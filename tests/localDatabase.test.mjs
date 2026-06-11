import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { CURRENT_SCHEMA_VERSION, getLocalDatabaseSummary, initializeLocalDatabase } from '../electron/localDatabase.mjs'

test('initializes the local SQLite database schema', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'report-local-db-'))
    const dbPath = path.join(tmpDir, 'pharmacy-report.sqlite')
    const initialized = await initializeLocalDatabase({ dbPath })

    try {
        assert.equal(initialized.dbPath, dbPath)
        assert.equal(initialized.schemaVersion, CURRENT_SCHEMA_VERSION)
        assert(fs.existsSync(dbPath))

        const summary = getLocalDatabaseSummary(initialized.db)
        assert.equal(summary.schemaVersion, CURRENT_SCHEMA_VERSION)
        assert.deepEqual(summary.tables, [
            'app_settings',
            'backups',
            'drug_master',
            'institutions',
            'patients',
            'report_medications',
            'reports',
            'schema_migrations',
            'templates'
        ])

        const migration = initialized.db
            .prepare('SELECT version FROM schema_migrations WHERE version = ?')
            .get(CURRENT_SCHEMA_VERSION)
        assert.equal(migration.version, CURRENT_SCHEMA_VERSION)
    } finally {
        initialized.db.close()
        fs.rmSync(tmpDir, { recursive: true, force: true })
    }
})

test('stores patient rows with logical deletion fields', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'report-local-db-'))
    const dbPath = path.join(tmpDir, 'pharmacy-report.sqlite')
    const initialized = await initializeLocalDatabase({ dbPath })

    try {
        initialized.db.prepare(`
            INSERT INTO patients (
                id,
                created_at,
                updated_at,
                name,
                dob,
                gender,
                payload_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
            'patient-1',
            '2026-06-10T00:00:00.000Z',
            '2026-06-10T00:00:00.000Z',
            '検証 太郎',
            '1940-01-01',
            'male',
            '{}'
        )

        const patient = initialized.db
            .prepare('SELECT id, name, deleted_at FROM patients WHERE id = ?')
            .get('patient-1')

        assert.equal(patient.id, 'patient-1')
        assert.equal(patient.name, '検証 太郎')
        assert.equal(patient.deleted_at, null)
    } finally {
        initialized.db.close()
        fs.rmSync(tmpDir, { recursive: true, force: true })
    }
})
