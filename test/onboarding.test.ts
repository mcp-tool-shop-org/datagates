import { describe, it, expect } from 'vitest';
import { SourceRegistry } from '../src/onboarding.js';

describe('SourceRegistry', () => {
  it('registers a source in probation/quarantine_only', () => {
    const reg = new SourceRegistry();
    const contract = reg.register({
      sourceId: 'vendor-a',
      schemaId: 'schema-1',
      criticalFields: ['name', 'score'],
      dedupeStrategy: 'normalized_hash',
    });

    expect(contract.status).toBe('probation');
    expect(contract.probationLevel).toBe('quarantine_only');
    expect(contract.batchesCompleted).toBe(0);
    expect(contract.probationBatchesRequired).toBe(3);
  });

  it('rejects duplicate registration', () => {
    const reg = new SourceRegistry();
    reg.register({ sourceId: 'x', schemaId: 's', criticalFields: [], dedupeStrategy: 'hash' });
    expect(() => reg.register({ sourceId: 'x', schemaId: 's', criticalFields: [], dedupeStrategy: 'hash' }))
      .toThrow('already registered');
  });

  it('upgrades probation level as batches complete', () => {
    const reg = new SourceRegistry();
    reg.register({
      sourceId: 'src', schemaId: 's', criticalFields: [], dedupeStrategy: 'hash',
      probationBatchesRequired: 4,
    });

    // 0/4 = quarantine_only
    expect(reg.get('src')!.probationLevel).toBe('quarantine_only');

    reg.recordBatch('src'); // 1/4 = 0.25
    expect(reg.get('src')!.probationLevel).toBe('quarantine_only');

    reg.recordBatch('src'); // 2/4 = 0.50 → partial_promotion
    expect(reg.get('src')!.probationLevel).toBe('partial_promotion');

    reg.recordBatch('src'); // 3/4 = 0.75
    expect(reg.get('src')!.probationLevel).toBe('partial_promotion');

    reg.recordBatch('src'); // 4/4 = 1.0 → supervised
    expect(reg.get('src')!.probationLevel).toBe('supervised');
  });

  it('canPromote returns false for quarantine_only', () => {
    const reg = new SourceRegistry();
    reg.register({ sourceId: 'src', schemaId: 's', criticalFields: [], dedupeStrategy: 'hash' });
    expect(reg.canPromote('src')).toBe(false);
  });

  it('canPromote returns true for partial_promotion', () => {
    const reg = new SourceRegistry();
    reg.register({
      sourceId: 'src', schemaId: 's', criticalFields: [], dedupeStrategy: 'hash',
      probationBatchesRequired: 2,
    });
    reg.recordBatch('src'); // 1/2 = 0.5 → partial_promotion
    expect(reg.canPromote('src')).toBe(true);
  });

  it('canPromote returns true for active sources', () => {
    const reg = new SourceRegistry();
    reg.register({
      sourceId: 'src', schemaId: 's', criticalFields: [], dedupeStrategy: 'hash',
      probationBatchesRequired: 1,
    });
    reg.recordBatch('src');
    reg.activate('src');
    expect(reg.canPromote('src')).toBe(true);
  });

  it('activation requires completed probation', () => {
    const reg = new SourceRegistry();
    reg.register({
      sourceId: 'src', schemaId: 's', criticalFields: [], dedupeStrategy: 'hash',
      probationBatchesRequired: 3,
    });
    reg.recordBatch('src'); // 1/3
    expect(() => reg.activate('src')).toThrow('1/3');
  });

  it('activates after probation complete', () => {
    const reg = new SourceRegistry();
    reg.register({
      sourceId: 'src', schemaId: 's', criticalFields: [], dedupeStrategy: 'hash',
      probationBatchesRequired: 2,
    });
    reg.recordBatch('src');
    reg.recordBatch('src');
    reg.activate('src');

    expect(reg.get('src')!.status).toBe('active');
    expect(reg.get('src')!.probationLevel).toBeUndefined();
    expect(reg.get('src')!.activatedAt).toBeTruthy();
  });

  it('cannot activate non-probation source', () => {
    const reg = new SourceRegistry();
    reg.register({
      sourceId: 'src', schemaId: 's', criticalFields: [], dedupeStrategy: 'hash',
      probationBatchesRequired: 1,
    });
    reg.recordBatch('src');
    reg.activate('src');
    expect(() => reg.activate('src')).toThrow('not in probation');
  });

  it('suspends a source', () => {
    const reg = new SourceRegistry();
    reg.register({ sourceId: 'src', schemaId: 's', criticalFields: [], dedupeStrategy: 'hash' });
    reg.suspend('src');
    expect(reg.getStatus('src')).toBe('suspended');
    expect(reg.canPromote('src')).toBe(false);
    expect(reg.isQuarantineOnly('src')).toBe(true);
  });

  it('isQuarantineOnly true for unregistered sources', () => {
    const reg = new SourceRegistry();
    expect(reg.isQuarantineOnly('unknown')).toBe(true);
  });

  it('lists with status filter', () => {
    const reg = new SourceRegistry();
    reg.register({ sourceId: 'a', schemaId: 's', criticalFields: [], dedupeStrategy: 'hash', probationBatchesRequired: 1 });
    reg.register({ sourceId: 'b', schemaId: 's', criticalFields: [], dedupeStrategy: 'hash', probationBatchesRequired: 1 });
    reg.recordBatch('a');
    reg.activate('a');

    expect(reg.list({ status: 'active' })).toHaveLength(1);
    expect(reg.list({ status: 'probation' })).toHaveLength(1);
    expect(reg.list()).toHaveLength(2);
  });

  it('exports and imports round-trip', () => {
    const reg = new SourceRegistry();
    reg.register({ sourceId: 'src', schemaId: 's', criticalFields: ['x'], dedupeStrategy: 'hash' });
    reg.recordBatch('src');

    const exported = reg.export();
    const reg2 = new SourceRegistry();
    reg2.import(exported);

    expect(reg2.get('src')!.batchesCompleted).toBe(1);
    expect(reg2.isRegistered('src')).toBe(true);
  });

  it('recordBatch throws for unregistered source', () => {
    const reg = new SourceRegistry();
    expect(() => reg.recordBatch('unknown')).toThrow('not registered');
  });

  it('custom probation batches required', () => {
    const reg = new SourceRegistry();
    const contract = reg.register({
      sourceId: 'src', schemaId: 's', criticalFields: [], dedupeStrategy: 'hash',
      probationBatchesRequired: 10,
    });
    expect(contract.probationBatchesRequired).toBe(10);
  });

  it('bypass prevention: cannot skip probation', () => {
    const reg = new SourceRegistry();
    reg.register({
      sourceId: 'src', schemaId: 's', criticalFields: [], dedupeStrategy: 'hash',
      probationBatchesRequired: 5,
    });
    // Try to activate immediately
    expect(() => reg.activate('src')).toThrow('0/5');
  });
});
