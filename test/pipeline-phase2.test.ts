import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Pipeline } from '../src/pipeline.js';
import { ZoneStore } from '../src/store.js';
import type { SchemaContract, GatePolicy, RawRecord, SemanticRule, NearDuplicateConfig } from '../src/types.js';

const schema: SchemaContract = {
  schemaId: 'phase2-schema',
  schemaVersion: '2.0.0',
  fields: {
    name: { type: 'string', required: true, normalizeCasing: 'lower' },
    status: { type: 'enum', required: true, enum: ['open', 'closed', 'draft', 'blocked'] },
    closedAt: { type: 'date', required: false },
    price: { type: 'number', required: true, min: 0, max: 10000 },
    tier: { type: 'enum', required: true, enum: ['free', 'premium', 'enterprise'] },
    description: { type: 'string', required: false },
  },
  primaryKeys: ['name'],
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
    id: 'premium-not-free',
    description: 'Premium tier must have price > 0',
    when: { field: 'tier', operator: 'equals', value: 'premium' },
    then: { field: 'price', operator: 'gt', value: 0 },
    failureClass: 'cross_field_violation',
  },
  {
    id: 'blocked-not-premium',
    description: 'Blocked items cannot be premium',
    when: { field: 'status', operator: 'equals', value: 'blocked' },
    then: { field: 'tier', operator: 'not_in', value: ['premium', 'enterprise'] },
    failureClass: 'field_contradiction',
  },
];

const nearDupConfig: NearDuplicateConfig = {
  fields: [
    { field: 'name', similarity: 'levenshtein', weight: 2.0 },
    { field: 'description', similarity: 'token_jaccard', weight: 1.0 },
    { field: 'price', similarity: 'numeric', weight: 0.5 },
  ],
  threshold: 0.85,
};

const policy: GatePolicy = {
  gatePolicyVersion: '2.0.0',
  maxQuarantineRatio: 0.5,
  maxDuplicateRatio: 0.5,
  maxCriticalNullRate: 0.1,
  semanticRules,
  nearDuplicate: nearDupConfig,
  minConfidence: 0.0,
  maxNearDuplicateRatio: 0.5,
};

const strictPolicy: GatePolicy = {
  ...policy,
  gatePolicyVersion: '2.0.0-strict',
  maxQuarantineRatio: 0.0,
  maxNearDuplicateRatio: 0.0,
};

function raw(payload: Record<string, unknown>, sourceId = 'test-src'): RawRecord {
  return { sourceId, batchRunId: '', ingestTimestamp: new Date().toISOString(), payload };
}

function validPayload(name = 'alice', price = 49.99): Record<string, unknown> {
  return { name, status: 'open', price, tier: 'free', description: 'a valid item' };
}

let store: ZoneStore;
beforeEach(() => { store = new ZoneStore(':memory:'); });
afterEach(() => { store.close(); });

// ── Semantic gate tests ──────────────────────────────────────────────

describe('Pipeline Phase 2 — semantic gate', () => {
  it('quarantines record with field contradiction', () => {
    const pipeline = new Pipeline(schema, policy, store);
    const result = pipeline.ingest([raw({ name: 'item1', status: 'closed', price: 10, tier: 'free' })]);

    expect(result.summary.rowsQuarantined).toBe(1);
    expect(result.summary.semanticViolations).toBeGreaterThan(0);
    const q = store.getByZone('quarantine');
    expect(q[0].failures[0].rule).toBe('field_contradiction');
  });

  it('passes closed item with closedAt', () => {
    const pipeline = new Pipeline(schema, policy, store);
    const result = pipeline.ingest([raw({
      name: 'item2', status: 'closed', closedAt: '2024-06-15', price: 10, tier: 'free',
    })]);

    expect(result.summary.rowsPassed).toBe(1);
    expect(store.countByZone('approved')).toBe(1);
  });

  it('quarantines premium with zero price (cross-field violation)', () => {
    const pipeline = new Pipeline(schema, policy, store);
    const result = pipeline.ingest([raw({ name: 'item3', status: 'open', price: 0, tier: 'premium' })]);

    expect(result.summary.rowsQuarantined).toBe(1);
    const q = store.getByZone('quarantine');
    expect(q[0].failures[0].rule).toBe('cross_field_violation');
  });

  it('quarantines blocked+premium (contradiction)', () => {
    const pipeline = new Pipeline(schema, policy, store);
    const result = pipeline.ingest([raw({ name: 'item4', status: 'blocked', price: 99, tier: 'premium' })]);

    expect(result.summary.rowsQuarantined).toBe(1);
    const q = store.getByZone('quarantine');
    expect(q[0].failures[0].rule).toBe('field_contradiction');
  });

  it('collects multiple semantic violations in batch summary', () => {
    const pipeline = new Pipeline(schema, policy, store);
    const result = pipeline.ingest([
      raw(validPayload('good1')),
      raw({ name: 'bad1', status: 'closed', price: 10, tier: 'free' }),
      raw({ name: 'bad2', status: 'open', price: 0, tier: 'premium' }),
    ]);

    expect(result.summary.semanticViolations).toBe(2);
    expect(result.summary.rowsQuarantined).toBe(2);
  });

  it('semantic failures preserve raw payload', () => {
    const pipeline = new Pipeline(schema, policy, store);
    const payload = { name: 'preserve-me', status: 'closed', price: 10, tier: 'free' };
    pipeline.ingest([raw(payload)]);

    const q = store.getByZone('quarantine');
    expect(q[0].payload).toEqual(payload);
  });
});

// ── Near-duplicate gate tests ────────────────────────────────────────

describe('Pipeline Phase 2 — near-duplicate gate', () => {
  it('detects near-duplicate across batches', () => {
    const pipeline = new Pipeline(schema, policy, store);

    // First batch: original
    pipeline.ingest([raw({
      name: 'alice johnson', status: 'open', price: 50, tier: 'free',
      description: 'senior data scientist at research labs',
    })]);

    // Second batch: near-duplicate (slightly different name + same description)
    const result = pipeline.ingest([raw({
      name: 'alice johnsen', status: 'open', price: 50, tier: 'free',
      description: 'senior data scientist at research labs',
    })]);

    expect(result.summary.nearDuplicatesDetected).toBe(1);
    const q = store.getByZone('quarantine');
    expect(q.some(r => r.failures[0]?.rule === 'near_duplicate')).toBe(true);
  });

  it('detects intra-batch near-duplicates', () => {
    const pipeline = new Pipeline(schema, policy, store);

    const result = pipeline.ingest([
      raw({ name: 'bob smith', status: 'open', price: 100, tier: 'free', description: 'backend engineer at startup' }),
      raw({ name: 'bob smyth', status: 'open', price: 100, tier: 'free', description: 'backend engineer at startup' }),
    ]);

    expect(result.summary.nearDuplicatesDetected).toBe(1);
  });

  it('does not flag sufficiently different records', () => {
    const pipeline = new Pipeline(schema, policy, store);

    pipeline.ingest([raw({
      name: 'carol white', status: 'open', price: 200, tier: 'premium',
      description: 'frontend developer specializing in react',
    })]);

    const result = pipeline.ingest([raw({
      name: 'dave brown', status: 'closed', closedAt: '2024-01-01', price: 50, tier: 'free',
      description: 'devops engineer managing infrastructure',
    })]);

    expect(result.summary.nearDuplicatesDetected).toBe(0);
    expect(store.countByZone('approved')).toBe(2);
  });

  it('near-duplicate quarantine includes similarity score in message', () => {
    const pipeline = new Pipeline(schema, policy, store);

    pipeline.ingest([raw({
      name: 'eve davis', status: 'open', price: 75, tier: 'free',
      description: 'machine learning researcher',
    })]);

    pipeline.ingest([raw({
      name: 'eve davs', status: 'open', price: 75, tier: 'free',
      description: 'machine learning researcher',
    })]);

    const q = store.getByZone('quarantine');
    const nearDupRecord = q.find(r => r.failures[0]?.rule === 'near_duplicate');
    expect(nearDupRecord).toBeDefined();
    expect(nearDupRecord!.failures[0].message).toMatch(/similarity/);
  });

  it('near-duplicate record has confidence breakdown', () => {
    const pipeline = new Pipeline(schema, policy, store);

    pipeline.ingest([raw({
      name: 'frank lee', status: 'open', price: 60, tier: 'free',
      description: 'systems architect',
    })]);

    pipeline.ingest([raw({
      name: 'frank le', status: 'open', price: 60, tier: 'free',
      description: 'systems architect',
    })]);

    const q = store.getByZone('quarantine');
    const nearDup = q.find(r => r.failures[0]?.rule === 'near_duplicate');
    expect(nearDup?.confidence).toBeDefined();
    expect(nearDup!.confidence!.gates.nearDuplicate).toBe(false);
    expect(nearDup!.confidence!.nearDuplicateOf.length).toBeGreaterThan(0);
  });
});

// ── Batch gate with Phase 2 thresholds ───────────────────────────────

describe('Pipeline Phase 2 — batch-level gates', () => {
  it('rejects batch when near-duplicate ratio exceeds strict threshold', () => {
    const pipeline = new Pipeline(schema, strictPolicy, store);

    pipeline.ingest([raw({ name: 'original', status: 'open', price: 100, tier: 'free', description: 'the original record' })]);

    const result = pipeline.ingest([
      raw({ name: 'originl', status: 'open', price: 100, tier: 'free', description: 'the original record' }),
    ]);

    expect(result.summary.promoted).toBe(false);
  });

  it('batch summary includes nearDuplicatesDetected and semanticViolations', () => {
    const pipeline = new Pipeline(schema, policy, store);

    pipeline.ingest([raw(validPayload('first'))]);

    const result = pipeline.ingest([
      raw(validPayload('second')),
      raw({ name: 'bad-semantic', status: 'closed', price: 10, tier: 'free' }),
    ]);

    const summary = store.getBatchSummary(result.summary.batchRunId);
    expect(summary).not.toBeNull();
    expect(typeof summary!.nearDuplicatesDetected).toBe('number');
    expect(typeof summary!.semanticViolations).toBe('number');
    expect(typeof summary!.avgConfidence).toBe('number');
  });
});

// ── Confidence scoring ───────────────────────────────────────────────

describe('Pipeline Phase 2 — confidence scoring', () => {
  it('clean records get confidence 1.0', () => {
    const pipeline = new Pipeline(schema, policy, store);
    const result = pipeline.ingest([raw(validPayload('clean-record'))]);

    expect(result.records[0].confidence).not.toBeNull();
    expect(result.records[0].confidence!.score).toBe(1.0);
    expect(result.records[0].confidence!.gates.schema).toBe(true);
    expect(result.records[0].confidence!.gates.semantic).toBe(true);
    expect(result.records[0].confidence!.gates.nearDuplicate).toBe(true);
  });

  it('batch avgConfidence is tracked', () => {
    const pipeline = new Pipeline(schema, policy, store);
    const result = pipeline.ingest([
      raw(validPayload('c1')),
      raw(validPayload('c2')),
    ]);

    expect(result.summary.avgConfidence).toBeGreaterThan(0);
    expect(result.summary.avgConfidence).toBeLessThanOrEqual(1.0);
  });
});

// ── Phase 1 backward compatibility ──────────────────────────────────

describe('Pipeline Phase 2 — backward compatibility', () => {
  it('works without semantic rules (Phase 1 policy)', () => {
    const p1Policy: GatePolicy = {
      gatePolicyVersion: '1.0.0',
      maxQuarantineRatio: 0.5,
      maxDuplicateRatio: 0.5,
      maxCriticalNullRate: 0.1,
    };
    const pipeline = new Pipeline(schema, p1Policy, store);
    const result = pipeline.ingest([raw(validPayload('compat'))]);

    expect(result.summary.promoted).toBe(true);
    expect(result.summary.nearDuplicatesDetected).toBe(0);
    expect(result.summary.semanticViolations).toBe(0);
  });

  it('Phase 1 structural failures still work alongside Phase 2', () => {
    const pipeline = new Pipeline(schema, policy, store);
    const result = pipeline.ingest([
      raw({ name: 123 }), // schema violation
      raw(validPayload('good')),
    ]);

    expect(result.summary.rowsQuarantined).toBe(1);
    expect(result.summary.rowsPassed).toBe(1);
  });
});
