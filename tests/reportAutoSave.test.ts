import assert from 'node:assert/strict'
import test from 'node:test'
import {
    canAutoSaveReport,
    canAutoSaveReportDraft,
    createReportAutoSaveFingerprint
} from '../src/reportAutoSave.ts'

test('allows auto save only after required report fields are present', () => {
    assert.equal(canAutoSaveReport({
        patient_name: '佐藤 花子',
        patient_dob: '1945-02-03',
        patient_gender: 'female',
        visit_date: '2026-06-11',
        pharmacist_name: '検証薬剤師'
    }), true)

    assert.equal(canAutoSaveReport({
        patient_name: '佐藤 花子',
        patient_dob: '1945-02-03',
        patient_gender: 'female',
        visit_date: '2026-06-11',
        pharmacist_name: ' '
    }), false)
})

test('creates a stable fingerprint independent of object key order', () => {
    const left = createReportAutoSaveFingerprint({
        patient_name: '佐藤 花子',
        patient_dob: '1945-02-03',
        patient_gender: 'female',
        visit_date: '2026-06-11',
        pharmacist_name: '検証薬剤師',
        medications_check_list: [{
            id: 'med-1',
            name: '薬A',
            current_amount: '',
            next_required_amount: '',
            unit: '日',
            notes: '',
            checked: true
        }]
    })
    const right = createReportAutoSaveFingerprint({
        medications_check_list: [{
            checked: true,
            notes: '',
            unit: '日',
            next_required_amount: '',
            current_amount: '',
            name: '薬A',
            id: 'med-1'
        }],
        pharmacist_name: '検証薬剤師',
        visit_date: '2026-06-11',
        patient_gender: 'female',
        patient_dob: '1945-02-03',
        patient_name: '佐藤 花子'
    })

    assert.equal(left, right)
})

test('blocks auto save when report edits would require patient master choice', () => {
    const sourcePatient = {
        id: 'patient-1',
        created_at: '2026-06-11T00:00:00.000Z',
        name: '佐藤 花子',
        dob: '1945-02-03',
        gender: 'female' as const,
        medical_institution_name: '既存医院',
        primary_doctor: '既存 太郎'
    }

    const reportInput = {
        patient_id: 'patient-1',
        patient_name: '佐藤 花子',
        patient_dob: '1945-02-03',
        patient_gender: 'female' as const,
        visit_date: '2026-06-11',
        pharmacist_name: '検証薬剤師',
        medical_institution_name: '変更医院',
        doctor_name: '既存 太郎'
    }

    assert.equal(canAutoSaveReportDraft(reportInput, sourcePatient), false)
    assert.equal(canAutoSaveReportDraft(reportInput, null), true)
    assert.equal(canAutoSaveReportDraft({ ...reportInput, patient_id: 'patient-2' }, sourcePatient), true)
})
