import type { SchemaContract } from './types.js';

export const NORMALIZATION_VERSION = '1.0.0';

/**
 * Normalize a validated payload according to schema rules.
 * Only deterministic, non-destructive transforms.
 */
export function normalize(
  payload: Record<string, unknown>,
  schema: SchemaContract,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [field, def] of Object.entries(schema.fields)) {
    let value: unknown = payload[field];

    if (value === undefined || value === null) {
      // Canonical null: always use null, never undefined
      result[field] = null;
      continue;
    }

    // Trim whitespace on strings
    if (typeof value === 'string') {
      value = value.trim();
    }

    // Casing normalization
    if (typeof value === 'string' && def.normalizeCasing) {
      if (def.normalizeCasing === 'lower') value = (value as string).toLowerCase();
      if (def.normalizeCasing === 'upper') value = (value as string).toUpperCase();
    }

    // Date normalization: convert to ISO string (UTC)
    if (def.type === 'date' && typeof value === 'string') {
      value = new Date(value).toISOString();
    }

    result[field] = value;
  }

  return result;
}
