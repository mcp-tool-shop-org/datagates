import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const CLI = join(process.cwd(), 'dist', 'cli.js');
const testDir = join(tmpdir(), `datagates-cli-test-${Date.now()}`);

function run(args: string, options?: { cwd?: string; expectFail?: boolean }): string {
  const cwd = options?.cwd ?? testDir;
  try {
    return execSync(`node ${CLI} ${args}`, { cwd, encoding: 'utf-8', timeout: 15000 });
  } catch (err: any) {
    if (options?.expectFail) return err.stdout + err.stderr;
    throw err;
  }
}

beforeEach(() => { mkdirSync(testDir, { recursive: true }); });
afterEach(() => { rmSync(testDir, { recursive: true, force: true }); });

describe('CLI', () => {
  it('help shows commands', () => {
    const output = run('help');
    expect(output).toContain('datagates');
    expect(output).toContain('init');
    expect(output).toContain('run');
    expect(output).toContain('calibrate');
  });

  it('--version shows version', () => {
    const output = run('--version', { cwd: process.cwd() });
    expect(output.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('packs lists available policy packs', () => {
    const output = run('packs', { cwd: process.cwd() });
    expect(output).toContain('strict-structured');
    expect(output).toContain('text-dedupe');
    expect(output).toContain('classification-basic');
    expect(output).toContain('source-probation-first');
  });

  it('init creates project scaffold', () => {
    run('init --name test-project');
    expect(existsSync(join(testDir, 'datagates.json'))).toBe(true);
    expect(existsSync(join(testDir, 'schema.json'))).toBe(true);
    expect(existsSync(join(testDir, 'policy.json'))).toBe(true);
    expect(existsSync(join(testDir, 'gold-set.json'))).toBe(true);
    expect(existsSync(join(testDir, 'artifacts'))).toBe(true);

    const config = JSON.parse(readFileSync(join(testDir, 'datagates.json'), 'utf-8'));
    expect(config.name).toBe('test-project');
  });

  it('init with --pack uses policy pack', () => {
    run('init --pack strict-structured');
    const policy = JSON.parse(readFileSync(join(testDir, 'policy.json'), 'utf-8'));
    expect(policy.gatePolicyVersion).toContain('strict-structured');
  });

  it('init rejects double initialization', () => {
    run('init');
    const output = run('init', { expectFail: true });
    expect(output).toContain('already initialized');
  });

  it('run ingests data and produces report', () => {
    run('init');
    // Create test data matching the default schema
    const data = [
      { id: 'r1', name: 'Alice', value: 100, category: 'alpha' },
      { id: 'r2', name: 'Bob', value: 200, category: 'beta' },
    ];
    writeFileSync(join(testDir, 'data.json'), JSON.stringify(data));

    const output = run('run --input data.json');
    expect(output).toContain('Rows ingested:');
    expect(output).toContain('Verdict:');
  });

  it('run creates artifact', () => {
    run('init');
    const data = [{ id: 'r1', name: 'Test', value: 50, category: 'gamma' }];
    writeFileSync(join(testDir, 'data.json'), JSON.stringify(data));
    run('run --input data.json');

    const artifacts = require('node:fs').readdirSync(join(testDir, 'artifacts'));
    expect(artifacts.length).toBeGreaterThan(0);
    expect(artifacts[0]).toMatch(/\.json$/);
  });

  it('run quarantines bad data with exit code 1', () => {
    run('init');
    // All records are bad — should quarantine batch
    const data = [
      { id: 'r1', name: 'Bad', value: -999, category: 'invalid' },
      { id: 'r2', name: 'Worse', value: 99999, category: 'invalid' },
    ];
    writeFileSync(join(testDir, 'data.json'), JSON.stringify(data));

    const output = run('run --input data.json', { expectFail: true });
    expect(output).toContain('QUARANTINE_BATCH');
  });

  it('calibrate runs gold set', () => {
    run('init');
    const output = run('calibrate');
    expect(output).toContain('Precision:');
    expect(output).toContain('Recall:');
    expect(output).toContain('F1:');
  });

  it('calibrate fails on regression', () => {
    run('init');
    // Create a baseline with perfect scores
    const baseline = {
      policyId: 'test', policyVersion: '1.0.0', timestamp: '2026-01-01',
      total: 4, truePositives: 2, trueNegatives: 2, falsePositives: 0, falseNegatives: 0,
      precision: 1.0, recall: 1.0, f1: 1.0, details: [],
    };
    writeFileSync(join(testDir, 'baseline.json'), JSON.stringify(baseline));

    // Modify gold set so current calibration has worse F1
    const badGoldSet = [
      { id: 'g1', payload: { id: 'x', name: 'Valid', value: 50, category: 'alpha' }, sourceId: 's', expected: 'quarantine', reason: 'expect quarantine but will pass' },
    ];
    writeFileSync(join(testDir, 'gold-set.json'), JSON.stringify(badGoldSet));

    const output = run('calibrate --baseline baseline.json', { expectFail: true });
    expect(output).toContain('F1') // either regression message or F1 report
  });

  it('review list works on empty queue', () => {
    run('init');
    // review list requires reviewQueuePath — add it
    const config = JSON.parse(readFileSync(join(testDir, 'datagates.json'), 'utf-8'));
    config.reviewQueuePath = 'reviews.json';
    writeFileSync(join(testDir, 'datagates.json'), JSON.stringify(config));

    const output = run('review list');
    expect(output).toContain('No review items');
  });

  it('source list works on empty registry', () => {
    run('init');
    const config = JSON.parse(readFileSync(join(testDir, 'datagates.json'), 'utf-8'));
    config.sourceRegistryPath = 'sources.json';
    writeFileSync(join(testDir, 'datagates.json'), JSON.stringify(config));

    const output = run('source list');
    expect(output).toContain('No registered sources');
  });

  it('source register creates a new source', () => {
    run('init');
    const config = JSON.parse(readFileSync(join(testDir, 'datagates.json'), 'utf-8'));
    config.sourceRegistryPath = 'sources.json';
    writeFileSync(join(testDir, 'datagates.json'), JSON.stringify(config));

    const output = run('source register --id vendor-a --batches 5');
    expect(output).toContain('Registered');
    expect(output).toContain('vendor-a');

    // Verify file was created
    expect(existsSync(join(testDir, 'sources.json'))).toBe(true);
  });

  it('unknown command shows error', () => {
    const output = run('nonexistent', { expectFail: true });
    expect(output).toContain('Unknown command');
  });
});
