# Changelog

## 1.0.0 (2026-03-31)

Release. Governed data promotion system — four trust layers, 9-command CLI, 4 policy packs.

No code changes from 1.0.0-rc.1 except release packaging:
- Version bump to 1.0.0
- SECURITY.md with threat model
- CI workflow
- Shipcheck gates passed (A-D)

## 1.0.0-rc.1 (2026-03-31)

First release candidate. Complete governed data promotion system.

### Core engine

- **Phase 1**: Schema validation, normalization, exact deduplication, content-addressed IDs
- **Phase 2**: Semantic cross-field rules (when/then), near-duplicate detection (levenshtein, token_jaccard, numeric, exact), confidence scoring
- **Phase 3**: Batch health metrics, drift detection (null_spike, label_skew, source_contamination, numeric_drift, class_disappearance), holdout overlap detection, source quarantine, batch verdict system
- **Phase 4**: Policy registry with inheritance/lifecycle, gold-set calibration with FP/FN/F1 regression detection, shadow mode, override receipts, review queue, source onboarding with probation, decision artifacts

### CLI

- `datagates init` — project scaffolding with optional policy packs
- `datagates run` — batch ingestion with full gate execution
- `datagates calibrate` — gold-set calibration with regression detection
- `datagates shadow` — active vs candidate policy comparison
- `datagates review` — review queue management
- `datagates source` — source onboarding lifecycle
- `datagates artifact` — decision evidence inspection
- `datagates promote-policy` — calibration-gated policy activation
- `datagates packs` — starter policy pack listing

### Policy packs

- strict-structured, text-dedupe, classification-basic, source-probation-first

### Examples

- Structured data (employee records)
- Text deduplication (articles)
- Multi-source with shadow policy (products)

### Tests

- 263+ tests across 22 test files
- Poison suites for Phases 1-4 proving bypass paths are closed
