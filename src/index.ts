export { Pipeline } from './pipeline.js';
export type { IngestResult } from './pipeline.js';
export { ZoneStore } from './store.js';
export { validate } from './validate.js';
export { normalize, NORMALIZATION_VERSION } from './normalize.js';
export { hashPayload, contentAddressedId } from './hash.js';
export { evaluateSemanticRules } from './semantic.js';
export { findNearDuplicates, computeRecordSimilarity } from './similarity.js';
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
} from './types.js';
