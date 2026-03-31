import type { ZonedRecord, HoldoutConfig, NearDuplicateConfig } from './types.js';
import { findNearDuplicates } from './similarity.js';

export interface HoldoutOverlap {
  recordId: string;
  holdoutId: string;
  type: 'exact' | 'near_duplicate';
  similarity: number;
}

/**
 * Check candidate records for overlap with a holdout/eval set.
 * Detects both exact hash matches and near-duplicate similarity.
 */
export function detectHoldoutOverlap(
  candidates: ZonedRecord[],
  holdoutRecords: { id: string; normalizedHash: string; payload: Record<string, unknown> }[],
  holdoutConfig: HoldoutConfig,
  nearDupConfig?: NearDuplicateConfig,
): HoldoutOverlap[] {
  const overlaps: HoldoutOverlap[] = [];
  const holdoutHashes = new Set(holdoutRecords.map(h => h.normalizedHash));

  for (const candidate of candidates) {
    if (candidate.zone !== 'candidate') continue;

    // Exact hash overlap
    if (candidate.normalizedHash && holdoutHashes.has(candidate.normalizedHash)) {
      const match = holdoutRecords.find(h => h.normalizedHash === candidate.normalizedHash);
      overlaps.push({
        recordId: candidate.id,
        holdoutId: match?.id ?? 'unknown',
        type: 'exact',
        similarity: 1.0,
      });
      continue;
    }

    // Near-duplicate overlap (if configured)
    if (nearDupConfig && candidate.normalizedPayload) {
      const threshold = holdoutConfig.similarityThreshold ?? nearDupConfig.threshold;
      const matches = findNearDuplicates(
        candidate.normalizedPayload,
        holdoutRecords.map(h => ({ id: h.id, payload: h.payload })),
        { ...nearDupConfig, threshold },
      );

      for (const match of matches) {
        overlaps.push({
          recordId: candidate.id,
          holdoutId: match.matchId,
          type: 'near_duplicate',
          similarity: match.score,
        });
      }
    }
  }

  return overlaps;
}
