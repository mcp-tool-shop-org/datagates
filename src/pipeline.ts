import { randomUUID } from 'node:crypto';
import type {
  SchemaContract, GatePolicy, RawRecord, ZonedRecord,
  BatchSummary, FailureReason, FailureClass, ConfidenceBreakdown,
  BatchVerdict, BatchDisposition, DriftViolation,
} from './types.js';
import { validate } from './validate.js';
import { normalize, NORMALIZATION_VERSION } from './normalize.js';
import { hashPayload, contentAddressedId } from './hash.js';
import { evaluateSemanticRules } from './semantic.js';
import { findNearDuplicates } from './similarity.js';
import { computeBatchMetrics } from './metrics.js';
import { detectDrift } from './drift.js';
import { detectHoldoutOverlap } from './holdout.js';
import { ZoneStore } from './store.js';

export interface IngestResult {
  summary: BatchSummary;
  records: ZonedRecord[];
}

/**
 * The intake pipeline:
 *   Raw → Validate → Normalize → Semantic → Dedupe → Score → Zone
 *   → Batch Health → Drift → Holdout → Source Quarantine → Verdict → Promote
 *
 * Phase 1: structural validation, normalization, exact dedup
 * Phase 2: semantic rules, near-duplicate detection, confidence scoring
 * Phase 3: batch metrics, drift detection, holdout overlap, source quarantine
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

    const batchNormalizedHashes = new Set<string>();
    const batchCandidates: { id: string; payload: Record<string, unknown> }[] = [];

    // ── Row-level gates (Phase 1 + 2) ───────────────────────────────

    let recordIndex = 0;
    for (const raw of records) {
      const rawHash = hashPayload(raw.payload);
      const id = contentAddressedId(raw.sourceId, rawHash);

      // Step 1: Raw duplicate check
      if (this.store.hasRawHash(rawHash)) {
        duplicatesDetected++;
        const qId = contentAddressedId(raw.sourceId, rawHash, `${batchRunId}:${recordIndex}`);
        zonedRecords.push(buildRecord(qId, 'quarantine', raw, batchRunId, rawHash, null, null, [
          { field: '_record', rule: 'duplicate_payload', message: 'Exact payload already exists in store' },
        ], this.schema.schemaVersion, this.policy.gatePolicyVersion, null));
        tally(rejectReasons, 'duplicate_payload');
        recordIndex++;
        continue;
      }

      // Step 2: Schema validation
      const failures = validate(raw.payload, this.schema);
      if (failures.length > 0) {
        zonedRecords.push(buildRecord(id, 'quarantine', raw, batchRunId, rawHash, null, null,
          failures, this.schema.schemaVersion, this.policy.gatePolicyVersion, null));
        for (const f of failures) tally(rejectReasons, f.rule);
        continue;
      }

      // Step 3: Normalize
      const normalizedPayload = normalize(raw.payload, this.schema);
      const normalizedHash = hashPayload(normalizedPayload);

      // Step 4: Normalized duplicate check
      if (this.store.hasNormalizedHash(normalizedHash) || batchNormalizedHashes.has(normalizedHash)) {
        duplicatesDetected++;
        const qId = contentAddressedId(raw.sourceId, rawHash, `${batchRunId}:${recordIndex}`);
        zonedRecords.push(buildRecord(qId, 'quarantine', raw, batchRunId, rawHash, normalizedHash,
          normalizedPayload, [
            { field: '_record', rule: 'duplicate_id', message: 'Normalized payload matches existing record' },
          ], this.schema.schemaVersion, this.policy.gatePolicyVersion, null));
        tally(rejectReasons, 'duplicate_id');
        recordIndex++;
        continue;
      }

      // Step 5: Semantic rules
      if (this.policy.semanticRules?.length) {
        const sf = evaluateSemanticRules(normalizedPayload, this.policy.semanticRules);
        if (sf.length > 0) {
          semanticViolationCount += sf.length;
          const qId = contentAddressedId(raw.sourceId, rawHash, `${batchRunId}:${recordIndex}`);
          zonedRecords.push(buildRecord(qId, 'quarantine', raw, batchRunId, rawHash, normalizedHash,
            normalizedPayload, sf, this.schema.schemaVersion, this.policy.gatePolicyVersion, null));
          for (const f of sf) tally(rejectReasons, f.rule);
          recordIndex++;
          continue;
        }
      }

      // Step 6: Near-duplicate detection
      let maxSimilarity = 0;
      let nearDuplicateOf: string[] = [];

      if (this.policy.nearDuplicate) {
        const existingCandidates = this.store.getCandidatesForSimilarity();
        const allCandidates = [...existingCandidates, ...batchCandidates];
        const matches = findNearDuplicates(normalizedPayload, allCandidates, this.policy.nearDuplicate);
        if (matches.length > 0) {
          maxSimilarity = matches[0].score;
          nearDuplicateOf = matches.map(m => m.matchId);
          nearDuplicatesDetected++;
          const qId = contentAddressedId(raw.sourceId, rawHash, `${batchRunId}:${recordIndex}`);
          zonedRecords.push(buildRecord(qId, 'quarantine', raw, batchRunId, rawHash, normalizedHash,
            normalizedPayload, [{
              field: '_record', rule: 'near_duplicate',
              message: `Near-duplicate of [${nearDuplicateOf.join(', ')}] (similarity: ${maxSimilarity.toFixed(3)})`,
            }], this.schema.schemaVersion, this.policy.gatePolicyVersion, {
              score: 0, gates: { schema: true, semantic: true, nearDuplicate: false },
              semanticViolations: 0, maxSimilarity, nearDuplicateOf,
            }));
          tally(rejectReasons, 'near_duplicate');
          recordIndex++;
          continue;
        }
      }

      batchNormalizedHashes.add(normalizedHash);

      // Step 7: Confidence + candidate assignment
      const confidence: ConfidenceBreakdown = {
        score: maxSimilarity > 0 ? Math.max(0, 1.0 - maxSimilarity * 0.3) : 1.0,
        gates: { schema: true, semantic: true, nearDuplicate: true },
        semanticViolations: 0, maxSimilarity, nearDuplicateOf,
      };

      zonedRecords.push(buildRecord(id, 'candidate', raw, batchRunId, rawHash, normalizedHash,
        normalizedPayload, [], this.schema.schemaVersion, this.policy.gatePolicyVersion, confidence));
      batchCandidates.push({ id, payload: normalizedPayload });
    }

    // ── Persist row-level results ───────────────────────────────────
    this.store.insertBatch(zonedRecords);

    // ── Phase 3: Batch-level gates ──────────────────────────────────

    const metrics = computeBatchMetrics(zonedRecords, this.schema);
    const candidateRecords = zonedRecords.filter(r => r.zone === 'candidate');
    const avgConfidence = candidateRecords.length > 0
      ? candidateRecords.reduce((sum, r) => sum + (r.confidence?.score ?? 1.0), 0) / candidateRecords.length
      : 0;

    // Source-level quarantine
    const quarantinedSources: string[] = [];
    if (this.policy.maxSourceQuarantineRatio !== undefined) {
      const sourceRates = this.store.getSourceQuarantineRates(batchRunId);
      for (const [sourceId, stats] of Object.entries(sourceRates)) {
        if (stats.rate > this.policy.maxSourceQuarantineRatio) {
          this.store.quarantineBySource(batchRunId, sourceId);
          quarantinedSources.push(sourceId);
          // Update in-memory records
          for (const r of zonedRecords) {
            if (r.sourceId === sourceId && r.zone === 'candidate') {
              r.zone = 'quarantine';
              r.failures.push({
                field: '_source',
                rule: 'source_contamination',
                message: `Source "${sourceId}" quarantined: ${(stats.rate * 100).toFixed(1)}% quarantine rate exceeds threshold`,
              });
            }
          }
        }
      }
    }

    // Holdout overlap detection
    let holdoutOverlaps = 0;
    if (this.policy.holdout) {
      const holdoutRecords = this.store.getHoldoutRecords();
      if (holdoutRecords.length > 0) {
        const overlaps = detectHoldoutOverlap(
          zonedRecords, holdoutRecords, this.policy.holdout, this.policy.nearDuplicate,
        );
        holdoutOverlaps = overlaps.length;
        for (const overlap of overlaps) {
          const record = zonedRecords.find(r => r.id === overlap.recordId);
          if (record && record.zone === 'candidate') {
            record.zone = 'quarantine';
            record.failures.push({
              field: '_record',
              rule: 'holdout_overlap',
              message: `Overlaps holdout record "${overlap.holdoutId}" (${overlap.type}, similarity: ${overlap.similarity.toFixed(3)})`,
            });
            tally(rejectReasons, 'holdout_overlap');
            // Update in DB
            this.store.quarantineBySource(batchRunId, record.sourceId);
          }
        }
      }
    }

    // Drift detection
    let driftViolations: DriftViolation[] = [];
    if (this.policy.driftRules?.length) {
      const baseline = this.store.getLastPromotedMetrics();
      if (baseline) {
        // Recompute metrics after source quarantine
        const updatedMetrics = computeBatchMetrics(zonedRecords, this.schema);
        driftViolations = detectDrift(updatedMetrics, baseline, this.policy.driftRules);
      }
    }

    // ── Compute verdict ─────────────────────────────────────────────

    const rowsIngested = records.length;
    const rowsQuarantined = zonedRecords.filter(r => r.zone === 'quarantine').length;
    const rowsPassed = rowsIngested - rowsQuarantined;
    const quarantineRatio = rowsIngested > 0 ? rowsQuarantined / rowsIngested : 0;
    const duplicateRatio = rowsIngested > 0 ? duplicatesDetected / rowsIngested : 0;
    const nearDupRatio = rowsIngested > 0 ? nearDuplicatesDetected / rowsIngested : 0;
    const maxNullRate = Object.values(metrics.nullRates).length > 0
      ? Math.max(...Object.values(metrics.nullRates)) : 0;
    const maxNearDupRatio = this.policy.maxNearDuplicateRatio ?? 1.0;
    const minConfidence = this.policy.minConfidence ?? 0.0;

    const verdict = computeVerdict({
      quarantineRatio, maxQuarantineRatio: this.policy.maxQuarantineRatio,
      duplicateRatio, maxDuplicateRatio: this.policy.maxDuplicateRatio,
      nearDupRatio, maxNearDupRatio,
      maxNullRate, maxCriticalNullRate: this.policy.maxCriticalNullRate,
      avgConfidence, minConfidence,
      rowsPassed, driftViolations, holdoutOverlaps, quarantinedSources,
      allowPartialSalvage: this.policy.allowPartialSalvage ?? false,
    });

    const promoted = verdict.disposition === 'approve' || verdict.disposition === 'approve_with_warnings';

    // Promote if verdict allows
    if (promoted) {
      this.store.promoteBatch(batchRunId);
      for (const r of zonedRecords) {
        if (r.zone === 'candidate') r.zone = 'approved';
      }
    } else if (verdict.disposition === 'partial_salvage' && quarantinedSources.length > 0) {
      // Promote only non-contaminated sources
      const salvaged = this.store.promoteBatch(batchRunId);
      for (const r of zonedRecords) {
        if (r.zone === 'candidate') r.zone = 'approved';
      }
    }

    const summary: BatchSummary = {
      batchRunId, timestamp,
      schemaVersion: this.schema.schemaVersion,
      normalizationVersion: NORMALIZATION_VERSION,
      gatePolicyVersion: this.policy.gatePolicyVersion,
      rowsIngested, rowsPassed, rowsQuarantined,
      duplicatesDetected, nearDuplicatesDetected,
      semanticViolations: semanticViolationCount,
      nullRates: metrics.nullRates, avgConfidence,
      promoted,
      rejectReasons: rejectReasons as Record<FailureClass, number>,
      verdict, metrics,
    };

    this.store.saveBatchSummary(summary);

    return { summary, records: zonedRecords };
  }
}

// ── Verdict computation ─────────────────────────────────────────────

interface VerdictInput {
  quarantineRatio: number; maxQuarantineRatio: number;
  duplicateRatio: number; maxDuplicateRatio: number;
  nearDupRatio: number; maxNearDupRatio: number;
  maxNullRate: number; maxCriticalNullRate: number;
  avgConfidence: number; minConfidence: number;
  rowsPassed: number;
  driftViolations: DriftViolation[];
  holdoutOverlaps: number;
  quarantinedSources: string[];
  allowPartialSalvage: boolean;
}

function computeVerdict(input: VerdictInput): BatchVerdict {
  const reasons: string[] = [];
  const warnings: string[] = [];
  let disposition: BatchDisposition = 'approve';

  // Hard blocks
  if (input.rowsPassed === 0) {
    reasons.push('No rows passed validation');
    disposition = 'quarantine_batch';
  }
  if (input.quarantineRatio > input.maxQuarantineRatio) {
    reasons.push(`Quarantine ratio ${(input.quarantineRatio * 100).toFixed(1)}% exceeds max ${(input.maxQuarantineRatio * 100).toFixed(1)}%`);
    disposition = 'quarantine_batch';
  }
  if (input.duplicateRatio > input.maxDuplicateRatio) {
    reasons.push(`Duplicate ratio ${(input.duplicateRatio * 100).toFixed(1)}% exceeds max ${(input.maxDuplicateRatio * 100).toFixed(1)}%`);
    disposition = 'quarantine_batch';
  }
  if (input.nearDupRatio > input.maxNearDupRatio) {
    reasons.push(`Near-duplicate ratio ${(input.nearDupRatio * 100).toFixed(1)}% exceeds max ${(input.maxNearDupRatio * 100).toFixed(1)}%`);
    disposition = 'quarantine_batch';
  }
  if (input.maxNullRate > input.maxCriticalNullRate) {
    reasons.push(`Critical null rate ${(input.maxNullRate * 100).toFixed(1)}% exceeds max ${(input.maxCriticalNullRate * 100).toFixed(1)}%`);
    disposition = 'quarantine_batch';
  }
  if (input.avgConfidence < input.minConfidence) {
    reasons.push(`Average confidence ${input.avgConfidence.toFixed(3)} below min ${input.minConfidence}`);
    disposition = 'quarantine_batch';
  }

  // Holdout overlap is always a hard block
  if (input.holdoutOverlaps > 0) {
    reasons.push(`${input.holdoutOverlaps} holdout overlap(s) detected — potential leakage`);
    disposition = 'quarantine_batch';
  }

  // Drift violations are warnings unless they cause quarantine
  if (input.driftViolations.length > 0) {
    for (const v of input.driftViolations) {
      warnings.push(`Drift: ${v.description} (${v.field}: baseline=${v.baselineValue.toFixed(3)}, current=${v.currentValue.toFixed(3)}, threshold=${v.threshold})`);
    }
    if (disposition === 'approve') {
      disposition = 'approve_with_warnings';
    }
  }

  // Source quarantine may trigger partial salvage
  if (input.quarantinedSources.length > 0 && disposition !== 'quarantine_batch') {
    if (input.allowPartialSalvage) {
      warnings.push(`Sources quarantined: [${input.quarantinedSources.join(', ')}]`);
      if (disposition === 'approve') disposition = 'partial_salvage';
    } else {
      reasons.push(`Sources contaminated: [${input.quarantinedSources.join(', ')}]`);
      disposition = 'quarantine_batch';
    }
  }

  return {
    disposition,
    reasons,
    driftViolations: input.driftViolations,
    holdoutOverlaps: input.holdoutOverlaps,
    quarantinedSources: input.quarantinedSources,
    warnings,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────

function buildRecord(
  id: string, zone: 'candidate' | 'quarantine',
  raw: RawRecord, batchRunId: string, rawHash: string,
  normalizedHash: string | null, normalizedPayload: Record<string, unknown> | null,
  failures: FailureReason[], schemaVersion: string, gatePolicyVersion: string,
  confidence: ConfidenceBreakdown | null,
): ZonedRecord {
  return {
    id, zone, sourceId: raw.sourceId, batchRunId,
    ingestTimestamp: raw.ingestTimestamp, rawHash, normalizedHash,
    payload: raw.payload, normalizedPayload, failures,
    schemaVersion, normalizationVersion: NORMALIZATION_VERSION,
    gatePolicyVersion, confidence,
  };
}

function tally(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1;
}
