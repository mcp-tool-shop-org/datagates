import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Pipeline } from '../src/pipeline.js';
import { ZoneStore } from '../src/store.js';
import type { SchemaContract, GatePolicy, RawRecord, SemanticRule, NearDuplicateConfig } from '../src/types.js';

/**
 * PHASE 2 POISON SUITE
 *
 * Extends the Phase 1 exit question:
 *
 *   Can semantically wrong but well-formed rows, contradictory fields,
 *   or near-duplicate clusters silently poison approved data?
 *
 * Expected answer after Phase 2: NO.
 */

const schema: SchemaContract = {
  schemaId: 'poison2-schema',
  schemaVersion: '2.0.0',
  fields: {
    id: { type: 'string', required: true },
    status: { type: 'enum', required: true, enum: ['open', 'closed', 'archived'] },
    closedAt: { type: 'date', required: false },
    price: { type: 'number', required: true, min: 0, max: 10000 },
    tier: { type: 'enum', required: true, enum: ['free', 'basic', 'premium'] },
    label: { type: 'string', required: true },
    description: { type: 'string', required: false },
  },
  primaryKeys: ['id'],
};

const semanticRules: SemanticRule[] = [
  {
    id: 'closed-needs-date',
    description: 'Closed items must have closedAt',
    when: { field: 'status', operator: 'equals', value: 'closed' },
    then: { field: 'closedAt', operator: 'exists' },
    failureClass: 'field_contradiction',
  },
  {
    id: 'premium-not-zero',
    description: 'Premium tier cannot have price 0',
    when: { field: 'tier', operator: 'equals', value: 'premium' },
    then: { field: 'price', operator: 'gt', value: 0 },
    failureClass: 'cross_field_violation',
  },
  {
    id: 'archived-not-premium',
    description: 'Archived items cannot be premium',
    when: { field: 'status', operator: 'equals', value: 'archived' },
    then: { field: 'tier', operator: 'not_in', value: ['premium'] },
    failureClass: 'field_contradiction',
  },
  {
    id: 'label-format',
    description: 'Labels must match alphanumeric-dash pattern',
    when: { field: 'label', operator: 'exists' },
    then: { field: 'label', operator: 'matches', value: '^[a-z0-9-]+$' },
    failureClass: 'cross_field_violation',
  },
];

const nearDupConfig: NearDuplicateConfig = {
  fields: [
    { field: 'label', similarity: 'levenshtein', weight: 2.0 },
    { field: 'description', similarity: 'token_jaccard', weight: 1.5 },
    { field: 'price', similarity: 'numeric', weight: 0.5 },
  ],
  threshold: 0.85,
};

const strictPolicy: GatePolicy = {
  gatePolicyVersion: '2.0.0-poison',
  maxQuarantineRatio: 0.0,
  maxDuplicateRatio: 0.0,
  maxCriticalNullRate: 0.0,
  semanticRules,
  nearDuplicate: nearDupConfig,
  maxNearDuplicateRatio: 0.0,
  minConfidence: 0.5,
};

function raw(payload: Record<string, unknown>): RawRecord {
  return { sourceId: 'poison2', batchRunId: '', ingestTimestamp: new Date().toISOString(), payload };
}

const VALID = {
  id: 'clean-1', status: 'open', price: 42, tier: 'free',
  label: 'good-record', description: 'a perfectly valid item',
};

let store: ZoneStore;
beforeEach(() => { store = new ZoneStore(':memory:'); });
afterEach(() => { store.close(); });

describe('Phase 2 Poison Suite — semantic poisons', () => {
  it('POISON: closed without closedAt (field contradiction)', () => {
    const pipeline = new Pipeline(schema, strictPolicy, store);
    pipeline.ingest([raw({
      id: 'p-sem-1', status: 'closed', price: 10, tier: 'free', label: 'test-closed',
    })]);
    expect(store.countByZone('approved')).toBe(0);
  });

  it('POISON: premium with price 0 (cross-field violation)', () => {
    const pipeline = new Pipeline(schema, strictPolicy, store);
    pipeline.ingest([raw({
      id: 'p-sem-2', status: 'open', price: 0, tier: 'premium', label: 'zero-premium',
    })]);
    expect(store.countByZone('approved')).toBe(0);
  });

  it('POISON: archived + premium (contradiction)', () => {
    const pipeline = new Pipeline(schema, strictPolicy, store);
    pipeline.ingest([raw({
      id: 'p-sem-3', status: 'archived', price: 99, tier: 'premium', label: 'archived-premium',
    })]);
    expect(store.countByZone('approved')).toBe(0);
  });

  it('POISON: invalid label format (cross-field violation)', () => {
    const pipeline = new Pipeline(schema, strictPolicy, store);
    pipeline.ingest([raw({
      id: 'p-sem-4', status: 'open', price: 10, tier: 'free', label: 'INVALID LABEL!',
    })]);
    expect(store.countByZone('approved')).toBe(0);
  });

  it('POISON: multiple semantic violations in one record', () => {
    const pipeline = new Pipeline(schema, strictPolicy, store);
    // archived + premium + invalid label
    pipeline.ingest([raw({
      id: 'p-sem-5', status: 'archived', price: 0, tier: 'premium', label: 'BAD LABEL',
    })]);
    expect(store.countByZone('approved')).toBe(0);
  });
});

describe('Phase 2 Poison Suite — near-duplicate poisons', () => {
  it('POISON: near-duplicate by label typo', () => {
    const pipeline = new Pipeline(schema, strictPolicy, store);
    pipeline.ingest([raw(VALID)]);
    pipeline.ingest([raw({
      id: 'p-dup-1', status: 'open', price: 42, tier: 'free',
      label: 'good-recrd', description: 'a perfectly valid item',
    })]);

    // Only the original should be approved
    const approved = store.getByZone('approved');
    expect(approved).toHaveLength(1);
    expect(approved[0].payload.id).toBe('clean-1');
  });

  it('POISON: near-duplicate by description overlap', () => {
    const pipeline = new Pipeline(schema, strictPolicy, store);
    pipeline.ingest([raw({
      id: 'orig', status: 'open', price: 100, tier: 'basic',
      label: 'product-x', description: 'advanced machine learning toolkit for data scientists',
    })]);
    pipeline.ingest([raw({
      id: 'p-dup-2', status: 'open', price: 100, tier: 'basic',
      label: 'product-x', description: 'advanced machine learning toolkit for data scientist',
    })]);

    const approved = store.getByZone('approved');
    expect(approved).toHaveLength(1);
  });

  it('POISON: near-duplicate cluster (3 similar records)', () => {
    const pipeline = new Pipeline(schema, strictPolicy, store);
    const base = { status: 'open', price: 50, tier: 'free', description: 'data processing pipeline tool' };

    pipeline.ingest([raw({ ...base, id: 'cluster-1', label: 'data-pipe' })]);
    // These should all be caught as near-dupes
    pipeline.ingest([raw({ ...base, id: 'cluster-2', label: 'data-pip' })]);
    pipeline.ingest([raw({ ...base, id: 'cluster-3', label: 'data-pype' })]);

    const approved = store.getByZone('approved');
    expect(approved).toHaveLength(1);
    expect(approved[0].payload.id).toBe('cluster-1');
  });

  it('CLEAN record still passes — sanity check', () => {
    const pipeline = new Pipeline(schema, strictPolicy, store);
    const result = pipeline.ingest([raw(VALID)]);
    expect(result.summary.promoted).toBe(true);
    expect(store.countByZone('approved')).toBe(1);
  });
});

describe('Phase 2 Poison Suite — combined threats', () => {
  it('POISON: structurally valid + semantically invalid + near-duplicate', () => {
    const pipeline = new Pipeline(schema, strictPolicy, store);
    // Seed a valid record
    pipeline.ingest([raw(VALID)]);

    // This is structurally valid, has a semantic violation (closed without date),
    // AND is a near-duplicate of the original by label
    const result = pipeline.ingest([raw({
      id: 'p-combo', status: 'closed', price: 42, tier: 'free',
      label: 'good-record', description: 'a perfectly valid item',
    })]);

    expect(store.getByZone('approved')).toHaveLength(1); // only original
    expect(result.summary.rowsQuarantined).toBe(1);
  });
});
