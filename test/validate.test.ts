import { describe, it, expect } from 'vitest';
import { validate } from '../src/validate.js';
import type { SchemaContract } from '../src/types.js';

const schema: SchemaContract = {
  schemaId: 'test-schema',
  schemaVersion: '1.0.0',
  fields: {
    name: { type: 'string', required: true },
    age: { type: 'number', required: true, min: 0, max: 150 },
    email: { type: 'string', required: false },
    role: { type: 'enum', required: true, enum: ['admin', 'user', 'moderator'] },
    active: { type: 'boolean', required: true },
    joinedAt: { type: 'date', required: true, minDate: '2000-01-01', maxDate: '2030-12-31' },
    bio: { type: 'string', required: false, nullable: true },
  },
  primaryKeys: ['name', 'email'],
};

describe('validate', () => {
  it('passes a fully valid record', () => {
    const failures = validate({
      name: 'Alice',
      age: 30,
      email: 'alice@example.com',
      role: 'admin',
      active: true,
      joinedAt: '2024-06-15T00:00:00Z',
    }, schema);
    expect(failures).toEqual([]);
  });

  it('passes with optional fields omitted', () => {
    const failures = validate({
      name: 'Bob',
      age: 25,
      role: 'user',
      active: false,
      joinedAt: '2023-01-01',
    }, schema);
    expect(failures).toEqual([]);
  });

  it('rejects missing required field', () => {
    const failures = validate({
      age: 30,
      role: 'admin',
      active: true,
      joinedAt: '2024-01-01',
    }, schema);
    expect(failures).toHaveLength(1);
    expect(failures[0].rule).toBe('missing_required');
    expect(failures[0].field).toBe('name');
  });

  it('rejects null on required non-nullable field', () => {
    const failures = validate({
      name: null,
      age: 30,
      role: 'admin',
      active: true,
      joinedAt: '2024-01-01',
    }, schema);
    expect(failures.some(f => f.field === 'name' && f.rule === 'null_critical')).toBe(true);
  });

  it('allows null on nullable field', () => {
    const failures = validate({
      name: 'Carol',
      age: 40,
      role: 'user',
      active: true,
      joinedAt: '2024-01-01',
      bio: null,
    }, schema);
    expect(failures).toEqual([]);
  });

  it('rejects wrong type (string where number expected)', () => {
    const failures = validate({
      name: 'Dave',
      age: 'thirty',
      role: 'user',
      active: true,
      joinedAt: '2024-01-01',
    }, schema);
    expect(failures.some(f => f.field === 'age' && f.rule === 'schema_violation')).toBe(true);
  });

  it('rejects invalid enum value', () => {
    const failures = validate({
      name: 'Eve',
      age: 28,
      role: 'superadmin',
      active: true,
      joinedAt: '2024-01-01',
    }, schema);
    expect(failures.some(f => f.field === 'role' && f.rule === 'invalid_enum')).toBe(true);
  });

  it('rejects number below min', () => {
    const failures = validate({
      name: 'Frank',
      age: -5,
      role: 'user',
      active: true,
      joinedAt: '2024-01-01',
    }, schema);
    expect(failures.some(f => f.field === 'age' && f.rule === 'out_of_range')).toBe(true);
  });

  it('rejects number above max', () => {
    const failures = validate({
      name: 'Grace',
      age: 200,
      role: 'user',
      active: true,
      joinedAt: '2024-01-01',
    }, schema);
    expect(failures.some(f => f.field === 'age' && f.rule === 'out_of_range')).toBe(true);
  });

  it('rejects invalid date string', () => {
    const failures = validate({
      name: 'Hank',
      age: 35,
      role: 'user',
      active: true,
      joinedAt: 'not-a-date',
    }, schema);
    expect(failures.some(f => f.field === 'joinedAt' && f.rule === 'parse_failure')).toBe(true);
  });

  it('rejects date before minDate', () => {
    const failures = validate({
      name: 'Iris',
      age: 50,
      role: 'user',
      active: true,
      joinedAt: '1999-12-31',
    }, schema);
    expect(failures.some(f => f.field === 'joinedAt' && f.rule === 'out_of_range')).toBe(true);
  });

  it('rejects date after maxDate', () => {
    const failures = validate({
      name: 'Jack',
      age: 22,
      role: 'user',
      active: true,
      joinedAt: '2031-01-01',
    }, schema);
    expect(failures.some(f => f.field === 'joinedAt' && f.rule === 'out_of_range')).toBe(true);
  });

  it('rejects unknown fields', () => {
    const failures = validate({
      name: 'Kate',
      age: 29,
      role: 'admin',
      active: true,
      joinedAt: '2024-01-01',
      hackField: 'surprise',
    }, schema);
    expect(failures.some(f => f.field === 'hackField' && f.rule === 'schema_violation')).toBe(true);
  });

  it('rejects NaN as number', () => {
    const failures = validate({
      name: 'Leo',
      age: NaN,
      role: 'user',
      active: true,
      joinedAt: '2024-01-01',
    }, schema);
    expect(failures.some(f => f.field === 'age' && f.rule === 'schema_violation')).toBe(true);
  });

  it('rejects Infinity as number', () => {
    const failures = validate({
      name: 'Mona',
      age: Infinity,
      role: 'user',
      active: true,
      joinedAt: '2024-01-01',
    }, schema);
    expect(failures.some(f => f.field === 'age' && f.rule === 'schema_violation')).toBe(true);
  });

  it('rejects empty string on required field', () => {
    const failures = validate({
      name: '',
      age: 30,
      role: 'admin',
      active: true,
      joinedAt: '2024-01-01',
    }, schema);
    expect(failures.some(f => f.field === 'name' && f.rule === 'null_critical')).toBe(true);
  });

  it('collects multiple failures', () => {
    const failures = validate({
      age: 'bad',
      role: 'invalid',
      active: 'yes',
    }, schema);
    expect(failures.length).toBeGreaterThanOrEqual(3);
  });
});
