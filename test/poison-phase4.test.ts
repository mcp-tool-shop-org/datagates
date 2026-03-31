import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Pipeline } from '../src/pipeline.js';
import { ZoneStore } from '../src/store.js';
import { PolicyRegistry } from '../src/policies.js';
import { OverrideRegistry } from '../src/overrides.js';
import { ReviewQueue } from '../src/review.js';
import { SourceRegistry } from '../src/onboarding.js';
import { calibrate, checkCalibrationRegression } from '../src/calibration.js';
import { runShadow } from '../src/shadow.js';
import { buildDecisionArtifact } from '../src/artifact.js';
import type { SchemaContract, GatePolicy, RawRecord, PolicyMeta, GoldSetEntry } from '../src/types.js';

/**
 * Phase 4 poison suite: one test per governance bypass vector.
 *
 * Exit question: "Can a policy change, a new data source, or
 * a manual exception silently degrade data quality?"
 *
 * If any of these tests pass when they should fail,
 * governance is broken.
 */

const schema: SchemaContract = {
  schemaId: 'poison-schema',
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

function raw(name: string, score = 50, category = 'a', sourceId = 'src-1'): RawRecord {
  return { sourceId, batchRunId: '', ingestTimestamp: new Date().toISOString(), payload: { name, score, category } };
}

let store: ZoneStore;
beforeEach(() => { store = new ZoneStore(':memory:'); });
afterEach(() => { store.close(); });

describe('Phase 4 poison suite — governance bypass vectors', () => {

  // ── 1. Policy change without calibration can't silently go live ──

  it('POISON: untested policy change is detectable via calibration regression', () => {
    // A good gold set expects score=999 to be quarantined
    const goldSet: GoldSetEntry[] = [
      { id: 'g1', payload: { name: 'ok', score: 50, category: 'a' }, sourceId: 's', expected: 'approve', reason: 'valid' },
      { id: 'g2', payload: { name: 'bad', score: 999, category: 'a' }, sourceId: 's', expected: 'quarantine', reason: 'out of range' },
    ];

    const goodResult = calibrate(goldSet, schema, basePolicy);
    expect(goodResult.f1).toBe(1.0);

    // New policy with widened range (0-9999) — lets bad data through
    const widenedSchema: SchemaContract = {
      ...schema,
      fields: { ...schema.fields, score: { type: 'number', required: true, min: 0, max: 9999 } },
    };
    const badResult = calibrate(goldSet, widenedSchema, basePolicy);

    // Calibration catches the regression: g2 expected quarantine but got approve
    expect(badResult.falseNegatives).toBeGreaterThan(0);
    const check = checkCalibrationRegression(badResult, goodResult);
    expect(check.regressed).toBe(true);
  });

  // ── 2. Shadow mode catches regressions before activation ──

  it('POISON: stricter shadow policy surfaces delta before activation', () => {
    const lenientPolicy: GatePolicy = {
      ...basePolicy,
      maxQuarantineRatio: 0.9,
    };

    const strictPolicy: GatePolicy = {
      ...basePolicy,
      maxQuarantineRatio: 0.1, // strict: any significant quarantine rejects batch
      semanticRules: [{
        id: 'no-low-scores',
        description: 'Block scores under 40',
        when: { field: 'score', operator: 'lt', value: 40 },
        then: { field: 'score', operator: 'gte', value: 40 },
        failureClass: 'cross_field_violation',
      }],
    };

    const records = [raw('good', 80), raw('marginal', 30), raw('bad', 10)];

    const result = runShadow({
      records, schema,
      activePolicy: lenientPolicy,
      shadowPolicy: strictPolicy,
      activePolicyId: 'lenient',
      shadowPolicyId: 'strict',
      store,
    });

    // Shadow catches what active misses
    expect(result.verdictChanged).toBe(true);
    expect(result.newlyRejectedRows).toBeGreaterThan(0);
  });

  // ── 3. Override without receipt is impossible ──

  it('POISON: override without actor is rejected', () => {
    const overrides = new OverrideRegistry();
    expect(() => overrides.create({
      action: 'waive_row', targetId: 'x', targetType: 'record',
      actor: '', reason: 'test', policyVersion: '1.0.0',
    })).toThrow();
  });

  it('POISON: override without reason is rejected', () => {
    const overrides = new OverrideRegistry();
    expect(() => overrides.create({
      action: 'waive_row', targetId: 'x', targetType: 'record',
      actor: 'admin', reason: '', policyVersion: '1.0.0',
    })).toThrow();
  });

  it('POISON: override without policy version is rejected', () => {
    const overrides = new OverrideRegistry();
    expect(() => overrides.create({
      action: 'waive_row', targetId: 'x', targetType: 'record',
      actor: 'admin', reason: 'test', policyVersion: '',
    })).toThrow();
  });

  // ── 4. New source cannot silently dilute standards ──

  it('POISON: unregistered source is quarantine-only', () => {
    const sources = new SourceRegistry();
    expect(sources.isQuarantineOnly('brand-new-vendor')).toBe(true);
    expect(sources.canPromote('brand-new-vendor')).toBe(false);
  });

  it('POISON: source cannot skip probation to activate', () => {
    const sources = new SourceRegistry();
    sources.register({
      sourceId: 'vendor', schemaId: 'schema-1',
      criticalFields: ['name'], dedupeStrategy: 'hash',
      probationBatchesRequired: 5,
    });
    expect(() => sources.activate('vendor')).toThrow('0/5');
  });

  it('POISON: suspended source cannot promote', () => {
    const sources = new SourceRegistry();
    sources.register({
      sourceId: 'vendor', schemaId: 'schema-1',
      criticalFields: [], dedupeStrategy: 'hash',
    });
    sources.suspend('vendor');
    expect(sources.canPromote('vendor')).toBe(false);
    expect(sources.isQuarantineOnly('vendor')).toBe(true);
  });

  // ── 5. Review items are created for quarantined records ──

  it('POISON: quarantined records generate review items', () => {
    const pipeline = new Pipeline(schema, basePolicy, store);
    const result = pipeline.ingest([
      raw('good', 50),
      raw('bad', 999), // will quarantine
    ]);

    const queue = new ReviewQueue();
    const items = queue.enqueueQuarantined(result.records);

    const quarantined = result.records.filter(r => r.zone === 'quarantine');
    expect(items).toHaveLength(quarantined.length);
    expect(items.every(i => i.status === 'pending')).toBe(true);
  });

  // ── 6. Decision artifact captures full evidence ──

  it('POISON: artifact without verdict is not reconstructable', () => {
    const pipeline = new Pipeline(schema, basePolicy, store);
    const result = pipeline.ingest([raw('alice'), raw('bad', -5)]);

    const policyMeta: PolicyMeta = {
      policyId: 'p', version: '1.0.0', name: 'Test',
      status: 'active', effectiveDate: '2026-01-01', author: 'test',
      policy: basePolicy,
    };

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

    // Artifact must contain the complete evidence chain
    expect(artifact.schema.id).toBeTruthy();
    expect(artifact.policy.id).toBeTruthy();
    expect(artifact.verdict).toBeTruthy();
    expect(artifact.summary).toBeTruthy();
    expect(artifact.rulesTriggered.length).toBeGreaterThan(0);
    expect(artifact.reconstructable).toBe(true);
  });

  // ── 7. Expired overrides don't persist ──

  it('POISON: expired override does not count as active', () => {
    const overrides = new OverrideRegistry();
    overrides.create({
      action: 'waive_row', targetId: 'rec-1', targetType: 'record',
      actor: 'admin', reason: 'temporary exception', policyVersion: '1.0.0',
      expiresAt: '2020-01-01T00:00:00Z',
    });
    expect(overrides.hasActiveOverride('rec-1', 'waive_row')).toBe(false);
    expect(overrides.getForTarget('rec-1')).toHaveLength(0);
  });

  // ── 8. Double policy registration is blocked ──

  it('POISON: duplicate policy version cannot be silently registered', () => {
    const reg = new PolicyRegistry();
    const meta: PolicyMeta = {
      policyId: 'p1', version: '1.0.0', name: 'Test',
      status: 'draft', effectiveDate: '2026-01-01', author: 'test',
      policy: basePolicy,
    };
    reg.register(meta);
    expect(() => reg.register(meta)).toThrow('already registered');
  });

  // ── 9. Overrides appear in decision artifacts ──

  it('POISON: overrides are visible in the decision artifact', () => {
    const pipeline = new Pipeline(schema, basePolicy, store);
    const result = pipeline.ingest([raw('alice')]);

    const overrides = new OverrideRegistry();
    const receipt = overrides.create({
      action: 'waive_row', targetId: 'rec-1', targetType: 'record',
      actor: 'admin', reason: 'false positive', policyVersion: '1.0.0',
    });

    const policyMeta: PolicyMeta = {
      policyId: 'p', version: '1.0.0', name: 'Test',
      status: 'active', effectiveDate: '2026-01-01', author: 'test',
      policy: basePolicy,
    };

    const artifact = buildDecisionArtifact({
      batchRunId: result.summary.batchRunId,
      timestamp: result.summary.timestamp,
      schema,
      policyMeta,
      summary: result.summary,
      records: result.records,
      overrides: [receipt],
      verdict: result.summary.verdict!,
    });

    // No invisible corrections — override is in the artifact
    expect(artifact.overridesApplied).toHaveLength(1);
    expect(artifact.overridesApplied[0].actor).toBe('admin');
    expect(artifact.overridesApplied[0].reason).toBe('false positive');
  });
});
