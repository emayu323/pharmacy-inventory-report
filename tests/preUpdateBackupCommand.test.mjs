import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createPatient } from '../electron/localPatientRepository.mjs'
import { initializeLocalDatabase } from '../electron/localDatabase.mjs'
import {
    parsePreUpdateBackupCommand,
    runPreUpdateBackupCommand
} from '../electron/preUpdateBackupCommand.mjs'

test('parses updater pre-update backup command arguments', () => {
    assert.equal(parsePreUpdateBackupCommand(['app.exe']), null)
    assert.deepEqual(parsePreUpdateBackupCommand([
        'app.exe',
        '--pre-update-backup',
        '--db-path',
        'C:\\data\\app.sqlite',
        '--backup-dir=C:\\backup',
        '--from-version',
        '0.1.0',
        '--to-version=0.2.0'
    ]), {
        dbPath: 'C:\\data\\app.sqlite',
        outputDir: 'C:\\backup',
        fromVersion: '0.1.0',
        toVersion: '0.2.0',
        googleDriveFolder: ''
    })
})

test('runs pre-update backup command without opening the app UI', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'report-pre-update-command-'))
    const dbPath = path.join(tmpDir, 'pharmacy-report.sqlite')
    const backupDir = path.join(tmpDir, 'backups')
    const initialized = await initializeLocalDatabase({ dbPath })

    try {
        createPatient(initialized.db, {
            name: 'CLI更新前 患者',
            dob: '1945-01-02',
            gender: 'female',
            is_active: true
        })
    } finally {
        initialized.db.close()
    }

    try {
        const result = await runPreUpdateBackupCommand({
            dbPath,
            outputDir: backupDir,
            fromVersion: '0.1.0',
            toVersion: '0.2.0',
            kdfIterations: 1000
        })

        assert.equal(result.ok, true)
        assert.equal(result.mode, 'pre_update_backup')
        assert.equal(result.summary.patients_count, 1)
        assert.ok(fs.existsSync(result.filePath))

        const reopened = await initializeLocalDatabase({ dbPath })
        try {
            const rows = reopened.db.prepare('SELECT status, metadata_json FROM backups').all()
            assert.equal(rows.length, 1)
            assert.equal(rows[0].status, 'pre_update_created')
            assert.deepEqual(JSON.parse(rows[0].metadata_json).pre_update_backup, {
                from_version: '0.1.0',
                to_version: '0.2.0',
                reason: 'updater_cli'
            })
        } finally {
            reopened.db.close()
        }
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true })
    }
})
