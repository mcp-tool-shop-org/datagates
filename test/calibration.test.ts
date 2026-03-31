import { describe, it, expect } from 'vitest';
import { calibrate, checkCalibrationRegression } from '../src/calibration.js';
import type { SchemaContract, GatePolicy, GoldSetEntry, CalibrationResult } from '../src/types.js';

const schema: SchemaContract = {
  schemaId: 'cal-schema',
  schemaVersion: '1.0.0',
  fields: {
    name: { type: 'string', required: true, normalizeCasing: 'lower' },
    score: { type: 'number', required: true, min: 0, max: 100 },
    category: { type: 'enum', required: true, enum: ['a', 'b', 'c'] },
  },
  primaryKeys: ['name'],
};

const basePolicy: GatePolicy = {
  gatePolicyVersion: '1.0.0',
  maxQuarantineRatio: 0.5,
  maxDuplicateRatio: 0.5,
  maxCriticalNullRate: 0.5,
};

describe('calibrate', () => {
  it('scores perfect when gold set matches policy behavior', () => {
    const goldSet: GoldSetEntry[] = [
      { id: 'g1', payload: { name: 'Alice', score: 50, category: 'a' }, sourceId: 's1', expected: 'approve', reason: 'valid' },
      { id: 'g2', payload: { name: 'Bob', score: 999, category: 'a' }, sourceId: 's1', expected: 'quarantine', reason: 'out of range' },
      { id: 'g3', payload: { name: 'Carol', score: 50, category: 'x' }, sourceId: 's1', expected: 'quarantine', reason: 'invalid enum' },
    ];

    const result = calibrate(goldSet, schema, basePolicy);

    expect(result.total).toBe(3);
    expect(result.truePositives).toBe(2); // correctly quarantined
    expect(result.trueNegatives).toBe(1); // correctly approved
    expect(result.falsePositives).toBe(0);
    expect(result.falseNegatives).toBe(0);
    expect(result.f1).toBe(1.0);
    expect(result.precision).toBe(1.0);
    expect(result.recall).toBe(1.0);
  });

  it('detects false positives (approved records that policy quarantines)', () => {
    // Policy is strict (range 0-100), gold set says score 150 is valid
    const goldSet: GoldSetEntry[] = [
      { id: 'g1', payload: { name: 'Alice', score: 150, category: 'a' }, sourceId: 's1', expected: 'approve', reason: 'user says valid' },
    ];

    const result = calibrate(goldSet, schema, basePolicy);
    expect(result.falsePositives).toBe(1);
    expect(result.trueNegatives).toBe(0);
    expect(result.precision).toBe(0); // no TP, only FP
  });

  it('detects false negatives (quarantine records that policy approves)', () => {
    // Gold set says should be quarantined, but record passes all gates
    const goldSet: GoldSetEntry[] = [
      { id: 'g1', payload: { name: 'Sneaky', score: 50, category: 'a' }, sourceId: 's1', expected: 'quarantine', reason: 'known bad actor' },
    ];

    const result = calibrate(goldSet, schema, basePolicy);
    expect(result.falseNegatives).toBe(1);
    expect(result.truePositives).toBe(0);
  });

  it('includes per-record details', () => {
    const goldSet: GoldSetEntry[] = [
      { id: 'g1', payload: { name: 'OK', score: 50, category: 'a' }, sourceId: 's1', expected: 'approve', reason: 'valid' },
      { id: 'g2', payload: { name: 'Bad', score: -5, category: 'a' }, sourceId: 's1', expected: 'quarantine', reason: 'negative' },
    ];

    const result = calibrate(goldSet, schema, basePolicy);
    expect(result.details).toHaveLength(2);
    expect(result.details[0].goldSetId).toBe('g1');
    expect(result.details[0].correct).toBe(true);
    expect(result.details[1].goldSetId).toBe('g2');
    expect(result.details[1].correct).toBe(true);
    expect(result.details[1].failures.length).toBeGreaterThan(0);
  });

  it('records policy version in result', () => {
    const goldSet: GoldSetEntry[] = [
      { id: 'g1', payload: { name: 'X', score: 50, category: 'a' }, sourceId: 's1', expected: 'approve', reason: 'ok' },
    ];
    const result = calibrate(goldSet, schema, { ...basePolicy, gatePolicyVersion: '2.5.0' });
    expect(result.policyVersion).toBe('2.5.0');
  });
});

describe('checkCalibrationRegression', () => {
  function makeResult(overrides: Partial<CalibrationResult> = {}): CalibrationResult {
    return {
      policyId: 'test', policyVersion: '1.0.0', timestamp: new Date().toISOString(),
      total: 10, truePositives: 5, trueNegatives: 4, falsePositives: 1, falseNegatives: 0,
      precision: 0.833, recall: 1.0, f1: 0.909,
      details: [],
      ...overrides,
    };
  }

  it('passes when F1 is stable', () => {
    const baseline = makeResult({ f1: 0.9 });
    const current = makeResult({ f1: 0.88 });
    const check = checkCalibrationRegression(current, baseline, 0.05);
    expect(check.regressed).toBe(false);
  });

  it('detects F1 regression', () => {
    const baseline = makeResult({ f1: 0.95 });
    const current = makeResult({ f1: 0.85 });
    const check = checkCalibrationRegression(current, baseline, 0.05);
    expect(check.regressed).toBe(true);
    expect(check.reason).toContain('F1 dropped');
  });

  it('detects false negative increase even when F1 is stable', () => {
    const baseline = makeResult({ f1: 0.9, falseNegatives: 1 });
    const current = makeResult({ f1: 0.9, falseNegatives: 3 });
    const check = checkCalibrationRegression(current, baseline);
    expect(check.regressed).toBe(true);
    expect(check.reason).toContain('False negatives increased');
  });

  it('allows false negative decrease', () => {
    const baseline = makeResult({ f1: 0.9, falseNegatives: 5 });
    const current = makeResult({ f1: 0.92, falseNegatives: 2 });
    const check = checkCalibrationRegression(current, baseline);
    expect(check.regressed).toBe(false);
  });
});
