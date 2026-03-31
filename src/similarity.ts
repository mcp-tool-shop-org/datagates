import type { NearDuplicateConfig, NearDuplicateFieldConfig } from './types.js';

export interface SimilarityResult {
  score: number;
  matchId: string;
}

/**
 * Compare a record against a set of existing records using field-level similarity.
 * Returns all matches above the configured threshold.
 */
export function findNearDuplicates(
  payload: Record<string, unknown>,
  candidates: { id: string; payload: Record<string, unknown> }[],
  config: NearDuplicateConfig,
): SimilarityResult[] {
  const matches: SimilarityResult[] = [];

  for (const candidate of candidates) {
    const score = computeRecordSimilarity(payload, candidate.payload, config.fields);
    if (score >= config.threshold) {
      matches.push({ score, matchId: candidate.id });
    }
  }

  return matches.sort((a, b) => b.score - a.score);
}

/**
 * Compute weighted similarity between two records across configured fields.
 */
export function computeRecordSimilarity(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
  fields: NearDuplicateFieldConfig[],
): number {
  let totalWeight = 0;
  let weightedSum = 0;

  for (const fieldConfig of fields) {
    const weight = fieldConfig.weight ?? 1.0;
    totalWeight += weight;

    const valA = a[fieldConfig.field];
    const valB = b[fieldConfig.field];

    // Both null/undefined → identical for this field
    if ((valA === null || valA === undefined) && (valB === null || valB === undefined)) {
      weightedSum += weight;
      continue;
    }

    // One null, one not → zero similarity for this field
    if (valA === null || valA === undefined || valB === null || valB === undefined) {
      continue;
    }

    const sim = computeFieldSimilarity(valA, valB, fieldConfig.similarity);
    weightedSum += sim * weight;
  }

  return totalWeight > 0 ? weightedSum / totalWeight : 0;
}

function computeFieldSimilarity(
  a: unknown,
  b: unknown,
  method: NearDuplicateFieldConfig['similarity'],
): number {
  switch (method) {
    case 'exact':
      return a === b ? 1.0 : 0.0;

    case 'levenshtein':
      if (typeof a !== 'string' || typeof b !== 'string') return a === b ? 1.0 : 0.0;
      return levenshteinSimilarity(a, b);

    case 'numeric':
      if (typeof a !== 'number' || typeof b !== 'number') return a === b ? 1.0 : 0.0;
      return numericSimilarity(a, b);

    case 'token_jaccard':
      if (typeof a !== 'string' || typeof b !== 'string') return a === b ? 1.0 : 0.0;
      return tokenJaccardSimilarity(a, b);

    default:
      return a === b ? 1.0 : 0.0;
  }
}

/**
 * Levenshtein distance normalized to [0, 1] similarity.
 */
function levenshteinSimilarity(a: string, b: string): number {
  if (a === b) return 1.0;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1.0;
  return 1.0 - levenshteinDistance(a, b) / maxLen;
}

function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;

  // Use single-row optimization
  let prev = new Array(n + 1);
  let curr = new Array(n + 1);

  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,       // deletion
        curr[j - 1] + 1,   // insertion
        prev[j - 1] + cost, // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }

  return prev[n];
}

/**
 * Numeric similarity: 1 - |a-b| / max(|a|, |b|, 1).
 */
function numericSimilarity(a: number, b: number): number {
  if (a === b) return 1.0;
  const denom = Math.max(Math.abs(a), Math.abs(b), 1);
  return Math.max(0, 1.0 - Math.abs(a - b) / denom);
}

/**
 * Token Jaccard similarity: intersection/union of word tokens.
 */
function tokenJaccardSimilarity(a: string, b: string): number {
  const tokensA = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
  const tokensB = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));

  if (tokensA.size === 0 && tokensB.size === 0) return 1.0;

  let intersection = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) intersection++;
  }

  const union = tokensA.size + tokensB.size - intersection;
  return union > 0 ? intersection / union : 0;
}
