import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { initializeLocalDatabase } from '../electron/localDatabase.mjs'
import { getAppSettings } from '../electron/localAppSettingsRepository.mjs'
import { createPatient } from '../electron/localPatientRepository.mjs'
import { ensureVersionChangePreUpdateBackup } from '../electron/localVersionBackupRepository.mjs'

test('records first app version without creating pre-update backup', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'report-version-backup-first-'))
    const dbPath = path.join(tmpDir, 'pharmacy-report.sqlite')
    const backupDir = path.join(tmpDir, 'backups')
    const initialized = await initializeLocalDatabase({ dbPath })

    try {
        const result = ensureVersionChangePreUpdateBackup(initialized.db, {
            dbPath,
            outputDir: backupDir,
            currentVersion: '0.1.0',
            kdfIterations: 1000
        })

        assert.equal(result.created, false)
        assert.equal(result.reason, 'first_start')
        assert.equal(result.currentVersion, '0.1.0')
        assert.equal(getAppSettings(initialized.db).last_app_version, '0.1.0')
        assert.equal(initialized.db.prepare('SELECT COUNT(*) AS count FROM backups').get().count, 0)
        assert.equal(fs.existsSync(backupDir), false)
    } finally {
        initialized.db.close()
        fs.rmSync(tmpDir, { recursive: true, force: true })
    }
})

test('creates pre-update backup once when started app version changes', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'report-version-backup-change-'))
    const dbPath = path.join(tmpDir, 'pharmacy-report.sqlite')
    const backupDir = path.join(tmpDir, 'backups')
    const googleDriveFolder = path.join(tmpDir, 'google-drive')
    const initialized = await initializeLocalDatabase({ dbPath })

    try {
        createPatient(initialized.db, {
            name: 'バージョン更新 患者',
            dob: '1945-01-02',
            gender: 'female',
            is_active: true
        })

        ensureVersionChangePreUpdateBackup(initialized.db, {
            dbPath,
            outputDir: backupDir,
            googleDriveFolder,
            currentVersion: '0.1.0',
            kdfIterations: 1000
        })
        const sameVersion = ensureVersionChangePreUpdateBackup(initialized.db, {
            dbPath,
            outputDir: backupDir,
            googleDriveFolder,
            currentVersion: '0.1.0',
            kdfIterations: 1000
        })
        const changedVersion = ensureVersionChangePreUpdateBackup(initialized.db, {
            dbPath,
            outputDir: backupDir,
            googleDriveFolder,
            currentVersion: '0.2.0',
            kdfIterations: 1000
        })

        assert.equal(sameVersion.created, false)
        assert.equal(sameVersion.reason, 'same_version')
        assert.equal(changedVersion.created, true)
        assert.equal(changedVersion.previousVersion, '0.1.0')
        assert.equal(changedVersion.currentVersion, '0.2.0')
        assert.ok(fs.existsSync(changedVersion.filePath))
        assert.ok(fs.existsSync(changedVersion.googleDriveFilePath))

        const settings = getAppSettings(initialized.db)
        assert.equal(settings.last_app_version, '0.2.0')
        assert.match(settings.backup_key, /^prk_[A-Za-z0-9_-]{43}$/)

        const backupRows = initialized.db.prepare('SELECT status, metadata_json FROM backups').all()
        assert.equal(backupRows.length, 1)
        assert.equal(backupRows[0].status, 'pre_update_created')
        assert.deepEqual(JSON.parse(backupRows[0].metadata_json).pre_update_backup, {
            from_version: '0.1.0',
            to_version: '0.2.0',
            reason: 'version_change_startup'
        })
    } finally {
        initialized.db.close()
        fs.rmSync(tmpDir, { recursive: true, force: true })
    }
})
