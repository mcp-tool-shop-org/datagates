// ── Field-level schema contract ──────────────────────────────────────

export type FieldType = 'string' | 'number' | 'boolean' | 'date' | 'enum';

export interface FieldDef {
  type: FieldType;
  required: boolean;
  nullable?: boolean;
  enum?: string[];
  min?: number;
  max?: number;
  /** ISO date string lower bound for date fields */
  minDate?: string;
  /** ISO date string upper bound for date fields */
  maxDate?: string;
  /** Normalize casing: 'lower' | 'upper' | 'none' (default: 'none') */
  normalizeCasing?: 'lower' | 'upper' | 'none';
}

export interface SchemaContract {
  schemaId: string;
  schemaVersion: string;
  fields: Record<string, FieldDef>;
  /** Fields that together form the primary identity (for duplicate detection) */
  primaryKeys: string[];
}

// ── Failure taxonomy ─────────────────────────────────────────────────

export type FailureClass =
  | 'schema_violation'
  | 'parse_failure'
  | 'missing_required'
  | 'invalid_enum'
  | 'out_of_range'
  | 'duplicate_id'
  | 'duplicate_payload'
  | 'null_critical';

export interface FailureReason {
  field: string;
  rule: FailureClass;
  message: string;
}

// ── Record wrapper ───────────────────────────────────────────────────

export type Zone = 'raw' | 'candidate' | 'approved' | 'quarantine';

export interface RawRecord {
  sourceId: string;
  batchRunId: string;
  ingestTimestamp: string;
  payload: Record<string, unknown>;
}

export interface ZonedRecord {
  id: string;
  zone: Zone;
  sourceId: string;
  batchRunId: string;
  ingestTimestamp: string;
  rawHash: string;
  normalizedHash: string | null;
  payload: Record<string, unknown>;
  normalizedPayload: Record<string, unknown> | null;
  failures: FailureReason[];
  schemaVersion: string;
  normalizationVersion: string;
  gatePolicyVersion: string;
}

// ── Batch summary ────────────────────────────────────────────────────

export interface BatchSummary {
  batchRunId: string;
  timestamp: string;
  schemaVersion: string;
  normalizationVersion: string;
  gatePolicyVersion: string;
  rowsIngested: number;
  rowsPassed: number;
  rowsQuarantined: number;
  duplicatesDetected: number;
  nullRates: Record<string, number>;
  promoted: boolean;
  rejectReasons: Record<FailureClass, number>;
}

// ── Gate policy ──────────────────────────────────────────────────────

export interface GatePolicy {
  gatePolicyVersion: string;
  /** Maximum quarantine ratio before batch is rejected (0.0 - 1.0) */
  maxQuarantineRatio: number;
  /** Maximum duplicate ratio before batch is rejected (0.0 - 1.0) */
  maxDuplicateRatio: number;
  /** Maximum null rate for any critical field before batch is rejected */
  maxCriticalNullRate: number;
}
