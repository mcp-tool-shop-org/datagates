import { createHash } from 'node:crypto';

/**
 * Content-addressed hash of a payload.
 * Deterministic: keys sorted, values stringified consistently.
 */
export function hashPayload(payload: Record<string, unknown>): string {
  const sorted = JSON.stringify(payload, Object.keys(payload).sort());
  return createHash('sha256').update(sorted).digest('hex');
}

/**
 * Content-addressed ID from source + payload hash.
 * Optional salt (e.g. batchRunId) ensures uniqueness for quarantine records.
 */
export function contentAddressedId(sourceId: string, rawHash: string, salt?: string): string {
  const input = salt ? `${sourceId}:${rawHash}:${salt}` : `${sourceId}:${rawHash}`;
  return createHash('sha256')
    .update(input)
    .digest('hex')
    .slice(0, 24);
}
