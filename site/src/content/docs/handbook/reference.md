---
title: CLI Reference
description: Complete command reference for the datagates CLI.
sidebar:
  order: 4
---

## Global options

| Flag | Description |
|------|-------------|
| `--help` | Show help message |
| `--version` | Show version |
| `--debug` | Show full stack traces on error |

## Commands

### `datagates init`

Initialize a new datagates project in the current directory.

```bash
datagates init [--name <project-name>] [--pack <pack-id>]
```

| Flag | Default | Description |
|------|---------|-------------|
| `--name` | `my-project` | Project name |
| `--pack` | — | Policy pack to use (see `datagates packs`) |

Creates: `datagates.json`, `schema.json`, `policy.json`, `gold-set.json`, `artifacts/`

### `datagates run`

Ingest a batch of records through all four trust layers.

```bash
datagates run --input <path> [--source-id <id>]
```

| Flag | Default | Description |
|------|---------|-------------|
| `--input`, `-i` | *required* | Path to JSON file (array of record objects) |
| `--source-id` | `cli` | Source identifier for provenance tracking |

**Exit codes:** 0 = approved, 1 = batch quarantined

### `datagates calibrate`

Run the gold set against the current policy and measure accuracy.

```bash
datagates calibrate [--baseline <path>] [--max-f1-drop <n>]
```

| Flag | Default | Description |
|------|---------|-------------|
| `--baseline`, `-b` | — | Path to previous calibration result for regression check |
| `--max-f1-drop` | `0.05` | Maximum allowed F1 score decrease |

**Exit codes:** 0 = passed, 2 = regression detected

### `datagates shadow`

Compare active policy against a candidate policy without affecting live data.

```bash
datagates shadow --input <path> [--source-id <id>]
```

Requires `shadowPolicyPath` in `datagates.json`.

**Exit codes:** 0 = no change, 3 = verdict would change

### `datagates review`

Manage the review queue for quarantined records.

```bash
datagates review list [status]
datagates review confirm <reviewId> [reviewer]
datagates review dismiss <reviewId> [reviewer]
datagates review override <reviewId> [reviewer]
```

| Subcommand | Description |
|------------|-------------|
| `list` | Show pending review items (optionally filter by status) |
| `confirm` | Confirm the quarantine decision |
| `dismiss` | Mark quarantine as incorrect |
| `override` | Force-approve with a durable receipt |

### `datagates source`

Manage data source registration and probation.

```bash
datagates source list
datagates source register --id <sourceId> [--batches <n>]
datagates source activate <sourceId>
datagates source suspend <sourceId>
```

| Subcommand | Description |
|------------|-------------|
| `list` | Show all sources with probation status |
| `register` | Register a new source (starts on probation) |
| `activate` | Manually promote a source to active |
| `suspend` | Suspend a source (blocks further ingestion) |

Register options:

| Flag | Default | Description |
|------|---------|-------------|
| `--id` | *required* | Source identifier |
| `--schema` | `default` | Schema ID |
| `--fields` | — | Comma-separated critical fields |
| `--dedupe` | `normalized_hash` | Dedup strategy |
| `--batches` | `3` | Probation batch count |

### `datagates artifact`

Inspect decision artifacts from previous batch runs.

```bash
datagates artifact
datagates artifact --id <batch-run-id> [--format text|json]
```

| Flag | Default | Description |
|------|---------|-------------|
| `--id` | — | Artifact ID to inspect (omit to list all) |
| `--format` | `text` | Output format (`text` or `json`) |

### `datagates promote-policy`

Activate a policy only after calibration checks pass.

```bash
datagates promote-policy [--require-calibration] [--require-shadow]
```

Blocks promotion if:
- False negatives detected (bad data would leak through)
- F1 score below 0.8

### `datagates packs`

List available starter policy packs.

```bash
datagates packs
```

## Exit codes

| Code | Meaning |
|------|---------|
| 0 | Success / batch approved |
| 1 | Batch quarantined |
| 2 | Calibration regression detected |
| 3 | Shadow verdict changed |
| 10 | Configuration error |
| 11 | Missing file |
| 12 | Validation error |
