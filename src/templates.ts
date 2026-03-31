import type { ProjectConfig, } from './config.js';
import type { SchemaContract, GatePolicy, GoldSetEntry } from './types.js';

/**
 * Starter templates for datagates init.
 * Each template is a complete, runnable scaffold.
 */

export function defaultConfig(name: string): ProjectConfig {
  return {
    name,
    schemaPath: 'schema.json',
    policyPath: 'policy.json',
    storePath: 'datagates.db',
    goldSetPath: 'gold-set.json',
    artifactsPath: 'artifacts',
    reviewQueuePath: 'reviews.json',
    sourceRegistryPath: 'sources.json',
  };
}

export function defaultSchema(): SchemaContract {
  return {
    schemaId: 'default',
    schemaVersion: '1.0.0',
    fields: {
      id: { type: 'string', required: true },
      name: { type: 'string', required: true, normalizeCasing: 'lower' },
      value: { type: 'number', required: true, min: 0, max: 10000 },
      category: { type: 'enum', required: true, enum: ['alpha', 'beta', 'gamma'] },
      description: { type: 'string', required: false },
    },
    primaryKeys: ['id'],
  };
}

export function defaultPolicy(): GatePolicy {
  return {
    gatePolicyVersion: '1.0.0',
    maxQuarantineRatio: 0.3,
    maxDuplicateRatio: 0.2,
    maxCriticalNullRate: 0.05,
    minConfidence: 0.5,
    maxNearDuplicateRatio: 0.1,
    semanticRules: [],
    nearDuplicate: {
      threshold: 0.85,
      fields: [
        { field: 'name', similarity: 'levenshtein', weight: 2.0 },
        { field: 'value', similarity: 'numeric', weight: 1.0 },
        { field: 'category', similarity: 'exact', weight: 1.0 },
      ],
    },
  };
}

export function defaultGoldSet(): GoldSetEntry[] {
  return [
    {
      id: 'gold-valid-1',
      payload: { id: 'r1', name: 'Test Record', value: 100, category: 'alpha' },
      sourceId: 'gold-source',
      expected: 'approve',
      reason: 'Valid record with all fields correct',
    },
    {
      id: 'gold-bad-range',
      payload: { id: 'r2', name: 'Bad Range', value: 99999, category: 'alpha' },
      sourceId: 'gold-source',
      expected: 'quarantine',
      reason: 'Value exceeds schema max (10000)',
    },
    {
      id: 'gold-bad-enum',
      payload: { id: 'r3', name: 'Bad Category', value: 50, category: 'invalid' },
      sourceId: 'gold-source',
      expected: 'quarantine',
      reason: 'Category not in enum list',
    },
    {
      id: 'gold-missing-required',
      payload: { id: 'r4', category: 'beta' },
      sourceId: 'gold-source',
      expected: 'quarantine',
      reason: 'Missing required fields: name, value',
    },
  ];
}

// ── Policy packs ────────────────────────────────────────────────────

export interface PolicyPack {
  id: string;
  name: string;
  description: string;
  policy: GatePolicy;
}

export const POLICY_PACKS: PolicyPack[] = [
  {
    id: 'strict-structured',
    name: 'Strict Structured',
    description: 'Tight thresholds for clean structured data. Low tolerance for quarantine, duplicates, and nulls.',
    policy: {
      gatePolicyVersion: 'strict-structured-1.0',
      maxQuarantineRatio: 0.1,
      maxDuplicateRatio: 0.05,
      maxCriticalNullRate: 0.01,
      minConfidence: 0.8,
      maxNearDuplicateRatio: 0.05,
    },
  },
  {
    id: 'text-dedupe',
    name: 'Text Deduplication',
    description: 'Optimized for text-heavy datasets. Aggressive near-duplicate detection with token jaccard.',
    policy: {
      gatePolicyVersion: 'text-dedupe-1.0',
      maxQuarantineRatio: 0.3,
      maxDuplicateRatio: 0.1,
      maxCriticalNullRate: 0.05,
      minConfidence: 0.6,
      maxNearDuplicateRatio: 0.15,
      nearDuplicate: {
        threshold: 0.75,
        fields: [
          { field: 'text', similarity: 'token_jaccard', weight: 3.0 },
          { field: 'title', similarity: 'levenshtein', weight: 2.0 },
          { field: 'category', similarity: 'exact', weight: 1.0 },
        ],
      },
    },
  },
  {
    id: 'classification-basic',
    name: 'Classification Basic',
    description: 'For labeled classification datasets. Includes drift rules for label distribution and class disappearance.',
    policy: {
      gatePolicyVersion: 'classification-basic-1.0',
      maxQuarantineRatio: 0.2,
      maxDuplicateRatio: 0.1,
      maxCriticalNullRate: 0.02,
      minConfidence: 0.7,
      driftRules: [
        {
          id: 'label-drift',
          description: 'Label distribution should not shift more than 20%',
          type: 'label_skew',
          field: 'label',
          threshold: 0.2,
        },
        {
          id: 'class-disappear',
          description: 'No label class should disappear entirely',
          type: 'class_disappearance',
          field: 'label',
          threshold: 0,
        },
      ],
    },
  },
  {
    id: 'source-probation-first',
    name: 'Source Probation First',
    description: 'Conservative policy for multi-source ingestion. Low per-source quarantine tolerance, partial salvage enabled.',
    policy: {
      gatePolicyVersion: 'source-probation-1.0',
      maxQuarantineRatio: 0.3,
      maxDuplicateRatio: 0.15,
      maxCriticalNullRate: 0.05,
      maxSourceQuarantineRatio: 0.15,
      allowPartialSalvage: true,
    },
  },
];

export function getPolicyPack(id: string): PolicyPack | undefined {
  return POLICY_PACKS.find(p => p.id === id);
}
