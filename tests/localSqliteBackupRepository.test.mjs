import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { initializeLocalDatabase } from '../electron/localDatabase.mjs'
import { createPatient, listPatients } from '../electron/localPatientRepository.mjs'
import {
    createEncryptedSqliteBackup,
    createPreUpdateEncryptedSqliteBackup,
    ensureDailyEncryptedSqliteBackup,
    restoreEncryptedSqliteBackup
} from '../electron/localSqliteBackupRepository.mjs'

test('creates encrypted SQLite backup with VACUUM export and copies to Google Drive folder', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'report-sqlite-backup-'))
    const dbPath = path.join(tmpDir, 'pharmacy-report.sqlite')
    const backupDir = path.join(tmpDir, 'backups')
    const googleDriveFolder = path.join(tmpDir, 'google-drive')
    const initialized = await initializeLocalDatabase({ dbPath })

    try {
        createPatient(initialized.db, {
            name: '暗号化 検証',
            dob: '1945-01-02',
            gender: 'female',
            is_active: true
        })

        const result = createEncryptedSqliteBackup(initialized.db, {
            dbPath,
            outputDir: backupDir,
            googleDriveFolder,
            password: 'backup-pass-123',
            kdfIterations: 1000
        })

        assert.equal(result.summary.patients_count, 1)
        assert.equal(result.summary.schema_version, 1)
        assert.ok(fs.existsSync(result.filePath))
        assert.ok(fs.existsSync(result.googleDriveFilePath))

        const rawBackup = fs.readFileSync(result.filePath, 'utf8')
        assert.match(rawBackup, /encrypted-sqlite-backup/)
        assert.doesNotMatch(rawBackup, /暗号化 検証/)

        const backupRows = initialized.db.prepare('SELECT status, path FROM backups').all()
        assert.deepEqual(backupRows.map(row => row.status), ['created'])
        assert.equal(backupRows[0].path, result.filePath)
    } finally {
        initialized.db.close()
        fs.rmSync(tmpDir, { recursive: true, force: true })
    }
})

test('restores encrypted SQLite backup after saving rollback copy of current DB', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'report-sqlite-restore-'))
    const dbPath = path.join(tmpDir, 'pharmacy-report.sqlite')
    const initialized = await initializeLocalDatabase({ dbPath })

    try {
        createPatient(initialized.db, {
            name: '復元 前',
            dob: '1945-01-02',
            gender: 'female',
            is_active: true
        })

        createEncryptedSqliteBackup(initialized.db, {
            dbPath,
            outputDir: path.join(tmpDir, 'backups'),
            password: 'backup-pass-123',
            kdfIterations: 1000
        })

        createPatient(initialized.db, {
            name: '復元 後に消える',
            dob: '1946-03-04',
            gender: 'male',
            is_active: true
        })
    } finally {
        initialized.db.close()
    }

    const restored = restoreEncryptedSqliteBackup({
        backupFilePath: path.join(tmpDir, 'backups', fs.readdirSync(path.join(tmpDir, 'backups'))[0]),
        dbPath,
        beforeRestoreDir: path.join(tmpDir, 'before-restore'),
        password: 'backup-pass-123'
    })

    assert.ok(fs.existsSync(restored.rollbackPath))
    assert.equal(restored.summary.patients_count, 1)

    const reopened = await initializeLocalDatabase({ dbPath })
    try {
        const patients = listPatients(reopened.db)
        assert.deepEqual(patients.map(patient => patient.name), ['復元 前'])
    } finally {
        reopened.db.close()
        fs.rmSync(tmpDir, { recursive: true, force: true })
    }
})

test('wrong SQLite backup password does not replace current DB', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'report-sqlite-restore-fail-'))
    const dbPath = path.join(tmpDir, 'pharmacy-report.sqlite')
    const initialized = await initializeLocalDatabase({ dbPath })

    try {
        createPatient(initialized.db, {
            name: '維持される患者',
            dob: '1945-01-02',
            gender: 'female',
            is_active: true
        })

        createEncryptedSqliteBackup(initialized.db, {
            dbPath,
            outputDir: path.join(tmpDir, 'backups'),
            password: 'backup-pass-123',
            kdfIterations: 1000
        })
    } finally {
        initialized.db.close()
    }

    const backupFilePath = path.join(tmpDir, 'backups', fs.readdirSync(path.join(tmpDir, 'backups'))[0])

    assert.throws(() => restoreEncryptedSqliteBackup({
        backupFilePath,
        dbPath,
        beforeRestoreDir: path.join(tmpDir, 'before-restore'),
        password: 'wrong-pass-123'
    }), /復元できません/)

    const reopened = await initializeLocalDatabase({ dbPath })
    try {
        const patients = listPatients(reopened.db)
        assert.deepEqual(patients.map(patient => patient.name), ['維持される患者'])
    } finally {
        reopened.db.close()
        fs.rmSync(tmpDir, { recursive: true, force: true })
    }
})

test('daily automatic backup runs once per date using pharmacy backup key', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'report-sqlite-auto-backup-'))
    const dbPath = path.join(tmpDir, 'pharmacy-report.sqlite')
    const backupDir = path.join(tmpDir, 'backups')
    const initialized = await initializeLocalDatabase({ dbPath })

    try {
        createPatient(initialized.db, {
            name: '自動バックアップ 患者',
            dob: '1945-01-02',
            gender: 'female',
            is_active: true
        })

        const first = ensureDailyEncryptedSqliteBackup(initialized.db, {
            dbPath,
            outputDir: backupDir,
            backupKey: 'prk_auto-backup-key-123456789012345678901234',
            today: '2026-06-10',
            kdfIterations: 1000
        })
        const second = ensureDailyEncryptedSqliteBackup(initialized.db, {
            dbPath,
            outputDir: backupDir,
            backupKey: 'prk_auto-backup-key-123456789012345678901234',
            today: '2026-06-10',
            kdfIterations: 1000
        })

        assert.equal(first.created, true)
        assert.equal(second.created, false)
        assert.equal(fs.readdirSync(backupDir).length, 1)

        const metadataRows = initialized.db.prepare('SELECT status, metadata_json FROM backups').all()
        assert.equal(metadataRows.length, 1)
        assert.equal(metadataRows[0].status, 'auto_created')
        assert.deepEqual(JSON.parse(metadataRows[0].metadata_json).auto_backup, {
            date: '2026-06-10'
        })
    } finally {
        initialized.db.close()
        fs.rmSync(tmpDir, { recursive: true, force: true })
    }
})

test('pre-update backup uses pharmacy backup key and records update metadata', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'report-sqlite-pre-update-backup-'))
    const dbPath = path.join(tmpDir, 'pharmacy-report.sqlite')
    const backupDir = path.join(tmpDir, 'backups')
    const initialized = await initializeLocalDatabase({ dbPath })

    try {
        createPatient(initialized.db, {
            name: '更新前バックアップ 患者',
            dob: '1945-01-02',
            gender: 'female',
            is_active: true
        })

        const result = createPreUpdateEncryptedSqliteBackup(initialized.db, {
            dbPath,
            outputDir: backupDir,
            backupKey: 'prk_pre-update-key-123456789012345678901234',
            fromVersion: '0.1.0',
            toVersion: '0.2.0',
            reason: 'manual',
            kdfIterations: 1000
        })

        assert.equal(result.summary.patients_count, 1)
        assert.ok(fs.existsSync(result.filePath))

        const backupRows = initialized.db.prepare('SELECT status, metadata_json FROM backups').all()
        assert.equal(backupRows.length, 1)
        assert.equal(backupRows[0].status, 'pre_update_created')
        assert.deepEqual(JSON.parse(backupRows[0].metadata_json).pre_update_backup, {
            from_version: '0.1.0',
            to_version: '0.2.0',
            reason: 'manual'
        })
    } finally {
        initialized.db.close()
        fs.rmSync(tmpDir, { recursive: true, force: true })
    }
})
