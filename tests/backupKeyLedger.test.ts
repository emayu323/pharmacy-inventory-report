import assert from 'node:assert/strict'
import test from 'node:test'
import { createBackupKeyLedgerTsv } from '../src/backupKeyLedger.ts'
import type { AppSettings } from '../src/types.ts'

test('creates copyable TSV for backup key ledger', () => {
    const settings: AppSettings = {
        pharmacy_name: '検証\t薬局',
        pharmacy_address: '東京都\n中央区',
        pharmacy_tel: '03-1111-2222',
        pharmacy_fax: '03-3333-4444',
        google_drive_folder: '',
        backup_key: 'prk_test-key',
        last_app_version: '',
        ai_mode_enabled: false,
        ai_consent_mode_enabled: false,
        ai_save_audio_enabled: false,
        ai_save_transcript_enabled: false,
        ai_ollama_url: 'http://127.0.0.1:11434',
        ai_ollama_model: '',
        ai_whisper_health_url: '',
        ai_whisper_transcribe_url: '',
        ai_whisper_file_field: 'audio',
        ai_auto_start_enabled: false,
        ai_ollama_start_command: 'ollama serve',
        ai_whisper_start_command: '',
        pin_enabled: false,
        lock_timeout_minutes: 15
    }

    const tsv = createBackupKeyLedgerTsv(settings, new Date('2026-06-11T09:00:00.000Z'))

    assert.equal(tsv.split('\n')[0], '控え日時\t薬局名\t所在地\tTEL\tFAX\t薬局キー')
    assert.equal(tsv.split('\n')[1], '2026-06-11T09:00:00.000Z\t"検証\t薬局"\t東京都 中央区\t03-1111-2222\t03-3333-4444\tprk_test-key')
})
