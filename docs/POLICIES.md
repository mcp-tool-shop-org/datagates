# Policies

Policies are the law of a datagates project. They define thresholds, rules, and conditions under which data earns promotion or gets quarantined.

## Structure

A gate policy (`GatePolicy`) contains:

| Field | Description |
|-------|-------------|
| `gatePolicyVersion` | Version identifier for this policy |
| `maxQuarantineRatio` | Max fraction of quarantined rows before batch is rejected (0.0-1.0) |
| `maxDuplicateRatio` | Max fraction of duplicates before batch is rejected |
| `maxCriticalNullRate` | Max null rate for any required field |
| `minConfidence` | Minimum average confidence score for promotion |
| `maxNearDuplicateRatio` | Max fraction of near-duplicates |
| `semanticRules` | Cross-field validation rules (when/then pattern) |
| `nearDuplicate` | Near-duplicate detection config (fields, similarity, threshold) |
| `driftRules` | Batch-level drift detection rules |
| `holdout` | Holdout overlap detection config |
| `maxSourceQuarantineRatio` | Per-source quarantine threshold |
| `allowPartialSalvage` | Whether to salvage clean sources when others are contaminated |

## Lifecycle

Policies move through a lifecycle:

```
draft --> active --> retired
            |
          shadow
```

- **draft**: Not yet active, can be tested
- **active**: The current policy governing promotions
- **shadow**: Running in parallel with active, producing comparison verdicts
- **retired**: No longer in use, preserved for audit

## Inheritance

A child policy can inherit from a parent. Fields specified in the child override the parent:

```typescript
const registry = new PolicyRegistry();

registry.register({
  policyId: 'base', version: '1.0.0', status: 'active',
  policy: { maxQuarantineRatio: 0.3, maxDuplicateRatio: 0.2, ... }
});

registry.register({
  policyId: 'strict', version: '1.0.0', status: 'draft',
  parentPolicyId: 'base',
  policy: { maxQuarantineRatio: 0.1 }  // inherits other fields from base
});

const resolved = registry.resolve('strict', '1.0.0');
// resolved.maxQuarantineRatio === 0.1 (child)
// resolved.maxDuplicateRatio === 0.2 (inherited from parent)
```

## Activation

A policy should only be activated after:

1. **Calibration**: Run against a gold set, verify F1 score and no false negative increase
2. **Shadow mode** (optional): Run in parallel with the active policy to see verdict deltas

```bash
datagates promote-policy --require-calibration
```

## Semantic rules

Cross-field rules use a when/then pattern:

```json
{
  "semanticRules": [
    {
      "id": "active-must-have-score",
      "description": "Active records must have a score above 0",
      "when": { "field": "status", "operator": "equals", "value": "active" },
      "then": { "field": "score", "operator": "gt", "value": 0 },
      "failureClass": "field_contradiction"
    }
  ]
}
```

Operators: `equals`, `not_equals`, `exists`, `not_exists`, `gt`, `gte`, `lt`, `lte`, `in`, `not_in`, `matches`.

## Drift rules

Detect distribution shift between batches:

```json
{
  "driftRules": [
    {
      "id": "null-spike",
      "description": "Null rate should not spike more than 10%",
      "type": "null_spike",
      "field": "score",
      "threshold": 0.1
    }
  ]
}
```

Types: `null_spike`, `label_skew`, `source_contamination`, `numeric_drift`, `class_disappearance`.
