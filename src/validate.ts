import type { SchemaContract, FieldDef, FailureReason, FailureClass } from './types.js';

/**
 * Validate a single record payload against a schema contract.
 * Returns an array of failures (empty = passed).
 */
export function validate(
  payload: Record<string, unknown>,
  schema: SchemaContract,
): FailureReason[] {
  const failures: FailureReason[] = [];

  // Check for required fields
  for (const [field, def] of Object.entries(schema.fields)) {
    const value = payload[field];

    if (def.required && (value === undefined || value === null || value === '')) {
      if (value === null && def.nullable) continue;
      const rule: FailureClass = value === null || value === ''
        ? 'null_critical'
        : 'missing_required';
      failures.push({ field, rule, message: `${field} is required` });
      continue;
    }

    if (value === undefined || value === null) continue;

    // Type checks
    const typeFailure = checkType(field, value, def);
    if (typeFailure) {
      failures.push(typeFailure);
      continue; // skip further checks if type is wrong
    }

    // Enum check
    if (def.type === 'enum' && def.enum) {
      if (!def.enum.includes(value as string)) {
        failures.push({
          field,
          rule: 'invalid_enum',
          message: `${field} value "${value}" not in [${def.enum.join(', ')}]`,
        });
      }
    }

    // Range checks for numbers
    if (def.type === 'number') {
      const num = value as number;
      if (def.min !== undefined && num < def.min) {
        failures.push({
          field,
          rule: 'out_of_range',
          message: `${field} value ${num} below min ${def.min}`,
        });
      }
      if (def.max !== undefined && num > def.max) {
        failures.push({
          field,
          rule: 'out_of_range',
          message: `${field} value ${num} above max ${def.max}`,
        });
      }
    }

    // Date range checks
    if (def.type === 'date') {
      const d = new Date(value as string).getTime();
      if (def.minDate && d < new Date(def.minDate).getTime()) {
        failures.push({
          field,
          rule: 'out_of_range',
          message: `${field} before min date ${def.minDate}`,
        });
      }
      if (def.maxDate && d > new Date(def.maxDate).getTime()) {
        failures.push({
          field,
          rule: 'out_of_range',
          message: `${field} after max date ${def.maxDate}`,
        });
      }
    }
  }

  // Check for unknown fields (schema violation)
  for (const field of Object.keys(payload)) {
    if (!(field in schema.fields)) {
      failures.push({
        field,
        rule: 'schema_violation',
        message: `Unknown field "${field}" not in schema`,
      });
    }
  }

  return failures;
}

function checkType(field: string, value: unknown, def: FieldDef): FailureReason | null {
  switch (def.type) {
    case 'string':
    case 'enum':
      if (typeof value !== 'string') {
        return { field, rule: 'schema_violation', message: `${field} must be a string, got ${typeof value}` };
      }
      break;
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return { field, rule: 'schema_violation', message: `${field} must be a finite number` };
      }
      break;
    case 'boolean':
      if (typeof value !== 'boolean') {
        return { field, rule: 'schema_violation', message: `${field} must be a boolean` };
      }
      break;
    case 'date':
      if (typeof value !== 'string' || Number.isNaN(new Date(value).getTime())) {
        return { field, rule: 'parse_failure', message: `${field} must be a valid ISO date string` };
      }
      break;
  }
  return null;
}
