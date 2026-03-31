import { randomUUID } from 'node:crypto';
import type { ReviewItem, ReviewItemType, ReviewStatus, ZonedRecord } from './types.js';

/**
 * Review queue: structured workflow for quarantined items,
 * shadow deltas, and periodic approved samples.
 */
export class ReviewQueue {
  private items: ReviewItem[] = [];

  add(params: {
    type: ReviewItemType;
    targetId: string;
    batchRunId: string;
  }): ReviewItem {
    const item: ReviewItem = {
      reviewId: randomUUID(),
      type: params.type,
      targetId: params.targetId,
      batchRunId: params.batchRunId,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    this.items.push(item);
    return item;
  }

  review(reviewId: string, params: {
    status: ReviewStatus;
    reviewer: string;
    notes?: string;
    overrideId?: string;
  }): ReviewItem {
    const item = this.items.find(i => i.reviewId === reviewId);
    if (!item) throw new Error(`Review item ${reviewId} not found`);
    if (item.status !== 'pending') throw new Error(`Review item ${reviewId} is already ${item.status}`);

    item.status = params.status;
    item.reviewer = params.reviewer;
    item.reviewedAt = new Date().toISOString();
    item.notes = params.notes;
    item.overrideId = params.overrideId;

    return item;
  }

  getById(reviewId: string): ReviewItem | null {
    return this.items.find(i => i.reviewId === reviewId) ?? null;
  }

  list(filter?: { status?: ReviewStatus; type?: ReviewItemType; batchRunId?: string }): ReviewItem[] {
    let results = [...this.items];
    if (filter?.status) results = results.filter(i => i.status === filter.status);
    if (filter?.type) results = results.filter(i => i.type === filter.type);
    if (filter?.batchRunId) results = results.filter(i => i.batchRunId === filter.batchRunId);
    return results;
  }

  pending(): ReviewItem[] {
    return this.list({ status: 'pending' });
  }

  /**
   * Generate review items from quarantined records.
   */
  enqueueQuarantined(records: ZonedRecord[]): ReviewItem[] {
    const items: ReviewItem[] = [];
    for (const r of records) {
      if (r.zone !== 'quarantine') continue;
      items.push(this.add({
        type: 'quarantined_row',
        targetId: r.id,
        batchRunId: r.batchRunId,
      }));
    }
    return items;
  }

  /**
   * Sample approved records for periodic review.
   */
  sampleApproved(records: ZonedRecord[], sampleRate: number = 0.1): ReviewItem[] {
    const approved = records.filter(r => r.zone === 'approved');
    const sampleSize = Math.max(1, Math.floor(approved.length * sampleRate));
    // Deterministic sampling: take every Nth record
    const step = Math.max(1, Math.floor(approved.length / sampleSize));
    const items: ReviewItem[] = [];
    for (let i = 0; i < approved.length && items.length < sampleSize; i += step) {
      items.push(this.add({
        type: 'approved_sample',
        targetId: approved[i].id,
        batchRunId: approved[i].batchRunId,
      }));
    }
    return items;
  }

  /** Export for persistence */
  export(): ReviewItem[] {
    return [...this.items];
  }

  /** Import from persistence */
  import(items: ReviewItem[]): void {
    this.items.push(...items);
  }
}
