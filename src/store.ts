import Database from 'better-sqlite3';
import type { ZonedRecord, BatchSummary, Zone } from './types.js';

/**
 * SQLite-backed zone storage.
 * Enforces immutability of raw zone and zone promotion rules.
 */
export class ZoneStore {
  private db: Database.Database;

  constructor(dbPath: string = ':memory:') {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.init();
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS records (
        id TEXT PRIMARY KEY,
        zone TEXT NOT NULL CHECK(zone IN ('raw','candidate','approved','quarantine')),
        source_id TEXT NOT NULL,
        batch_run_id TEXT NOT NULL,
        ingest_timestamp TEXT NOT NULL,
        raw_hash TEXT NOT NULL,
        normalized_hash TEXT,
        payload TEXT NOT NULL,
        normalized_payload TEXT,
        failures TEXT NOT NULL DEFAULT '[]',
        schema_version TEXT NOT NULL,
        normalization_version TEXT NOT NULL,
        gate_policy_version TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_records_zone ON records(zone);
      CREATE INDEX IF NOT EXISTS idx_records_batch ON records(batch_run_id);
      CREATE INDEX IF NOT EXISTS idx_records_raw_hash ON records(raw_hash);
      CREATE INDEX IF NOT EXISTS idx_records_normalized_hash ON records(normalized_hash);
      CREATE INDEX IF NOT EXISTS idx_records_source ON records(source_id);

      CREATE TABLE IF NOT EXISTS batch_summaries (
        batch_run_id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        schema_version TEXT NOT NULL,
        normalization_version TEXT NOT NULL,
        gate_policy_version TEXT NOT NULL,
        rows_ingested INTEGER NOT NULL,
        rows_passed INTEGER NOT NULL,
        rows_quarantined INTEGER NOT NULL,
        duplicates_detected INTEGER NOT NULL,
        null_rates TEXT NOT NULL,
        promoted INTEGER NOT NULL DEFAULT 0,
        reject_reasons TEXT NOT NULL DEFAULT '{}'
      );
    `);
  }

  insertRecord(record: ZonedRecord): void {
    this.db.prepare(`
      INSERT INTO records (
        id, zone, source_id, batch_run_id, ingest_timestamp,
        raw_hash, normalized_hash, payload, normalized_payload,
        failures, schema_version, normalization_version, gate_policy_version
      ) VALUES (
        @id, @zone, @sourceId, @batchRunId, @ingestTimestamp,
        @rawHash, @normalizedHash, @payload, @normalizedPayload,
        @failures, @schemaVersion, @normalizationVersion, @gatePolicyVersion
      )
    `).run({
      id: record.id,
      zone: record.zone,
      sourceId: record.sourceId,
      batchRunId: record.batchRunId,
      ingestTimestamp: record.ingestTimestamp,
      rawHash: record.rawHash,
      normalizedHash: record.normalizedHash,
      payload: JSON.stringify(record.payload),
      normalizedPayload: record.normalizedPayload ? JSON.stringify(record.normalizedPayload) : null,
      failures: JSON.stringify(record.failures),
      schemaVersion: record.schemaVersion,
      normalizationVersion: record.normalizationVersion,
      gatePolicyVersion: record.gatePolicyVersion,
    });
  }

  insertBatch(records: ZonedRecord[]): void {
    const insert = this.db.transaction((recs: ZonedRecord[]) => {
      for (const r of recs) this.insertRecord(r);
    });
    insert(records);
  }

  saveBatchSummary(summary: BatchSummary): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO batch_summaries (
        batch_run_id, timestamp, schema_version, normalization_version,
        gate_policy_version, rows_ingested, rows_passed, rows_quarantined,
        duplicates_detected, null_rates, promoted, reject_reasons
      ) VALUES (
        @batchRunId, @timestamp, @schemaVersion, @normalizationVersion,
        @gatePolicyVersion, @rowsIngested, @rowsPassed, @rowsQuarantined,
        @duplicatesDetected, @nullRates, @promoted, @rejectReasons
      )
    `).run({
      batchRunId: summary.batchRunId,
      timestamp: summary.timestamp,
      schemaVersion: summary.schemaVersion,
      normalizationVersion: summary.normalizationVersion,
      gatePolicyVersion: summary.gatePolicyVersion,
      rowsIngested: summary.rowsIngested,
      rowsPassed: summary.rowsPassed,
      rowsQuarantined: summary.rowsQuarantined,
      duplicatesDetected: summary.duplicatesDetected,
      nullRates: JSON.stringify(summary.nullRates),
      promoted: summary.promoted ? 1 : 0,
      rejectReasons: JSON.stringify(summary.rejectReasons),
    });
  }

  getByZone(zone: Zone): ZonedRecord[] {
    const rows = this.db.prepare('SELECT * FROM records WHERE zone = ?').all(zone) as any[];
    return rows.map(deserializeRecord);
  }

  getByBatch(batchRunId: string): ZonedRecord[] {
    const rows = this.db.prepare('SELECT * FROM records WHERE batch_run_id = ?').all(batchRunId) as any[];
    return rows.map(deserializeRecord);
  }

  getBatchSummary(batchRunId: string): BatchSummary | null {
    const row = this.db.prepare('SELECT * FROM batch_summaries WHERE batch_run_id = ?').get(batchRunId) as any;
    if (!row) return null;
    return {
      batchRunId: row.batch_run_id,
      timestamp: row.timestamp,
      schemaVersion: row.schema_version,
      normalizationVersion: row.normalization_version,
      gatePolicyVersion: row.gate_policy_version,
      rowsIngested: row.rows_ingested,
      rowsPassed: row.rows_passed,
      rowsQuarantined: row.rows_quarantined,
      duplicatesDetected: row.duplicates_detected,
      nullRates: JSON.parse(row.null_rates),
      promoted: !!row.promoted,
      rejectReasons: JSON.parse(row.reject_reasons),
    };
  }

  hasRawHash(rawHash: string): boolean {
    const row = this.db.prepare('SELECT 1 FROM records WHERE raw_hash = ? LIMIT 1').get(rawHash);
    return !!row;
  }

  hasNormalizedHash(normalizedHash: string): boolean {
    const row = this.db.prepare('SELECT 1 FROM records WHERE normalized_hash = ? AND zone IN (\'candidate\', \'approved\') LIMIT 1').get(normalizedHash);
    return !!row;
  }

  promoteCandidate(id: string): void {
    const record = this.db.prepare('SELECT zone FROM records WHERE id = ?').get(id) as any;
    if (!record) throw new Error(`Record ${id} not found`);
    if (record.zone !== 'candidate') throw new Error(`Cannot promote from zone "${record.zone}" — only candidate records can be promoted`);
    this.db.prepare('UPDATE records SET zone = ? WHERE id = ?').run('approved', id);
  }

  promoteBatch(batchRunId: string): number {
    const result = this.db.prepare(
      "UPDATE records SET zone = 'approved' WHERE batch_run_id = ? AND zone = 'candidate'"
    ).run(batchRunId);
    return result.changes;
  }

  countByZone(zone: Zone): number {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM records WHERE zone = ?').get(zone) as any;
    return row.count;
  }

  close(): void {
    this.db.close();
  }
}

function deserializeRecord(row: any): ZonedRecord {
  return {
    id: row.id,
    zone: row.zone,
    sourceId: row.source_id,
    batchRunId: row.batch_run_id,
    ingestTimestamp: row.ingest_timestamp,
    rawHash: row.raw_hash,
    normalizedHash: row.normalized_hash,
    payload: JSON.parse(row.payload),
    normalizedPayload: row.normalized_payload ? JSON.parse(row.normalized_payload) : null,
    failures: JSON.parse(row.failures),
    schemaVersion: row.schema_version,
    normalizationVersion: row.normalization_version,
    gatePolicyVersion: row.gate_policy_version,
  };
}
