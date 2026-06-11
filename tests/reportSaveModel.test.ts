import assert from 'node:assert/strict'
import test from 'node:test'
import { buildReportInputForSave } from '../src/reportSaveModel.ts'
import type { Report } from '../src/types.ts'

test('saves visit memo and strips legacy AI transcript and audio fields', () => {
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
        aiVisitMemo: '今回の訪問メモ',
        now: '2026-06-11T09:00:00.000Z'
    })

    assert.equal(report.memo, '今回メモ')
    assert.equal(report.ai_visit_memo, '今回の訪問メモ')
    assert.equal(report.ai_visit_memo_saved_at, '2026-06-11T09:00:00.000Z')
    const legacyReport = report as typeof report & {
        ai_transcript?: string
        ai_transcript_saved_at?: string
        ai_audio_file_path?: string
        ai_audio_file_name?: string
        ai_audio_mime_type?: string
        ai_audio_saved_at?: string
    }
    assert.equal(legacyReport.ai_transcript, undefined)
    assert.equal(legacyReport.ai_transcript_saved_at, undefined)
    assert.equal(legacyReport.ai_audio_file_path, undefined)
    assert.equal(legacyReport.ai_audio_file_name, undefined)
    assert.equal(legacyReport.ai_audio_mime_type, undefined)
    assert.equal(legacyReport.ai_audio_saved_at, undefined)
})

test('trims visit memo before saving', () => {
    const report = buildReportInputForSave({
        formData: createReportDraft(),
        patientMemo: '',
        aiVisitMemo: '  主訴等: 眠気あり  ',
        now: '2026-06-11T09:00:00.000Z'
    })

    assert.equal(report.ai_visit_memo, '主訴等: 眠気あり')
    assert.equal(report.ai_visit_memo_saved_at, '2026-06-11T09:00:00.000Z')
})

test('preserves existing visit memo timestamp when text is unchanged', () => {
    const report = buildReportInputForSave({
        formData: createReportDraft({
            ai_visit_memo: '前回保存された訪問メモ',
            ai_visit_memo_saved_at: '2026-06-10T12:00:00.000Z'
        }),
        patientMemo: '',
        aiVisitMemo: '前回保存された訪問メモ',
        now: '2026-06-11T09:00:00.000Z'
    })

    assert.equal(report.ai_visit_memo, '前回保存された訪問メモ')
    assert.equal(report.ai_visit_memo_saved_at, '2026-06-10T12:00:00.000Z')
})

function createReportDraft(overrides: Partial<Report> & {
    ai_transcript?: string
    ai_transcript_saved_at?: string
    ai_audio_file_path?: string
    ai_audio_file_name?: string
    ai_audio_mime_type?: string
    ai_audio_saved_at?: string
} = {}): Omit<Report, 'id' | 'created_at' | 'updated_at'> {
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
