---
title: Configuration
description: Schema contracts, policy thresholds, and project settings.
sidebar:
  order: 3
---

## Project config (datagates.json)

The project config file tells datagates where to find everything:

```json
{
  "name": "my-project",
  "schemaPath": "schema.json",
  "policyPath": "policy.json",
  "storePath": "datagates.db",
  "goldSetPath": "gold-set.json",
  "artifactsPath": "artifacts",
  "reviewQueuePath": "reviews.json",
  "sourceRegistryPath": "sources.json",
  "shadowPolicyPath": "shadow-policy.json"
}
```

All paths are relative to the directory containing `datagates.json`. The CLI walks up from the current directory to find this file.

## Schema contract

The schema defines field types, constraints, and normalization rules:

```json
{
  "schemaId": "my-data",
  "schemaVersion": "1.0.0",
  "fields": {
    "id": { "type": "string", "required": true },
    "name": { "type": "string", "required": true, "normalizeCasing": "lower" },
    "email": { "type": "string", "required": true, "normalizeTrim": true },
    "age": { "type": "number", "required": true, "min": 0, "max": 150 },
    "role": { "type": "enum", "required": true, "enum": ["admin", "user", "guest"] },
    "bio": { "type": "string", "required": false }
  },
  "primaryKeys": ["id"]
}
```

### Field types

| Type | Validation | Notes |
|------|-----------|-------|
| `string` | Present and non-empty (if required) | Supports `normalizeCasing` (`lower`, `upper`) and `normalizeTrim` |
| `number` | Numeric value within `min`/`max` range | |
| `enum` | Value exists in the `enum` array | |

### Primary keys

Fields listed in `primaryKeys` are used for exact deduplication. Records with identical primary key values after normalization are flagged as duplicates.

## Gate policy

The policy controls thresholds for batch-level decisions:

```json
{
  "gatePolicyVersion": "1.0.0",
  "maxQuarantineRatio": 0.3,
  "maxDuplicateRatio": 0.2,
  "maxCriticalNullRate": 0.05,
  "minConfidence": 0.5,
  "maxNearDuplicateRatio": 0.1,
  "maxSourceQuarantineRatio": 0.15,
  "allowPartialSalvage": true
}
```

### Threshold reference

| Field | Default | Effect |
|-------|---------|--------|
| `maxQuarantineRatio` | 0.3 | Batch quarantined if more than 30% of records fail |
| `maxDuplicateRatio` | 0.2 | Batch quarantined if more than 20% are exact duplicates |
| `maxCriticalNullRate` | 0.05 | Batch quarantined if required fields have >5% null rate |
| `minConfidence` | 0.5 | Records below this confidence score are quarantined |
| `maxNearDuplicateRatio` | 0.1 | Batch quarantined if >10% are near-duplicates |
| `maxSourceQuarantineRatio` | — | Per-source quarantine limit (for multi-source ingestion) |
| `allowPartialSalvage` | false | If true, clean records from a quarantined batch can be salvaged |

### Near-duplicate configuration

```json
{
  "nearDuplicate": {
    "threshold": 0.85,
    "fields": [
      { "field": "name", "similarity": "levenshtein", "weight": 2.0 },
      { "field": "value", "similarity": "numeric", "weight": 1.0 },
      { "field": "category", "similarity": "exact", "weight": 1.0 }
    ]
  }
}
```

Similarity algorithms: `levenshtein` (edit distance), `token_jaccard` (word overlap), `numeric` (relative difference), `exact` (binary match).

### Semantic rules

Cross-field validation rules using a `when`/`then` pattern:

```json
{
  "semanticRules": [
    {
      "id": "high-value-needs-review",
      "description": "High-value items must have a reviewer",
      "when": { "field": "value", "op": "gt", "value": 5000 },
      "then": { "field": "reviewer", "op": "not_null" }
    }
  ]
}
```

Operators: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `in`, `not_in`, `null`, `not_null`, `matches`, `not_matches`.

### Drift rules

Detect distribution shifts between batches:

```json
{
  "driftRules": [
    {
      "id": "label-drift",
      "type": "label_skew",
      "field": "category",
      "threshold": 0.2
    },
    {
      "id": "null-spike",
      "type": "null_spike",
      "field": "email",
      "threshold": 0.1
    }
  ]
}
```

Drift types: `null_spike`, `label_skew`, `source_contamination`, `numeric_drift`, `class_disappearance`.

## Policy packs

Pre-built policy configurations for common use cases:

| Pack | Best for |
|------|----------|
| `strict-structured` | Clean structured data — tight thresholds, low tolerance |
| `text-dedupe` | Text datasets — aggressive token jaccard near-dup detection |
| `classification-basic` | Labeled datasets — label drift and class disappearance rules |
| `source-probation-first` | Multi-source ingestion — per-source quarantine, partial salvage |

Initialize with a pack: `npx datagates init --pack <pack-id>`
