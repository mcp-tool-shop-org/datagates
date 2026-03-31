import type { DriftRule, DriftViolation, BatchMetrics } from './types.js';

/**
 * Compare current batch metrics against a baseline and evaluate drift rules.
 * Returns violations for any rule that exceeds its threshold.
 */
export function detectDrift(
  current: BatchMetrics,
  baseline: BatchMetrics,
  rules: DriftRule[],
): DriftViolation[] {
  const violations: DriftViolation[] = [];

  for (const rule of rules) {
    const violation = evaluateDriftRule(rule, current, baseline);
    if (violation) violations.push(violation);
  }

  return violations;
}

function evaluateDriftRule(
  rule: DriftRule,
  current: BatchMetrics,
  baseline: BatchMetrics,
): DriftViolation | null {
  switch (rule.type) {
    case 'null_spike':
      return checkNullSpike(rule, current, baseline);
    case 'label_skew':
      return checkLabelSkew(rule, current, baseline);
    case 'source_contamination':
      return checkSourceContamination(rule, current, baseline);
    case 'numeric_drift':
      return checkNumericDrift(rule, current, baseline);
    case 'class_disappearance':
      return checkClassDisappearance(rule, current, baseline);
    default:
      return null;
  }
}

/**
 * Null spike: current null rate for field exceeds baseline by more than threshold.
 */
function checkNullSpike(
  rule: DriftRule,
  current: BatchMetrics,
  baseline: BatchMetrics,
): DriftViolation | null {
  const currentRate = current.nullRates[rule.field] ?? 0;
  const baselineRate = baseline.nullRates[rule.field] ?? 0;
  const delta = currentRate - baselineRate;

  if (delta > rule.threshold) {
    return {
      ruleId: rule.id,
      description: rule.description,
      field: rule.field,
      type: 'null_spike',
      baselineValue: baselineRate,
      currentValue: currentRate,
      threshold: rule.threshold,
    };
  }
  return null;
}

/**
 * Label skew: Jensen-Shannon divergence of label distribution exceeds threshold.
 * Uses simplified relative change of the most common class.
 */
function checkLabelSkew(
  rule: DriftRule,
  current: BatchMetrics,
  baseline: BatchMetrics,
): DriftViolation | null {
  const currentDist = current.labelDistribution[rule.field];
  const baselineDist = baseline.labelDistribution[rule.field];
  if (!currentDist || !baselineDist) return null;

  const skew = distributionDivergence(currentDist, baselineDist);

  if (skew > rule.threshold) {
    return {
      ruleId: rule.id,
      description: rule.description,
      field: rule.field,
      type: 'label_skew',
      baselineValue: 0,
      currentValue: skew,
      threshold: rule.threshold,
    };
  }
  return null;
}

/**
 * Source contamination: a source's share in the current batch differs from
 * baseline by more than threshold (absolute proportion change).
 */
function checkSourceContamination(
  rule: DriftRule,
  current: BatchMetrics,
  baseline: BatchMetrics,
): DriftViolation | null {
  const currentTotal = current.rowsTotal || 1;
  const baselineTotal = baseline.rowsTotal || 1;

  const currentProportion = (current.sourceDistribution[rule.field] ?? 0) / currentTotal;
  const baselineProportion = (baseline.sourceDistribution[rule.field] ?? 0) / baselineTotal;
  const delta = Math.abs(currentProportion - baselineProportion);

  if (delta > rule.threshold) {
    return {
      ruleId: rule.id,
      description: rule.description,
      field: rule.field,
      type: 'source_contamination',
      baselineValue: baselineProportion,
      currentValue: currentProportion,
      threshold: rule.threshold,
    };
  }
  return null;
}

/**
 * Numeric drift: mean of a numeric field shifted by more than threshold
 * standard deviations from baseline.
 */
function checkNumericDrift(
  rule: DriftRule,
  current: BatchMetrics,
  baseline: BatchMetrics,
): DriftViolation | null {
  const currentSummary = current.numericSummaries[rule.field];
  const baselineSummary = baseline.numericSummaries[rule.field];
  if (!currentSummary || !baselineSummary) return null;

  const baselineStd = baselineSummary.stddev || 1;
  const zScore = Math.abs(currentSummary.mean - baselineSummary.mean) / baselineStd;

  if (zScore > rule.threshold) {
    return {
      ruleId: rule.id,
      description: rule.description,
      field: rule.field,
      type: 'numeric_drift',
      baselineValue: baselineSummary.mean,
      currentValue: currentSummary.mean,
      threshold: rule.threshold,
    };
  }
  return null;
}

/**
 * Class disappearance: a label class present in baseline is absent or
 * dropped below threshold proportion in current.
 */
function checkClassDisappearance(
  rule: DriftRule,
  current: BatchMetrics,
  baseline: BatchMetrics,
): DriftViolation | null {
  const currentDist = current.labelDistribution[rule.field];
  const baselineDist = baseline.labelDistribution[rule.field];
  if (!baselineDist) return null;

  const baselineTotal = Object.values(baselineDist).reduce((s, v) => s + v, 0) || 1;
  const currentTotal = currentDist
    ? Object.values(currentDist).reduce((s, v) => s + v, 0) || 1
    : 1;

  for (const [label, baselineCount] of Object.entries(baselineDist)) {
    const baselineProportion = baselineCount / baselineTotal;
    const currentCount = currentDist?.[label] ?? 0;
    const currentProportion = currentCount / currentTotal;

    // Only flag classes that were significant in baseline (>threshold proportion)
    if (baselineProportion >= rule.threshold && currentProportion < rule.threshold * 0.1) {
      return {
        ruleId: rule.id,
        description: rule.description,
        field: rule.field,
        type: 'class_disappearance',
        baselineValue: baselineProportion,
        currentValue: currentProportion,
        threshold: rule.threshold,
      };
    }
  }
  return null;
}

/**
 * Simple distribution divergence: sum of absolute proportion differences / 2.
 * Range [0, 1] where 0 = identical, 1 = completely disjoint.
 */
function distributionDivergence(
  a: Record<string, number>,
  b: Record<string, number>,
): number {
  const allKeys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const totalA = Object.values(a).reduce((s, v) => s + v, 0) || 1;
  const totalB = Object.values(b).reduce((s, v) => s + v, 0) || 1;

  let divergence = 0;
  for (const key of allKeys) {
    const pA = (a[key] ?? 0) / totalA;
    const pB = (b[key] ?? 0) / totalB;
    divergence += Math.abs(pA - pB);
  }
  return divergence / 2;
}
