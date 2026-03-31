import type {
  BatchSummary, BatchVerdict, DecisionArtifact,
  ZonedRecord, ShadowResult, CalibrationResult,
} from './types.js';

/**
 * Terminal report: structured, human-readable summary
 * of every batch run, calibration, or shadow comparison.
 */

export function formatBatchReport(summary: BatchSummary, records: ZonedRecord[]): string {
  const lines: string[] = [];
  const v = summary.verdict;

  lines.push('');
  lines.push(`  Batch: ${summary.batchRunId}`);
  lines.push(`  Time:  ${summary.timestamp}`);
  lines.push(`  Policy: ${summary.gatePolicyVersion}  Schema: ${summary.schemaVersion}`);
  lines.push('');
  lines.push(`  Rows ingested:    ${summary.rowsIngested}`);
  lines.push(`  Rows passed:      ${summary.rowsPassed}`);
  lines.push(`  Rows quarantined: ${summary.rowsQuarantined}`);
  lines.push(`  Duplicates:       ${summary.duplicatesDetected}`);
  lines.push(`  Near-duplicates:  ${summary.nearDuplicatesDetected}`);
  lines.push(`  Semantic issues:  ${summary.semanticViolations}`);
  lines.push(`  Avg confidence:   ${summary.avgConfidence.toFixed(3)}`);
  lines.push('');

  if (v) {
    const icon = verdictIcon(v.disposition);
    lines.push(`  Verdict: ${icon} ${v.disposition.toUpperCase()}`);

    if (v.reasons.length > 0) {
      lines.push('  Reasons:');
      for (const r of v.reasons) lines.push(`    - ${r}`);
    }
    if (v.warnings.length > 0) {
      lines.push('  Warnings:');
      for (const w of v.warnings) lines.push(`    - ${w}`);
    }
    if (v.quarantinedSources.length > 0) {
      lines.push(`  Quarantined sources: ${v.quarantinedSources.join(', ')}`);
    }
    if (v.holdoutOverlaps > 0) {
      lines.push(`  Holdout overlaps: ${v.holdoutOverlaps}`);
    }
  }

  // Reject reasons breakdown
  const rejectEntries = Object.entries(summary.rejectReasons).filter(([, n]) => n > 0);
  if (rejectEntries.length > 0) {
    lines.push('');
    lines.push('  Quarantine breakdown:');
    for (const [reason, count] of rejectEntries.sort((a, b) => b[1] - a[1])) {
      lines.push(`    ${reason}: ${count}`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

export function formatCalibrationReport(result: CalibrationResult): string {
  const lines: string[] = [];

  lines.push('');
  lines.push(`  Calibration: ${result.policyId}@${result.policyVersion}`);
  lines.push(`  Time: ${result.timestamp}`);
  lines.push(`  Gold set size: ${result.total}`);
  lines.push('');
  lines.push(`  True positives:  ${result.truePositives}`);
  lines.push(`  True negatives:  ${result.trueNegatives}`);
  lines.push(`  False positives: ${result.falsePositives}`);
  lines.push(`  False negatives: ${result.falseNegatives}`);
  lines.push('');
  lines.push(`  Precision: ${result.precision.toFixed(3)}`);
  lines.push(`  Recall:    ${result.recall.toFixed(3)}`);
  lines.push(`  F1:        ${result.f1.toFixed(3)}`);

  // Detail any mismatches
  const mismatches = result.details.filter(d => !d.correct);
  if (mismatches.length > 0) {
    lines.push('');
    lines.push('  Mismatches:');
    for (const m of mismatches) {
      lines.push(`    ${m.goldSetId}: expected=${m.expected} actual=${m.actual}`);
      if (m.failures.length > 0) {
        for (const f of m.failures) lines.push(`      ${f.rule}: ${f.message}`);
      }
    }
  }

  lines.push('');
  return lines.join('\n');
}

export function formatShadowReport(result: ShadowResult): string {
  const lines: string[] = [];

  lines.push('');
  lines.push(`  Shadow comparison: ${result.activePolicyId} vs ${result.shadowPolicyId}`);
  lines.push(`  Batch: ${result.batchRunId}`);
  lines.push(`  Time:  ${result.timestamp}`);
  lines.push('');
  lines.push(`  Active verdict:  ${result.activeVerdict.disposition}`);
  lines.push(`  Shadow verdict:  ${result.shadowVerdict.disposition}`);
  lines.push(`  Verdict changed: ${result.verdictChanged ? 'YES' : 'no'}`);
  lines.push('');
  lines.push(`  Newly rejected rows:  ${result.newlyRejectedRows}`);
  lines.push(`  Newly approved rows:  ${result.newlyApprovedRows}`);

  if (result.newlyQuarantinedSources.length > 0) {
    lines.push(`  Newly quarantined sources: ${result.newlyQuarantinedSources.join(', ')}`);
  }

  lines.push('');
  return lines.join('\n');
}

export function formatArtifactReport(artifact: DecisionArtifact): string {
  const lines: string[] = [];

  lines.push('');
  lines.push(`  Decision Artifact: ${artifact.batchRunId}`);
  lines.push(`  Time:   ${artifact.timestamp}`);
  lines.push(`  Schema: ${artifact.schema.id}@${artifact.schema.version}`);
  lines.push(`  Policy: ${artifact.policy.id}@${artifact.policy.version} (${artifact.policy.name})`);
  lines.push('');
  lines.push(`  Verdict: ${verdictIcon(artifact.verdict.disposition)} ${artifact.verdict.disposition.toUpperCase()}`);
  lines.push(`  Reconstructable: ${artifact.reconstructable}`);
  lines.push('');

  if (artifact.rulesTriggered.length > 0) {
    lines.push('  Rules triggered:');
    for (const r of artifact.rulesTriggered) {
      lines.push(`    ${r.ruleId}: ${r.count}x`);
    }
  }

  if (artifact.sourceActions.length > 0) {
    lines.push('  Source actions:');
    for (const a of artifact.sourceActions) {
      lines.push(`    ${a.sourceId}: ${a.action} — ${a.reason}`);
    }
  }

  if (artifact.driftResults.length > 0) {
    lines.push('  Drift violations:');
    for (const d of artifact.driftResults) {
      lines.push(`    ${d.field}: ${d.description}`);
    }
  }

  if (artifact.overridesApplied.length > 0) {
    lines.push('  Overrides applied:');
    for (const o of artifact.overridesApplied) {
      lines.push(`    ${o.overrideId}: ${o.action} by ${o.actor} — ${o.reason}`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

function verdictIcon(disposition: string): string {
  switch (disposition) {
    case 'approve': return '[PASS]';
    case 'approve_with_warnings': return '[WARN]';
    case 'quarantine_batch': return '[FAIL]';
    case 'partial_salvage': return '[PART]';
    default: return '[????]';
  }
}

// ── Exit codes ──────────────────────────────────────────────────────

export const EXIT = {
  OK: 0,
  BATCH_QUARANTINED: 1,
  CALIBRATION_REGRESSION: 2,
  SHADOW_VERDICT_CHANGED: 3,
  CONFIG_ERROR: 10,
  MISSING_FILE: 11,
  VALIDATION_ERROR: 12,
} as const;
