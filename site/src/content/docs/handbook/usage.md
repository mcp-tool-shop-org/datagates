---
title: Usage Guide
description: Operator workflows — ingestion, review, source management, shadow comparison, and policy promotion.
sidebar:
  order: 2
---

## Ingesting data

The primary workflow is `datagates run`:

```bash
npx datagates run --input data.json --source-id vendor-a
```

This executes all four trust layers in sequence:

1. **Row gates**: validate each record against the schema, normalize fields, compute content hashes, detect exact duplicates
2. **Semantic gates**: evaluate cross-field rules, detect near-duplicates, score confidence
3. **Batch gates**: compute batch metrics (null rates, label distribution), check drift rules, detect holdout overlap, evaluate source quarantine ratios
4. **Verdict**: approve the batch or quarantine it, with explicit reasons

The `--source-id` flag tags records with their origin. If omitted, defaults to `cli`.

## Reviewing quarantined records

When records are quarantined, they're automatically added to the review queue:

```bash
# List pending reviews
npx datagates review list

# Confirm a quarantine decision (record stays quarantined)
npx datagates review confirm <reviewId> operator-name

# Dismiss (record was wrongly quarantined)
npx datagates review dismiss <reviewId> operator-name

# Override (force-approve with receipt)
npx datagates review override <reviewId> operator-name
```

Every review action is recorded. Overrides create durable receipts with actor, reason, and policy version.

## Managing data sources

Sources go through probation before earning full trust:

```bash
# Register a new source
npx datagates source register --id vendor-a --batches 5

# List all sources with their probation status
npx datagates source list

# Manually activate a source (skips remaining probation)
npx datagates source activate vendor-a

# Suspend a misbehaving source
npx datagates source suspend vendor-a
```

Probation levels: `quarantine_only` → `partial_promotion` → `supervised` → `active`. Sources advance by completing clean batches.

## Shadow policy comparison

Before activating a new policy, compare it against the current one:

```bash
npx datagates shadow --input data.json
```

This requires a `shadowPolicyPath` in your `datagates.json`. Shadow mode runs both policies in memory and reports:

- Whether the batch verdict would change
- How many rows would be newly quarantined or newly approved
- Which sources would be affected

Exit code 3 means the verdict changed — review before promoting.

## Policy promotion

Activate a new policy only after it passes calibration:

```bash
npx datagates promote-policy
```

This runs calibration against your gold set and blocks promotion if:
- Any false negatives are detected (bad data would leak)
- F1 score drops below 0.8

## Inspecting artifacts

Every batch run produces a decision artifact:

```bash
# List all artifacts
npx datagates artifact

# Inspect a specific artifact
npx datagates artifact --id <batch-run-id>

# Export as JSON
npx datagates artifact --id <batch-run-id> --format json
```

Artifacts contain the complete evidence trail: schema used, policy applied, per-record outcomes, batch metrics, drift results, and the final verdict.

## Programmatic API

For integration into larger pipelines:

```typescript
import { Pipeline, ZoneStore } from 'datagates';

const store = new ZoneStore('datagates.db');
const pipeline = new Pipeline(schema, policy, store);
const result = pipeline.ingest(records);

// result.summary.verdict — batch-level decision
// result.records — per-record outcomes with reasons
// result.summary — batch metrics and health indicators

store.close();
```
