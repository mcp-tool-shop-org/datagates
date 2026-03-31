import type { SchemaContract, ZonedRecord, BatchMetrics, NumericSummary } from './types.js';

/**
 * Compute aggregate health metrics for a batch of zoned records.
 */
export function computeBatchMetrics(
  records: ZonedRecord[],
  schema: SchemaContract,
): BatchMetrics {
  const candidates = records.filter(r => r.zone === 'candidate' || r.zone === 'approved');
  const quarantined = records.filter(r => r.zone === 'quarantine');
  const total = records.length;

  return {
    nullRates: computeNullRates(candidates, schema),
    labelDistribution: computeLabelDistribution(candidates, schema),
    sourceDistribution: computeSourceDistribution(records),
    numericSummaries: computeNumericSummaries(candidates, schema),
    quarantineByReason: computeQuarantineByReason(quarantined),
    rowsTotal: total,
    rowsPassed: candidates.length,
    rowsQuarantined: quarantined.length,
    duplicateRate: total > 0
      ? records.filter(r => r.failures.some(f => f.rule === 'duplicate_payload' || f.rule === 'duplicate_id')).length / total
      : 0,
    nearDuplicateRate: total > 0
      ? records.filter(r => r.failures.some(f => f.rule === 'near_duplicate')).length / total
      : 0,
  };
}

function computeNullRates(
  records: ZonedRecord[],
  schema: SchemaContract,
): Record<string, number> {
  if (records.length === 0) return {};
  const rates: Record<string, number> = {};
  for (const [field, def] of Object.entries(schema.fields)) {
    // Only track null rates for required fields (optional fields being null is expected)
    if (!def.required) continue;
    const nullCount = records.filter(r => {
      const val = r.normalizedPayload?.[field];
      return val === null || val === undefined;
    }).length;
    rates[field] = nullCount / records.length;
  }
  return rates;
}

function computeLabelDistribution(
  records: ZonedRecord[],
  schema: SchemaContract,
): Record<string, Record<string, number>> {
  const dist: Record<string, Record<string, number>> = {};
  for (const [field, def] of Object.entries(schema.fields)) {
    if (def.type !== 'enum') continue;
    dist[field] = {};
    for (const r of records) {
      const val = r.normalizedPayload?.[field];
      if (typeof val === 'string') {
        dist[field][val] = (dist[field][val] ?? 0) + 1;
      }
    }
  }
  return dist;
}

function computeSourceDistribution(records: ZonedRecord[]): Record<string, number> {
  const dist: Record<string, number> = {};
  for (const r of records) {
    dist[r.sourceId] = (dist[r.sourceId] ?? 0) + 1;
  }
  return dist;
}

function computeNumericSummaries(
  records: ZonedRecord[],
  schema: SchemaContract,
): Record<string, NumericSummary> {
  const summaries: Record<string, NumericSummary> = {};
  for (const [field, def] of Object.entries(schema.fields)) {
    if (def.type !== 'number') continue;
    const values: number[] = [];
    for (const r of records) {
      const val = r.normalizedPayload?.[field];
      if (typeof val === 'number' && Number.isFinite(val)) {
        values.push(val);
      }
    }
    if (values.length === 0) continue;
    summaries[field] = summarizeNumeric(values);
  }
  return summaries;
}

function summarizeNumeric(values: number[]): NumericSummary {
  const sorted = [...values].sort((a, b) => a - b);
  const count = sorted.length;
  const mean = sorted.reduce((s, v) => s + v, 0) / count;
  const median = count % 2 === 0
    ? (sorted[count / 2 - 1] + sorted[count / 2]) / 2
    : sorted[Math.floor(count / 2)];
  const variance = sorted.reduce((s, v) => s + (v - mean) ** 2, 0) / count;
  const stddev = Math.sqrt(variance);

  return {
    min: sorted[0],
    max: sorted[count - 1],
    mean,
    median,
    stddev,
    count,
  };
}

function computeQuarantineByReason(quarantined: ZonedRecord[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const r of quarantined) {
    for (const f of r.failures) {
      counts[f.rule] = (counts[f.rule] ?? 0) + 1;
    }
  }
  return counts;
}
