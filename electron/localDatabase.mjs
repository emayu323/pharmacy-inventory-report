import fs from 'node:fs'
import path from 'node:path'

export const CURRENT_SCHEMA_VERSION = 1

export async function initializeLocalDatabase({ dbPath }) {
    if (!dbPath) {
        throw new Error('dbPath is required')
    }

    fs.mkdirSync(path.dirname(dbPath), { recursive: true })
    const { DatabaseSync } = await import('node:sqlite')
    const db = new DatabaseSync(dbPath)

    db.exec('PRAGMA foreign_keys = ON;')
    db.exec('PRAGMA journal_mode = WAL;')
    db.exec('PRAGMA busy_timeout = 5000;')
    db.exec(SCHEMA_SQL)
    applySchemaVersion(db)

    return {
        db,
        dbPath,
        schemaVersion: getSchemaVersion(db),
        tables: listTables(db)
    }
}

export function getLocalDatabaseSummary(db) {
    return {
        schemaVersion: getSchemaVersion(db),
        tables: listTables(db)
    }
}

function applySchemaVersion(db) {
    const row = db.prepare('SELECT COUNT(*) AS count FROM schema_migrations WHERE version = ?').get(CURRENT_SCHEMA_VERSION)
    if (!row?.count) {
        db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
            CURRENT_SCHEMA_VERSION,
            new Date().toISOString()
        )
    }
    db.exec(`PRAGMA user_version = ${CURRENT_SCHEMA_VERSION};`)
}

function getSchemaVersion(db) {
    const row = db.prepare('PRAGMA user_version').get()
    return Number(row?.user_version ?? 0)
}

function listTables(db) {
    return db.prepare(`
        SELECT name
        FROM sqlite_master
        WHERE type = 'table'
          AND name NOT LIKE 'sqlite_%'
        ORDER BY name
    `).all().map(row => row.name)
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS patients (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    name TEXT NOT NULL,
    kana TEXT,
    dob TEXT NOT NULL,
    gender TEXT NOT NULL CHECK (gender IN ('male', 'female', 'other')),
    address TEXT,
    contact1 TEXT,
    contact2 TEXT,
    contact2_memo TEXT,
    memo TEXT,
    medical_institution_name TEXT,
    primary_doctor TEXT,
    home_care_office TEXT,
    care_manager TEXT,
    visiting_nursing_station_name TEXT,
    pharmacy_name TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    payload_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_patients_active_name
    ON patients (is_active, name)
    WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS institutions (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    type TEXT NOT NULL CHECK (type IN ('hospital', 'pharmacy', 'care_office', 'nursing_station')),
    name TEXT NOT NULL,
    address TEXT,
    tel TEXT,
    fax TEXT,
    doctor_name TEXT,
    payload_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_institutions_type_name
    ON institutions (type, name)
    WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY,
    patient_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    visit_date TEXT NOT NULL,
    patient_name TEXT NOT NULL,
    patient_dob TEXT NOT NULL,
    patient_gender TEXT NOT NULL CHECK (patient_gender IN ('male', 'female', 'other')),
    pharmacy_name TEXT,
    regular_medication_supply_until TEXT,
    next_visit_date TEXT,
    payload_json TEXT NOT NULL,
    FOREIGN KEY (patient_id) REFERENCES patients(id) ON UPDATE CASCADE ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_reports_patient_visit
    ON reports (patient_id, visit_date DESC)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_reports_next_visit
    ON reports (next_visit_date)
    WHERE deleted_at IS NULL AND next_visit_date IS NOT NULL;

CREATE TABLE IF NOT EXISTS report_medications (
    id TEXT PRIMARY KEY,
    report_id TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('regular', 'other')),
    position INTEGER NOT NULL DEFAULT 0,
    name TEXT NOT NULL,
    unit TEXT,
    quantity TEXT,
    previous_supply_until TEXT,
    prescription_days TEXT,
    actual_remaining_days TEXT,
    calculated_total_days TEXT,
    calculated_supply_until TEXT,
    notes TEXT,
    payload_json TEXT NOT NULL DEFAULT '{}',
    FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_report_medications_report_position
    ON report_medications (report_id, category, position);

CREATE TABLE IF NOT EXISTS templates (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    target TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_templates_target_title
    ON templates (target, title)
    WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS drug_master (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_code TEXT,
    name TEXT NOT NULL,
    kana TEXT,
    unit TEXT,
    search_text TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_drug_master_search
    ON drug_master (search_text);

CREATE TABLE IF NOT EXISTS backups (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    path TEXT NOT NULL,
    status TEXT NOT NULL,
    metadata_json TEXT NOT NULL DEFAULT '{}'
);
`
