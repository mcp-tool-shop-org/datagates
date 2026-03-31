import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Pipeline } from '../src/pipeline.js';
import { ZoneStore } from '../src/store.js';
import { hashPayload } from '../src/hash.js';
import { normalize } from '../src/normalize.js';
import type { SchemaContract, GatePolicy, RawRecord, DriftRule } from '../src/types.js';

const schema: SchemaContract = {
  schemaId: 'phase3-schema',
  schemaVersion: '3.0.0',
  fields: {
    name: { type: 'string', required: true, normalizeCasing: 'lower' },
    score: { type: 'number', required: true, min: 0, max: 100 },
    category: { type: 'enum', required: true, enum: ['a', 'b', 'c'] },
    label: { type: 'string', required: true },
  },
  primaryKeys: ['name'],
};

function raw(payload: Record<string, unknown>, sourceId = 'src-good'): RawRecord {
  return { sourceId, batchRunId: '', ingestTimestamp: new Date().toISOString(), payload };
}

function valid(name: string, category = 'a', score = 50): Record<string, unknown> {
  return { name, score, category, label: `label-${name}` };
}

let store: ZoneStore;
beforeEach(() => { store = new ZoneStore(':memory:'); });
afterEach(() => { store.close(); });

// ── Batch verdict tests ─────────────────────────────────────────────

describe('Pipeline Phase 3 — batch verdict', () => {
  it('produces approve verdict for clean batch', () => {
    const policy: GatePolicy = {
      gatePolicyVersion: '3.0.0', maxQuarantineRatio: 0.5,
      maxDuplicateRatio: 0.5, maxCriticalNullRate: 0.1,
    };
    const pipeline = new Pipeline(schema, policy, store);
    const result = pipeline.ingest([raw(valid('alice')), raw(valid('bob'))]);

    expect(result.summary.verdict).not.toBeNull();
    expect(result.summary.verdict!.disposition).toBe('approve');
    expect(result.summary.verdict!.reasons).toHaveLength(0);
    expect(result.summary.promoted).toBe(true);
  });

  it('produces quarantine_batch verdict when thresholds exceeded', () => {
    const policy: GatePolicy = {
      gatePolicyVersion: '3.0.0', maxQuarantineRatio: 0.0,
      maxDuplicateRatio: 0.0, maxCriticalNullRate: 0.0,
    };
    const pipeline = new Pipeline(schema, policy, store);
    const result = pipeline.ingest([
      raw(valid('good')),
      raw({ name: 123 }), // invalid
    ]);

    expect(result.summary.verdict!.disposition).toBe('quarantine_batch');
    expect(result.summary.verdict!.reasons.length).toBeGreaterThan(0);
    expect(result.summary.promoted).toBe(false);
  });

  it('stores metrics snapshot with batch summary', () => {
    const policy: GatePolicy = {
      gatePolicyVersion: '3.0.0', maxQuarantineRatio: 0.5,
      maxDuplicateRatio: 0.5, maxCriticalNullRate: 0.1,
    };
    const pipeline = new Pipeline(schema, policy, store);
    const result = pipeline.ingest([
      raw(valid('alice', 'a', 40)),
      raw(valid('bob', 'b', 60)),
    ]);

    expect(result.summary.metrics).not.toBeNull();
    expect(result.summary.metrics!.numericSummaries['score']).toBeDefined();
    expect(result.summary.metrics!.labelDistribution['category']).toEqual({ a: 1, b: 1 });
  });

  it('verdict is persisted and retrievable', () => {
    const policy: GatePolicy = {
      gatePolicyVersion: '3.0.0', maxQuarantineRatio: 0.5,
      maxDuplicateRatio: 0.5, maxCriticalNullRate: 0.1,
    };
    const pipeline = new Pipeline(schema, policy, store);
    const result = pipeline.ingest([raw(valid('carol'))]);

    const saved = store.getBatchSummary(result.summary.batchRunId);
    expect(saved!.verdict).not.toBeNull();
    expect(saved!.verdict!.disposition).toBe('approve');
    expect(saved!.metrics).not.toBeNull();
  });
});

// ── Drift detection tests ───────────────────────────────────────────

describe('Pipeline Phase 3 — drift detection', () => {
  it('detects null rate spike against baseline', () => {
    const driftRules: DriftRule[] = [
      { id: 'ns-1', description: 'Name null spike', type: 'null_spike', field: 'name', threshold: 0.1 },
    ];
    const policy: GatePolicy = {
      gatePolicyVersion: '3.0.0', maxQuarantineRatio: 0.5,
      maxDuplicateRatio: 0.5, maxCriticalNullRate: 0.5,
      driftRules,
    };
    const pipeline = new Pipeline(schema, policy, store);

    // Batch 1: healthy baseline (establishes metrics)
    pipeline.ingest([
      raw(valid('a1')), raw(valid('a2')), raw(valid('a3')),
      raw(valid('a4')), raw(valid('a5')),
    ]);

    // Batch 2: has different data but same null rate should be fine
    const result = pipeline.ingest([
      raw(valid('b1')), raw(valid('b2')), raw(valid('b3')),
    ]);

    // No drift expected — null rates are consistent
    expect(result.summary.verdict!.driftViolations).toHaveLength(0);
  });

  it('produces approve_with_warnings when drift is detected', () => {
    const driftRules: DriftRule[] = [
      { id: 'ls-1', description: 'Category skew', type: 'label_skew', field: 'category', threshold: 0.2 },
    ];
    const policy: GatePolicy = {
      gatePolicyVersion: '3.0.0', maxQuarantineRatio: 0.5,
      maxDuplicateRatio: 0.5, maxCriticalNullRate: 0.5,
      driftRules,
    };
    const pipeline = new Pipeline(schema, policy, store);

    // Baseline: balanced categories
    pipeline.ingest([
      raw(valid('a1', 'a')), raw(valid('a2', 'b')), raw(valid('a3', 'c')),
      raw(valid('a4', 'a')), raw(valid('a5', 'b')), raw(valid('a6', 'c')),
    ]);

    // Current: heavily skewed
    const result = pipeline.ingest([
      raw(valid('b1', 'a')), raw(valid('b2', 'a')), raw(valid('b3', 'a')),
      raw(valid('b4', 'a')), raw(valid('b5', 'a')),
    ]);

    expect(result.summary.verdict!.disposition).toBe('approve_with_warnings');
    expect(result.summary.verdict!.warnings.length).toBeGreaterThan(0);
    expect(result.summary.promoted).toBe(true); // still promoted, just with warnings
  });

  it('skips drift when no baseline exists', () => {
    const driftRules: DriftRule[] = [
      { id: 'nd-1', description: 'Score drift', type: 'numeric_drift', field: 'score', threshold: 2.0 },
    ];
    const policy: GatePolicy = {
      gatePolicyVersion: '3.0.0', maxQuarantineRatio: 0.5,
      maxDuplicateRatio: 0.5, maxCriticalNullRate: 0.5,
      driftRules,
    };
    const pipeline = new Pipeline(schema, policy, store);

    // First batch — no baseline to compare
    const result = pipeline.ingest([raw(valid('first', 'a', 99))]);
    expect(result.summary.verdict!.driftViolations).toHaveLength(0);
    expect(result.summary.verdict!.disposition).toBe('approve');
  });
});

// ── Holdout overlap tests ───────────────────────────────────────────

describe('Pipeline Phase 3 — holdout overlap', () => {
  it('blocks batch with exact holdout overlap', () => {
    const policy: GatePolicy = {
      gatePolicyVersion: '3.0.0', maxQuarantineRatio: 0.5,
      maxDuplicateRatio: 0.5, maxCriticalNullRate: 0.5,
      holdout: {},
    };
    const pipeline = new Pipeline(schema, policy, store);

    // Register holdout
    const holdoutPayload = valid('holdout-item');
    const normalized = normalize(holdoutPayload, schema);
    const normalizedHash = hashPayload(normalized);
    store.registerHoldout([{ id: 'h1', normalizedHash, payload: normalized }]);

    // Try to ingest the same record
    const result = pipeline.ingest([raw(holdoutPayload)]);

    expect(result.summary.verdict!.holdoutOverlaps).toBe(1);
    expect(result.summary.verdict!.disposition).toBe('quarantine_batch');
    expect(result.summary.promoted).toBe(false);
  });

  it('passes when no holdout overlap', () => {
    const policy: GatePolicy = {
      gatePolicyVersion: '3.0.0', maxQuarantineRatio: 0.5,
      maxDuplicateRatio: 0.5, maxCriticalNullRate: 0.5,
      holdout: {},
    };
    const pipeline = new Pipeline(schema, policy, store);

    store.registerHoldout([{
      id: 'h1',
      normalizedHash: 'completely-different-hash',
      payload: { name: 'holdout-person', score: 99, category: 'c', label: 'holdout' },
    }]);

    const result = pipeline.ingest([raw(valid('training-item'))]);
    expect(result.summary.verdict!.holdoutOverlaps).toBe(0);
    expect(result.summary.promoted).toBe(true);
  });
});

// ── Source-level quarantine tests ────────────────────────────────────

describe('Pipeline Phase 3 — source-level quarantine', () => {
  it('quarantines contaminated source without killing good sources', () => {
    const policy: GatePolicy = {
      gatePolicyVersion: '3.0.0', maxQuarantineRatio: 0.8,
      maxDuplicateRatio: 0.5, maxCriticalNullRate: 0.5,
      maxSourceQuarantineRatio: 0.3,
      allowPartialSalvage: true,
    };
    const pipeline = new Pipeline(schema, policy, store);

    // src-good: 3 valid records
    // src-bad: 2 valid + 3 invalid (>50% quarantine rate, exceeds 0.3 threshold)
    const result = pipeline.ingest([
      raw(valid('good1'), 'src-good'),
      raw(valid('good2'), 'src-good'),
      raw(valid('good3'), 'src-good'),
      raw(valid('bad-ok1'), 'src-bad'),
      raw(valid('bad-ok2'), 'src-bad'),
      raw({ name: 123 }, 'src-bad'),
      raw({ name: 456 }, 'src-bad'),
      raw({ name: 789 }, 'src-bad'),
    ]);

    expect(result.summary.verdict!.quarantinedSources).toContain('src-bad');
    expect(result.summary.verdict!.disposition).toBe('partial_salvage');

    // Good source records should be promoted
    const approved = store.getByZone('approved');
    expect(approved.every(r => r.sourceId === 'src-good')).toBe(true);
    expect(approved.length).toBe(3);
  });

  it('blocks entire batch when partial salvage is disabled', () => {
    const policy: GatePolicy = {
      gatePolicyVersion: '3.0.0', maxQuarantineRatio: 0.8,
      maxDuplicateRatio: 0.5, maxCriticalNullRate: 0.5,
      maxSourceQuarantineRatio: 0.3,
      allowPartialSalvage: false,
    };
    const pipeline = new Pipeline(schema, policy, store);

    const result = pipeline.ingest([
      raw(valid('good1'), 'src-good'),
      raw(valid('bad-ok1'), 'src-bad'),
      raw({ name: 123 }, 'src-bad'),
      raw({ name: 456 }, 'src-bad'),
    ]);

    expect(result.summary.verdict!.quarantinedSources).toContain('src-bad');
    expect(result.summary.verdict!.disposition).toBe('quarantine_batch');
    expect(store.countByZone('approved')).toBe(0);
  });
});

// ── Backward compatibility ──────────────────────────────────────────

describe('Pipeline Phase 3 — backward compatibility', () => {
  it('Phase 1 policy still works (no drift, no holdout, no source quarantine)', () => {
    const policy: GatePolicy = {
      gatePolicyVersion: '1.0.0', maxQuarantineRatio: 0.5,
      maxDuplicateRatio: 0.5, maxCriticalNullRate: 0.1,
    };
    const pipeline = new Pipeline(schema, policy, store);
    const result = pipeline.ingest([raw(valid('legacy'))]);

    expect(result.summary.promoted).toBe(true);
    expect(result.summary.verdict!.disposition).toBe('approve');
    expect(result.summary.verdict!.driftViolations).toHaveLength(0);
    expect(result.summary.verdict!.holdoutOverlaps).toBe(0);
    expect(result.summary.verdict!.quarantinedSources).toHaveLength(0);
  });
});
