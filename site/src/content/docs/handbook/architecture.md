---
title: Architecture
description: How datagates processes data — zones, hashing, pipeline stages, and the decision model.
sidebar:
  order: 5
---

## Pipeline flow

Every batch passes through this sequence:

```
validate → normalize → hash → semantic rules → near-dup → confidence score
    → batch metrics → drift check → holdout overlap → source quarantine
    → batch verdict → zone promotion
```

Each stage can quarantine individual records (row-level) or the entire batch (batch-level).

## Content-addressed identity

Every record gets two hashes:

- **Raw hash**: SHA-256 of the original payload (before any normalization)
- **Normalized hash**: SHA-256 of the payload after normalization (trimming, casing, etc.)

This dual-hashing approach means:
- Exact duplicates are caught by normalized hash comparison
- The original input is always recoverable from the raw hash
- Two records that normalize to the same value are correctly identified as duplicates

## Three-zone storage

```
┌──────────┐     ┌───────────┐     ┌──────────┐
│   Raw    │────→│ Candidate │────→│ Approved │
│(immutable│     │ (pending  │     │(promoted)│
│  input)  │     │  verdict) │     │          │
└──────────┘     └─────┬─────┘     └──────────┘
                       │
                 ┌─────▼─────┐
                 │Quarantine │
                 │(with      │
                 │ reasons)  │
                 └───────────┘
```

The `ZoneStore` uses SQLite with three tables:
- Records are inserted into `raw` on intake (immutable, never modified)
- Row-level gates promote passing records to `candidate`
- Batch verdict either promotes all candidates to `approved` or quarantines the batch
- Quarantined records carry their failure reasons

## Batch verdict model

The batch verdict is a binary decision: **approve** or **quarantine_batch**.

A batch is quarantined when any threshold is exceeded:
- Quarantine ratio > `maxQuarantineRatio`
- Duplicate ratio > `maxDuplicateRatio`
- Critical null rate > `maxCriticalNullRate`
- Near-duplicate ratio > `maxNearDuplicateRatio`
- Source quarantine ratio > `maxSourceQuarantineRatio` (per-source)
- Any drift rule fires

When `allowPartialSalvage` is true, clean records from a quarantined batch can still be promoted — the quarantine applies to the batch decision, not to individually passing records.

## Decision artifacts

Every batch run produces a complete decision artifact containing:
- The schema and policy version used
- Per-record outcomes with specific failure reasons
- Batch-level metrics (null rates, duplicate rates, label distributions)
- Drift rule results
- The final verdict with all contributing reasons

This makes every decision **reconstructable** — you can audit why any record was approved or quarantined by inspecting its artifact.

## Policy governance

Policies follow a lifecycle: `draft` → `active` → `shadow` → `retired`.

- **Draft**: being developed, not yet used for decisions
- **Active**: the current production policy
- **Shadow**: running in parallel for comparison, not affecting outcomes
- **Retired**: no longer in use

Policy changes are gated by calibration: a policy cannot be activated unless it passes gold-set testing with acceptable F1 and zero false negatives.

## Source trust model

Data sources follow a probation model:

```
quarantine_only → partial_promotion → supervised → active
```

New sources start at `quarantine_only` — all their records are quarantined regardless of quality. After completing clean batches, they advance through probation levels until reaching `active` status where their records are treated normally.

Sources can be suspended at any time, which blocks further ingestion until an operator reactivates them.
