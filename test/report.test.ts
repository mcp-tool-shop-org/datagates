import { describe, it, expect } from 'vitest';
import {
  formatBatchReport, formatCalibrationReport,
  formatShadowReport, formatArtifactReport, EXIT,
} from '../src/report.js';
import type {
  BatchSummary, CalibrationResult, ShadowResult, DecisionArtifact,
  ZonedRecord, BatchVerdict,
} from '../src/types.js';

function makeVerdict(overrides: Partial<BatchVerdict> = {}): BatchVerdict {
  return {
    disposition: 'approve',
    reasons: [],
    driftViolations: [],
    holdoutOverlaps: 0,
    quarantinedSources: [],
    warnings: [],
    ...overrides,
  };
}

function makeSummary(overrides: Partial<BatchSummary> = {}): BatchSummary {
  return {
    batchRunId: 'batch-1', timestamp: '2026-01-01T00:00:00Z',
    schemaVersion: '1.0.0', normalizationVersion: '1.0.0',
    gatePolicyVersion: '1.0.0',
    rowsIngested: 10, rowsPassed: 8, rowsQuarantined: 2,
    duplicatesDetected: 1, nearDuplicatesDetected: 0,
    semanticViolations: 0, nullRates: {}, avgConfidence: 0.95,
    promoted: true,
    rejectReasons: {} as any,
    verdict: makeVerdict(),
    metrics: null,
    ...overrides,
  };
}

describe('Report formatting', () => {
  it('formatBatchReport includes key metrics', () => {
    const report = formatBatchReport(makeSummary(), []);
    expect(report).toContain('batch-1');
    expect(report).toContain('Rows ingested:    10');
    expect(report).toContain('Rows quarantined: 2');
    expect(report).toContain('[PASS] APPROVE');
  });

  it('formatBatchReport shows quarantine verdict', () => {
    const report = formatBatchReport(makeSummary({
      verdict: makeVerdict({
        disposition: 'quarantine_batch',
        reasons: ['Too many bad rows'],
      }),
    }), []);
    expect(report).toContain('[FAIL] QUARANTINE_BATCH');
    expect(report).toContain('Too many bad rows');
  });

  it('formatBatchReport shows warnings', () => {
    const report = formatBatchReport(makeSummary({
      verdict: makeVerdict({
        disposition: 'approve_with_warnings',
        warnings: ['Drift detected in score field'],
      }),
    }), []);
    expect(report).toContain('[WARN]');
    expect(report).toContain('Drift detected');
  });

  it('formatBatchReport shows reject reasons breakdown', () => {
    const report = formatBatchReport(makeSummary({
      rejectReasons: { out_of_range: 3, invalid_enum: 1 } as any,
    }), []);
    expect(report).toContain('out_of_range: 3');
    expect(report).toContain('invalid_enum: 1');
  });

  it('formatCalibrationReport includes F1 and mismatches', () => {
    const result: CalibrationResult = {
      policyId: 'test', policyVersion: '1.0.0', timestamp: '2026-01-01',
      total: 4, truePositives: 2, trueNegatives: 1, falsePositives: 1, falseNegatives: 0,
      precision: 0.667, recall: 1.0, f1: 0.8,
      details: [
        { goldSetId: 'g1', expected: 'approve', actual: 'quarantine', correct: false, failures: [] },
      ],
    };
    const report = formatCalibrationReport(result);
    expect(report).toContain('F1:        0.800');
    expect(report).toContain('False positives: 1');
    expect(report).toContain('g1: expected=approve actual=quarantine');
  });

  it('formatShadowReport shows verdict change', () => {
    const result: ShadowResult = {
      shadowPolicyId: 'shadow-1', activePolicyId: 'active-1',
      batchRunId: 'batch-1', timestamp: '2026-01-01',
      activeVerdict: makeVerdict({ disposition: 'approve' }),
      shadowVerdict: makeVerdict({ disposition: 'quarantine_batch' }),
      newlyRejectedRows: 5, newlyApprovedRows: 0,
      newlyQuarantinedSources: ['vendor-x'],
      verdictChanged: true,
    };
    const report = formatShadowReport(result);
    expect(report).toContain('Verdict changed: YES');
    expect(report).toContain('Newly rejected rows:  5');
    expect(report).toContain('vendor-x');
  });

  it('formatArtifactReport shows complete evidence', () => {
    const artifact: DecisionArtifact = {
      batchRunId: 'batch-1', timestamp: '2026-01-01',
      schema: { id: 'test-schema', version: '1.0.0' },
      policy: { id: 'test-policy', version: '1.0.0', name: 'Test Policy' },
      summary: makeSummary(),
      rulesTriggered: [{ ruleId: 'out_of_range', count: 3 }],
      sourceActions: [{ sourceId: 'bad-vendor', action: 'quarantine', reason: 'contaminated' }],
      holdoutResults: { overlaps: 0 },
      driftResults: [],
      overridesApplied: [],
      verdict: makeVerdict(),
      reconstructable: true,
    };
    const report = formatArtifactReport(artifact);
    expect(report).toContain('test-schema@1.0.0');
    expect(report).toContain('test-policy@1.0.0 (Test Policy)');
    expect(report).toContain('out_of_range: 3x');
    expect(report).toContain('bad-vendor: quarantine');
    expect(report).toContain('Reconstructable: true');
  });
});

describe('Exit codes', () => {
  it('defines deterministic exit codes', () => {
    expect(EXIT.OK).toBe(0);
    expect(EXIT.BATCH_QUARANTINED).toBe(1);
    expect(EXIT.CALIBRATION_REGRESSION).toBe(2);
    expect(EXIT.SHADOW_VERDICT_CHANGED).toBe(3);
    expect(EXIT.CONFIG_ERROR).toBe(10);
    expect(EXIT.MISSING_FILE).toBe(11);
    expect(EXIT.VALIDATION_ERROR).toBe(12);
  });
});
