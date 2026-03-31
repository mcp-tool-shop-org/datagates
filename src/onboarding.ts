import type { SourceContract, SourceStatus, ProbationLevel } from './types.js';

/**
 * Source onboarding: new data sources must declare contracts and
 * pass probation before earning full promotion rights.
 */
export class SourceRegistry {
  private sources = new Map<string, SourceContract>();

  register(params: {
    sourceId: string;
    schemaId: string;
    criticalFields: string[];
    dedupeStrategy: string;
    expectedDistributions?: Record<string, Record<string, number>>;
    probationBatchesRequired?: number;
    notes?: string;
  }): SourceContract {
    if (this.sources.has(params.sourceId)) {
      throw new Error(`Source "${params.sourceId}" already registered`);
    }

    const contract: SourceContract = {
      sourceId: params.sourceId,
      status: 'probation',
      probationLevel: 'quarantine_only',
      registeredAt: new Date().toISOString(),
      schemaId: params.schemaId,
      criticalFields: params.criticalFields,
      dedupeStrategy: params.dedupeStrategy,
      expectedDistributions: params.expectedDistributions,
      notes: params.notes,
      batchesCompleted: 0,
      probationBatchesRequired: params.probationBatchesRequired ?? 3,
    };

    this.sources.set(params.sourceId, contract);
    return contract;
  }

  get(sourceId: string): SourceContract | null {
    return this.sources.get(sourceId) ?? null;
  }

  isRegistered(sourceId: string): boolean {
    return this.sources.has(sourceId);
  }

  getStatus(sourceId: string): SourceStatus | null {
    return this.sources.get(sourceId)?.status ?? null;
  }

  /**
   * Record a completed batch for a source.
   * If probation batches are met, upgrade probation level.
   */
  recordBatch(sourceId: string): void {
    const source = this.sources.get(sourceId);
    if (!source) throw new Error(`Source "${sourceId}" not registered`);
    source.batchesCompleted++;

    // Auto-upgrade probation level based on completed batches
    if (source.status === 'probation') {
      const progress = source.batchesCompleted / source.probationBatchesRequired;
      if (progress >= 1.0) {
        // Ready for activation (must be explicitly activated)
        source.probationLevel = 'supervised';
      } else if (progress >= 0.5) {
        source.probationLevel = 'partial_promotion';
      }
    }
  }

  /**
   * Activate a source after successful probation.
   */
  activate(sourceId: string): void {
    const source = this.sources.get(sourceId);
    if (!source) throw new Error(`Source "${sourceId}" not registered`);
    if (source.status !== 'probation') {
      throw new Error(`Source "${sourceId}" is ${source.status}, not in probation`);
    }
    if (source.batchesCompleted < source.probationBatchesRequired) {
      throw new Error(
        `Source "${sourceId}" has ${source.batchesCompleted}/${source.probationBatchesRequired} probation batches`
      );
    }
    source.status = 'active';
    source.probationLevel = undefined;
    source.activatedAt = new Date().toISOString();
  }

  suspend(sourceId: string): void {
    const source = this.sources.get(sourceId);
    if (!source) throw new Error(`Source "${sourceId}" not registered`);
    source.status = 'suspended';
  }

  /**
   * Check whether a source can promote records.
   */
  canPromote(sourceId: string): boolean {
    const source = this.sources.get(sourceId);
    if (!source) return false;
    if (source.status === 'active') return true;
    if (source.status === 'probation') {
      return source.probationLevel === 'partial_promotion' || source.probationLevel === 'supervised';
    }
    return false;
  }

  /**
   * Check whether a source can only quarantine (strictest probation).
   */
  isQuarantineOnly(sourceId: string): boolean {
    const source = this.sources.get(sourceId);
    if (!source) return true; // unregistered sources are quarantine-only
    if (source.status === 'suspended') return true;
    if (source.status === 'probation' && source.probationLevel === 'quarantine_only') return true;
    return false;
  }

  list(filter?: { status?: SourceStatus }): SourceContract[] {
    let results = [...this.sources.values()];
    if (filter?.status) results = results.filter(s => s.status === filter.status);
    return results;
  }

  /** Export for persistence */
  export(): SourceContract[] {
    return [...this.sources.values()];
  }

  /** Import from persistence */
  import(sources: SourceContract[]): void {
    for (const s of sources) this.sources.set(s.sourceId, { ...s });
  }
}
