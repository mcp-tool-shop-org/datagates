import { describe, it, expect } from 'vitest';
import { detectHoldoutOverlap } from '../src/holdout.js';
import type { ZonedRecord, HoldoutConfig, NearDuplicateConfig } from '../src/types.js';

function makeCandidate(id: string, hash: string, payload: Record<string, unknown>): ZonedRecord {
  return {
    id, zone: 'candidate', sourceId: 'src', batchRunId: 'b1',
    ingestTimestamp: '2024-01-01T00:00:00Z', rawHash: 'rh',
    normalizedHash: hash, payload, normalizedPayload: payload,
    failures: [], schemaVersion: '1.0.0', normalizationVersion: '1.0.0',
    gatePolicyVersion: '1.0.0', confidence: null,
  };
}

const holdoutConfig: HoldoutConfig = {};

describe('detectHoldoutOverlap', () => {
  it('detects exact hash overlap', () => {
    const candidates = [
      makeCandidate('c1', 'hash-abc', { name: 'alice' }),
      makeCandidate('c2', 'hash-xyz', { name: 'bob' }),
    ];
    const holdout = [
      { id: 'h1', normalizedHash: 'hash-abc', payload: { name: 'alice' } },
    ];

    const overlaps = detectHoldoutOverlap(candidates, holdout, holdoutConfig);
    expect(overlaps).toHaveLength(1);
    expect(overlaps[0].recordId).toBe('c1');
    expect(overlaps[0].holdoutId).toBe('h1');
    expect(overlaps[0].type).toBe('exact');
    expect(overlaps[0].similarity).toBe(1.0);
  });

  it('detects near-duplicate overlap when configured', () => {
    const nearDupConfig: NearDuplicateConfig = {
      fields: [
        { field: 'name', similarity: 'levenshtein', weight: 1.0 },
        { field: 'desc', similarity: 'token_jaccard', weight: 1.0 },
      ],
      threshold: 0.8,
    };

    const candidates = [
      makeCandidate('c1', 'hash-1', { name: 'alice smith', desc: 'data scientist at lab' }),
    ];
    const holdout = [
      { id: 'h1', normalizedHash: 'different', payload: { name: 'alice smyth', desc: 'data scientist at lab' } },
    ];

    const overlaps = detectHoldoutOverlap(candidates, holdout, holdoutConfig, nearDupConfig);
    expect(overlaps).toHaveLength(1);
    expect(overlaps[0].type).toBe('near_duplicate');
    expect(overlaps[0].similarity).toBeGreaterThanOrEqual(0.8);
  });

  it('returns empty when no overlaps', () => {
    const candidates = [makeCandidate('c1', 'hash-1', { name: 'alice' })];
    const holdout = [{ id: 'h1', normalizedHash: 'hash-999', payload: { name: 'zara' } }];

    expect(detectHoldoutOverlap(candidates, holdout, holdoutConfig)).toHaveLength(0);
  });

  it('skips non-candidate records', () => {
    const quarantined = makeCandidate('c1', 'hash-abc', { name: 'alice' });
    quarantined.zone = 'quarantine';
    const holdout = [{ id: 'h1', normalizedHash: 'hash-abc', payload: { name: 'alice' } }];

    expect(detectHoldoutOverlap([quarantined], holdout, holdoutConfig)).toHaveLength(0);
  });

  it('returns empty when holdout set is empty', () => {
    const candidates = [makeCandidate('c1', 'hash-1', { name: 'alice' })];
    expect(detectHoldoutOverlap(candidates, [], holdoutConfig)).toHaveLength(0);
  });
});
