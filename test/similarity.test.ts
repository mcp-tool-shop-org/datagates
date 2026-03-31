import { describe, it, expect } from 'vitest';
import { findNearDuplicates, computeRecordSimilarity } from '../src/similarity.js';
import type { NearDuplicateConfig, NearDuplicateFieldConfig } from '../src/types.js';

describe('computeRecordSimilarity', () => {
  describe('exact similarity', () => {
    const fields: NearDuplicateFieldConfig[] = [
      { field: 'name', similarity: 'exact' },
      { field: 'role', similarity: 'exact' },
    ];

    it('identical records = 1.0', () => {
      const sim = computeRecordSimilarity(
        { name: 'Alice', role: 'admin' },
        { name: 'Alice', role: 'admin' },
        fields,
      );
      expect(sim).toBe(1.0);
    });

    it('completely different records = 0.0', () => {
      const sim = computeRecordSimilarity(
        { name: 'Alice', role: 'admin' },
        { name: 'Bob', role: 'user' },
        fields,
      );
      expect(sim).toBe(0.0);
    });

    it('one field matches = 0.5', () => {
      const sim = computeRecordSimilarity(
        { name: 'Alice', role: 'admin' },
        { name: 'Alice', role: 'user' },
        fields,
      );
      expect(sim).toBe(0.5);
    });
  });

  describe('levenshtein similarity', () => {
    const fields: NearDuplicateFieldConfig[] = [
      { field: 'name', similarity: 'levenshtein' },
    ];

    it('identical strings = 1.0', () => {
      const sim = computeRecordSimilarity(
        { name: 'Alice' },
        { name: 'Alice' },
        fields,
      );
      expect(sim).toBe(1.0);
    });

    it('similar strings have high similarity', () => {
      const sim = computeRecordSimilarity(
        { name: 'Alice' },
        { name: 'Alise' },
        fields,
      );
      expect(sim).toBeGreaterThan(0.7);
    });

    it('very different strings have low similarity', () => {
      const sim = computeRecordSimilarity(
        { name: 'Alice' },
        { name: 'Zzzzzzzzz' },
        fields,
      );
      expect(sim).toBeLessThan(0.3);
    });

    it('empty string vs non-empty = 0.0', () => {
      const sim = computeRecordSimilarity(
        { name: '' },
        { name: 'Alice' },
        fields,
      );
      expect(sim).toBe(0.0);
    });
  });

  describe('numeric similarity', () => {
    const fields: NearDuplicateFieldConfig[] = [
      { field: 'price', similarity: 'numeric' },
    ];

    it('identical numbers = 1.0', () => {
      const sim = computeRecordSimilarity({ price: 100 }, { price: 100 }, fields);
      expect(sim).toBe(1.0);
    });

    it('close numbers have high similarity', () => {
      const sim = computeRecordSimilarity({ price: 100 }, { price: 95 }, fields);
      expect(sim).toBeGreaterThan(0.9);
    });

    it('distant numbers have low similarity', () => {
      const sim = computeRecordSimilarity({ price: 100 }, { price: 1 }, fields);
      expect(sim).toBeLessThan(0.1);
    });

    it('zero vs zero = 1.0', () => {
      const sim = computeRecordSimilarity({ price: 0 }, { price: 0 }, fields);
      expect(sim).toBe(1.0);
    });
  });

  describe('token_jaccard similarity', () => {
    const fields: NearDuplicateFieldConfig[] = [
      { field: 'description', similarity: 'token_jaccard' },
    ];

    it('identical text = 1.0', () => {
      const sim = computeRecordSimilarity(
        { description: 'fast red car' },
        { description: 'fast red car' },
        fields,
      );
      expect(sim).toBe(1.0);
    });

    it('overlapping tokens have partial similarity', () => {
      const sim = computeRecordSimilarity(
        { description: 'fast red car' },
        { description: 'fast blue car' },
        fields,
      );
      // 2 overlap out of 4 unique tokens → ~0.5
      expect(sim).toBeCloseTo(0.5, 1);
    });

    it('no overlap = 0.0', () => {
      const sim = computeRecordSimilarity(
        { description: 'fast red car' },
        { description: 'slow green bus' },
        fields,
      );
      expect(sim).toBe(0.0);
    });

    it('case insensitive', () => {
      const sim = computeRecordSimilarity(
        { description: 'Fast Red Car' },
        { description: 'fast red car' },
        fields,
      );
      expect(sim).toBe(1.0);
    });
  });

  describe('weighted similarity', () => {
    it('higher-weight fields dominate', () => {
      const fields: NearDuplicateFieldConfig[] = [
        { field: 'name', similarity: 'exact', weight: 3.0 },
        { field: 'role', similarity: 'exact', weight: 1.0 },
      ];
      // name matches (weight 3), role differs (weight 1) → 3/4 = 0.75
      const sim = computeRecordSimilarity(
        { name: 'Alice', role: 'admin' },
        { name: 'Alice', role: 'user' },
        fields,
      );
      expect(sim).toBe(0.75);
    });
  });

  describe('null handling', () => {
    const fields: NearDuplicateFieldConfig[] = [
      { field: 'name', similarity: 'exact' },
      { field: 'extra', similarity: 'exact' },
    ];

    it('both null = identical for that field', () => {
      const sim = computeRecordSimilarity(
        { name: 'Alice', extra: null },
        { name: 'Alice', extra: null },
        fields,
      );
      expect(sim).toBe(1.0);
    });

    it('one null, one not = 0 for that field', () => {
      const sim = computeRecordSimilarity(
        { name: 'Alice', extra: 'yes' },
        { name: 'Alice', extra: null },
        fields,
      );
      expect(sim).toBe(0.5);
    });
  });
});

describe('findNearDuplicates', () => {
  const config: NearDuplicateConfig = {
    fields: [
      { field: 'name', similarity: 'levenshtein', weight: 2.0 },
      { field: 'description', similarity: 'token_jaccard', weight: 1.0 },
    ],
    threshold: 0.8,
  };

  it('finds near-duplicates above threshold', () => {
    const candidates = [
      { id: 'a', payload: { name: 'Alice Smith', description: 'data scientist at labs' } },
      { id: 'b', payload: { name: 'Bob Jones', description: 'totally different person' } },
    ];

    const matches = findNearDuplicates(
      { name: 'Alice Smth', description: 'data scientist at labs' },
      candidates,
      config,
    );

    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches[0].matchId).toBe('a');
    expect(matches[0].score).toBeGreaterThanOrEqual(0.8);
  });

  it('returns empty when no matches above threshold', () => {
    const candidates = [
      { id: 'a', payload: { name: 'Completely Different', description: 'unrelated text' } },
    ];

    const matches = findNearDuplicates(
      { name: 'Alice Smith', description: 'data scientist' },
      candidates,
      config,
    );

    expect(matches).toHaveLength(0);
  });

  it('returns matches sorted by score descending', () => {
    const candidates = [
      { id: 'a', payload: { name: 'Alice Smyth', description: 'data scientist at labs' } },
      { id: 'b', payload: { name: 'Alice Smith', description: 'data scientist at labs' } },
    ];

    const matches = findNearDuplicates(
      { name: 'Alice Smith', description: 'data scientist at labs' },
      candidates,
      config,
    );

    // b should score higher (exact name match)
    expect(matches[0].matchId).toBe('b');
    if (matches.length > 1) {
      expect(matches[0].score).toBeGreaterThanOrEqual(matches[1].score);
    }
  });
});
