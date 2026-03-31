import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { SchemaContract, GatePolicy, GoldSetEntry } from './types.js';

/**
 * Project configuration: single file that anchors
 * a datagates project to its schema, policy, and paths.
 */
export interface ProjectConfig {
  /** Project name */
  name: string;
  /** Path to schema definition (JSON) */
  schemaPath: string;
  /** Path to active policy (JSON) */
  policyPath: string;
  /** Path to zone storage (SQLite) */
  storePath: string;
  /** Path to gold set for calibration (JSON, optional) */
  goldSetPath?: string;
  /** Path to shadow policy (JSON, optional) */
  shadowPolicyPath?: string;
  /** Path to source registry (JSON, optional) */
  sourceRegistryPath?: string;
  /** Path to override registry (JSON, optional) */
  overrideRegistryPath?: string;
  /** Path to review queue (JSON, optional) */
  reviewQueuePath?: string;
  /** Path to artifacts directory */
  artifactsPath?: string;
}

export const CONFIG_FILENAME = 'datagates.json';

export function findConfig(startDir: string = process.cwd()): string | null {
  let dir = resolve(startDir);
  while (true) {
    const candidate = join(dir, CONFIG_FILENAME);
    if (existsSync(candidate)) return candidate;
    const parent = resolve(dir, '..');
    if (parent === dir) return null;
    dir = parent;
  }
}

export function loadConfig(configPath: string): ProjectConfig {
  const raw = readFileSync(configPath, 'utf-8');
  return JSON.parse(raw) as ProjectConfig;
}

export function saveConfig(configPath: string, config: ProjectConfig): void {
  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

export function loadSchema(config: ProjectConfig, baseDir: string): SchemaContract {
  const path = resolve(baseDir, config.schemaPath);
  return JSON.parse(readFileSync(path, 'utf-8')) as SchemaContract;
}

export function loadPolicy(config: ProjectConfig, baseDir: string): GatePolicy {
  const path = resolve(baseDir, config.policyPath);
  return JSON.parse(readFileSync(path, 'utf-8')) as GatePolicy;
}

export function loadGoldSet(config: ProjectConfig, baseDir: string): GoldSetEntry[] | null {
  if (!config.goldSetPath) return null;
  const path = resolve(baseDir, config.goldSetPath);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf-8')) as GoldSetEntry[];
}

export function loadShadowPolicy(config: ProjectConfig, baseDir: string): GatePolicy | null {
  if (!config.shadowPolicyPath) return null;
  const path = resolve(baseDir, config.shadowPolicyPath);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf-8')) as GatePolicy;
}

export function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}
