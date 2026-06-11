import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { initializeLocalDatabase } from '../electron/localDatabase.mjs'
import {
    clearLocalPin,
    ensureBackupKey,
    getAppSettings,
    rotateBackupKey,
    saveAppSettings,
    setLocalPin,
    verifyLocalPin
} from '../electron/localAppSettingsRepository.mjs'

test('saves app settings and verifies hashed PIN in SQLite', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'report-settings-db-'))
    const initialized = await initializeLocalDatabase({ dbPath: path.join(tmpDir, 'settings.sqlite') })

    try {
        assert.deepEqual(getAppSettings(initialized.db), {
            pharmacy_name: '',
            pharmacy_address: '',
            pharmacy_tel: '',
            pharmacy_fax: '',
            google_drive_folder: '',
            backup_key: undefined,
            last_app_version: '',
            ai_mode_enabled: false,
            ai_ollama_url: 'http://127.0.0.1:11434',
            ai_ollama_model: '',
            ai_auto_start_enabled: false,
            ai_ollama_start_command: 'ollama serve',
            pin_enabled: false,
            lock_timeout_minutes: 15
        })

        const saved = saveAppSettings(initialized.db, {
            pharmacy_name: '検証薬局',
            pharmacy_fax: '03-1111-2222',
            google_drive_folder: '/tmp/google-drive',
            ai_mode_enabled: true,
            ai_ollama_url: ' http://127.0.0.1:11434/ ',
            ai_ollama_model: ' llama3.1:8b ',
            ai_auto_start_enabled: true,
            ai_ollama_start_command: ' ollama serve ',
            last_app_version: ' 0.2.0 ',
            lock_timeout_minutes: 20
        })
        assert.equal(saved.pharmacy_name, '検証薬局')
        assert.equal(saved.last_app_version, '0.2.0')
        assert.equal(saved.lock_timeout_minutes, 20)
        assert.equal(saved.ai_mode_enabled, true)
        assert.equal(saved.ai_ollama_url, 'http://127.0.0.1:11434')
        assert.equal(saved.ai_ollama_model, 'llama3.1:8b')
        assert.equal(saved.ai_auto_start_enabled, true)
        assert.equal(saved.ai_ollama_start_command, 'ollama serve')

        const disabledAi = saveAppSettings(initialized.db, {
            ai_mode_enabled: false
        })
        assert.equal(disabledAi.ai_mode_enabled, false)
        assert.equal(disabledAi.ai_ollama_url, 'http://127.0.0.1:11434')
        assert.equal(disabledAi.ai_ollama_model, 'llama3.1:8b')
        assert.equal(disabledAi.ai_auto_start_enabled, true)
        assert.equal(disabledAi.ai_ollama_start_command, 'ollama serve')

        const pinSettings = setLocalPin(initialized.db, '1234')
        assert.equal(pinSettings.pin_enabled, true)
        assert.equal(typeof pinSettings.pin_hash, 'string')
        assert.equal(typeof pinSettings.pin_salt, 'string')
        assert.equal(verifyLocalPin(initialized.db, '1234'), true)
        assert.equal(verifyLocalPin(initialized.db, '9999'), false)

        const row = initialized.db.prepare('SELECT value_json FROM app_settings WHERE key = ?').get('app-settings')
        assert.equal(row.value_json.includes('1234'), false)

        const cleared = clearLocalPin(initialized.db)
        assert.equal(cleared.pin_enabled, false)
        assert.equal(cleared.pin_hash, undefined)
        assert.equal(verifyLocalPin(initialized.db, '9999'), true)

        const backupSettings = ensureBackupKey(initialized.db)
        assert.match(backupSettings.backup_key, /^prk_[A-Za-z0-9_-]{43}$/)
        assert.equal(ensureBackupKey(initialized.db).backup_key, backupSettings.backup_key)
        const rotatedBackupSettings = rotateBackupKey(initialized.db)
        assert.match(rotatedBackupSettings.backup_key, /^prk_[A-Za-z0-9_-]{43}$/)
        assert.notEqual(rotatedBackupSettings.backup_key, backupSettings.backup_key)
        assert.equal(rotatedBackupSettings.pharmacy_name, '検証薬局')
        assert.equal(
            initialized.db.prepare('SELECT value_json FROM app_settings WHERE key = ?').get('app-settings').value_json.includes('backup-pass'),
            false
        )
    } finally {
        initialized.db.close()
        fs.rmSync(tmpDir, { recursive: true, force: true })
    }
})

test('rejects invalid PIN and clamps lock timeout', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'report-settings-db-'))
    const initialized = await initializeLocalDatabase({ dbPath: path.join(tmpDir, 'settings.sqlite') })

    try {
        assert.throws(() => setLocalPin(initialized.db, 'abcd'), /PIN/)
        assert.equal(saveAppSettings(initialized.db, { lock_timeout_minutes: 999 }).lock_timeout_minutes, 240)
        assert.equal(saveAppSettings(initialized.db, { lock_timeout_minutes: 0 }).lock_timeout_minutes, 15)
    } finally {
        initialized.db.close()
        fs.rmSync(tmpDir, { recursive: true, force: true })
    }
})
