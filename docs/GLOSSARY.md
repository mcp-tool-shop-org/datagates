# Glossary

| Term | Definition |
|------|-----------|
| **Approved** | Zone for records that passed all gates and were promoted. Eligible for training/eval/use. |
| **Artifact** | Decision evidence for a batch — captures schema, policy, rules, verdict, and all inputs to the decision. |
| **Batch** | A group of records ingested together. The unit of promotion or rejection at the batch level. |
| **Calibration** | Running a policy against a gold set to measure precision, recall, and F1. Catches regressions before policy activation. |
| **Candidate** | Zone for records that passed row-level gates but await batch-level verdict. |
| **Confidence** | Per-record score (0.0-1.0) based on gate signals. Higher means more trustworthy. |
| **Drift** | Distribution shift between batches — null spikes, label skew, numeric drift, or class disappearance. |
| **F1** | Harmonic mean of precision and recall. Primary calibration metric. |
| **False negative** | A record that should have been quarantined but was approved. The most dangerous calibration failure. |
| **False positive** | A record that should have been approved but was quarantined. Annoying but not dangerous. |
| **Gate** | A checkpoint that records or batches must pass. Each gate has explicit rules and reasons. |
| **Gold set** | Collection of records with known expected outcomes (approve or quarantine), used for calibration. |
| **Holdout** | A reserved set of records used to detect test-set leakage. Training data must not overlap holdout data. |
| **Near-duplicate** | A record that is not an exact match but is suspiciously similar to an existing record. |
| **Override** | An explicit exception to a gate decision. Requires actor, reason, and policy version. Immutable once created. |
| **Policy** | The set of thresholds, rules, and configurations that govern data promotion. Versioned and auditable. |
| **Probation** | The onboarding period for new data sources, during which their data faces stricter controls. |
| **Promotion** | Moving data from candidate to approved zone after passing all gates. |
| **Quarantine** | Zone for records that failed one or more gates. Includes explicit reasons for every quarantine decision. |
| **Raw** | Immutable input zone. Data enters here and is never modified. |
| **Review** | The process of inspecting quarantined items, shadow deltas, or approved samples. |
| **Schema** | The structural contract for a dataset — field types, required fields, enums, ranges. |
| **Semantic rule** | A cross-field validation rule using a when/then pattern. |
| **Shadow mode** | Running a candidate policy in parallel with the active policy to compare verdicts without affecting real data. |
| **Source** | A data provider. Each source has its own onboarding lifecycle and quarantine history. |
| **Verdict** | The batch-level decision: approve, approve_with_warnings, quarantine_batch, or partial_salvage. |
| **Zone** | A storage region with specific trust level: raw, candidate, approved, or quarantine. |
