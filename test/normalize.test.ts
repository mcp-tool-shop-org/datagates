import { describe, it, expect } from 'vitest';
import { normalize } from '../src/normalize.js';
import type { SchemaContract } from '../src/types.js';

const schema: SchemaContract = {
  schemaId: 'test-schema',
  schemaVersion: '1.0.0',
  fields: {
    name: { type: 'string', required: true },
    tag: { type: 'string', required: true, normalizeCasing: 'lower' },
    code: { type: 'string', required: false, normalizeCasing: 'upper' },
    joinedAt: { type: 'date', required: true },
    score: { type: 'number', required: false },
  },
  primaryKeys: ['name'],
};

describe('normalize', () => {
  it('trims whitespace from strings', () => {
    const result = normalize({
      name: '  Alice  ',
      tag: 'Admin',
      joinedAt: '2024-01-15',
    }, schema);
    expect(result.name).toBe('Alice');
  });

  it('lowercases tag field', () => {
    const result = normalize({
      name: 'Alice',
      tag: '  ADMIN  ',
      joinedAt: '2024-01-15',
    }, schema);
    expect(result.tag).toBe('admin');
  });

  it('uppercases code field', () => {
    const result = normalize({
      name: 'Alice',
      tag: 'admin',
      code: 'abc123',
      joinedAt: '2024-01-15',
    }, schema);
    expect(result.code).toBe('ABC123');
  });

  it('normalizes dates to ISO string', () => {
    const result = normalize({
      name: 'Alice',
      tag: 'admin',
      joinedAt: '2024-01-15',
    }, schema);
    expect(result.joinedAt).toBe('2024-01-15T00:00:00.000Z');
  });

  it('converts undefined to null', () => {
    const result = normalize({
      name: 'Alice',
      tag: 'admin',
      joinedAt: '2024-01-15',
    }, schema);
    expect(result.score).toBeNull();
    expect(result.code).toBeNull();
  });

  it('preserves numbers as-is', () => {
    const result = normalize({
      name: 'Alice',
      tag: 'admin',
      joinedAt: '2024-01-15',
      score: 42.5,
    }, schema);
    expect(result.score).toBe(42.5);
  });

  it('is deterministic (same input → same output)', () => {
    const input = { name: '  Bob  ', tag: '  USER  ', joinedAt: '2024-06-01' };
    const a = normalize(input, schema);
    const b = normalize(input, schema);
    expect(a).toEqual(b);
  });
});
