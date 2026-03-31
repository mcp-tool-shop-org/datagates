#!/usr/bin/env node

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import {
  CONFIG_FILENAME, findConfig, loadConfig, saveConfig,
  loadSchema, loadPolicy, loadGoldSet, loadShadowPolicy, ensureDir,
} from './config.js';
import { Pipeline } from './pipeline.js';
import { ZoneStore } from './store.js';
import { calibrate, checkCalibrationRegression } from './calibration.js';
import { runShadow } from './shadow.js';
import { buildDecisionArtifact } from './artifact.js';
import { OverrideRegistry } from './overrides.js';
import { ReviewQueue } from './review.js';
import { SourceRegistry } from './onboarding.js';
import { PolicyRegistry } from './policies.js';
import {
  formatBatchReport, formatCalibrationReport,
  formatShadowReport, formatArtifactReport, EXIT,
} from './report.js';
import {
  defaultConfig, defaultSchema, defaultPolicy, defaultGoldSet,
  POLICY_PACKS, getPolicyPack,
} from './templates.js';
import type { RawRecord, PolicyMeta, CalibrationResult } from './types.js';

// ── Main dispatch ───────────────────────────────────────────────────

const COMMANDS: Record<string, string> = {
  init: 'Initialize a new datagates project',
  run: 'Ingest a batch and execute gates',
  calibrate: 'Run gold set against a policy',
  shadow: 'Compare active vs candidate policy',
  review: 'List and manage review queue',
  source: 'Manage source onboarding',
  artifact: 'Export a decision artifact',
  'promote-policy': 'Activate a policy after checks',
  packs: 'List available policy packs',
  help: 'Show this help message',
};

async function main(): Promise<number> {
  const command = process.argv[2];

  if (!command || command === 'help' || command === '--help') {
    printHelp();
    return EXIT.OK;
  }

  if (command === '--version') {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8'));
    console.log(pkg.version);
    return EXIT.OK;
  }

  switch (command) {
    case 'init': return cmdInit();
    case 'run': return cmdRun();
    case 'calibrate': return cmdCalibrate();
    case 'shadow': return cmdShadow();
    case 'review': return cmdReview();
    case 'source': return cmdSource();
    case 'artifact': return cmdArtifact();
    case 'promote-policy': return cmdPromotePolicy();
    case 'packs': return cmdPacks();
    default:
      console.error(`Unknown command: ${command}`);
      console.error(`Run "datagates help" for usage.`);
      return EXIT.CONFIG_ERROR;
  }
}

// ── init ────────────────────────────────────────────────────────────

function cmdInit(): number {
  const { values } = parseArgs({
    args: process.argv.slice(3),
    options: {
      name: { type: 'string', default: 'my-project' },
      pack: { type: 'string' },
    },
    strict: false,
  });

  const projectName = values.name as string;
  const configPath = join(process.cwd(), CONFIG_FILENAME);

  if (existsSync(configPath)) {
    console.error(`Project already initialized: ${configPath}`);
    return EXIT.CONFIG_ERROR;
  }

  const config = defaultConfig(projectName);

  // Write config
  saveConfig(configPath, config);
  console.log(`  Created ${CONFIG_FILENAME}`);

  // Write schema
  const schemaPath = join(process.cwd(), config.schemaPath);
  writeFileSync(schemaPath, JSON.stringify(defaultSchema(), null, 2) + '\n');
  console.log(`  Created ${config.schemaPath}`);

  // Write policy (from pack or default)
  const policyPath = join(process.cwd(), config.policyPath);
  const packId = values.pack as string | undefined;
  if (packId) {
    const pack = getPolicyPack(packId);
    if (!pack) {
      console.error(`Unknown policy pack: ${packId}`);
      console.error(`Run "datagates packs" to see available packs.`);
      return EXIT.CONFIG_ERROR;
    }
    writeFileSync(policyPath, JSON.stringify(pack.policy, null, 2) + '\n');
    console.log(`  Created ${config.policyPath} (pack: ${pack.name})`);
  } else {
    writeFileSync(policyPath, JSON.stringify(defaultPolicy(), null, 2) + '\n');
    console.log(`  Created ${config.policyPath}`);
  }

  // Write gold set
  const goldSetPath = join(process.cwd(), config.goldSetPath!);
  writeFileSync(goldSetPath, JSON.stringify(defaultGoldSet(), null, 2) + '\n');
  console.log(`  Created ${config.goldSetPath}`);
  if (packId) {
    console.log(`  NOTE: gold-set.json uses default schema fields — update it to match your schema`);
  }

  // Create artifacts dir
  ensureDir(join(process.cwd(), config.artifactsPath!));
  console.log(`  Created ${config.artifactsPath}/`);

  console.log('');
  console.log(`  Project "${projectName}" initialized.`);
  console.log('');
  console.log('  Next steps:');
  console.log('    1. Edit schema.json to match your data');
  console.log('    2. Edit policy.json to set your thresholds');
  console.log('    3. Edit gold-set.json to match your schema');
  console.log('    4. Run: datagates run --input data.json');
  console.log('');

  return EXIT.OK;
}

// ── run ─────────────────────────────────────────────────────────────

function cmdRun(): number {
  const { values } = parseArgs({
    args: process.argv.slice(3),
    options: {
      input: { type: 'string', short: 'i' },
      'source-id': { type: 'string', default: 'cli' },
    },
    strict: false,
  });

  const { config, baseDir } = resolveConfig();
  const inputPath = values.input as string | undefined;
  if (!inputPath) {
    console.error('Missing --input <path> (JSON array of records)');
    return EXIT.MISSING_FILE;
  }

  const absInput = resolve(process.cwd(), inputPath);
  if (!existsSync(absInput)) {
    console.error(`Input file not found: ${absInput}`);
    return EXIT.MISSING_FILE;
  }

  const schema = loadSchema(config, baseDir);
  const policy = loadPolicy(config, baseDir);
  const storePath = resolve(baseDir, config.storePath);
  const store = new ZoneStore(storePath);

  const rawPayloads: Record<string, unknown>[] = JSON.parse(readFileSync(absInput, 'utf-8'));
  const sourceId = values['source-id'] as string;
  const now = new Date().toISOString();

  const records: RawRecord[] = rawPayloads.map(payload => ({
    sourceId,
    batchRunId: '',
    ingestTimestamp: now,
    payload,
  }));

  const pipeline = new Pipeline(schema, policy, store);
  const result = pipeline.ingest(records);

  // Build and save artifact
  if (config.artifactsPath) {
    const artifactsDir = resolve(baseDir, config.artifactsPath);
    ensureDir(artifactsDir);

    const policyMeta: PolicyMeta = {
      policyId: 'active',
      version: policy.gatePolicyVersion,
      name: 'Active Policy',
      status: 'active',
      effectiveDate: now,
      author: 'cli',
      policy,
    };

    const artifact = buildDecisionArtifact({
      batchRunId: result.summary.batchRunId,
      timestamp: result.summary.timestamp,
      schema,
      policyMeta,
      summary: result.summary,
      records: result.records,
      overrides: [],
      verdict: result.summary.verdict!,
    });

    const artifactPath = join(artifactsDir, `${result.summary.batchRunId}.json`);
    writeFileSync(artifactPath, JSON.stringify(artifact, null, 2) + '\n');
  }

  // Enqueue quarantined for review
  if (config.reviewQueuePath) {
    const queue = loadReviewQueue(config, baseDir);
    queue.enqueueQuarantined(result.records);
    saveReviewQueue(config, baseDir, queue);
  }

  console.log(formatBatchReport(result.summary, result.records));

  store.close();

  const disposition = result.summary.verdict?.disposition;
  if (disposition === 'quarantine_batch') return EXIT.BATCH_QUARANTINED;
  return EXIT.OK;
}

// ── calibrate ───────────────────────────────────────────────────────

function cmdCalibrate(): number {
  const { values } = parseArgs({
    args: process.argv.slice(3),
    options: {
      baseline: { type: 'string', short: 'b' },
      'max-f1-drop': { type: 'string', default: '0.05' },
    },
    strict: false,
  });

  const { config, baseDir } = resolveConfig();
  const schema = loadSchema(config, baseDir);
  const policy = loadPolicy(config, baseDir);
  const goldSet = loadGoldSet(config, baseDir);

  if (!goldSet || goldSet.length === 0) {
    console.error('No gold set found. Create one at the path specified in datagates.json.');
    return EXIT.MISSING_FILE;
  }

  const result = calibrate(goldSet, schema, policy);
  console.log(formatCalibrationReport(result));

  // Check regression against baseline
  const baselinePath = values.baseline as string | undefined;
  if (baselinePath) {
    const absBaseline = resolve(process.cwd(), baselinePath);
    if (!existsSync(absBaseline)) {
      console.error(`Baseline file not found: ${absBaseline}`);
      return EXIT.MISSING_FILE;
    }
    const baseline = JSON.parse(readFileSync(absBaseline, 'utf-8')) as CalibrationResult;
    const maxDrop = parseFloat(values['max-f1-drop'] as string);
    const check = checkCalibrationRegression(result, baseline, maxDrop);

    if (check.regressed) {
      console.error(`  REGRESSION: ${check.reason}`);
      return EXIT.CALIBRATION_REGRESSION;
    }
    console.log('  No regression detected.');
  }

  // Save result for future baseline
  if (config.artifactsPath) {
    const artifactsDir = resolve(baseDir, config.artifactsPath);
    ensureDir(artifactsDir);
    const calibPath = join(artifactsDir, `calibration-${Date.now()}.json`);
    writeFileSync(calibPath, JSON.stringify(result, null, 2) + '\n');
    console.log(`  Saved: ${calibPath}`);
  }

  return EXIT.OK;
}

// ── shadow ──────────────────────────────────────────────────────────

function cmdShadow(): number {
  const { values } = parseArgs({
    args: process.argv.slice(3),
    options: {
      input: { type: 'string', short: 'i' },
      'source-id': { type: 'string', default: 'cli' },
    },
    strict: false,
  });

  const { config, baseDir } = resolveConfig();
  const inputPath = values.input as string | undefined;
  if (!inputPath) {
    console.error('Missing --input <path>');
    return EXIT.MISSING_FILE;
  }

  const schema = loadSchema(config, baseDir);
  const activePolicy = loadPolicy(config, baseDir);
  const shadowPolicy = loadShadowPolicy(config, baseDir);

  if (!shadowPolicy) {
    console.error('No shadow policy configured. Set shadowPolicyPath in datagates.json.');
    return EXIT.CONFIG_ERROR;
  }

  const absInput = resolve(process.cwd(), inputPath);
  if (!existsSync(absInput)) {
    console.error(`Input file not found: ${absInput}`);
    return EXIT.MISSING_FILE;
  }

  const rawPayloads: Record<string, unknown>[] = JSON.parse(readFileSync(absInput, 'utf-8'));
  const sourceId = values['source-id'] as string;
  const now = new Date().toISOString();
  const records: RawRecord[] = rawPayloads.map(payload => ({
    sourceId, batchRunId: '', ingestTimestamp: now, payload,
  }));

  const store = new ZoneStore(':memory:');
  const result = runShadow({
    records, schema, activePolicy, shadowPolicy,
    activePolicyId: activePolicy.gatePolicyVersion,
    shadowPolicyId: shadowPolicy.gatePolicyVersion,
    store,
  });
  store.close();

  console.log(formatShadowReport(result));

  if (result.verdictChanged) return EXIT.SHADOW_VERDICT_CHANGED;
  return EXIT.OK;
}

// ── review ──────────────────────────────────────────────────────────

function cmdReview(): number {
  const subcommand = process.argv[3];

  const { config, baseDir } = resolveConfig();
  const queue = loadReviewQueue(config, baseDir);

  if (!subcommand || subcommand === 'list') {
    const status = process.argv[4] as string | undefined;
    const items = status ? queue.list({ status: status as any }) : queue.pending();
    if (items.length === 0) {
      console.log('  No review items found.');
    } else {
      console.log(`  ${items.length} review item(s):`);
      for (const item of items) {
        console.log(`    ${item.reviewId} [${item.type}] ${item.status} — target: ${item.targetId.slice(0, 12)}`);
      }
    }
    return EXIT.OK;
  }

  if (subcommand === 'confirm' || subcommand === 'dismiss' || subcommand === 'override') {
    const reviewId = process.argv[4];
    const reviewer = process.argv[5] || 'cli-operator';
    if (!reviewId) {
      console.error(`Usage: datagates review ${subcommand} <reviewId> [reviewer]`);
      return EXIT.VALIDATION_ERROR;
    }

    const statusMap: Record<string, any> = {
      confirm: 'confirmed',
      dismiss: 'dismissed',
      override: 'overridden',
    };

    try {
      queue.review(reviewId, { status: statusMap[subcommand], reviewer });
      saveReviewQueue(config, baseDir, queue);
      console.log(`  Review ${reviewId.slice(0, 8)}: ${statusMap[subcommand]}`);
    } catch (err: any) {
      console.error(`  Error: ${err.message}`);
      return EXIT.VALIDATION_ERROR;
    }
    return EXIT.OK;
  }

  console.error(`Unknown review subcommand: ${subcommand}`);
  return EXIT.CONFIG_ERROR;
}

// ── source ──────────────────────────────────────────────────────────

function cmdSource(): number {
  const subcommand = process.argv[3];
  const { config, baseDir } = resolveConfig();
  const sources = loadSourceRegistry(config, baseDir);

  if (!subcommand || subcommand === 'list') {
    const all = sources.list();
    if (all.length === 0) {
      console.log('  No registered sources.');
    } else {
      for (const s of all) {
        const level = s.probationLevel ? ` (${s.probationLevel})` : '';
        console.log(`  ${s.sourceId}: ${s.status}${level} — ${s.batchesCompleted}/${s.probationBatchesRequired} batches`);
      }
    }
    return EXIT.OK;
  }

  if (subcommand === 'register') {
    const { values } = parseArgs({
      args: process.argv.slice(4),
      options: {
        id: { type: 'string' },
        schema: { type: 'string', default: 'default' },
        fields: { type: 'string', default: '' },
        dedupe: { type: 'string', default: 'normalized_hash' },
        batches: { type: 'string', default: '3' },
      },
      strict: false,
    });

    const sourceId = values.id as string;
    if (!sourceId) {
      console.error('Usage: datagates source register --id <sourceId>');
      return EXIT.VALIDATION_ERROR;
    }

    try {
      const contract = sources.register({
        sourceId,
        schemaId: values.schema as string,
        criticalFields: (values.fields as string).split(',').filter(Boolean),
        dedupeStrategy: values.dedupe as string,
        probationBatchesRequired: parseInt(values.batches as string, 10),
      });
      saveSourceRegistry(config, baseDir, sources);
      console.log(`  Registered: ${contract.sourceId} (probation: ${contract.probationBatchesRequired} batches)`);
    } catch (err: any) {
      console.error(`  Error: ${err.message}`);
      return EXIT.VALIDATION_ERROR;
    }
    return EXIT.OK;
  }

  if (subcommand === 'activate') {
    const sourceId = process.argv[4];
    if (!sourceId) {
      console.error('Usage: datagates source activate <sourceId>');
      return EXIT.VALIDATION_ERROR;
    }
    try {
      sources.activate(sourceId);
      saveSourceRegistry(config, baseDir, sources);
      console.log(`  Activated: ${sourceId}`);
    } catch (err: any) {
      console.error(`  Error: ${err.message}`);
      return EXIT.VALIDATION_ERROR;
    }
    return EXIT.OK;
  }

  if (subcommand === 'suspend') {
    const sourceId = process.argv[4];
    if (!sourceId) {
      console.error('Usage: datagates source suspend <sourceId>');
      return EXIT.VALIDATION_ERROR;
    }
    try {
      sources.suspend(sourceId);
      saveSourceRegistry(config, baseDir, sources);
      console.log(`  Suspended: ${sourceId}`);
    } catch (err: any) {
      console.error(`  Error: ${err.message}`);
      return EXIT.VALIDATION_ERROR;
    }
    return EXIT.OK;
  }

  console.error(`Unknown source subcommand: ${subcommand}`);
  return EXIT.CONFIG_ERROR;
}

// ── artifact ────────────────────────────────────────────────────────

function cmdArtifact(): number {
  const { values } = parseArgs({
    args: process.argv.slice(3),
    options: {
      id: { type: 'string' },
      format: { type: 'string', default: 'text' },
    },
    strict: false,
  });

  const { config, baseDir } = resolveConfig();
  const artifactId = values.id as string | undefined;

  if (!config.artifactsPath) {
    console.error('No artifacts path configured.');
    return EXIT.CONFIG_ERROR;
  }

  const artifactsDir = resolve(baseDir, config.artifactsPath);

  if (!artifactId) {
    // List available artifacts
    if (!existsSync(artifactsDir)) {
      console.log('  No artifacts found.');
      return EXIT.OK;
    }
    const files = readdirSync(artifactsDir).filter((f: string) =>
      f.endsWith('.json') && !f.startsWith('calibration')
    );
    if (files.length === 0) {
      console.log('  No artifacts found.');
    } else {
      console.log(`  ${files.length} artifact(s):`);
      for (const f of files) console.log(`    ${f.replace('.json', '')}`);
    }
    return EXIT.OK;
  }

  const artifactPath = join(artifactsDir, `${artifactId}.json`);
  if (!existsSync(artifactPath)) {
    console.error(`Artifact not found: ${artifactId}`);
    return EXIT.MISSING_FILE;
  }

  const artifact = JSON.parse(readFileSync(artifactPath, 'utf-8'));
  const fmt = values.format as string;
  if (fmt === 'json') {
    console.log(JSON.stringify(artifact, null, 2));
  } else {
    console.log(formatArtifactReport(artifact));
  }

  return EXIT.OK;
}

// ── promote-policy ──────────────────────────────────────────────────

function cmdPromotePolicy(): number {
  const { values } = parseArgs({
    args: process.argv.slice(3),
    options: {
      'require-calibration': { type: 'boolean', default: true },
      'require-shadow': { type: 'boolean', default: false },
    },
    strict: false,
  });

  const { config, baseDir } = resolveConfig();
  const schema = loadSchema(config, baseDir);
  const policy = loadPolicy(config, baseDir);

  if (values['require-calibration']) {
    const goldSet = loadGoldSet(config, baseDir);
    if (!goldSet || goldSet.length === 0) {
      console.error('  Calibration required but no gold set found.');
      return EXIT.CALIBRATION_REGRESSION;
    }
    const result = calibrate(goldSet, schema, policy);
    console.log(formatCalibrationReport(result));
    if (result.falseNegatives > 0) {
      console.error('  BLOCKED: false negatives detected — bad data would leak.');
      return EXIT.CALIBRATION_REGRESSION;
    }
    if (result.f1 < 0.8) {
      console.error(`  BLOCKED: F1 score ${result.f1.toFixed(3)} below minimum 0.8.`);
      return EXIT.CALIBRATION_REGRESSION;
    }
    console.log('  Calibration: PASSED');
  }

  console.log(`  Policy ${policy.gatePolicyVersion} is ready for activation.`);
  return EXIT.OK;
}

// ── packs ───────────────────────────────────────────────────────────

function cmdPacks(): number {
  console.log('');
  console.log('  Available policy packs:');
  console.log('');
  for (const pack of POLICY_PACKS) {
    console.log(`  ${pack.id}`);
    console.log(`    ${pack.description}`);
    console.log('');
  }
  console.log('  Use: datagates init --pack <pack-id>');
  console.log('');
  return EXIT.OK;
}

// ── Helpers ─────────────────────────────────────────────────────────

function resolveConfig(): { config: ReturnType<typeof loadConfig>; baseDir: string } {
  const configPath = findConfig();
  if (!configPath) {
    console.error(`No ${CONFIG_FILENAME} found. Run "datagates init" first.`);
    process.exit(EXIT.CONFIG_ERROR);
  }
  return { config: loadConfig(configPath), baseDir: dirname(configPath) };
}

function printHelp(): void {
  console.log('');
  console.log('  datagates — governed data promotion system');
  console.log('');
  console.log('  Usage: datagates <command> [options]');
  console.log('');
  console.log('  Commands:');
  for (const [cmd, desc] of Object.entries(COMMANDS)) {
    console.log(`    ${cmd.padEnd(18)} ${desc}`);
  }
  console.log('');
  console.log('  Examples:');
  console.log('    datagates init --name my-project');
  console.log('    datagates init --pack strict-structured');
  console.log('    datagates run --input data.json');
  console.log('    datagates calibrate');
  console.log('    datagates shadow --input data.json');
  console.log('    datagates review list');
  console.log('    datagates source list');
  console.log('    datagates artifact --id <batch-id>');
  console.log('');
}

function loadReviewQueue(config: ReturnType<typeof loadConfig>, baseDir: string): ReviewQueue {
  const queue = new ReviewQueue();
  const path = config.reviewQueuePath ? resolve(baseDir, config.reviewQueuePath) : null;
  if (path && existsSync(path)) {
    queue.import(JSON.parse(readFileSync(path, 'utf-8')));
  }
  return queue;
}

function saveReviewQueue(config: ReturnType<typeof loadConfig>, baseDir: string, queue: ReviewQueue): void {
  const path = config.reviewQueuePath ? resolve(baseDir, config.reviewQueuePath) : null;
  if (path) writeFileSync(path, JSON.stringify(queue.export(), null, 2) + '\n');
}

function loadSourceRegistry(config: ReturnType<typeof loadConfig>, baseDir: string): SourceRegistry {
  const reg = new SourceRegistry();
  const path = config.sourceRegistryPath ? resolve(baseDir, config.sourceRegistryPath) : null;
  if (path && existsSync(path)) {
    reg.import(JSON.parse(readFileSync(path, 'utf-8')));
  }
  return reg;
}

function saveSourceRegistry(config: ReturnType<typeof loadConfig>, baseDir: string, reg: SourceRegistry): void {
  const path = config.sourceRegistryPath ? resolve(baseDir, config.sourceRegistryPath) : null;
  if (path) writeFileSync(path, JSON.stringify(reg.export(), null, 2) + '\n');
}

// ── Entry ───────────────────────────────────────────────────────────

main().then(code => process.exit(code)).catch(err => {
  console.error(err);
  process.exit(1);
});
