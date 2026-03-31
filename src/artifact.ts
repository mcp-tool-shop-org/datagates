import type {
  DecisionArtifact, BatchSummary, BatchVerdict,
  DriftViolation, OverrideReceipt, ZonedRecord,
  SchemaContract, GatePolicy, PolicyMeta,
} from './types.js';

/**
 * Decision artifact builder: assembles the complete evidence
 * trail for a batch decision. Every batch gets one artifact.
 * Same input + same policy + same overrides = same artifact.
 */
export function buildDecisionArtifact(params: {
  batchRunId: string;
  timestamp: string;
  schema: SchemaContract;
  policyMeta: PolicyMeta;
  summary: BatchSummary;
  records: ZonedRecord[];
  overrides: OverrideReceipt[];
  verdict: BatchVerdict;
}): DecisionArtifact {
  const { batchRunId, timestamp, schema, policyMeta, summary, records, overrides, verdict } = params;

  // Tally which rules fired and how many times
  const ruleCounts = new Map<string, number>();
  for (const r of records) {
    for (const f of r.failures) {
      ruleCounts.set(f.rule, (ruleCounts.get(f.rule) ?? 0) + 1);
    }
  }
  const rulesTriggered = [...ruleCounts.entries()]
    .map(([ruleId, count]) => ({ ruleId, count }))
    .sort((a, b) => b.count - a.count);

  // Source-level actions from verdict
  const sourceActions = verdict.quarantinedSources.map(sourceId => ({
    sourceId,
    action: 'quarantine',
    reason: `Source quarantined during batch ${batchRunId}`,
  }));

  return {
    batchRunId,
    timestamp,
    schema: { id: schema.schemaId, version: schema.schemaVersion },
    policy: { id: policyMeta.policyId, version: policyMeta.version, name: policyMeta.name },
    summary,
    rulesTriggered,
    sourceActions,
    holdoutResults: { overlaps: verdict.holdoutOverlaps },
    driftResults: verdict.driftViolations,
    overridesApplied: overrides,
    verdict,
    reconstructable: true,
  };
}
