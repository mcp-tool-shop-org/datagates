import { describe, it, expect } from 'vitest';
import { computeBatchMetrics } from '../src/metrics.js';
import type { SchemaContract, ZonedRecord } from '../src/types.js';

const schema: SchemaContract = {
  schemaId: 'metrics-test',
  schemaVersion: '1.0.0',
  fields: {
    name: { type: 'string', required: true },
    score: { type: 'number', required: true, min: 0, max: 100 },
    category: { type: 'enum', required: true, enum: ['a', 'b', 'c'] },
    note: { type: 'string', required: false },
  },
  primaryKeys: ['name'],
};

function makeRecord(overrides: Partial<ZonedRecord> = {}): ZonedRecord {
  return {
    id: 'r1', zone: 'candidate', sourceId: 'src1', batchRunId: 'b1',
    ingestTimestamp: '2024-01-01T00:00:00Z', rawHash: 'h1', normalizedHash: 'nh1',
    payload: {}, normalizedPayload: { name: 'alice', score: 50, category: 'a', note: null },
    failures: [], schemaVersion: '1.0.0', normalizationVersion: '1.0.0',
    gatePolicyVersion: '1.0.0', confidence: null,
    ...overrides,
  };
}

describe('computeBatchMetrics', () => {
  it('computes null rates for required fields only', () => {
    const records = [
      makeRecord({ id: 'r1', normalizedPayload: { name: 'alice', score: 50, category: 'a', note: null } }),
      makeRecord({ id: 'r2', normalizedPayload: { name: null, score: 30, category: 'b', note: 'hi' } }),
    ];
    const metrics = computeBatchMetrics(records, schema);
    expect(metrics.nullRates['name']).toBe(0.5);
    expect(metrics.nullRates['score']).toBe(0);
    expect(metrics.nullRates['note']).toBeUndefined(); // optional, not tracked
  });

  it('computes label distribution for enum fields', () => {
    const records = [
      makeRecord({ id: 'r1', normalizedPayload: { name: 'a', score: 10, category: 'a' } }),
      makeRecord({ id: 'r2', normalizedPayload: { name: 'b', score: 20, category: 'a' } }),
      makeRecord({ id: 'r3', normalizedPayload: { name: 'c', score: 30, category: 'b' } }),
    ];
    const metrics = computeBatchMetrics(records, schema);
    expect(metrics.labelDistribution['category']).toEqual({ a: 2, b: 1 });
  });

  it('computes source distribution', () => {
    const records = [
      makeRecord({ id: 'r1', sourceId: 'feed-a' }),
      makeRecord({ id: 'r2', sourceId: 'feed-a' }),
      makeRecord({ id: 'r3', sourceId: 'feed-b' }),
    ];
    const metrics = computeBatchMetrics(records, schema);
    expect(metrics.sourceDistribution).toEqual({ 'feed-a': 2, 'feed-b': 1 });
  });

  it('computes numeric summaries', () => {
    const records = [
      makeRecord({ id: 'r1', normalizedPayload: { name: 'a', score: 10, category: 'a' } }),
      makeRecord({ id: 'r2', normalizedPayload: { name: 'b', score: 20, category: 'b' } }),
      makeRecord({ id: 'r3', normalizedPayload: { name: 'c', score: 30, category: 'c' } }),
    ];
    const metrics = computeBatchMetrics(records, schema);
    expect(metrics.numericSummaries['score'].min).toBe(10);
    expect(metrics.numericSummaries['score'].max).toBe(30);
    expect(metrics.numericSummaries['score'].mean).toBe(20);
    expect(metrics.numericSummaries['score'].median).toBe(20);
    expect(metrics.numericSummaries['score'].count).toBe(3);
  });

  it('computes quarantine by reason', () => {
    const records = [
      makeRecord({ id: 'r1', zone: 'quarantine', failures: [
        { field: 'name', rule: 'missing_required', message: '' },
      ]}),
      makeRecord({ id: 'r2', zone: 'quarantine', failures: [
        { field: 'name', rule: 'missing_required', message: '' },
        { field: 'score', rule: 'out_of_range', message: '' },
      ]}),
      makeRecord({ id: 'r3', zone: 'candidate' }),
    ];
    const metrics = computeBatchMetrics(records, schema);
    expect(metrics.quarantineByReason['missing_required']).toBe(2);
    expect(metrics.quarantineByReason['out_of_range']).toBe(1);
  });

  it('computes row totals', () => {
    const records = [
      makeRecord({ id: 'r1', zone: 'candidate' }),
      makeRecord({ id: 'r2', zone: 'quarantine' }),
      makeRecord({ id: 'r3', zone: 'candidate' }),
    ];
    const metrics = computeBatchMetrics(records, schema);
    expect(metrics.rowsTotal).toBe(3);
    expect(metrics.rowsPassed).toBe(2);
    expect(metrics.rowsQuarantined).toBe(1);
  });

  it('handles empty batch', () => {
    const metrics = computeBatchMetrics([], schema);
    expect(metrics.rowsTotal).toBe(0);
    expect(metrics.rowsPassed).toBe(0);
    expect(metrics.duplicateRate).toBe(0);
  });
});
