import { randomUUID } from 'node:crypto';
import type {
  SchemaContract, GatePolicy, RawRecord, ZonedRecord,
  BatchSummary, FailureReason, FailureClass, ConfidenceBreakdown,
} from './types.js';
import { validate } from './validate.js';
import { normalize, NORMALIZATION_VERSION } from './normalize.js';
import { hashPayload, contentAddressedId } from './hash.js';
import { evaluateSemanticRules } from './semantic.js';
import { findNearDuplicates } from './similarity.js';
import { ZoneStore } from './store.js';

export interface IngestResult {
  summary: BatchSummary;
  records: ZonedRecord[];
}

/**
 * The intake pipeline: Raw → Validate → Normalize → Semantic → Dedupe → Score → Zone.
 *
 * Phase 1: structural validation, normalization, exact dedup
 * Phase 2: semantic rules, near-duplicate detection, confidence scoring
 */
export class Pipeline {
  constructor(
    private schema: SchemaContract,
    private policy: GatePolicy,
    private store: ZoneStore,
  ) {}

  ingest(records: RawRecord[]): IngestResult {
    const batchRunId = randomUUID();
    const timestamp = new Date().toISOString();
    const zonedRecords: ZonedRecord[] = [];
    const rejectReasons: Record<string, number> = {};
    let duplicatesDetected = 0;
    let nearDuplicatesDetected = 0;
    let semanticViolationCount = 0;

    // Track normalized hashes within this batch for intra-batch dedup
    const batchNormalizedHashes = new Set<string>();
    // Track intra-batch candidates for near-duplicate comparison
    const batchCandidates: { id: string; payload: Record<string, unknown> }[] = [];

    let recordIndex = 0;
    for (const raw of records) {
      const rawHash = hashPayload(raw.payload);
      const id = contentAddressedId(raw.sourceId, rawHash);

      // ── Step 1: Raw duplicate check (exact payload seen before?) ──
      if (this.store.hasRawHash(rawHash)) {
        duplicatesDetected++;
        const qId = contentAddressedId(raw.sourceId, rawHash, `${batchRunId}:${recordIndex}`);
        const record = buildRecord(qId, 'quarantine', raw, batchRunId, rawHash, null, null, [
          { field: '_record', rule: 'duplicate_payload', message: 'Exact payload already exists in store' },
        ], this.schema.schemaVersion, this.policy.gatePolicyVersion, null);
        zonedRecords.push(record);
        tally(rejectReasons, 'duplicate_payload');
        recordIndex++;
        continue;
      }

      // ── Step 2: Validate against schema ───────────────────────────
      const failures = validate(raw.payload, this.schema);
      if (failures.length > 0) {
        const record = buildRecord(id, 'quarantine', raw, batchRunId, rawHash, null, null,
          failures, this.schema.schemaVersion, this.policy.gatePolicyVersion, null);
        zonedRecords.push(record);
        for (const f of failures) tally(rejectReasons, f.rule);
        continue;
      }

      // ── Step 3: Normalize ─────────────────────────────────────────
      const normalizedPayload = normalize(raw.payload, this.schema);
      const normalizedHash = hashPayload(normalizedPayload);

      // ── Step 4: Normalized duplicate check ────────────────────────
      if (this.store.hasNormalizedHash(normalizedHash) || batchNormalizedHashes.has(normalizedHash)) {
        duplicatesDetected++;
        const qId = contentAddressedId(raw.sourceId, rawHash, `${batchRunId}:${recordIndex}`);
        const record = buildRecord(qId, 'quarantine', raw, batchRunId, rawHash, normalizedHash,
          normalizedPayload, [
            { field: '_record', rule: 'duplicate_id', message: 'Normalized payload matches existing record' },
          ], this.schema.schemaVersion, this.policy.gatePolicyVersion, null);
        zonedRecords.push(record);
        tally(rejectReasons, 'duplicate_id');
        recordIndex++;
        continue;
      }

      // ── Step 5: Semantic rules (Phase 2) ──────────────────────────
      const semanticFailures: FailureReason[] = [];
      if (this.policy.semanticRules && this.policy.semanticRules.length > 0) {
        const sf = evaluateSemanticRules(normalizedPayload, this.policy.semanticRules);
        semanticFailures.push(...sf);
      }

      if (semanticFailures.length > 0) {
        semanticViolationCount += semanticFailures.length;
        const qId = contentAddressedId(raw.sourceId, rawHash, `${batchRunId}:${recordIndex}`);
        const record = buildRecord(qId, 'quarantine', raw, batchRunId, rawHash, normalizedHash,
          normalizedPayload, semanticFailures, this.schema.schemaVersion, this.policy.gatePolicyVersion, null);
        zonedRecords.push(record);
        for (const f of semanticFailures) tally(rejectReasons, f.rule);
        recordIndex++;
        continue;
      }

      // ── Step 6: Near-duplicate detection (Phase 2) ────────────────
      let maxSimilarity = 0;
      let nearDuplicateOf: string[] = [];

      if (this.policy.nearDuplicate) {
        // Compare against store + intra-batch candidates
        const existingCandidates = this.store.getCandidatesForSimilarity();
        const allCandidates = [...existingCandidates, ...batchCandidates];

        const matches = findNearDuplicates(normalizedPayload, allCandidates, this.policy.nearDuplicate);
        if (matches.length > 0) {
          maxSimilarity = matches[0].score;
          nearDuplicateOf = matches.map(m => m.matchId);
          nearDuplicatesDetected++;

          const qId = contentAddressedId(raw.sourceId, rawHash, `${batchRunId}:${recordIndex}`);
          const record = buildRecord(qId, 'quarantine', raw, batchRunId, rawHash, normalizedHash,
            normalizedPayload, [
              {
                field: '_record',
                rule: 'near_duplicate',
                message: `Near-duplicate of [${nearDuplicateOf.join(', ')}] (similarity: ${maxSimilarity.toFixed(3)})`,
              },
            ], this.schema.schemaVersion, this.policy.gatePolicyVersion, {
              score: 0,
              gates: { schema: true, semantic: true, nearDuplicate: false },
              semanticViolations: 0,
              maxSimilarity,
              nearDuplicateOf,
            });
          zonedRecords.push(record);
          tally(rejectReasons, 'near_duplicate');
          recordIndex++;
          continue;
        }
      }

      batchNormalizedHashes.add(normalizedHash);

      // ── Step 7: Compute confidence and assign to candidate ────────
      const confidence: ConfidenceBreakdown = {
        score: 1.0, // perfect: passed all gates
        gates: { schema: true, semantic: true, nearDuplicate: true },
        semanticViolations: 0,
        maxSimilarity,
        nearDuplicateOf,
      };

      // Degrade confidence based on similarity (even if below near-dup threshold)
      if (maxSimilarity > 0) {
        confidence.score = Math.max(0, 1.0 - maxSimilarity * 0.3);
      }

      const record = buildRecord(id, 'candidate', raw, batchRunId, rawHash, normalizedHash,
        normalizedPayload, [], this.schema.schemaVersion, this.policy.gatePolicyVersion, confidence);
      zonedRecords.push(record);

      // Track for intra-batch near-dup comparison
      batchCandidates.push({ id, payload: normalizedPayload });
    }

    // ── Batch-level gate ────────────────────────────────────────────
    const rowsIngested = records.length;
    const rowsQuarantined = zonedRecords.filter(r => r.zone === 'quarantine').length;
    const rowsPassed = rowsIngested - rowsQuarantined;

    const nullRates = computeNullRates(
      zonedRecords.filter(r => r.zone === 'candidate'),
      this.schema,
    );

    const quarantineRatio = rowsIngested > 0 ? rowsQuarantined / rowsIngested : 0;
    const duplicateRatio = rowsIngested > 0 ? duplicatesDetected / rowsIngested : 0;
    const nearDupRatio = rowsIngested > 0 ? nearDuplicatesDetected / rowsIngested : 0;
    const maxNullRate = Object.values(nullRates).length > 0
      ? Math.max(...Object.values(nullRates))
      : 0;

    // Compute average confidence of candidate records
    const candidateRecords = zonedRecords.filter(r => r.zone === 'candidate');
    const avgConfidence = candidateRecords.length > 0
      ? candidateRecords.reduce((sum, r) => sum + (r.confidence?.score ?? 1.0), 0) / candidateRecords.length
      : 0;

    const maxNearDupRatio = this.policy.maxNearDuplicateRatio ?? 1.0;
    const minConfidence = this.policy.minConfidence ?? 0.0;

    const promoted =
      quarantineRatio <= this.policy.maxQuarantineRatio &&
      duplicateRatio <= this.policy.maxDuplicateRatio &&
      nearDupRatio <= maxNearDupRatio &&
      maxNullRate <= this.policy.maxCriticalNullRate &&
      avgConfidence >= minConfidence &&
      rowsPassed > 0;

    // Persist all records
    this.store.insertBatch(zonedRecords);

    // If batch passes, promote candidates to approved
    if (promoted) {
      this.store.promoteBatch(batchRunId);
      for (const r of zonedRecords) {
        if (r.zone === 'candidate') r.zone = 'approved';
      }
    }

    const summary: BatchSummary = {
      batchRunId,
      timestamp,
      schemaVersion: this.schema.schemaVersion,
      normalizationVersion: NORMALIZATION_VERSION,
      gatePolicyVersion: this.policy.gatePolicyVersion,
      rowsIngested,
      rowsPassed,
      rowsQuarantined,
      duplicatesDetected,
      nearDuplicatesDetected,
      semanticViolations: semanticViolationCount,
      nullRates,
      avgConfidence,
      promoted,
      rejectReasons: rejectReasons as Record<FailureClass, number>,
    };

    this.store.saveBatchSummary(summary);

    return { summary, records: zonedRecords };
  }
}

function buildRecord(
  id: string, zone: 'candidate' | 'quarantine',
  raw: RawRecord, batchRunId: string, rawHash: string,
  normalizedHash: string | null, normalizedPayload: Record<string, unknown> | null,
  failures: FailureReason[], schemaVersion: string, gatePolicyVersion: string,
  confidence: ConfidenceBreakdown | null,
): ZonedRecord {
  return {
    id,
    zone,
    sourceId: raw.sourceId,
    batchRunId,
    ingestTimestamp: raw.ingestTimestamp,
    rawHash,
    normalizedHash,
    payload: raw.payload,
    normalizedPayload,
    failures,
    schemaVersion,
    normalizationVersion: NORMALIZATION_VERSION,
    gatePolicyVersion,
    confidence,
  };
}

function tally(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

function computeNullRates(
  records: ZonedRecord[],
  schema: SchemaContract,
): Record<string, number> {
  if (records.length === 0) return {};
  const rates: Record<string, number> = {};
  for (const [field, def] of Object.entries(schema.fields)) {
    if (!def.required) continue;
    const nullCount = records.filter(r => {
      const val = r.normalizedPayload?.[field];
      return val === null || val === undefined;
    }).length;
    rates[field] = nullCount / records.length;
  }
  return rates;
}
