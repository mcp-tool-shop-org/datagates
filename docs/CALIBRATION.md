# Calibration

Calibration measures how well a policy catches what it should catch and passes what it should pass. It is the primary defense against policy regressions.

## Gold set

A gold set is a collection of records with known expected outcomes:

```json
[
  {
    "id": "gold-1",
    "payload": { "name": "Valid Record", "score": 50, "category": "alpha" },
    "sourceId": "gold",
    "expected": "approve",
    "reason": "All fields valid, should pass all gates"
  },
  {
    "id": "gold-2",
    "payload": { "name": "Bad Score", "score": -10, "category": "alpha" },
    "sourceId": "gold",
    "expected": "quarantine",
    "reason": "Negative score is out of range"
  }
]
```

Each entry has:
- `expected`: `"approve"` or `"quarantine"`
- `reason`: why this record belongs in the gold set

## Running calibration

```bash
datagates calibrate
```

Output:

```
  Calibration: active@1.0.0
  Gold set size: 4

  True positives:  2
  True negatives:  2
  False positives: 0
  False negatives: 0

  Precision: 1.000
  Recall:    1.000
  F1:        1.000
```

## Metrics

| Metric | Meaning |
|--------|---------|
| True positive | Expected quarantine, actually quarantined |
| True negative | Expected approve, actually approved |
| False positive | Expected approve, but quarantined (policy too strict) |
| False negative | Expected quarantine, but approved (bad data leaked through) |
| Precision | TP / (TP + FP) — how many quarantines were correct |
| Recall | TP / (TP + FN) — how many bad records were caught |
| F1 | Harmonic mean of precision and recall |

## Regression detection

Compare against a baseline calibration result:

```bash
datagates calibrate --baseline artifacts/calibration-baseline.json
```

A regression is detected if:
- F1 drops more than the threshold (default: 0.05)
- False negatives increase (bad data leaking)

The CLI exits with code 2 on regression.

## Best practices

1. Include at least one record per failure class in your gold set
2. Include edge cases that are close to thresholds
3. Save calibration results as baselines before changing policies
4. Run calibration in CI before deploying policy changes
5. Never skip calibration when promoting a policy
