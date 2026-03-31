import type { PolicyMeta, PolicyStatus, GatePolicy } from './types.js';

/**
 * Policy registry: named, versioned gate policies with inheritance,
 * activation lifecycle, and shadow mode support.
 */
export class PolicyRegistry {
  private policies = new Map<string, PolicyMeta>();

  register(meta: PolicyMeta): void {
    const key = policyKey(meta.policyId, meta.version);
    if (this.policies.has(key)) {
      throw new Error(`Policy ${key} already registered`);
    }
    this.policies.set(key, { ...meta });
  }

  get(policyId: string, version: string): PolicyMeta | null {
    return this.policies.get(policyKey(policyId, version)) ?? null;
  }

  getActive(policyId: string): PolicyMeta | null {
    for (const meta of this.policies.values()) {
      if (meta.policyId === policyId && meta.status === 'active') return meta;
    }
    return null;
  }

  getShadow(policyId: string): PolicyMeta | null {
    for (const meta of this.policies.values()) {
      if (meta.policyId === policyId && meta.status === 'shadow') return meta;
    }
    return null;
  }

  activate(policyId: string, version: string): void {
    // Retire current active policy for this ID
    for (const meta of this.policies.values()) {
      if (meta.policyId === policyId && meta.status === 'active') {
        meta.status = 'retired';
      }
    }
    const target = this.policies.get(policyKey(policyId, version));
    if (!target) throw new Error(`Policy ${policyId}@${version} not found`);
    target.status = 'active';
  }

  retire(policyId: string, version: string): void {
    const target = this.policies.get(policyKey(policyId, version));
    if (!target) throw new Error(`Policy ${policyId}@${version} not found`);
    target.status = 'retired';
  }

  /**
   * Resolve a policy by applying inheritance from parent.
   * Child fields override parent fields.
   */
  resolve(policyId: string, version: string): GatePolicy {
    const meta = this.get(policyId, version);
    if (!meta) throw new Error(`Policy ${policyId}@${version} not found`);

    if (!meta.parentPolicyId) return meta.policy;

    const parent = this.getActive(meta.parentPolicyId);
    if (!parent) return meta.policy;

    // Merge: child overrides parent
    return { ...parent.policy, ...meta.policy };
  }

  list(filter?: { status?: PolicyStatus; policyId?: string }): PolicyMeta[] {
    let results = [...this.policies.values()];
    if (filter?.status) results = results.filter(p => p.status === filter.status);
    if (filter?.policyId) results = results.filter(p => p.policyId === filter.policyId);
    return results;
  }

  /** Export all policies for persistence */
  export(): PolicyMeta[] {
    return [...this.policies.values()];
  }

  /** Import policies from persistence */
  import(policies: PolicyMeta[]): void {
    for (const p of policies) {
      this.policies.set(policyKey(p.policyId, p.version), { ...p });
    }
  }
}

function policyKey(id: string, version: string): string {
  return `${id}@${version}`;
}
