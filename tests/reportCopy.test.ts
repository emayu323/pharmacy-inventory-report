import assert from 'node:assert/strict'
import test from 'node:test'
import { createCopiedReportDraft, type ReportDraft } from '../src/reportCopy.ts'
import type { Report } from '../src/types.ts'

const emptyReport: ReportDraft = {
    patient_name: '',
    patient_dob: '',
    patient_gender: 'female',
    doctor_name: '',
    pharmacist_name: '',
    prescription_date: '',
    dispensing_date: '',
    visit_date: '',
    medication_instruction: '',
    side_effects: '',
    default_prescription_days: '28',
    medications_check_list: [],
    medications_check_list_prn: [],
    regular_medication_supply_until: '',
    next_visit_date: '',
    allergy_history: 'なし',
    guidance_recipient: '家族',
    medication_status: '良好',
    storage_status: '良好',
    other_dept_consultation: 'なし',
    concomitant_medications: 'なし',
    interaction_status: '併用薬/飲食物による相互作用なし'
}

test('copied report keeps fixed info and medications but clears visit-specific text fields', () => {
    const source: Report = {
        id: 'report-previous',
        created_at: '2026-06-01T00:00:00.000Z',
        updated_at: '2026-06-01T00:00:00.000Z',
        patient_id: 'patient-1',
        patient_name: '佐藤 花子',
        patient_dob: '1945-02-03',
        patient_gender: 'female',
        doctor_name: '検証医師',
        pharmacist_name: '前回薬剤師',
        prescription_date: '2026-06-01',
        dispensing_date: '2026-06-01',
        visit_date: '2026-06-01',
        next_visit_date: '2026-06-15',
        chief_complaint: '前回の主訴',
        medication_instruction: '前回の服薬指導',
        side_effects: '前回のその他伝達事項',
        memo: '前回の申し送り',
        ai_transcript: '前回の文字起こし',
        ai_audio_file_path: '/tmp/previous.webm',
        default_prescription_days: '28',
        regular_medication_supply_until: '2026-07-02',
        medications_check_list: [{
            id: 'med-1',
            name: '定期薬A',
            current_amount: '32',
            next_required_amount: '2026-07-02',
            previous_supply_until: '2026-06-05',
            calculated_supply_until: '2026-07-02',
            unit: '日分',
            notes: '',
            checked: true
        }],
        medications_check_list_prn: [{
            id: 'prn-1',
            name: '保管薬B',
            current_amount: '10',
            next_required_amount: '',
            unit: '錠',
            notes: '期限注意',
            checked: false
        }],
        medication_status: '飲み忘れあり',
        storage_status: '良好'
    }

    const copied = createCopiedReportDraft(source, {
        emptyReport,
        today: '2026-06-10',
        pharmacistName: '今回薬剤師'
    })

    assert.equal(copied.report.patient_name, '佐藤 花子')
    assert.equal(copied.report.doctor_name, '検証医師')
    assert.equal(copied.report.visit_date, '2026-06-10')
    assert.equal(copied.report.prescription_date, '2026-06-10')
    assert.equal(copied.report.dispensing_date, '2026-06-10')
    assert.equal(copied.report.pharmacist_name, '今回薬剤師')

    assert.equal(copied.report.chief_complaint, '')
    assert.equal(copied.report.medication_instruction, '')
    assert.equal(copied.report.side_effects, '')
    assert.equal(copied.report.next_visit_date, '')
    assert.equal(copied.report.memo, '')
    assert.equal(copied.patientMemo, '')
    assert.equal(copied.report.ai_transcript, undefined)
    assert.equal(copied.report.ai_audio_file_path, undefined)

    assert.equal(copied.report.medications_check_list?.[0].name, '定期薬A')
    assert.equal(copied.report.medications_check_list?.[0].previous_supply_until, '2026-07-02')
    assert.equal(copied.report.medications_check_list?.[0].current_amount, '51')
    assert.equal(copied.report.medications_check_list_prn?.[0].name, '保管薬B')
    assert.equal(copied.report.patient_age_at_visit, 81)
})

test('copied report keeps zero patient age at new visit date', () => {
    const copied = createCopiedReportDraft({
        id: 'report-baby',
        created_at: '2026-06-01T00:00:00.000Z',
        updated_at: '2026-06-01T00:00:00.000Z',
        patient_name: '乳児 患者',
        patient_dob: '2026-06-01',
        patient_gender: 'female',
        doctor_name: '検証医師',
        pharmacist_name: '前回薬剤師',
        prescription_date: '2026-06-01',
        dispensing_date: '2026-06-01',
        visit_date: '2026-06-01',
        medication_instruction: '前回本文',
        side_effects: '',
        default_prescription_days: '28',
        regular_medication_supply_until: '',
        medications_check_list: [],
        medications_check_list_prn: []
    }, {
        emptyReport,
        today: '2026-06-10',
        pharmacistName: '今回薬剤師'
    })

    assert.equal(copied.report.patient_age_at_visit, 0)
})
