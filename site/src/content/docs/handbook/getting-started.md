---
title: Getting Started
description: Install datagates and run your first batch in under 5 minutes.
sidebar:
  order: 1
---

## Prerequisites

- Node.js 20 or later
- npm

## Install

```bash
npm install datagates
```

## Initialize a project

```bash
npx datagates init --name my-project
```

This creates:
- `datagates.json` — project configuration
- `schema.json` — field definitions (types, ranges, enums, normalization)
- `policy.json` — gate thresholds (quarantine ratios, duplicate tolerance, null rates)
- `gold-set.json` — calibration entries (known-good and known-bad records)
- `artifacts/` — directory for decision evidence

## Edit your schema

Open `schema.json` and define your fields:

```json
{
  "schemaId": "my-data",
  "schemaVersion": "1.0.0",
  "fields": {
    "id": { "type": "string", "required": true },
    "name": { "type": "string", "required": true, "normalizeCasing": "lower" },
    "value": { "type": "number", "required": true, "min": 0, "max": 10000 },
    "category": { "type": "enum", "required": true, "enum": ["alpha", "beta", "gamma"] }
  },
  "primaryKeys": ["id"]
}
```

## Ingest your first batch

Create a `data.json` with an array of records, then run:

```bash
npx datagates run --input data.json
```

The output shows:
- How many records were approved vs quarantined
- What reasons caused quarantine (schema violations, duplicates, etc.)
- The batch verdict (approve or quarantine_batch)
- A decision artifact saved to `artifacts/`

## Calibrate

Once you have a gold set (known correct outcomes), calibrate:

```bash
npx datagates calibrate
```

This measures true positives, false positives, false negatives, and F1 score against your gold set. Use the `--baseline` flag to detect regression:

```bash
npx datagates calibrate --baseline artifacts/calibration-previous.json
```

## Use a policy pack

Instead of crafting thresholds from scratch, start with a pre-built pack:

```bash
npx datagates init --pack strict-structured
```

Available packs: `strict-structured`, `text-dedupe`, `classification-basic`, `source-probation-first`. See all with `datagates packs`.

## Next steps

- [Usage guide](/datagates/handbook/usage/) — full operator workflows
- [Configuration](/datagates/handbook/configuration/) — schema and policy options
- [CLI reference](/datagates/handbook/reference/) — all commands and flags
