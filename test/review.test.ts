import { describe, it, expect } from 'vitest';
import { ReviewQueue } from '../src/review.js';
import type { ZonedRecord } from '../src/types.js';

function makeRecord(overrides: Partial<ZonedRecord> = {}): ZonedRecord {
  return {
    id: `rec-${Math.random().toString(36).slice(2, 8)}`,
    zone: 'quarantine',
    sourceId: 'src-1',
    batchRunId: 'batch-1',
    ingestTimestamp: new Date().toISOString(),
    rawHash: 'abc',
    normalizedHash: null,
    payload: { name: 'test' },
    normalizedPayload: null,
    failures: [{ field: 'name', rule: 'schema_violation', message: 'bad' }],
    schemaVersion: '1.0.0',
    normalizationVersion: '1.0.0',
    gatePolicyVersion: '1.0.0',
    confidence: null,
    ...overrides,
  };
}

describe('ReviewQueue', () => {
  it('adds and retrieves review items', () => {
    const queue = new ReviewQueue();
    const item = queue.add({ type: 'quarantined_row', targetId: 'rec-1', batchRunId: 'batch-1' });
    expect(item.reviewId).toBeTruthy();
    expect(item.status).toBe('pending');
    expect(queue.getById(item.reviewId)).not.toBeNull();
  });

  it('reviews an item (status transition)', () => {
    const queue = new ReviewQueue();
    const item = queue.add({ type: 'quarantined_row', targetId: 'rec-1', batchRunId: 'batch-1' });
    const reviewed = queue.review(item.reviewId, {
      status: 'confirmed',
      reviewer: 'admin@test.com',
      notes: 'Verified as legitimate quarantine',
    });
    expect(reviewed.status).toBe('confirmed');
    expect(reviewed.reviewer).toBe('admin@test.com');
    expect(reviewed.reviewedAt).toBeTruthy();
  });

  it('rejects double-review', () => {
    const queue = new ReviewQueue();
    const item = queue.add({ type: 'quarantined_row', targetId: 'rec-1', batchRunId: 'batch-1' });
    queue.review(item.reviewId, { status: 'confirmed', reviewer: 'admin' });
    expect(() => queue.review(item.reviewId, { status: 'dismissed', reviewer: 'other' }))
      .toThrow('already confirmed');
  });

  it('throws on unknown review ID', () => {
    const queue = new ReviewQueue();
    expect(() => queue.review('nonexistent', { status: 'confirmed', reviewer: 'admin' }))
      .toThrow('not found');
  });

  it('lists pending items', () => {
    const queue = new ReviewQueue();
    queue.add({ type: 'quarantined_row', targetId: 'rec-1', batchRunId: 'batch-1' });
    queue.add({ type: 'quarantined_row', targetId: 'rec-2', batchRunId: 'batch-1' });
    const item3 = queue.add({ type: 'approved_sample', targetId: 'rec-3', batchRunId: 'batch-1' });
    queue.review(item3.reviewId, { status: 'confirmed', reviewer: 'admin' });

    expect(queue.pending()).toHaveLength(2);
  });

  it('filters by type', () => {
    const queue = new ReviewQueue();
    queue.add({ type: 'quarantined_row', targetId: 'rec-1', batchRunId: 'batch-1' });
    queue.add({ type: 'approved_sample', targetId: 'rec-2', batchRunId: 'batch-1' });
    queue.add({ type: 'shadow_delta', targetId: 'rec-3', batchRunId: 'batch-1' });

    expect(queue.list({ type: 'quarantined_row' })).toHaveLength(1);
    expect(queue.list({ type: 'shadow_delta' })).toHaveLength(1);
  });

  it('filters by batchRunId', () => {
    const queue = new ReviewQueue();
    queue.add({ type: 'quarantined_row', targetId: 'rec-1', batchRunId: 'batch-a' });
    queue.add({ type: 'quarantined_row', targetId: 'rec-2', batchRunId: 'batch-b' });

    expect(queue.list({ batchRunId: 'batch-a' })).toHaveLength(1);
  });

  it('enqueues quarantined records', () => {
    const queue = new ReviewQueue();
    const records = [
      makeRecord({ id: 'q1', zone: 'quarantine', batchRunId: 'b1' }),
      makeRecord({ id: 'q2', zone: 'quarantine', batchRunId: 'b1' }),
      makeRecord({ id: 'a1', zone: 'approved', batchRunId: 'b1' }),
    ];
    const items = queue.enqueueQuarantined(records);
    expect(items).toHaveLength(2);
    expect(items.every(i => i.type === 'quarantined_row')).toBe(true);
  });

  it('samples approved records deterministically', () => {
    const queue = new ReviewQueue();
    const records = Array.from({ length: 20 }, (_, i) =>
      makeRecord({ id: `a-${i}`, zone: 'approved', batchRunId: 'b1' })
    );
    const items = queue.sampleApproved(records, 0.1);
    // 10% of 20 = 2
    expect(items).toHaveLength(2);
    expect(items.every(i => i.type === 'approved_sample')).toBe(true);
  });

  it('samples at least 1 approved record', () => {
    const queue = new ReviewQueue();
    const records = [makeRecord({ zone: 'approved', batchRunId: 'b1' })];
    const items = queue.sampleApproved(records, 0.01);
    expect(items).toHaveLength(1);
  });

  it('review with overrideId links to override', () => {
    const queue = new ReviewQueue();
    const item = queue.add({ type: 'quarantined_row', targetId: 'rec-1', batchRunId: 'batch-1' });
    const reviewed = queue.review(item.reviewId, {
      status: 'overridden',
      reviewer: 'admin',
      overrideId: 'override-123',
    });
    expect(reviewed.overrideId).toBe('override-123');
  });

  it('exports and imports', () => {
    const queue = new ReviewQueue();
    queue.add({ type: 'quarantined_row', targetId: 'rec-1', batchRunId: 'batch-1' });
    const exported = queue.export();

    const queue2 = new ReviewQueue();
    queue2.import(exported);
    expect(queue2.pending()).toHaveLength(1);
  });
});
