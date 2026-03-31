import type {
  GoldSetEntry, CalibrationResult, CalibrationDetail,
  SchemaContract, GatePolicy, RawRecord,
} from './types.js';
import { Pipeline } from './pipeline.js';
import { ZoneStore } from './store.js';

/**
 * Calibration harness: run a policy against a gold set of known-good
 * and known-bad records, measure false-positive/false-negative rates.
 */
export function calibrate(
  goldSet: GoldSetEntry[],
  schema: SchemaContract,
  policy: GatePolicy,
): CalibrationResult {
  const details: CalibrationDetail[] = [];
  let tp = 0, tn = 0, fp = 0, fn = 0;

  // Run each gold-set entry individually to get per-record verdicts
  for (const entry of goldSet) {
    const store = new ZoneStore(':memory:');
    const pipeline = new Pipeline(schema, policy, store);

    const raw: RawRecord = {
      sourceId: entry.sourceId,
      batchRunId: '',
      ingestTimestamp: new Date().toISOString(),
      payload: entry.payload,
    };

    const result = pipeline.ingest([raw]);
    const record = result.records[0];
    const actual: 'approve' | 'quarantine' =
      record.zone === 'approved' || record.zone === 'candidate' ? 'approve' : 'quarantine';

    const correct = actual === entry.expected;

    if (entry.expected === 'quarantine' && actual === 'quarantine') tp++;
    else if (entry.expected === 'approve' && actual === 'approve') tn++;
    else if (entry.expected === 'approve' && actual === 'quarantine') fp++;
    else if (entry.expected === 'quarantine' && actual === 'approve') fn++;

    details.push({
      goldSetId: entry.id,
      expected: entry.expected,
      actual,
      correct,
      failures: record.failures,
    });

    store.close();
  }

  const total = goldSet.length;
  const precision = tp + fp > 0 ? tp / (tp + fp) : 1;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 1;
  const f1 = precision + recall > 0 ? 2 * (precision * recall) / (precision + recall) : 0;

  return {
    policyId: policy.gatePolicyVersion,
    policyVersion: policy.gatePolicyVersion,
    timestamp: new Date().toISOString(),
    total,
    truePositives: tp,
    trueNegatives: tn,
    falsePositives: fp,
    falseNegatives: fn,
    precision,
    recall,
    f1,
    details,
  };
}

/**
 * Check if calibration result regresses beyond acceptable thresholds.
 */
export function checkCalibrationRegression(
  current: CalibrationResult,
  baseline: CalibrationResult,
  maxF1Drop: number = 0.05,
): { regressed: boolean; reason: string | null } {
  const f1Delta = baseline.f1 - current.f1;
  if (f1Delta > maxF1Drop) {
    return {
      regressed: true,
      reason: `F1 dropped from ${baseline.f1.toFixed(3)} to ${current.f1.toFixed(3)} (delta: ${f1Delta.toFixed(3)}, max: ${maxF1Drop})`,
    };
  }

  if (current.falseNegatives > baseline.falseNegatives) {
    return {
      regressed: true,
      reason: `False negatives increased from ${baseline.falseNegatives} to ${current.falseNegatives} — bad data may be leaking`,
    };
  }

  return { regressed: false, reason: null };
}
