# Quickstart

Get a governed data run working in under 5 minutes.

## 1. Install

```bash
npm install -g datagates
```

## 2. Initialize

```bash
mkdir my-data-project && cd my-data-project
datagates init --name my-data-project
```

This creates:
- `datagates.json` — project config
- `schema.json` — field definitions (types, ranges, enums, required)
- `policy.json` — gate thresholds (quarantine ratio, duplicate ratio, etc.)
- `gold-set.json` — known-good/known-bad records for calibration
- `artifacts/` — decision evidence directory

## 3. Edit your schema

Open `schema.json` and define your fields:

```json
{
  "schemaId": "my-dataset",
  "schemaVersion": "1.0.0",
  "fields": {
    "id": { "type": "string", "required": true },
    "name": { "type": "string", "required": true, "normalizeCasing": "lower" },
    "score": { "type": "number", "required": true, "min": 0, "max": 100 },
    "label": { "type": "enum", "required": true, "enum": ["positive", "negative", "neutral"] }
  },
  "primaryKeys": ["id"]
}
```

## 4. Prepare your data

Create `data.json` — a JSON array of records:

```json
[
  { "id": "r1", "name": "Alice", "score": 85, "label": "positive" },
  { "id": "r2", "name": "Bob", "score": 42, "label": "negative" },
  { "id": "r3", "name": "Carol", "score": -5, "label": "positive" }
]
```

## 5. Run

```bash
datagates run --input data.json
```

Output:

```
  Batch: <batch-id>
  Rows ingested:    3
  Rows passed:      2
  Rows quarantined: 1

  Verdict: [PASS] APPROVE

  Quarantine breakdown:
    out_of_range: 1
```

Carol's record was quarantined because `score: -5` is below `min: 0`. The other two were promoted.

## 6. Calibrate

```bash
datagates calibrate
```

Runs your gold set against the active policy and reports precision/recall/F1. If false negatives are detected (bad data that leaked through), the calibration fails.

## 7. Review

```bash
datagates review list
```

Shows pending review items for quarantined records. Confirm or dismiss:

```bash
datagates review confirm <reviewId> operator@team.com
```

## Next steps

- Add semantic rules to `policy.json` for cross-field validation
- Configure near-duplicate detection for fuzzy dedup
- Set up a shadow policy to test changes before activation
- Register data sources with probation via `datagates source register`

See [Policies](POLICIES.md) and [Calibration](CALIBRATION.md) for details.
