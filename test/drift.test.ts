import { describe, it, expect } from 'vitest';
import { detectDrift } from '../src/drift.js';
import type { BatchMetrics, DriftRule } from '../src/types.js';

function makeMetrics(overrides: Partial<BatchMetrics> = {}): BatchMetrics {
  return {
    nullRates: {}, labelDistribution: {}, sourceDistribution: {},
    numericSummaries: {}, quarantineByReason: {},
    rowsTotal: 100, rowsPassed: 90, rowsQuarantined: 10,
    duplicateRate: 0.05, nearDuplicateRate: 0.02,
    ...overrides,
  };
}

describe('detectDrift', () => {
  describe('null_spike', () => {
    const rule: DriftRule = {
      id: 'ns-1', description: 'Name null rate spike', type: 'null_spike',
      field: 'name', threshold: 0.1,
    };

    it('detects null rate spike above threshold', () => {
      const baseline = makeMetrics({ nullRates: { name: 0.02 } });
      const current = makeMetrics({ nullRates: { name: 0.20 } });
      const violations = detectDrift(current, baseline, [rule]);
      expect(violations).toHaveLength(1);
      expect(violations[0].type).toBe('null_spike');
      expect(violations[0].currentValue).toBe(0.20);
    });

    it('passes when spike is within threshold', () => {
      const baseline = makeMetrics({ nullRates: { name: 0.02 } });
      const current = makeMetrics({ nullRates: { name: 0.05 } });
      expect(detectDrift(current, baseline, [rule])).toHaveLength(0);
    });
  });

  describe('label_skew', () => {
    const rule: DriftRule = {
      id: 'ls-1', description: 'Category distribution skew', type: 'label_skew',
      field: 'category', threshold: 0.3,
    };

    it('detects label distribution shift', () => {
      const baseline = makeMetrics({
        labelDistribution: { category: { a: 40, b: 40, c: 20 } },
      });
      const current = makeMetrics({
        labelDistribution: { category: { a: 90, b: 5, c: 5 } },
      });
      const violations = detectDrift(current, baseline, [rule]);
      expect(violations).toHaveLength(1);
      expect(violations[0].type).toBe('label_skew');
    });

    it('passes when distribution is stable', () => {
      const baseline = makeMetrics({
        labelDistribution: { category: { a: 40, b: 40, c: 20 } },
      });
      const current = makeMetrics({
        labelDistribution: { category: { a: 42, b: 38, c: 20 } },
      });
      expect(detectDrift(current, baseline, [rule])).toHaveLength(0);
    });
  });

  describe('source_contamination', () => {
    const rule: DriftRule = {
      id: 'sc-1', description: 'Feed-x proportion spike', type: 'source_contamination',
      field: 'feed-x', threshold: 0.2,
    };

    it('detects source proportion spike', () => {
      const baseline = makeMetrics({
        rowsTotal: 100, sourceDistribution: { 'feed-x': 10, 'feed-y': 90 },
      });
      const current = makeMetrics({
        rowsTotal: 100, sourceDistribution: { 'feed-x': 50, 'feed-y': 50 },
      });
      const violations = detectDrift(current, baseline, [rule]);
      expect(violations).toHaveLength(1);
      expect(violations[0].type).toBe('source_contamination');
    });

    it('passes when source proportion is stable', () => {
      const baseline = makeMetrics({
        rowsTotal: 100, sourceDistribution: { 'feed-x': 30, 'feed-y': 70 },
      });
      const current = makeMetrics({
        rowsTotal: 100, sourceDistribution: { 'feed-x': 35, 'feed-y': 65 },
      });
      expect(detectDrift(current, baseline, [rule])).toHaveLength(0);
    });
  });

  describe('numeric_drift', () => {
    const rule: DriftRule = {
      id: 'nd-1', description: 'Price mean drift', type: 'numeric_drift',
      field: 'price', threshold: 2.0, // 2 standard deviations
    };

    it('detects mean drift beyond z-score threshold', () => {
      const baseline = makeMetrics({
        numericSummaries: { price: { min: 0, max: 100, mean: 50, median: 50, stddev: 10, count: 100 } },
      });
      const current = makeMetrics({
        numericSummaries: { price: { min: 0, max: 100, mean: 80, median: 80, stddev: 10, count: 50 } },
      });
      const violations = detectDrift(current, baseline, [rule]);
      expect(violations).toHaveLength(1);
      expect(violations[0].type).toBe('numeric_drift');
    });

    it('passes when mean is within z-score threshold', () => {
      const baseline = makeMetrics({
        numericSummaries: { price: { min: 0, max: 100, mean: 50, median: 50, stddev: 10, count: 100 } },
      });
      const current = makeMetrics({
        numericSummaries: { price: { min: 0, max: 100, mean: 55, median: 55, stddev: 10, count: 50 } },
      });
      expect(detectDrift(current, baseline, [rule])).toHaveLength(0);
    });
  });

  describe('class_disappearance', () => {
    const rule: DriftRule = {
      id: 'cd-1', description: 'Category class disappearance', type: 'class_disappearance',
      field: 'category', threshold: 0.1, // classes with >10% baseline share
    };

    it('detects disappeared class', () => {
      const baseline = makeMetrics({
        labelDistribution: { category: { a: 30, b: 30, c: 40 } },
      });
      const current = makeMetrics({
        labelDistribution: { category: { a: 50, b: 50 } }, // c disappeared
      });
      const violations = detectDrift(current, baseline, [rule]);
      expect(violations).toHaveLength(1);
      expect(violations[0].type).toBe('class_disappearance');
    });

    it('passes when all classes present', () => {
      const baseline = makeMetrics({
        labelDistribution: { category: { a: 30, b: 30, c: 40 } },
      });
      const current = makeMetrics({
        labelDistribution: { category: { a: 35, b: 35, c: 30 } },
      });
      expect(detectDrift(current, baseline, [rule])).toHaveLength(0);
    });

    it('ignores rare classes below threshold', () => {
      const baseline = makeMetrics({
        labelDistribution: { category: { a: 45, b: 45, rare: 1 } }, // rare < 10%
      });
      const current = makeMetrics({
        labelDistribution: { category: { a: 50, b: 50 } }, // rare gone but it was tiny
      });
      expect(detectDrift(current, baseline, [rule])).toHaveLength(0);
    });
  });

  it('collects multiple violations', () => {
    const rules: DriftRule[] = [
      { id: 'ns', description: 'null spike', type: 'null_spike', field: 'name', threshold: 0.05 },
      { id: 'nd', description: 'numeric drift', type: 'numeric_drift', field: 'price', threshold: 1.0 },
    ];
    const baseline = makeMetrics({
      nullRates: { name: 0.01 },
      numericSummaries: { price: { min: 0, max: 100, mean: 50, median: 50, stddev: 5, count: 100 } },
    });
    const current = makeMetrics({
      nullRates: { name: 0.20 },
      numericSummaries: { price: { min: 0, max: 100, mean: 80, median: 80, stddev: 5, count: 50 } },
    });
    const violations = detectDrift(current, baseline, rules);
    expect(violations).toHaveLength(2);
  });

  it('returns empty when no baseline drift rules', () => {
    expect(detectDrift(makeMetrics(), makeMetrics(), [])).toHaveLength(0);
  });
});
