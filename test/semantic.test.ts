import { describe, it, expect } from 'vitest';
import { evaluateSemanticRules } from '../src/semantic.js';
import type { SemanticRule } from '../src/types.js';

describe('evaluateSemanticRules', () => {
  const rules: SemanticRule[] = [
    {
      id: 'closed-needs-date',
      description: 'If status is closed, closedAt must exist',
      when: { field: 'status', operator: 'equals', value: 'closed' },
      then: { field: 'closedAt', operator: 'exists' },
      failureClass: 'field_contradiction',
    },
    {
      id: 'min-lte-max',
      description: 'minPrice must be less than or equal to maxPrice',
      when: { field: 'minPrice', operator: 'exists' },
      then: { field: 'maxPrice', operator: 'gte', value: 0 }, // placeholder — we'll test cross-field below
      failureClass: 'cross_field_violation',
    },
    {
      id: 'active-needs-email',
      description: 'Active users must have an email',
      when: { field: 'active', operator: 'equals', value: true },
      then: { field: 'email', operator: 'exists' },
      failureClass: 'field_contradiction',
    },
    {
      id: 'premium-not-free',
      description: 'Premium tier cannot have price 0',
      when: { field: 'tier', operator: 'equals', value: 'premium' },
      then: { field: 'price', operator: 'gt', value: 0 },
      failureClass: 'cross_field_violation',
    },
    {
      id: 'category-match',
      description: 'Category must be in allowed set when published',
      when: { field: 'published', operator: 'equals', value: true },
      then: { field: 'category', operator: 'in', value: ['tech', 'science', 'arts'] },
      failureClass: 'cross_field_violation',
    },
    {
      id: 'draft-no-slug',
      description: 'Draft items should not have a slug',
      when: { field: 'status', operator: 'equals', value: 'draft' },
      then: { field: 'slug', operator: 'not_exists' },
      failureClass: 'field_contradiction',
    },
    {
      id: 'code-format',
      description: 'Product code must match pattern when present',
      when: { field: 'code', operator: 'exists' },
      then: { field: 'code', operator: 'matches', value: '^[A-Z]{2}-\\d{4}$' },
      failureClass: 'cross_field_violation',
    },
    {
      id: 'blocked-not-active',
      description: 'Blocked status excludes active states',
      when: { field: 'status', operator: 'equals', value: 'blocked' },
      then: { field: 'tier', operator: 'not_in', value: ['premium', 'enterprise'] },
      failureClass: 'field_contradiction',
    },
  ];

  // ── Passing cases ──

  it('passes when condition is not triggered', () => {
    const failures = evaluateSemanticRules({ status: 'open' }, rules);
    expect(failures).toEqual([]);
  });

  it('passes when condition is triggered and then-clause holds', () => {
    const failures = evaluateSemanticRules({ status: 'closed', closedAt: '2024-01-01' }, rules);
    expect(failures).toEqual([]);
  });

  it('passes: active user with email', () => {
    const failures = evaluateSemanticRules({ active: true, email: 'test@example.com' }, rules);
    expect(failures).toEqual([]);
  });

  it('passes: premium with positive price', () => {
    const failures = evaluateSemanticRules({ tier: 'premium', price: 9.99 }, rules);
    expect(failures).toEqual([]);
  });

  it('passes: published with valid category', () => {
    const failures = evaluateSemanticRules({ published: true, category: 'tech' }, rules);
    expect(failures).toEqual([]);
  });

  it('passes: draft without slug', () => {
    const failures = evaluateSemanticRules({ status: 'draft' }, rules);
    expect(failures).toEqual([]);
  });

  it('passes: valid product code format', () => {
    const failures = evaluateSemanticRules({ code: 'AB-1234' }, rules);
    expect(failures).toEqual([]);
  });

  it('passes: blocked with free tier', () => {
    const failures = evaluateSemanticRules({ status: 'blocked', tier: 'free' }, rules);
    expect(failures).toEqual([]);
  });

  // ── Failing cases ──

  it('fails: closed without closedAt', () => {
    const failures = evaluateSemanticRules({ status: 'closed' }, rules);
    expect(failures).toHaveLength(1);
    expect(failures[0].rule).toBe('field_contradiction');
    expect(failures[0].field).toBe('closedAt');
  });

  it('fails: active without email', () => {
    const failures = evaluateSemanticRules({ active: true }, rules);
    expect(failures).toHaveLength(1);
    expect(failures[0].rule).toBe('field_contradiction');
    expect(failures[0].field).toBe('email');
  });

  it('fails: premium with price 0', () => {
    const failures = evaluateSemanticRules({ tier: 'premium', price: 0 }, rules);
    expect(failures).toHaveLength(1);
    expect(failures[0].rule).toBe('cross_field_violation');
  });

  it('fails: published with invalid category', () => {
    const failures = evaluateSemanticRules({ published: true, category: 'cooking' }, rules);
    expect(failures).toHaveLength(1);
    expect(failures[0].rule).toBe('cross_field_violation');
  });

  it('fails: draft with slug', () => {
    const failures = evaluateSemanticRules({ status: 'draft', slug: 'my-post' }, rules);
    expect(failures).toHaveLength(1);
    expect(failures[0].rule).toBe('field_contradiction');
  });

  it('fails: invalid product code format', () => {
    const failures = evaluateSemanticRules({ code: 'bad-code' }, rules);
    expect(failures).toHaveLength(1);
    expect(failures[0].rule).toBe('cross_field_violation');
  });

  it('fails: blocked with premium tier', () => {
    // Include price > 0 so only the blocked-not-active rule fires (not premium-not-free)
    const failures = evaluateSemanticRules({ status: 'blocked', tier: 'premium', price: 99 }, rules);
    expect(failures).toHaveLength(1);
    expect(failures[0].rule).toBe('field_contradiction');
  });

  it('collects multiple failures from different rules', () => {
    const failures = evaluateSemanticRules({
      status: 'closed',
      active: true,
      // missing closedAt AND email
    }, rules);
    expect(failures.length).toBeGreaterThanOrEqual(2);
  });

  it('returns empty for empty rules', () => {
    const failures = evaluateSemanticRules({ anything: 'goes' }, []);
    expect(failures).toEqual([]);
  });

  // ── Operator coverage ──

  it('not_equals operator', () => {
    const rule: SemanticRule = {
      id: 'ne-test',
      description: 'x must not equal 5',
      when: { field: 'check', operator: 'equals', value: true },
      then: { field: 'x', operator: 'not_equals', value: 5 },
      failureClass: 'cross_field_violation',
    };
    expect(evaluateSemanticRules({ check: true, x: 5 }, [rule])).toHaveLength(1);
    expect(evaluateSemanticRules({ check: true, x: 6 }, [rule])).toHaveLength(0);
  });

  it('lt operator', () => {
    const rule: SemanticRule = {
      id: 'lt-test',
      description: 'x must be less than 10',
      when: { field: 'check', operator: 'equals', value: true },
      then: { field: 'x', operator: 'lt', value: 10 },
      failureClass: 'cross_field_violation',
    };
    expect(evaluateSemanticRules({ check: true, x: 10 }, [rule])).toHaveLength(1);
    expect(evaluateSemanticRules({ check: true, x: 9 }, [rule])).toHaveLength(0);
  });

  it('lte operator', () => {
    const rule: SemanticRule = {
      id: 'lte-test',
      description: 'x must be <= 10',
      when: { field: 'check', operator: 'equals', value: true },
      then: { field: 'x', operator: 'lte', value: 10 },
      failureClass: 'cross_field_violation',
    };
    expect(evaluateSemanticRules({ check: true, x: 11 }, [rule])).toHaveLength(1);
    expect(evaluateSemanticRules({ check: true, x: 10 }, [rule])).toHaveLength(0);
  });

  it('not_in operator', () => {
    const rule: SemanticRule = {
      id: 'not-in-test',
      description: 'role must not be admin or root',
      when: { field: 'check', operator: 'equals', value: true },
      then: { field: 'role', operator: 'not_in', value: ['admin', 'root'] },
      failureClass: 'cross_field_violation',
    };
    expect(evaluateSemanticRules({ check: true, role: 'admin' }, [rule])).toHaveLength(1);
    expect(evaluateSemanticRules({ check: true, role: 'user' }, [rule])).toHaveLength(0);
  });
});
