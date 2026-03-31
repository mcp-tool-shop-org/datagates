# Source Onboarding

New data sources start constrained, not trusted. They must earn promotion through a probation period before gaining full ingestion rights.

## Probation model

Every source passes through three levels:

```
quarantine_only --> partial_promotion --> supervised --> active
```

| Level | Promotion rights |
|-------|-----------------|
| `quarantine_only` | All records quarantined regardless of quality |
| `partial_promotion` | Records can be promoted, but source is monitored |
| `supervised` | Full rights, but still in probation (must be explicitly activated) |
| `active` | Fully trusted, no probation restrictions |

## Registering a source

```bash
datagates source register --id vendor-a --batches 5
```

Options:
- `--id` — unique source identifier
- `--schema` — schema ID this source uses (default: `default`)
- `--fields` — comma-separated critical fields
- `--dedupe` — deduplication strategy (default: `normalized_hash`)
- `--batches` — number of probation batches required (default: 3)

## Progression

Probation level upgrades automatically based on completed batches:

| Progress | Level |
|----------|-------|
| 0% to <50% | `quarantine_only` |
| 50% to <100% | `partial_promotion` |
| 100% | `supervised` (ready for activation) |

## Activation

After completing probation, explicitly activate:

```bash
datagates source activate vendor-a
```

Activation will fail if probation batches are not complete.

## Suspension

Suspend a source at any time:

```bash
datagates source suspend vendor-a
```

Suspended sources are quarantine-only.

## Inspection

```bash
datagates source list
```

Output:
```
  vendor-a: probation (partial_promotion) — 2/5 batches
  vendor-b: active — 5/5 batches
  vendor-c: suspended — 1/3 batches
```

## Why probation matters

Without source onboarding, a new vendor with poor data quality can silently dilute your approved dataset. Probation ensures:
- Bad sources are caught early
- Quality baselines are established per source
- Activation is an explicit decision, not a default
