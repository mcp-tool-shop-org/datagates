import type {
  SchemaContract, GatePolicy, RawRecord,
  ShadowResult, BatchVerdict,
} from './types.js';
import { Pipeline } from './pipeline.js';
import { ZoneStore } from './store.js';

/**
 * Shadow mode: run a candidate policy against a batch without
 * affecting the real store. Compare verdicts to detect divergence.
 *
 * Shadow results feed the review queue as 'shadow_delta' items
 * when verdicts differ, giving operators visibility before activation.
 */
export function runShadow(params: {
  records: RawRecord[];
  schema: SchemaContract;
  activePolicy: GatePolicy;
  shadowPolicy: GatePolicy;
  activePolicyId: string;
  shadowPolicyId: string;
  store: ZoneStore;
}): ShadowResult {
  const { records, schema, activePolicy, shadowPolicy, activePolicyId, shadowPolicyId, store } = params;

  // Run active policy against the real store
  const activeResult = new Pipeline(schema, activePolicy, store).ingest(records);

  // Run shadow policy against an isolated in-memory store
  const shadowStore = new ZoneStore(':memory:');
  const shadowResult = new Pipeline(schema, shadowPolicy, shadowStore).ingest(records);

  // Compare row-level outcomes
  const activeZones = new Map(activeResult.records.map(r => [r.rawHash, r.zone]));
  const shadowZones = new Map(shadowResult.records.map(r => [r.rawHash, r.zone]));

  let newlyRejectedRows = 0;
  let newlyApprovedRows = 0;

  for (const [hash, shadowZone] of shadowZones) {
    const activeZone = activeZones.get(hash);
    if (!activeZone) continue;

    const activePass = activeZone === 'approved' || activeZone === 'candidate';
    const shadowPass = shadowZone === 'approved' || shadowZone === 'candidate';

    if (activePass && !shadowPass) newlyRejectedRows++;
    if (!activePass && shadowPass) newlyApprovedRows++;
  }

  // Compare source-level quarantine
  const activeSources = new Set(activeResult.summary.verdict?.quarantinedSources ?? []);
  const shadowSources = new Set(shadowResult.summary.verdict?.quarantinedSources ?? []);
  const newlyQuarantinedSources = [...shadowSources].filter(s => !activeSources.has(s));

  const activeVerdict = activeResult.summary.verdict!;
  const shadowVerdict = shadowResult.summary.verdict!;
  const verdictChanged = activeVerdict.disposition !== shadowVerdict.disposition;

  shadowStore.close();

  return {
    shadowPolicyId,
    activePolicyId,
    batchRunId: activeResult.summary.batchRunId,
    timestamp: new Date().toISOString(),
    activeVerdict,
    shadowVerdict,
    newlyRejectedRows,
    newlyApprovedRows,
    newlyQuarantinedSources,
    verdictChanged,
  };
}
