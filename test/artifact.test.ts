import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildDecisionArtifact } from '../src/artifact.js';
import { Pipeline } from '../src/pipeline.js';
import { ZoneStore } from '../src/store.js';
import type { SchemaContract, GatePolicy, RawRecord, PolicyMeta, OverrideReceipt } from '../src/types.js';

const schema: SchemaContract = {
  schemaId: 'artifact-schema',
  schemaVersion: '1.0.0',
  fields: {
    name: { type: 'string', required: true, normalizeCasing: 'lower' },
    score: { type: 'number', required: true, min: 0, max: 100 },
    category: { type: 'enum', required: true, enum: ['a', 'b', 'c'] },
  },
  primaryKeys: ['name'],
};

const policy: GatePolicy = {
  gatePolicyVersion: '1.0.0',
  maxQuarantineRatio: 0.5,
  maxDuplicateRatio: 0.5,
  maxCriticalNullRate: 0.5,
};

const policyMeta: PolicyMeta = {
  policyId: 'default',
  version: '1.0.0',
  name: 'Default Policy',
  status: 'active',
  effectiveDate: '2026-01-01',
  author: 'test',
  policy,
};

function raw(name: string, score = 50, category = 'a'): RawRecord {
  return {
    sourceId: 'src-1',
    batchRunId: '',
    ingestTimestamp: new Date().toISOString(),
    payload: { name, score, category },
  };
}

let store: ZoneStore;
beforeEach(() => { store = new ZoneStore(':memory:'); });
afterEach(() => { store.close(); });

describe('Decision Artifacts', () => {
  it('produces a complete artifact for a clean batch', () => {
    const pipeline = new Pipeline(schema, policy, store);
    const result = pipeline.ingest([raw('alice'), raw('bob')]);

    const artifact = buildDecisionArtifact({
      batchRunId: result.summary.batchRunId,
      timestamp: result.summary.timestamp,
      schema,
      policyMeta,
      summary: result.summary,
      records: result.records,
      overrides: [],
      verdict: result.summary.verdict!,
    });

    expect(artifact.batchRunId).toBe(result.summary.batchRunId);
    expect(artifact.schema.id).toBe('artifact-schema');
    expect(artifact.schema.version).toBe('1.0.0');
    expect(artifact.policy.id).toBe('default');
    expect(artifact.policy.name).toBe('Default Policy');
    expect(artifact.verdict.disposition).toBe('approve');
    expect(artifact.reconstructable).toBe(true);
    expect(artifact.overridesApplied).toHaveLength(0);
    expect(artifact.rulesTriggered).toHaveLength(0); // no failures
  });

  it('includes rules triggered in artifact', () => {
    const pipeline = new Pipeline(schema, policy, store);
    const result = pipeline.ingest([
      raw('alice'),
      raw('bad', 999), // out_of_range
      raw('worse', 50, 'x' as string), // invalid_enum
    ]);

    const artifact = buildDecisionArtifact({
      batchRunId: result.summary.batchRunId,
      timestamp: result.summary.timestamp,
      schema,
      policyMeta,
      summary: result.summary,
      records: result.records,
      overrides: [],
      verdict: result.summary.verdict!,
    });

    expect(artifact.rulesTriggered.length).toBeGreaterThan(0);
    const ruleIds = artifact.rulesTriggered.map(r => r.ruleId);
    expect(ruleIds).toContain('out_of_range');
    expect(ruleIds).toContain('invalid_enum');
  });

  it('includes overrides in artifact', () => {
    const pipeline = new Pipeline(schema, policy, store);
    const result = pipeline.ingest([raw('alice')]);

    const override: OverrideReceipt = {
      overrideId: 'ovr-1',
      action: 'waive_row',
      targetId: 'rec-1',
      targetType: 'record',
      actor: 'admin',
      timestamp: new Date().toISOString(),
      reason: 'false positive',
      policyVersion: '1.0.0',
    };

    const artifact = buildDecisionArtifact({
      batchRunId: result.summary.batchRunId,
      timestamp: result.summary.timestamp,
      schema,
      policyMeta,
      summary: result.summary,
      records: result.records,
      overrides: [override],
      verdict: result.summary.verdict!,
    });

    expect(artifact.overridesApplied).toHaveLength(1);
    expect(artifact.overridesApplied[0].overrideId).toBe('ovr-1');
  });

  it('captures source quarantine actions', () => {
    const strictPolicy: GatePolicy = {
      ...policy,
      maxSourceQuarantineRatio: 0.01, // very strict
      allowPartialSalvage: true,
    };
    const strictMeta = { ...policyMeta, policy: strictPolicy };

    const pipeline = new Pipeline(schema, strictPolicy, store);
    const records: RawRecord[] = [
      // src-bad: 2 bad out of 3 = 67% quarantine rate
      { sourceId: 'src-bad', batchRunId: '', ingestTimestamp: new Date().toISOString(), payload: { name: 'x1', score: 999, category: 'a' } },
      { sourceId: 'src-bad', batchRunId: '', ingestTimestamp: new Date().toISOString(), payload: { name: 'x2', score: -1, category: 'a' } },
      { sourceId: 'src-bad', batchRunId: '', ingestTimestamp: new Date().toISOString(), payload: { name: 'x3', score: 50, category: 'a' } },
      // src-good: all pass
      { sourceId: 'src-good', batchRunId: '', ingestTimestamp: new Date().toISOString(), payload: { name: 'g1', score: 50, category: 'a' } },
    ];

    const result = pipeline.ingest(records);
    const artifact = buildDecisionArtifact({
      batchRunId: result.summary.batchRunId,
      timestamp: result.summary.timestamp,
      schema,
      policyMeta: strictMeta,
      summary: result.summary,
      records: result.records,
      overrides: [],
      verdict: result.summary.verdict!,
    });

    expect(artifact.sourceActions.length).toBeGreaterThan(0);
    expect(artifact.sourceActions[0].sourceId).toBe('src-bad');
    expect(artifact.sourceActions[0].action).toBe('quarantine');
  });

  it('artifact is stable across re-runs with same input', () => {
    const store1 = new ZoneStore(':memory:');
    const store2 = new ZoneStore(':memory:');
    const records = [raw('alice'), raw('bob')];

    const result1 = new Pipeline(schema, policy, store1).ingest(records);
    const result2 = new Pipeline(schema, policy, store2).ingest(records);

    const artifact1 = buildDecisionArtifact({
      batchRunId: 'fixed-batch',
      timestamp: '2026-01-01T00:00:00Z',
      schema, policyMeta,
      summary: result1.summary,
      records: result1.records,
      overrides: [],
      verdict: result1.summary.verdict!,
    });

    const artifact2 = buildDecisionArtifact({
      batchRunId: 'fixed-batch',
      timestamp: '2026-01-01T00:00:00Z',
      schema, policyMeta,
      summary: result2.summary,
      records: result2.records,
      overrides: [],
      verdict: result2.summary.verdict!,
    });

    // Core fields match
    expect(artifact1.verdict.disposition).toBe(artifact2.verdict.disposition);
    expect(artifact1.rulesTriggered).toEqual(artifact2.rulesTriggered);
    expect(artifact1.policy).toEqual(artifact2.policy);
    expect(artifact1.reconstructable).toBe(artifact2.reconstructable);

    store1.close();
    store2.close();
  });

  it('holdout results appear in artifact', () => {
    const pipeline = new Pipeline(schema, policy, store);
    const result = pipeline.ingest([raw('alice')]);

    const artifact = buildDecisionArtifact({
      batchRunId: result.summary.batchRunId,
      timestamp: result.summary.timestamp,
      schema, policyMeta,
      summary: result.summary,
      records: result.records,
      overrides: [],
      verdict: result.summary.verdict!,
    });

    expect(artifact.holdoutResults).toEqual({ overlaps: 0 });
  });
});
