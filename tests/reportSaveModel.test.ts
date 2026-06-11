import assert from 'node:assert/strict'
import test from 'node:test'
import { buildReportInputForSave } from '../src/reportSaveModel.ts'
import type { AppSettings, Report } from '../src/types.ts'

test('strips previous AI transcript and audio fields when AI saving is off', () => {
    const report = buildReportInputForSave({
        formData: createReportDraft({
            ai_transcript: '前回保存された文字起こし',
            ai_transcript_saved_at: '2026-06-10T12:00:00.000Z',
            ai_audio_file_path: '/tmp/previous.webm',
            ai_audio_file_name: 'previous.webm',
            ai_audio_mime_type: 'audio/webm',
            ai_audio_saved_at: '2026-06-10T12:01:00.000Z'
        }),
        patientMemo: '今回メモ',
        aiTranscript: '今回の文字起こし',
        appSettings: {
            ...baseSettings,
            ai_mode_enabled: true,
            ai_save_audio_enabled: false,
            ai_save_transcript_enabled: false
        },
        now: '2026-06-11T09:00:00.000Z'
    })

    assert.equal(report.memo, '今回メモ')
    assert.equal(report.ai_transcript, undefined)
    assert.equal(report.ai_transcript_saved_at, undefined)
    assert.equal(report.ai_audio_file_path, undefined)
    assert.equal(report.ai_audio_file_name, undefined)
    assert.equal(report.ai_audio_mime_type, undefined)
    assert.equal(report.ai_audio_saved_at, undefined)
})

test('adds AI transcript and audio fields only when saving is enabled', () => {
    const report = buildReportInputForSave({
        formData: createReportDraft(),
        patientMemo: '',
        aiTranscript: '  主訴等: 眠気あり  ',
        appSettings: {
            ...baseSettings,
            ai_mode_enabled: true,
            ai_save_audio_enabled: true,
            ai_save_transcript_enabled: true
        },
        audioResult: {
            filePath: '/safe/audio.webm',
            fileName: 'audio.webm',
            mimeType: 'audio/webm',
            saved_at: '2026-06-11T09:01:00.000Z'
        },
        now: '2026-06-11T09:00:00.000Z'
    })

    assert.equal(report.ai_transcript, '主訴等: 眠気あり')
    assert.equal(report.ai_transcript_saved_at, '2026-06-11T09:00:00.000Z')
    assert.equal(report.ai_audio_file_path, '/safe/audio.webm')
    assert.equal(report.ai_audio_file_name, 'audio.webm')
    assert.equal(report.ai_audio_mime_type, 'audio/webm')
    assert.equal(report.ai_audio_saved_at, '2026-06-11T09:01:00.000Z')
})

test('preserves existing AI transcript timestamp and audio metadata when saving stays enabled', () => {
    const report = buildReportInputForSave({
        formData: createReportDraft({
            ai_transcript: '前回保存された文字起こし',
            ai_transcript_saved_at: '2026-06-10T12:00:00.000Z',
            ai_audio_file_path: '/safe/previous.webm',
            ai_audio_file_name: 'previous.webm',
            ai_audio_mime_type: 'audio/webm',
            ai_audio_saved_at: '2026-06-10T12:01:00.000Z'
        }),
        patientMemo: '',
        aiTranscript: '前回保存された文字起こし',
        appSettings: {
            ...baseSettings,
            ai_mode_enabled: true,
            ai_save_audio_enabled: true,
            ai_save_transcript_enabled: true
        },
        now: '2026-06-11T09:00:00.000Z'
    })

    assert.equal(report.ai_transcript, '前回保存された文字起こし')
    assert.equal(report.ai_transcript_saved_at, '2026-06-10T12:00:00.000Z')
    assert.equal(report.ai_audio_file_path, '/safe/previous.webm')
    assert.equal(report.ai_audio_file_name, 'previous.webm')
    assert.equal(report.ai_audio_mime_type, 'audio/webm')
    assert.equal(report.ai_audio_saved_at, '2026-06-10T12:01:00.000Z')
})

const baseSettings: AppSettings = {
    pharmacy_name: '',
    pharmacy_address: '',
    pharmacy_tel: '',
    pharmacy_fax: '',
    google_drive_folder: '',
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

function createReportDraft(overrides: Partial<Report> = {}): Omit<Report, 'id' | 'created_at' | 'updated_at'> {
    return {
        patient_name: '検証 患者',
        patient_dob: '1940-06-11',
        patient_gender: 'female',
        doctor_name: '検証医師',
        medical_institution_name: '検証医院',
        pharmacist_name: '検証薬剤師',
        prescription_date: '2026-06-11',
        dispensing_date: '2026-06-11',
        visit_date: '2026-06-11',
        medication_instruction: '服薬指導',
        side_effects: '',
        default_prescription_days: '28',
        regular_medication_supply_until: '',
        medications_check_list: [],
        medications_check_list_prn: [],
        ...overrides
    }
}
