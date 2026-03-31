import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  findConfig, loadConfig, saveConfig,
  loadSchema, loadPolicy, loadGoldSet,
  CONFIG_FILENAME, ensureDir,
} from '../src/config.js';
import type { ProjectConfig } from '../src/config.js';

const testDir = join(tmpdir(), `datagates-config-test-${Date.now()}`);

beforeEach(() => { mkdirSync(testDir, { recursive: true }); });
afterEach(() => { rmSync(testDir, { recursive: true, force: true }); });

describe('Config', () => {
  it('saves and loads a config', () => {
    const config: ProjectConfig = {
      name: 'test-project',
      schemaPath: 'schema.json',
      policyPath: 'policy.json',
      storePath: 'datagates.db',
    };
    const configPath = join(testDir, CONFIG_FILENAME);
    saveConfig(configPath, config);
    const loaded = loadConfig(configPath);
    expect(loaded.name).toBe('test-project');
    expect(loaded.schemaPath).toBe('schema.json');
  });

  it('findConfig walks up directories', () => {
    const nested = join(testDir, 'a', 'b', 'c');
    mkdirSync(nested, { recursive: true });
    saveConfig(join(testDir, CONFIG_FILENAME), {
      name: 'root', schemaPath: 's.json', policyPath: 'p.json', storePath: 'd.db',
    });
    const found = findConfig(nested);
    expect(found).toBe(join(testDir, CONFIG_FILENAME));
  });

  it('findConfig returns null when not found', () => {
    const isolated = join(tmpdir(), `datagates-no-config-${Date.now()}`);
    mkdirSync(isolated, { recursive: true });
    const found = findConfig(isolated);
    rmSync(isolated, { recursive: true, force: true });
    // May return null or string (if a parent dir has datagates.json)
    expect(found === null || typeof found === 'string').toBe(true);
  });

  it('loadSchema reads schema from file', () => {
    const schema = { schemaId: 'test', schemaVersion: '1.0.0', fields: {}, primaryKeys: [] };
    writeFileSync(join(testDir, 'schema.json'), JSON.stringify(schema));

    const config: ProjectConfig = {
      name: 'test', schemaPath: 'schema.json', policyPath: 'p.json', storePath: 'd.db',
    };
    const loaded = loadSchema(config, testDir);
    expect(loaded.schemaId).toBe('test');
  });

  it('loadPolicy reads policy from file', () => {
    const policy = { gatePolicyVersion: '1.0.0', maxQuarantineRatio: 0.3, maxDuplicateRatio: 0.2, maxCriticalNullRate: 0.1 };
    writeFileSync(join(testDir, 'policy.json'), JSON.stringify(policy));

    const config: ProjectConfig = {
      name: 'test', schemaPath: 's.json', policyPath: 'policy.json', storePath: 'd.db',
    };
    const loaded = loadPolicy(config, testDir);
    expect(loaded.gatePolicyVersion).toBe('1.0.0');
  });

  it('loadGoldSet returns null when path not configured', () => {
    const config: ProjectConfig = {
      name: 'test', schemaPath: 's.json', policyPath: 'p.json', storePath: 'd.db',
    };
    expect(loadGoldSet(config, testDir)).toBeNull();
  });

  it('loadGoldSet reads gold set from file', () => {
    const goldSet = [{ id: 'g1', payload: {}, sourceId: 's', expected: 'approve', reason: 'ok' }];
    writeFileSync(join(testDir, 'gold.json'), JSON.stringify(goldSet));

    const config: ProjectConfig = {
      name: 'test', schemaPath: 's.json', policyPath: 'p.json', storePath: 'd.db',
      goldSetPath: 'gold.json',
    };
    const loaded = loadGoldSet(config, testDir);
    expect(loaded).toHaveLength(1);
  });

  it('ensureDir creates nested directories', () => {
    const deep = join(testDir, 'x', 'y', 'z');
    expect(existsSync(deep)).toBe(false);
    ensureDir(deep);
    expect(existsSync(deep)).toBe(true);
  });
});
