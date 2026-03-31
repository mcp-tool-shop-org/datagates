import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Pipeline } from '../src/pipeline.js';
import { ZoneStore } from '../src/store.js';
import { hashPayload } from '../src/hash.js';
import { normalize } from '../src/normalize.js';
import type { SchemaContract, GatePolicy, RawRecord, DriftRule } from '../src/types.js';

/**
 * PHASE 3 POISON SUITE
 *
 * Exit question:
 *   Can a batch with acceptable rows but unhealthy aggregate profile,
 *   a contaminated source, holdout overlap, or distribution drift
 *   silently reach approved data?
 *
 * Expected answer after Phase 3: NO.
 */

const schema: SchemaContract = {
  schemaId: 'poison3-schema',
  schemaVersion: '3.0.0',
  fields: {
    id: { type: 'string', required: true },
    score: { type: 'number', required: true, min: 0, max: 100 },
    category: { type: 'enum', required: true, enum: ['a', 'b', 'c'] },
    label: { type: 'string', required: true },
  },
  primaryKeys: ['id'],
};

function raw(payload: Record<string, unknown>, sourceId = 'clean-source'): RawRecord {
  return { sourceId, batchRunId: '', ingestTimestamp: new Date().toISOString(), payload };
}

function valid(id: string, cat = 'a', score = 50): Record<string, unknown> {
  return { id, score, category: cat, label: `label-${id}` };
}

let store: ZoneStore;
beforeEach(() => { store = new ZoneStore(':memory:'); });
afterEach(() => { store.close(); });

describe('Phase 3 Poison Suite — holdout leakage', () => {
  it('POISON: exact holdout overlap blocked', () => {
    const policy: GatePolicy = {
      gatePolicyVersion: '3.0.0-poison', maxQuarantineRatio: 0.5,
      maxDuplicateRatio: 0.5, maxCriticalNullRate: 0.5,
      holdout: {},
    };
    const pipeline = new Pipeline(schema, policy, store);

    const holdoutPayload = valid('holdout-1');
    const normalized = normalize(holdoutPayload, schema);
    store.registerHoldout([{ id: 'h1', normalizedHash: hashPayload(normalized), payload: normalized }]);

    pipeline.ingest([raw(holdoutPayload)]);
    expect(store.countByZone('approved')).toBe(0);
  });
});

describe('Phase 3 Poison Suite — source contamination', () => {
  it('POISON: contaminated source isolated via partial salvage', () => {
    const policy: GatePolicy = {
      gatePolicyVersion: '3.0.0-poison', maxQuarantineRatio: 0.9,
      maxDuplicateRatio: 0.5, maxCriticalNullRate: 0.5,
      maxSourceQuarantineRatio: 0.4,
      allowPartialSalvage: true,
    };
    const pipeline = new Pipeline(schema, policy, store);

    pipeline.ingest([
      raw(valid('clean-1'), 'good-feed'),
      raw(valid('clean-2'), 'good-feed'),
      raw(valid('ok'), 'bad-feed'),
      raw({ id: 'garbage-1' }, 'bad-feed'), // invalid
      raw({ id: 'garbage-2' }, 'bad-feed'), // invalid
      raw({ id: 'garbage-3' }, 'bad-feed'), // invalid
    ]);

    // No records from bad-feed should be approved
    const approved = store.getByZone('approved');
    expect(approved.every(r => r.sourceId === 'good-feed')).toBe(true);
  });

  it('POISON: contaminated source blocks batch when partial salvage disabled', () => {
    const policy: GatePolicy = {
      gatePolicyVersion: '3.0.0-poison', maxQuarantineRatio: 0.9,
      maxDuplicateRatio: 0.5, maxCriticalNullRate: 0.5,
      maxSourceQuarantineRatio: 0.4,
      allowPartialSalvage: false,
    };
    const pipeline = new Pipeline(schema, policy, store);

    pipeline.ingest([
      raw(valid('clean-1'), 'good-feed'),
      raw(valid('ok'), 'bad-feed'),
      raw({ id: 'junk' }, 'bad-feed'),
      raw({ id: 'junk2' }, 'bad-feed'),
    ]);

    expect(store.countByZone('approved')).toBe(0);
  });
});

describe('Phase 3 Poison Suite — batch health', () => {
  it('POISON: batch with too many quarantined rows rejected', () => {
    const policy: GatePolicy = {
      gatePolicyVersion: '3.0.0-poison', maxQuarantineRatio: 0.2,
      maxDuplicateRatio: 0.5, maxCriticalNullRate: 0.5,
    };
    const pipeline = new Pipeline(schema, policy, store);

    // 3 bad, 1 good → 75% quarantine rate
    pipeline.ingest([
      raw(valid('good')),
      raw({ id: 'b1' }),
      raw({ id: 'b2' }),
      raw({ id: 'b3' }),
    ]);

    expect(store.countByZone('approved')).toBe(0);
  });

  it('CLEAN batch passes — sanity check', () => {
    const policy: GatePolicy = {
      gatePolicyVersion: '3.0.0', maxQuarantineRatio: 0.5,
      maxDuplicateRatio: 0.5, maxCriticalNullRate: 0.5,
    };
    const pipeline = new Pipeline(schema, policy, store);
    const result = pipeline.ingest([raw(valid('clean-1')), raw(valid('clean-2'))]);

    expect(result.summary.promoted).toBe(true);
    expect(result.summary.verdict!.disposition).toBe('approve');
    expect(store.countByZone('approved')).toBe(2);
  });
});

describe('Phase 3 Poison Suite — deterministic re-run', () => {
  it('same data + same policy = same verdict', () => {
    const policy: GatePolicy = {
      gatePolicyVersion: '3.0.0', maxQuarantineRatio: 0.5,
      maxDuplicateRatio: 0.5, maxCriticalNullRate: 0.5,
    };

    const data = [raw(valid('det-1')), raw(valid('det-2')), raw({ id: 'bad' })];

    const store1 = new ZoneStore(':memory:');
    const store2 = new ZoneStore(':memory:');

    const r1 = new Pipeline(schema, policy, store1).ingest(data);
    const r2 = new Pipeline(schema, policy, store2).ingest(data);

    expect(r1.summary.verdict!.disposition).toBe(r2.summary.verdict!.disposition);
    expect(r1.summary.rowsPassed).toBe(r2.summary.rowsPassed);
    expect(r1.summary.rowsQuarantined).toBe(r2.summary.rowsQuarantined);
    expect(r1.summary.promoted).toBe(r2.summary.promoted);

    store1.close();
    store2.close();
  });
});
