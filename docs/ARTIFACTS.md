# Decision Artifacts

Every batch run produces a decision artifact — the complete evidence trail for how and why data was promoted or quarantined.

## What's captured

| Field | Description |
|-------|-------------|
| `batchRunId` | Unique batch identifier |
| `timestamp` | When the decision was made |
| `schema` | Schema ID and version used |
| `policy` | Policy ID, version, and name used |
| `summary` | Full batch summary (rows, rates, metrics) |
| `rulesTriggered` | Which rules fired and how many times |
| `sourceActions` | Source-level quarantine decisions |
| `holdoutResults` | Holdout overlap count |
| `driftResults` | Drift violations detected |
| `overridesApplied` | Override receipts applied to this batch |
| `verdict` | Final batch disposition and reasons |
| `reconstructable` | Whether the verdict can be reproduced from this artifact |

## Viewing artifacts

```bash
# List all artifacts
datagates artifact

# View a specific artifact (human-readable)
datagates artifact --id <batch-id>

# Export as JSON
datagates artifact --id <batch-id> --format json
```

## Determinism

Same input + same policy + same overrides = same verdict. Artifacts prove this by capturing every input to the decision process.

## Storage

Artifacts are saved as JSON files in the `artifacts/` directory (configurable via `artifactsPath` in `datagates.json`).

## Audit use

Artifacts answer the question: "Why was this batch promoted (or rejected)?"

For any batch, you can:
1. See which rules fired
2. See which sources were quarantined
3. See which overrides were applied
4. See the exact verdict and its reasons
5. Reproduce the verdict by re-running with the same inputs
