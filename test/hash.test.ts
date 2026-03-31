import { describe, it, expect } from 'vitest';
import { hashPayload, contentAddressedId } from '../src/hash.js';

describe('hashPayload', () => {
  it('produces consistent hash for same payload', () => {
    const a = hashPayload({ name: 'Alice', age: 30 });
    const b = hashPayload({ name: 'Alice', age: 30 });
    expect(a).toBe(b);
  });

  it('produces same hash regardless of key order', () => {
    const a = hashPayload({ age: 30, name: 'Alice' });
    const b = hashPayload({ name: 'Alice', age: 30 });
    expect(a).toBe(b);
  });

  it('produces different hash for different payloads', () => {
    const a = hashPayload({ name: 'Alice' });
    const b = hashPayload({ name: 'Bob' });
    expect(a).not.toBe(b);
  });

  it('returns a hex string', () => {
    const hash = hashPayload({ x: 1 });
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('contentAddressedId', () => {
  it('produces consistent ID', () => {
    const a = contentAddressedId('src1', 'abc123');
    const b = contentAddressedId('src1', 'abc123');
    expect(a).toBe(b);
  });

  it('produces 24-char hex ID', () => {
    const id = contentAddressedId('src1', 'abc123');
    expect(id).toMatch(/^[0-9a-f]{24}$/);
  });

  it('different sources produce different IDs', () => {
    const a = contentAddressedId('src1', 'abc123');
    const b = contentAddressedId('src2', 'abc123');
    expect(a).not.toBe(b);
  });
});
