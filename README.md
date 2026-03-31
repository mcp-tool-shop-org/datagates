<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/datagates/readme.png" width="500" alt="datagates" />
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/datagates/actions"><img src="https://github.com/mcp-tool-shop-org/datagates/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/mcp-tool-shop-org/datagates/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License" /></a>
  <a href="https://mcp-tool-shop-org.github.io/datagates/"><img src="https://img.shields.io/badge/docs-landing%20page-blue" alt="Landing Page" /></a>
</p>

Governed data promotion system. Data earns trust through layered gates, not silent cleaning.

## What it does

Datagates treats dataset cleaning as a **promotion problem**. Records don't become trusted by passing through code — they become trusted by earning promotion under explicit, versioned, auditable law.

Four trust layers, each with its own gate:

| Layer | Gate | What it catches |
|-------|------|-----------------|
| **Row trust** | Schema validation, normalization, exact dedup | Bad structure, invalid values, duplicates |
| **Semantic trust** | Cross-field rules, near-duplicate detection | Contradictions, fuzzy duplicates, confidence |
| **Batch trust** | Metrics, drift detection, holdout overlap | Distribution shift, test set leakage, source contamination |
| **Governance trust** | Policy registry, calibration, shadow mode, overrides | Untested policy changes, silent exceptions, unvetted sources |

Every quarantine decision includes explicit reasons. Every override requires a durable receipt. Every batch decision is reconstructable from its artifact.

## Install

```bash
npm install datagates
```

## Quick start

```bash
# Initialize a project
npx datagates init --name my-project

# Edit schema.json and policy.json to match your data

# Ingest a batch
npx datagates run --input data.json

# Calibrate against a gold set
npx datagates calibrate

# Compare policies in shadow mode
npx datagates shadow --input data.json

# Review quarantined items
npx datagates review list
```

## CLI commands

| Command | Description |
|---------|-------------|
| `datagates init` | Initialize project with config, schema, policy, gold set |
| `datagates run` | Ingest a batch, execute all gates, emit verdict |
| `datagates calibrate` | Run gold set, measure FP/FN/F1, detect regression |
| `datagates shadow` | Compare active vs candidate policy without affecting data |
| `datagates review` | List, confirm, dismiss, or override review items |
| `datagates source` | Register, inspect, activate, or suspend data sources |
| `datagates artifact` | Export or inspect batch decision artifacts |
| `datagates promote-policy` | Activate a policy only after calibration passes |
| `datagates packs` | List available starter policy packs |

## Policy packs

Start with a pre-built policy instead of inventing governance from zero:

- **strict-structured** — Tight thresholds for clean structured data
- **text-dedupe** — Aggressive near-duplicate detection for text datasets
- **classification-basic** — Label drift and class disappearance detection
- **source-probation-first** — Conservative multi-source ingestion with partial salvage

```bash
npx datagates init --pack strict-structured
```

## Three-zone architecture

```
Raw (immutable) --> Candidate --> Approved
                        |
                    Quarantine
```

- **Raw**: immutable input, never modified
- **Candidate**: passed row-level gates, awaiting batch verdict
- **Approved**: promoted after batch-level gates pass
- **Quarantine**: failed one or more gates, with explicit reasons

## Programmatic API

```typescript
import { Pipeline, ZoneStore } from 'datagates';

const store = new ZoneStore('datagates.db');
const pipeline = new Pipeline(schema, policy, store);
const result = pipeline.ingest(records);

console.log(result.summary.verdict);
// { disposition: 'approve', reasons: [], warnings: [], ... }
```

## Exit codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Batch quarantined |
| 2 | Calibration regression |
| 3 | Shadow verdict changed |
| 10 | Config error |
| 11 | Missing file |
| 12 | Validation error |

## Documentation

- [Quickstart](docs/QUICKSTART.md) — End-to-end first run
- [Policies](docs/POLICIES.md) — Law, inheritance, lifecycle
- [Calibration](docs/CALIBRATION.md) — Gold sets and regression
- [Review](docs/REVIEW.md) — Queue and override receipts
- [Onboarding](docs/ONBOARDING.md) — Source probation model
- [Artifacts](docs/ARTIFACTS.md) — Decision evidence
- [Glossary](docs/GLOSSARY.md) — Terms and concepts

## Security

Datagates operates **locally only**. It reads and writes files within your project directory — JSON configs, a SQLite database, and decision artifacts. It makes no network calls, collects no telemetry, and handles no credentials. See [SECURITY.md](SECURITY.md) for the full threat model and reporting instructions.

## License

MIT

---

Built by <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
