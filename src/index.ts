export { Pipeline } from './pipeline.js';
export type { IngestResult } from './pipeline.js';
export { ZoneStore } from './store.js';
export { validate } from './validate.js';
export { normalize, NORMALIZATION_VERSION } from './normalize.js';
export { hashPayload, contentAddressedId } from './hash.js';
export { evaluateSemanticRules } from './semantic.js';
export { findNearDuplicates, computeRecordSimilarity } from './similarity.js';
export { computeBatchMetrics } from './metrics.js';
export { detectDrift } from './drift.js';
export { detectHoldoutOverlap } from './holdout.js';

// Phase 4: Governance + Calibration
export { PolicyRegistry } from './policies.js';
export { calibrate, checkCalibrationRegression } from './calibration.js';
export { OverrideRegistry } from './overrides.js';
export { ReviewQueue } from './review.js';
export { SourceRegistry } from './onboarding.js';
export { buildDecisionArtifact } from './artifact.js';
export { runShadow } from './shadow.js';

export type {
  SchemaContract,
  FieldDef,
  FieldType,
  FailureClass,
  FailureReason,
  RawRecord,
  ZonedRecord,
  BatchSummary,
  GatePolicy,
  Zone,
  SemanticRule,
  SemanticCondition,
  SemanticOperator,
  NearDuplicateConfig,
  NearDuplicateFieldConfig,
  ConfidenceBreakdown,
  BatchMetrics,
  NumericSummary,
  DriftRule,
  DriftViolation,
  HoldoutConfig,
  BatchDisposition,
  BatchVerdict,
  // Phase 4 types
  PolicyStatus,
  PolicyMeta,
  GoldSetEntry,
  CalibrationResult,
  CalibrationDetail,
  OverrideAction,
  OverrideReceipt,
  ReviewItemType,
  ReviewStatus,
  ReviewItem,
  SourceStatus,
  ProbationLevel,
  SourceContract,
  ShadowResult,
  DecisionArtifact,
} from './types.js';
