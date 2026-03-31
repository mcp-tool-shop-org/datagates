import { randomUUID } from 'node:crypto';
import type {
  SchemaContract, GatePolicy, RawRecord, ZonedRecord,
  BatchSummary, FailureReason, FailureClass,
} from './types.js';
import { validate } from './validate.js';
import { normalize, NORMALIZATION_VERSION } from './normalize.js';
import { hashPayload, contentAddressedId } from './hash.js';
import { ZoneStore } from './store.js';

export interface IngestResult {
  summary: BatchSummary;
  records: ZonedRecord[];
}

/**
 * The intake pipeline: Raw → Validate → Normalize → Dedupe → Zone assignment.
 *
 * This is the Phase 1 hard gate. It enforces:
 * - Schema validation (reject malformed)
 * - Normalization (deterministic canonicalization)
 * - Exact duplicate detection (raw hash + normalized hash)
 * - Reason-coded quarantine (never silently delete)
 * - Batch-level thresholds (promote or reject entire batch)
 */
export class Pipeline {
  constructor(
    private schema: SchemaContract,
    private policy: GatePolicy,
    private store: ZoneStore,
  ) {}

  /**
   * Ingest a batch of raw records through the gate system.
   * Returns the batch summary and all zoned records.
   */
  ingest(records: RawRecord[]): IngestResult {
    const batchRunId = randomUUID();
    const timestamp = new Date().toISOString();
    const zonedRecords: ZonedRecord[] = [];
    const rejectReasons: Record<string, number> = {};
    let duplicatesDetected = 0;

    // Track normalized hashes within this batch for intra-batch dedup
    const batchNormalizedHashes = new Set<string>();

    let recordIndex = 0;
    for (const raw of records) {
      const rawHash = hashPayload(raw.payload);
      const id = contentAddressedId(raw.sourceId, rawHash);

      // ── Step 1: Raw duplicate check (exact payload seen before?) ──
      if (this.store.hasRawHash(rawHash)) {
        duplicatesDetected++;
        // Use batch+index salt so quarantine records get unique IDs
        const qId = contentAddressedId(raw.sourceId, rawHash, `${batchRunId}:${recordIndex}`);
        const record = buildRecord(qId, 'quarantine', raw, batchRunId, rawHash, null, null, [
          { field: '_record', rule: 'duplicate_payload', message: 'Exact payload already exists in store' },
        ], this.schema.schemaVersion, this.policy.gatePolicyVersion);
        zonedRecords.push(record);
        tally(rejectReasons, 'duplicate_payload');
        recordIndex++;
        continue;
      }

      // ── Step 2: Validate against schema ───────────────────────────
      const failures = validate(raw.payload, this.schema);
      if (failures.length > 0) {
        const record = buildRecord(id, 'quarantine', raw, batchRunId, rawHash, null, null,
          failures, this.schema.schemaVersion, this.policy.gatePolicyVersion);
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
          ], this.schema.schemaVersion, this.policy.gatePolicyVersion);
        zonedRecords.push(record);
        tally(rejectReasons, 'duplicate_id');
        recordIndex++;
        continue;
      }

      batchNormalizedHashes.add(normalizedHash);

      // ── Step 5: Passed — assign to candidate zone ─────────────────
      const record = buildRecord(id, 'candidate', raw, batchRunId, rawHash, normalizedHash,
        normalizedPayload, [], this.schema.schemaVersion, this.policy.gatePolicyVersion);
      zonedRecords.push(record);
    }

    // ── Batch-level gate ────────────────────────────────────────────
    const rowsIngested = records.length;
    const rowsQuarantined = zonedRecords.filter(r => r.zone === 'quarantine').length;
    const rowsPassed = rowsIngested - rowsQuarantined;

    // Compute null rates for required fields
    const nullRates = computeNullRates(
      zonedRecords.filter(r => r.zone === 'candidate'),
      this.schema,
    );

    // Evaluate batch thresholds
    const quarantineRatio = rowsIngested > 0 ? rowsQuarantined / rowsIngested : 0;
    const duplicateRatio = rowsIngested > 0 ? duplicatesDetected / rowsIngested : 0;
    const maxNullRate = Object.values(nullRates).length > 0
      ? Math.max(...Object.values(nullRates))
      : 0;

    const promoted =
      quarantineRatio <= this.policy.maxQuarantineRatio &&
      duplicateRatio <= this.policy.maxDuplicateRatio &&
      maxNullRate <= this.policy.maxCriticalNullRate &&
      rowsPassed > 0;

    // Persist all records
    this.store.insertBatch(zonedRecords);

    // If batch passes, promote candidates to approved
    if (promoted) {
      this.store.promoteBatch(batchRunId);
      // Update in-memory records to reflect promotion
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
      nullRates,
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
