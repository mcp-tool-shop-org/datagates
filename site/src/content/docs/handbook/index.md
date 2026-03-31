---
title: Datagates
description: Governed data promotion system — data earns trust through layered gates, not silent cleaning.
sidebar:
  order: 0
---

Datagates treats dataset cleaning as a **promotion problem**. Records don't become trusted by passing through a filter — they become trusted by earning promotion under explicit, versioned, auditable law.

## The doctrine

Most data cleaning tools ask: *"Is this data clean?"*

Datagates asks: *"Did this data earn promotion?"*

The difference matters. "Clean" is subjective and implicit. "Promoted" requires evidence — a schema that was checked, a policy that was applied, a reason that was recorded, a receipt that was filed.

## Four trust layers

Every record passes through four layers before it earns the `approved` zone:

| Layer | Gate | What it catches |
|-------|------|-----------------|
| **Row trust** | Schema validation, normalization, exact dedup | Bad structure, invalid values, duplicates |
| **Semantic trust** | Cross-field rules, near-dup detection | Contradictions, fuzzy duplicates, low confidence |
| **Batch trust** | Metrics, drift detection, holdout overlap | Distribution shift, test set leakage, source contamination |
| **Governance trust** | Policy registry, calibration, shadow mode | Untested policy changes, silent exceptions, unvetted sources |

## Three zones

```
Raw (immutable) → Candidate → Approved
                      |
                  Quarantine
```

- **Raw**: immutable input, content-addressed, never modified
- **Candidate**: passed row-level gates, awaiting batch verdict
- **Approved**: promoted after all batch-level gates pass
- **Quarantine**: failed one or more gates, with explicit reasons attached

## What makes this different

- **Every quarantine decision includes explicit reasons** — not just "rejected"
- **Every override requires a durable receipt** — actor, reason, policy version, optional expiration
- **Every batch decision is reconstructable** from its decision artifact
- **Policy changes are calibrated** against gold sets before activation
- **New data sources start on probation** and earn trust through clean batches
- **Shadow mode** lets you compare candidate policies without affecting live data
