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
  // Phase 1 — structural
  | 'schema_violation'
  | 'parse_failure'
  | 'missing_required'
  | 'invalid_enum'
  | 'out_of_range'
  | 'duplicate_id'
  | 'duplicate_payload'
  | 'null_critical'
  // Phase 2 — semantic
  | 'field_contradiction'
  | 'cross_field_violation'
  | 'near_duplicate';

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
  confidence: ConfidenceBreakdown | null;
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
  nearDuplicatesDetected: number;
  semanticViolations: number;
  nullRates: Record<string, number>;
  avgConfidence: number;
  promoted: boolean;
  rejectReasons: Record<FailureClass, number>;
}

// ── Semantic rules ───────────────────────────────────────────────────

export type SemanticOperator =
  | 'equals' | 'not_equals'
  | 'exists' | 'not_exists'
  | 'gt' | 'gte' | 'lt' | 'lte'
  | 'in' | 'not_in'
  | 'matches';

export interface SemanticCondition {
  field: string;
  operator: SemanticOperator;
  value?: unknown;
}

export interface SemanticRule {
  id: string;
  description: string;
  /** When this condition is true... */
  when: SemanticCondition;
  /** ...then this condition must also be true */
  then: SemanticCondition;
  /** Failure class to emit when rule is violated */
  failureClass: 'field_contradiction' | 'cross_field_violation';
}

// ── Near-duplicate config ────────────────────────────────────────────

export interface NearDuplicateConfig {
  /** Fields to compare for similarity */
  fields: NearDuplicateFieldConfig[];
  /** Overall similarity threshold (0.0 - 1.0) for flagging as near-duplicate */
  threshold: number;
}

export interface NearDuplicateFieldConfig {
  field: string;
  /** Weight of this field in overall similarity (default: 1.0) */
  weight?: number;
  /** Similarity function: 'exact' | 'levenshtein' | 'numeric' | 'token_jaccard' */
  similarity: 'exact' | 'levenshtein' | 'numeric' | 'token_jaccard';
}

// ── Confidence scoring ───────────────────────────────────────────────

export interface ConfidenceBreakdown {
  /** Overall confidence score (0.0 - 1.0) */
  score: number;
  /** Per-gate pass/fail signals */
  gates: {
    schema: boolean;
    semantic: boolean;
    nearDuplicate: boolean;
  };
  /** Number of semantic rule violations (0 = clean) */
  semanticViolations: number;
  /** Highest similarity to any existing record (0.0 = unique, 1.0 = identical) */
  maxSimilarity: number;
  /** IDs of near-duplicate matches, if any */
  nearDuplicateOf: string[];
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
  /** Semantic rules to enforce (Phase 2) */
  semanticRules?: SemanticRule[];
  /** Near-duplicate detection config (Phase 2) */
  nearDuplicate?: NearDuplicateConfig;
  /** Minimum confidence score for promotion (Phase 2, 0.0 - 1.0) */
  minConfidence?: number;
  /** Maximum near-duplicate ratio before batch is rejected (Phase 2) */
  maxNearDuplicateRatio?: number;
}
