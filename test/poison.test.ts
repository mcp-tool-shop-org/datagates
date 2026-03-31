import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Pipeline } from '../src/pipeline.js';
import { ZoneStore } from '../src/store.js';
import type { SchemaContract, GatePolicy, RawRecord } from '../src/types.js';

/**
 * POISON TEST SUITE
 *
 * One intentionally bad record per Phase 1 failure class.
 * If ANY poison record reaches 'approved', the test fails.
 * This directly operationalizes the Phase 1 exit question:
 *
 *   "Can bad structure, obvious invalidity, and exact duplicates
 *    silently poison approved data?"
 *
 * Expected answer after Phase 1: NO.
 */

const schema: SchemaContract = {
  schemaId: 'poison-schema',
  schemaVersion: '1.0.0',
  fields: {
    id: { type: 'string', required: true },
    value: { type: 'number', required: true, min: 0, max: 1000 },
    category: { type: 'enum', required: true, enum: ['a', 'b', 'c'] },
    timestamp: { type: 'date', required: true },
    label: { type: 'string', required: true },
  },
  primaryKeys: ['id'],
};

const strictPolicy: GatePolicy = {
  gatePolicyVersion: '1.0.0',
  maxQuarantineRatio: 0.0,
  maxDuplicateRatio: 0.0,
  maxCriticalNullRate: 0.0,
};

function raw(payload: Record<string, unknown>): RawRecord {
  return {
    sourceId: 'poison-test',
    batchRunId: '',
    ingestTimestamp: new Date().toISOString(),
    payload,
  };
}

const VALID = { id: 'clean-1', value: 42, category: 'a', timestamp: '2024-06-15', label: 'good' };

let store: ZoneStore;

beforeEach(() => { store = new ZoneStore(':memory:'); });
afterEach(() => { store.close(); });

describe('Poison Suite — no poison reaches approved', () => {
  it('POISON: missing required field (no id)', () => {
    const pipeline = new Pipeline(schema, strictPolicy, store);
    const result = pipeline.ingest([raw({ value: 10, category: 'a', timestamp: '2024-01-01', label: 'x' })]);
    expect(store.countByZone('approved')).toBe(0);
    expect(result.records[0].failures.length).toBeGreaterThan(0);
  });

  it('POISON: null critical field', () => {
    const pipeline = new Pipeline(schema, strictPolicy, store);
    const result = pipeline.ingest([raw({ id: null, value: 10, category: 'a', timestamp: '2024-01-01', label: 'x' })]);
    expect(store.countByZone('approved')).toBe(0);
  });

  it('POISON: empty string on required field', () => {
    const pipeline = new Pipeline(schema, strictPolicy, store);
    const result = pipeline.ingest([raw({ id: '', value: 10, category: 'a', timestamp: '2024-01-01', label: 'x' })]);
    expect(store.countByZone('approved')).toBe(0);
  });

  it('POISON: wrong type (string where number expected)', () => {
    const pipeline = new Pipeline(schema, strictPolicy, store);
    const result = pipeline.ingest([raw({ id: 'p1', value: 'ten', category: 'a', timestamp: '2024-01-01', label: 'x' })]);
    expect(store.countByZone('approved')).toBe(0);
  });

  it('POISON: invalid enum value', () => {
    const pipeline = new Pipeline(schema, strictPolicy, store);
    const result = pipeline.ingest([raw({ id: 'p2', value: 10, category: 'z', timestamp: '2024-01-01', label: 'x' })]);
    expect(store.countByZone('approved')).toBe(0);
  });

  it('POISON: number below minimum', () => {
    const pipeline = new Pipeline(schema, strictPolicy, store);
    const result = pipeline.ingest([raw({ id: 'p3', value: -1, category: 'a', timestamp: '2024-01-01', label: 'x' })]);
    expect(store.countByZone('approved')).toBe(0);
  });

  it('POISON: number above maximum', () => {
    const pipeline = new Pipeline(schema, strictPolicy, store);
    const result = pipeline.ingest([raw({ id: 'p4', value: 9999, category: 'a', timestamp: '2024-01-01', label: 'x' })]);
    expect(store.countByZone('approved')).toBe(0);
  });

  it('POISON: unparseable date', () => {
    const pipeline = new Pipeline(schema, strictPolicy, store);
    const result = pipeline.ingest([raw({ id: 'p5', value: 10, category: 'a', timestamp: 'not-a-date', label: 'x' })]);
    expect(store.countByZone('approved')).toBe(0);
  });

  it('POISON: NaN value', () => {
    const pipeline = new Pipeline(schema, strictPolicy, store);
    const result = pipeline.ingest([raw({ id: 'p6', value: NaN, category: 'a', timestamp: '2024-01-01', label: 'x' })]);
    expect(store.countByZone('approved')).toBe(0);
  });

  it('POISON: Infinity value', () => {
    const pipeline = new Pipeline(schema, strictPolicy, store);
    const result = pipeline.ingest([raw({ id: 'p7', value: Infinity, category: 'a', timestamp: '2024-01-01', label: 'x' })]);
    expect(store.countByZone('approved')).toBe(0);
  });

  it('POISON: unknown field injection', () => {
    const pipeline = new Pipeline(schema, strictPolicy, store);
    const result = pipeline.ingest([raw({ ...VALID, id: 'p8', __proto__: 'hack', evil: true })]);
    expect(store.countByZone('approved')).toBe(0);
  });

  it('POISON: exact duplicate payload', () => {
    const pipeline = new Pipeline(schema, strictPolicy, store);
    // First ingest succeeds
    pipeline.ingest([raw(VALID)]);
    // Strict policy: any duplicate = batch rejected
    const result = pipeline.ingest([raw(VALID)]);
    expect(result.summary.duplicatesDetected).toBe(1);
    // The duplicate itself is quarantined, never approved twice
    const approved = store.getByZone('approved');
    const approvedPayloads = approved.map(r => JSON.stringify(r.payload));
    const unique = new Set(approvedPayloads);
    expect(unique.size).toBe(approvedPayloads.length);
  });

  it('POISON: normalized duplicate (whitespace/casing variant)', () => {
    const pipeline = new Pipeline(schema, strictPolicy, store);
    pipeline.ingest([raw({ id: 'dup-1', value: 50, category: 'b', timestamp: '2024-03-01', label: 'test' })]);
    // Same content but with whitespace — different raw hash, same normalized hash
    const result = pipeline.ingest([raw({ id: '  dup-1  ', value: 50, category: 'b', timestamp: '2024-03-01', label: '  test  ' })]);
    expect(result.summary.duplicatesDetected).toBe(1);
  });

  it('CLEAN record passes — sanity check', () => {
    const pipeline = new Pipeline(schema, strictPolicy, store);
    const result = pipeline.ingest([raw(VALID)]);
    expect(result.summary.promoted).toBe(true);
    expect(store.countByZone('approved')).toBe(1);
  });
});
