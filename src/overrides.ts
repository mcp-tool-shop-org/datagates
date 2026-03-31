import { randomUUID } from 'node:crypto';
import type { OverrideReceipt, OverrideAction } from './types.js';

/**
 * Override registry: explicit, immutable receipts for every manual
 * exception to the gate system. No invisible corrections.
 */
export class OverrideRegistry {
  private receipts: OverrideReceipt[] = [];

  create(params: {
    action: OverrideAction;
    targetId: string;
    targetType: 'record' | 'batch' | 'source';
    actor: string;
    reason: string;
    policyVersion: string;
    expiresAt?: string;
    scope?: string;
  }): OverrideReceipt {
    if (!params.actor) throw new Error('Override requires an actor');
    if (!params.reason) throw new Error('Override requires a reason');
    if (!params.policyVersion) throw new Error('Override requires a policy version');

    const receipt: OverrideReceipt = {
      overrideId: randomUUID(),
      action: params.action,
      targetId: params.targetId,
      targetType: params.targetType,
      actor: params.actor,
      timestamp: new Date().toISOString(),
      reason: params.reason,
      policyVersion: params.policyVersion,
      expiresAt: params.expiresAt,
      scope: params.scope,
    };

    this.receipts.push(receipt);
    return receipt;
  }

  getForTarget(targetId: string): OverrideReceipt[] {
    const now = new Date().toISOString();
    return this.receipts.filter(r =>
      r.targetId === targetId &&
      (!r.expiresAt || r.expiresAt > now)
    );
  }

  getAll(): OverrideReceipt[] {
    return [...this.receipts];
  }

  getById(overrideId: string): OverrideReceipt | null {
    return this.receipts.find(r => r.overrideId === overrideId) ?? null;
  }

  hasActiveOverride(targetId: string, action: OverrideAction): boolean {
    const now = new Date().toISOString();
    return this.receipts.some(r =>
      r.targetId === targetId &&
      r.action === action &&
      (!r.expiresAt || r.expiresAt > now)
    );
  }

  /** Export for persistence */
  export(): OverrideReceipt[] {
    return [...this.receipts];
  }

  /** Import from persistence */
  import(receipts: OverrideReceipt[]): void {
    this.receipts.push(...receipts);
  }
}
