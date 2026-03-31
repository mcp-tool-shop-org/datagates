import type { SemanticRule, SemanticCondition, FailureReason } from './types.js';

/**
 * Evaluate semantic rules against a normalized payload.
 * Rules are "when X then Y" — if the `when` condition is true,
 * the `then` condition must also be true or a failure is emitted.
 */
export function evaluateSemanticRules(
  payload: Record<string, unknown>,
  rules: SemanticRule[],
): FailureReason[] {
  const failures: FailureReason[] = [];

  for (const rule of rules) {
    // Only evaluate `then` if `when` is true
    if (!evaluateCondition(payload, rule.when)) continue;

    if (!evaluateCondition(payload, rule.then)) {
      failures.push({
        field: rule.then.field,
        rule: rule.failureClass,
        message: `Semantic rule "${rule.id}" violated: ${rule.description}`,
      });
    }
  }

  return failures;
}

function evaluateCondition(
  payload: Record<string, unknown>,
  condition: SemanticCondition,
): boolean {
  const value = payload[condition.field];

  switch (condition.operator) {
    case 'exists':
      return value !== null && value !== undefined;
    case 'not_exists':
      return value === null || value === undefined;
    case 'equals':
      return value === condition.value;
    case 'not_equals':
      return value !== condition.value;
    case 'gt':
      return typeof value === 'number' && typeof condition.value === 'number' && value > condition.value;
    case 'gte':
      return typeof value === 'number' && typeof condition.value === 'number' && value >= condition.value;
    case 'lt':
      return typeof value === 'number' && typeof condition.value === 'number' && value < condition.value;
    case 'lte':
      return typeof value === 'number' && typeof condition.value === 'number' && value <= condition.value;
    case 'in':
      return Array.isArray(condition.value) && condition.value.includes(value);
    case 'not_in':
      return Array.isArray(condition.value) && !condition.value.includes(value);
    case 'matches':
      return typeof value === 'string' && typeof condition.value === 'string' && new RegExp(condition.value).test(value);
    default:
      return false;
  }
}
