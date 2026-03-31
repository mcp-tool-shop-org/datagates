import { describe, it, expect } from 'vitest';
import {
  defaultConfig, defaultSchema, defaultPolicy, defaultGoldSet,
  POLICY_PACKS, getPolicyPack,
} from '../src/templates.js';

describe('Templates', () => {
  it('defaultConfig creates valid project config', () => {
    const config = defaultConfig('test-project');
    expect(config.name).toBe('test-project');
    expect(config.schemaPath).toBeTruthy();
    expect(config.policyPath).toBeTruthy();
    expect(config.storePath).toBeTruthy();
  });

  it('defaultSchema creates valid schema contract', () => {
    const schema = defaultSchema();
    expect(schema.schemaId).toBeTruthy();
    expect(schema.schemaVersion).toBeTruthy();
    expect(Object.keys(schema.fields).length).toBeGreaterThan(0);
    expect(schema.primaryKeys.length).toBeGreaterThan(0);
  });

  it('defaultPolicy creates valid gate policy', () => {
    const policy = defaultPolicy();
    expect(policy.gatePolicyVersion).toBeTruthy();
    expect(policy.maxQuarantineRatio).toBeGreaterThan(0);
    expect(policy.maxDuplicateRatio).toBeGreaterThan(0);
    expect(policy.maxCriticalNullRate).toBeGreaterThan(0);
  });

  it('defaultGoldSet creates entries with approve and quarantine', () => {
    const goldSet = defaultGoldSet();
    expect(goldSet.length).toBeGreaterThanOrEqual(4);
    expect(goldSet.some(g => g.expected === 'approve')).toBe(true);
    expect(goldSet.some(g => g.expected === 'quarantine')).toBe(true);
    expect(goldSet.every(g => g.id && g.reason)).toBe(true);
  });

  it('gold set records match default schema', () => {
    const schema = defaultSchema();
    const policy = defaultPolicy();
    const goldSet = defaultGoldSet();

    // The approve entries should have all required fields
    const approveEntries = goldSet.filter(g => g.expected === 'approve');
    for (const entry of approveEntries) {
      for (const [field, def] of Object.entries(schema.fields)) {
        if (def.required) {
          expect(entry.payload[field]).not.toBeUndefined();
        }
      }
    }
  });
});

describe('Policy packs', () => {
  it('has at least 4 packs', () => {
    expect(POLICY_PACKS.length).toBeGreaterThanOrEqual(4);
  });

  it('each pack has required fields', () => {
    for (const pack of POLICY_PACKS) {
      expect(pack.id).toBeTruthy();
      expect(pack.name).toBeTruthy();
      expect(pack.description).toBeTruthy();
      expect(pack.policy.gatePolicyVersion).toBeTruthy();
      expect(pack.policy.maxQuarantineRatio).toBeGreaterThan(0);
    }
  });

  it('getPolicyPack finds by id', () => {
    const pack = getPolicyPack('strict-structured');
    expect(pack).toBeDefined();
    expect(pack!.name).toBe('Strict Structured');
  });

  it('getPolicyPack returns undefined for unknown id', () => {
    expect(getPolicyPack('nonexistent')).toBeUndefined();
  });

  it('pack ids are unique', () => {
    const ids = POLICY_PACKS.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('strict-structured has tight thresholds', () => {
    const pack = getPolicyPack('strict-structured')!;
    expect(pack.policy.maxQuarantineRatio).toBeLessThanOrEqual(0.1);
    expect(pack.policy.maxDuplicateRatio).toBeLessThanOrEqual(0.05);
  });

  it('text-dedupe has near-duplicate config', () => {
    const pack = getPolicyPack('text-dedupe')!;
    expect(pack.policy.nearDuplicate).toBeDefined();
    expect(pack.policy.nearDuplicate!.fields.some(f => f.similarity === 'token_jaccard')).toBe(true);
  });

  it('classification-basic has drift rules', () => {
    const pack = getPolicyPack('classification-basic')!;
    expect(pack.policy.driftRules).toBeDefined();
    expect(pack.policy.driftRules!.length).toBeGreaterThan(0);
  });

  it('source-probation-first has source quarantine config', () => {
    const pack = getPolicyPack('source-probation-first')!;
    expect(pack.policy.maxSourceQuarantineRatio).toBeDefined();
    expect(pack.policy.allowPartialSalvage).toBe(true);
  });
});
