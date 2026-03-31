import { describe, it, expect } from 'vitest';
import { PolicyRegistry } from '../src/policies.js';
import type { PolicyMeta, GatePolicy } from '../src/types.js';

function makePolicy(overrides: Partial<GatePolicy> = {}): GatePolicy {
  return {
    gatePolicyVersion: '1.0.0',
    maxQuarantineRatio: 0.3,
    maxDuplicateRatio: 0.2,
    maxCriticalNullRate: 0.1,
    ...overrides,
  };
}

function makeMeta(overrides: Partial<PolicyMeta> = {}): PolicyMeta {
  return {
    policyId: 'default',
    version: '1.0.0',
    name: 'Default Policy',
    status: 'draft',
    effectiveDate: '2026-01-01',
    author: 'test',
    policy: makePolicy(),
    ...overrides,
  };
}

describe('PolicyRegistry', () => {
  it('registers and retrieves a policy', () => {
    const reg = new PolicyRegistry();
    reg.register(makeMeta());
    const result = reg.get('default', '1.0.0');
    expect(result).not.toBeNull();
    expect(result!.name).toBe('Default Policy');
  });

  it('rejects duplicate registration', () => {
    const reg = new PolicyRegistry();
    reg.register(makeMeta());
    expect(() => reg.register(makeMeta())).toThrow('already registered');
  });

  it('supports multiple versions of the same policy', () => {
    const reg = new PolicyRegistry();
    reg.register(makeMeta({ version: '1.0.0' }));
    reg.register(makeMeta({ version: '2.0.0', policy: makePolicy({ maxQuarantineRatio: 0.5 }) }));
    expect(reg.get('default', '1.0.0')!.policy.maxQuarantineRatio).toBe(0.3);
    expect(reg.get('default', '2.0.0')!.policy.maxQuarantineRatio).toBe(0.5);
  });

  it('activates a policy and retires the previous active', () => {
    const reg = new PolicyRegistry();
    reg.register(makeMeta({ version: '1.0.0', status: 'active' }));
    reg.register(makeMeta({ version: '2.0.0', status: 'draft' }));
    reg.activate('default', '2.0.0');

    expect(reg.get('default', '1.0.0')!.status).toBe('retired');
    expect(reg.get('default', '2.0.0')!.status).toBe('active');
    expect(reg.getActive('default')!.version).toBe('2.0.0');
  });

  it('finds shadow policies', () => {
    const reg = new PolicyRegistry();
    reg.register(makeMeta({ version: '1.0.0', status: 'active' }));
    reg.register(makeMeta({ version: '2.0.0', status: 'shadow' }));
    expect(reg.getShadow('default')!.version).toBe('2.0.0');
  });

  it('retires a policy', () => {
    const reg = new PolicyRegistry();
    reg.register(makeMeta({ status: 'active' }));
    reg.retire('default', '1.0.0');
    expect(reg.get('default', '1.0.0')!.status).toBe('retired');
    expect(reg.getActive('default')).toBeNull();
  });

  it('resolves policy inheritance from parent', () => {
    const reg = new PolicyRegistry();
    reg.register(makeMeta({
      policyId: 'parent', version: '1.0.0', status: 'active',
      policy: makePolicy({ maxQuarantineRatio: 0.5, maxDuplicateRatio: 0.4 }),
    }));
    reg.register(makeMeta({
      policyId: 'child', version: '1.0.0', status: 'draft',
      parentPolicyId: 'parent',
      policy: { gatePolicyVersion: '1.0.0', maxQuarantineRatio: 0.1, maxDuplicateRatio: 0.2, maxCriticalNullRate: 0.1 },
    }));

    const resolved = reg.resolve('child', '1.0.0');
    // Child overrides parent's quarantine ratio (0.5 → 0.1)
    expect(resolved.maxQuarantineRatio).toBe(0.1);
    // Child overrides parent's duplicate ratio (0.4 → 0.2)
    expect(resolved.maxDuplicateRatio).toBe(0.2);
    // Child overrides parent's null rate (inherited from parent if child had omitted)
    // But since child specifies 0.1, that wins
    expect(resolved.maxCriticalNullRate).toBe(0.1);
  });

  it('returns child policy as-is when parent not found', () => {
    const reg = new PolicyRegistry();
    reg.register(makeMeta({ parentPolicyId: 'nonexistent' }));
    const resolved = reg.resolve('default', '1.0.0');
    expect(resolved.maxQuarantineRatio).toBe(0.3);
  });

  it('lists by status', () => {
    const reg = new PolicyRegistry();
    reg.register(makeMeta({ policyId: 'a', version: '1.0.0', status: 'active' }));
    reg.register(makeMeta({ policyId: 'b', version: '1.0.0', status: 'draft' }));
    reg.register(makeMeta({ policyId: 'c', version: '1.0.0', status: 'retired' }));

    expect(reg.list({ status: 'active' })).toHaveLength(1);
    expect(reg.list({ status: 'draft' })).toHaveLength(1);
    expect(reg.list()).toHaveLength(3);
  });

  it('lists by policyId', () => {
    const reg = new PolicyRegistry();
    reg.register(makeMeta({ policyId: 'x', version: '1.0.0' }));
    reg.register(makeMeta({ policyId: 'x', version: '2.0.0' }));
    reg.register(makeMeta({ policyId: 'y', version: '1.0.0' }));

    expect(reg.list({ policyId: 'x' })).toHaveLength(2);
  });

  it('exports and imports round-trip', () => {
    const reg = new PolicyRegistry();
    reg.register(makeMeta({ policyId: 'a', version: '1.0.0' }));
    reg.register(makeMeta({ policyId: 'b', version: '1.0.0' }));

    const exported = reg.export();
    const reg2 = new PolicyRegistry();
    reg2.import(exported);

    expect(reg2.get('a', '1.0.0')).not.toBeNull();
    expect(reg2.get('b', '1.0.0')).not.toBeNull();
  });

  it('throws on activate of nonexistent policy', () => {
    const reg = new PolicyRegistry();
    expect(() => reg.activate('nope', '1.0.0')).toThrow('not found');
  });

  it('retired policies are not replayed as active', () => {
    const reg = new PolicyRegistry();
    reg.register(makeMeta({ status: 'active' }));
    reg.retire('default', '1.0.0');
    // Re-importing should preserve retired status
    const exported = reg.export();
    const reg2 = new PolicyRegistry();
    reg2.import(exported);
    expect(reg2.getActive('default')).toBeNull();
    expect(reg2.get('default', '1.0.0')!.status).toBe('retired');
  });
});
