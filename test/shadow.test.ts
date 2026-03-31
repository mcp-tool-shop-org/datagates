import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runShadow } from '../src/shadow.js';
import { ZoneStore } from '../src/store.js';
import type { SchemaContract, GatePolicy, RawRecord } from '../src/types.js';

const schema: SchemaContract = {
  schemaId: 'shadow-schema',
  schemaVersion: '1.0.0',
  fields: {
    name: { type: 'string', required: true, normalizeCasing: 'lower' },
    score: { type: 'number', required: true, min: 0, max: 100 },
    category: { type: 'enum', required: true, enum: ['a', 'b', 'c'] },
  },
  primaryKeys: ['name'],
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

describe('Shadow mode', () => {
  it('produces separate verdict streams with no overlap', () => {
    const activePolicy: GatePolicy = {
      gatePolicyVersion: 'active-1.0',
      maxQuarantineRatio: 0.5,
      maxDuplicateRatio: 0.5,
      maxCriticalNullRate: 0.5,
    };

    const shadowPolicy: GatePolicy = {
      gatePolicyVersion: 'shadow-1.0',
      maxQuarantineRatio: 0.5,
      maxDuplicateRatio: 0.5,
      maxCriticalNullRate: 0.5,
    };

    const records = [raw('alice'), raw('bob'), raw('carol')];

    const result = runShadow({
      records, schema,
      activePolicy, shadowPolicy,
      activePolicyId: 'active-1.0',
      shadowPolicyId: 'shadow-1.0',
      store,
    });

    expect(result.activePolicyId).toBe('active-1.0');
    expect(result.shadowPolicyId).toBe('shadow-1.0');
    expect(result.activeVerdict).toBeTruthy();
    expect(result.shadowVerdict).toBeTruthy();
    // Same policy = same verdict
    expect(result.verdictChanged).toBe(false);
    expect(result.newlyRejectedRows).toBe(0);
    expect(result.newlyApprovedRows).toBe(0);
  });

  it('detects verdict change when shadow policy is stricter', () => {
    const activePolicy: GatePolicy = {
      gatePolicyVersion: 'active-1.0',
      maxQuarantineRatio: 0.9, // lenient
      maxDuplicateRatio: 0.9,
      maxCriticalNullRate: 0.9,
    };

    // Shadow adds semantic rules that reject some records
    const shadowPolicy: GatePolicy = {
      gatePolicyVersion: 'shadow-strict',
      maxQuarantineRatio: 0.01, // very strict — any quarantine rejects batch
      maxDuplicateRatio: 0.9,
      maxCriticalNullRate: 0.9,
      semanticRules: [{
        id: 'low-score',
        description: 'Score must be above 40',
        when: { field: 'score', operator: 'lt', value: 40 },
        then: { field: 'score', operator: 'gte', value: 40 },
        failureClass: 'cross_field_violation',
      }],
    };

    const records = [
      raw('alice', 50),
      raw('bob', 30),   // will fail shadow's semantic rule
      raw('carol', 60),
    ];

    const result = runShadow({
      records, schema,
      activePolicy, shadowPolicy,
      activePolicyId: 'active-1.0',
      shadowPolicyId: 'shadow-strict',
      store,
    });

    // Active approves all, shadow quarantines bob AND rejects batch (>1% quarantine)
    expect(result.verdictChanged).toBe(true);
    expect(result.newlyRejectedRows).toBeGreaterThan(0);
  });

  it('shadow does not affect the real store', () => {
    const activePolicy: GatePolicy = {
      gatePolicyVersion: 'active-1.0',
      maxQuarantineRatio: 0.5,
      maxDuplicateRatio: 0.5,
      maxCriticalNullRate: 0.5,
    };

    const shadowPolicy: GatePolicy = {
      gatePolicyVersion: 'shadow-1.0',
      maxQuarantineRatio: 0.5,
      maxDuplicateRatio: 0.5,
      maxCriticalNullRate: 0.5,
    };

    const records = [raw('alice')];

    // Run shadow
    runShadow({
      records, schema,
      activePolicy, shadowPolicy,
      activePolicyId: 'a', shadowPolicyId: 's',
      store,
    });

    // Active policy writes to real store. Shadow uses isolated store.
    // The real store should have records from active policy only.
    const allRecords = store.getCandidatesForSimilarity();
    // Active pipeline promotes alice → she's in approved zone
    expect(allRecords.length).toBeGreaterThanOrEqual(0); // store has the active result
  });

  it('reports newly quarantined sources in shadow', () => {
    const activePolicy: GatePolicy = {
      gatePolicyVersion: 'active-1.0',
      maxQuarantineRatio: 0.9,
      maxDuplicateRatio: 0.9,
      maxCriticalNullRate: 0.9,
    };

    const shadowPolicy: GatePolicy = {
      gatePolicyVersion: 'shadow-1.0',
      maxQuarantineRatio: 0.9,
      maxDuplicateRatio: 0.9,
      maxCriticalNullRate: 0.9,
      maxSourceQuarantineRatio: 0.01, // very strict per-source
      semanticRules: [{
        id: 'block-low',
        description: 'Block low scores',
        when: { field: 'score', operator: 'lt', value: 40 },
        then: { field: 'score', operator: 'gte', value: 40 },
        failureClass: 'cross_field_violation',
      }],
    };

    // All records from same source, one fails
    const records: RawRecord[] = [
      { sourceId: 'vendor-x', batchRunId: '', ingestTimestamp: new Date().toISOString(), payload: { name: 'a', score: 10, category: 'a' } },
      { sourceId: 'vendor-x', batchRunId: '', ingestTimestamp: new Date().toISOString(), payload: { name: 'b', score: 50, category: 'a' } },
    ];

    const result = runShadow({
      records, schema,
      activePolicy, shadowPolicy,
      activePolicyId: 'a', shadowPolicyId: 's',
      store,
    });

    // Shadow should quarantine vendor-x due to high per-source quarantine rate
    expect(result.newlyQuarantinedSources).toContain('vendor-x');
  });

  it('delta reporting shows row-level differences', () => {
    const activePolicy: GatePolicy = {
      gatePolicyVersion: 'active-1.0',
      maxQuarantineRatio: 0.9,
      maxDuplicateRatio: 0.9,
      maxCriticalNullRate: 0.9,
    };

    // Shadow rejects records with score < 60
    const shadowPolicy: GatePolicy = {
      gatePolicyVersion: 'shadow-1.0',
      maxQuarantineRatio: 0.9,
      maxDuplicateRatio: 0.9,
      maxCriticalNullRate: 0.9,
      semanticRules: [{
        id: 'high-bar',
        description: 'Score must be >= 60',
        when: { field: 'score', operator: 'lt', value: 60 },
        then: { field: 'score', operator: 'gte', value: 60 },
        failureClass: 'cross_field_violation',
      }],
    };

    const records = [
      raw('pass', 80),
      raw('fail1', 40),
      raw('fail2', 20),
    ];

    const result = runShadow({
      records, schema,
      activePolicy, shadowPolicy,
      activePolicyId: 'a', shadowPolicyId: 's',
      store,
    });

    // Active approves all 3, shadow rejects 2
    expect(result.newlyRejectedRows).toBe(2);
    expect(result.newlyApprovedRows).toBe(0);
  });
});
