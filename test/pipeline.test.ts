import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Pipeline } from '../src/pipeline.js';
import { ZoneStore } from '../src/store.js';
import type { SchemaContract, GatePolicy, RawRecord } from '../src/types.js';

const schema: SchemaContract = {
  schemaId: 'user-schema',
  schemaVersion: '1.0.0',
  fields: {
    name: { type: 'string', required: true, normalizeCasing: 'lower' },
    age: { type: 'number', required: true, min: 0, max: 150 },
    role: { type: 'enum', required: true, enum: ['admin', 'user'] },
    joinedAt: { type: 'date', required: true },
  },
  primaryKeys: ['name'],
};

const permissivePolicy: GatePolicy = {
  gatePolicyVersion: '1.0.0',
  maxQuarantineRatio: 0.5,
  maxDuplicateRatio: 0.5,
  maxCriticalNullRate: 0.1,
};

const strictPolicy: GatePolicy = {
  gatePolicyVersion: '1.0.0-strict',
  maxQuarantineRatio: 0.0,
  maxDuplicateRatio: 0.0,
  maxCriticalNullRate: 0.0,
};

function makeRaw(payload: Record<string, unknown>, sourceId = 'test-source'): RawRecord {
  return {
    sourceId,
    batchRunId: '',
    ingestTimestamp: new Date().toISOString(),
    payload,
  };
}

function validPayload(name = 'alice', age = 30): Record<string, unknown> {
  return { name, age, role: 'user', joinedAt: '2024-06-15' };
}

let store: ZoneStore;

beforeEach(() => {
  store = new ZoneStore(':memory:');
});

afterEach(() => {
  store.close();
});

describe('Pipeline — valid records', () => {
  it('promotes valid records to approved', () => {
    const pipeline = new Pipeline(schema, permissivePolicy, store);
    const result = pipeline.ingest([makeRaw(validPayload())]);

    expect(result.summary.rowsIngested).toBe(1);
    expect(result.summary.rowsPassed).toBe(1);
    expect(result.summary.rowsQuarantined).toBe(0);
    expect(result.summary.promoted).toBe(true);
    expect(result.records[0].zone).toBe('approved');
  });

  it('normalizes payload before approval', () => {
    const pipeline = new Pipeline(schema, permissivePolicy, store);
    const result = pipeline.ingest([makeRaw({ name: '  ALICE  ', age: 30, role: 'user', joinedAt: '2024-06-15' })]);

    expect(result.records[0].normalizedPayload?.name).toBe('alice');
    expect(result.records[0].normalizedPayload?.joinedAt).toBe('2024-06-15T00:00:00.000Z');
  });

  it('stores batch summary', () => {
    const pipeline = new Pipeline(schema, permissivePolicy, store);
    const result = pipeline.ingest([makeRaw(validPayload())]);

    const summary = store.getBatchSummary(result.summary.batchRunId);
    expect(summary).not.toBeNull();
    expect(summary!.rowsIngested).toBe(1);
    expect(summary!.promoted).toBe(true);
  });

  it('approved records are retrievable by zone', () => {
    const pipeline = new Pipeline(schema, permissivePolicy, store);
    pipeline.ingest([makeRaw(validPayload())]);

    const approved = store.getByZone('approved');
    expect(approved).toHaveLength(1);
    expect(approved[0].normalizedPayload?.name).toBe('alice');
  });
});

describe('Pipeline — quarantine on validation failure', () => {
  it('quarantines record with missing required field', () => {
    const pipeline = new Pipeline(schema, permissivePolicy, store);
    const result = pipeline.ingest([
      makeRaw(validPayload()),
      makeRaw({ age: 30, role: 'user', joinedAt: '2024-01-01' }),
    ]);

    expect(result.summary.rowsQuarantined).toBe(1);
    const quarantined = store.getByZone('quarantine');
    expect(quarantined).toHaveLength(1);
    expect(quarantined[0].failures[0].rule).toBe('missing_required');
  });

  it('quarantines record with invalid enum', () => {
    const pipeline = new Pipeline(schema, permissivePolicy, store);
    const result = pipeline.ingest([makeRaw({ name: 'bob', age: 25, role: 'superadmin', joinedAt: '2024-01-01' })]);

    expect(result.summary.rowsQuarantined).toBe(1);
    expect(result.records[0].failures[0].rule).toBe('invalid_enum');
  });

  it('quarantines record with out-of-range number', () => {
    const pipeline = new Pipeline(schema, permissivePolicy, store);
    const result = pipeline.ingest([makeRaw({ name: 'carol', age: -1, role: 'user', joinedAt: '2024-01-01' })]);

    expect(result.summary.rowsQuarantined).toBe(1);
    expect(result.records[0].failures[0].rule).toBe('out_of_range');
  });

  it('quarantines record with invalid date', () => {
    const pipeline = new Pipeline(schema, permissivePolicy, store);
    const result = pipeline.ingest([makeRaw({ name: 'dave', age: 40, role: 'admin', joinedAt: 'garbage' })]);

    expect(result.summary.rowsQuarantined).toBe(1);
    expect(result.records[0].failures[0].rule).toBe('parse_failure');
  });

  it('quarantines record with wrong type', () => {
    const pipeline = new Pipeline(schema, permissivePolicy, store);
    const result = pipeline.ingest([makeRaw({ name: 'eve', age: 'thirty', role: 'user', joinedAt: '2024-01-01' })]);

    expect(result.summary.rowsQuarantined).toBe(1);
    expect(result.records[0].failures[0].rule).toBe('schema_violation');
  });

  it('quarantined records preserve raw payload', () => {
    const pipeline = new Pipeline(schema, permissivePolicy, store);
    const badPayload = { name: 123, age: 'nope', role: 'alien', joinedAt: 'never' };
    pipeline.ingest([makeRaw(badPayload)]);

    const quarantined = store.getByZone('quarantine');
    expect(quarantined[0].payload).toEqual(badPayload);
  });
});

describe('Pipeline — duplicate detection', () => {
  it('detects exact duplicate across batches', () => {
    const pipeline = new Pipeline(schema, permissivePolicy, store);
    const payload = validPayload('frank');

    pipeline.ingest([makeRaw(payload)]);
    const result = pipeline.ingest([makeRaw(payload)]);

    expect(result.summary.duplicatesDetected).toBe(1);
    expect(result.records[0].zone).toBe('quarantine');
    expect(result.records[0].failures[0].rule).toBe('duplicate_payload');
  });

  it('detects normalized duplicate (whitespace/casing difference)', () => {
    const pipeline = new Pipeline(schema, permissivePolicy, store);

    pipeline.ingest([makeRaw({ name: 'grace', age: 25, role: 'user', joinedAt: '2024-01-01' })]);
    const result = pipeline.ingest([makeRaw({ name: '  GRACE  ', age: 25, role: 'user', joinedAt: '2024-01-01' })]);

    expect(result.summary.duplicatesDetected).toBe(1);
    expect(result.records[0].failures[0].rule).toBe('duplicate_id');
  });

  it('detects intra-batch duplicates', () => {
    const pipeline = new Pipeline(schema, permissivePolicy, store);
    const payload = validPayload('hank');

    const result = pipeline.ingest([
      makeRaw({ name: 'hank', age: 30, role: 'user', joinedAt: '2024-01-01' }),
      makeRaw({ name: '  HANK  ', age: 30, role: 'user', joinedAt: '2024-01-01' }),
    ]);

    // Second should be detected as normalized dup
    expect(result.summary.duplicatesDetected).toBe(1);
  });
});

describe('Pipeline — batch-level gates', () => {
  it('rejects batch when quarantine ratio exceeds threshold', () => {
    const pipeline = new Pipeline(schema, strictPolicy, store);
    const result = pipeline.ingest([
      makeRaw(validPayload('iris')),
      makeRaw({ age: 'bad' }), // invalid — will quarantine
    ]);

    expect(result.summary.promoted).toBe(false);
    // Valid record stays in candidate (not promoted to approved)
    expect(store.countByZone('approved')).toBe(0);
    expect(store.countByZone('candidate')).toBe(1);
  });

  it('promotes batch when within thresholds', () => {
    const pipeline = new Pipeline(schema, permissivePolicy, store);
    const result = pipeline.ingest([
      makeRaw(validPayload('jack')),
      makeRaw(validPayload('kate')),
    ]);

    expect(result.summary.promoted).toBe(true);
    expect(store.countByZone('approved')).toBe(2);
  });

  it('empty batch is not promoted', () => {
    const pipeline = new Pipeline(schema, permissivePolicy, store);
    const result = pipeline.ingest([]);

    expect(result.summary.promoted).toBe(false);
  });

  it('all-invalid batch is not promoted', () => {
    const pipeline = new Pipeline(schema, strictPolicy, store);
    const result = pipeline.ingest([
      makeRaw({ name: 123 }),
      makeRaw({ age: 'bad' }),
    ]);

    expect(result.summary.promoted).toBe(false);
    expect(store.countByZone('approved')).toBe(0);
    expect(store.countByZone('quarantine')).toBe(2);
  });
});

describe('Pipeline — traceability', () => {
  it('every approved record traces back to a batch summary', () => {
    const pipeline = new Pipeline(schema, permissivePolicy, store);
    const result = pipeline.ingest([makeRaw(validPayload('leo'))]);

    const approved = store.getByZone('approved');
    expect(approved).toHaveLength(1);

    const summary = store.getBatchSummary(approved[0].batchRunId);
    expect(summary).not.toBeNull();
    expect(summary!.promoted).toBe(true);
  });

  it('every record has schema + normalization + policy versions', () => {
    const pipeline = new Pipeline(schema, permissivePolicy, store);
    pipeline.ingest([makeRaw(validPayload('mona'))]);

    const records = store.getByZone('approved');
    expect(records[0].schemaVersion).toBe('1.0.0');
    expect(records[0].normalizationVersion).toBe('1.0.0');
    expect(records[0].gatePolicyVersion).toBe('1.0.0');
  });

  it('batch summary includes reject reason counts', () => {
    const pipeline = new Pipeline(schema, permissivePolicy, store);
    const result = pipeline.ingest([
      makeRaw(validPayload('ned')),
      makeRaw({ name: 'ollie', age: -5, role: 'user', joinedAt: '2024-01-01' }),
      makeRaw({ role: 'alien' }),
    ]);

    expect(result.summary.rejectReasons['out_of_range']).toBe(1);
  });
});

describe('Pipeline — idempotency', () => {
  it('re-running same records produces same zone assignments', () => {
    const store1 = new ZoneStore(':memory:');
    const store2 = new ZoneStore(':memory:');

    const records = [
      makeRaw(validPayload('pat')),
      makeRaw({ name: 123 }),
      makeRaw(validPayload('quinn')),
    ];

    const p1 = new Pipeline(schema, permissivePolicy, store1);
    const p2 = new Pipeline(schema, permissivePolicy, store2);

    const r1 = p1.ingest(records);
    const r2 = p2.ingest(records);

    expect(r1.summary.rowsPassed).toBe(r2.summary.rowsPassed);
    expect(r1.summary.rowsQuarantined).toBe(r2.summary.rowsQuarantined);
    expect(r1.summary.promoted).toBe(r2.summary.promoted);

    // Same IDs assigned
    expect(r1.records.map(r => r.id).sort()).toEqual(r2.records.map(r => r.id).sort());

    store1.close();
    store2.close();
  });
});
