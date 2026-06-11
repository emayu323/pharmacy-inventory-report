import test from 'node:test'
import assert from 'node:assert/strict'
import type { Report } from '../src/types.ts'
import {
    calculateAgeAtDate,
    estimateReportPrintPages,
    getReportPrintRecipients,
    getReportPrintWarnings,
    hasMissingCareManagerRecipient,
    resolvePatientAgeAtVisit,
    resolveReportRecipient
} from '../src/reportPrintModel.ts'

test('resolves medical and care manager recipients with different names and fax numbers', () => {
    const report = createReport()

    const medical = resolveReportRecipient(report, 'medical')
    const careManager = resolveReportRecipient(report, 'care_manager')

    assert.equal(medical.name, '検証医院 検証医師 先生')
    assert.equal(medical.fax, '03-1111-2222')
    assert.equal(careManager.name, '検証居宅介護支援事業所 検証ケアマネ 様')
    assert.equal(careManager.fax, '03-3333-4444')
})

test('both print target produces two recipient copies', () => {
    assert.deepEqual(getReportPrintRecipients('both'), ['medical', 'care_manager'])
    assert.deepEqual(getReportPrintRecipients('medical'), ['medical'])
    assert.deepEqual(getReportPrintRecipients('care_manager'), ['care_manager'])
})

test('age at visit is calculated from visit date instead of today', () => {
    assert.equal(calculateAgeAtDate('1940-06-11', '2026-06-10'), 85)
    assert.equal(calculateAgeAtDate('1940-06-11', '2026-06-11'), 86)
})

test('age at visit keeps zero age instead of falling back to today age', () => {
    assert.equal(resolvePatientAgeAtVisit('2026-06-01', '2026-06-10', 1), 0)
    assert.equal(resolvePatientAgeAtVisit('', '', 82), 82)
    assert.equal(resolvePatientAgeAtVisit('', '', ''), '')
})

test('warnings include missing care manager recipient and likely two page report', () => {
    const report = createReport({
        home_care_office: '',
        care_manager: '',
        home_care_office_fax: '',
        medications_check_list: Array.from({ length: 13 }, (_, index) => ({
            id: `regular-${index}`,
            name: `定期薬${index + 1}`,
            current_amount: '',
            next_required_amount: '',
            unit: '日',
            notes: '',
            checked: true,
            calculated_total_days: '28'
        }))
    })

    assert.equal(estimateReportPrintPages(report), 2)
    assert.deepEqual(getReportPrintWarnings(report, 'care_manager'), [
        'ケアマネ向けの報告先またはFAX番号が未入力です。今回報告書だけの一時入力を確認してください。',
        '薬剤数または本文量が多いため、1通あたり2枚になる可能性があります。'
    ])
})

test('print page estimate includes long medication names and notes', () => {
    const report = createReport({
        medications_check_list_prn: Array.from({ length: 3 }, (_, index) => ({
            id: `other-${index}`,
            name: `保管用外用薬${index + 1}`,
            current_amount: '1',
            unit: '本',
            notes: '期限、使用部位、使用間隔、保管場所、使用時の注意点を家族と共有。'.repeat(8),
            next_required_amount: '',
            checked: false
        }))
    })

    assert.equal(estimateReportPrintPages(report), 2)
})

test('missing care manager recipient is only blocking for care manager copies', () => {
    const report = createReport({
        home_care_office: '',
        home_care_office_fax: '',
        care_manager: ''
    })

    assert.equal(hasMissingCareManagerRecipient(report, 'medical'), false)
    assert.equal(hasMissingCareManagerRecipient(report, 'care_manager'), true)
    assert.equal(hasMissingCareManagerRecipient(report, 'both'), true)
})

function createReport(overrides: Partial<Report> = {}): Report {
    return {
        id: 'report-1',
        created_at: '2026-06-10T00:00:00.000Z',
        updated_at: '2026-06-10T00:00:00.000Z',
        patient_name: '鈴木 一郎',
        patient_dob: '1940-06-11',
        patient_gender: 'male',
        patient_age_at_visit: 85,
        doctor_name: '検証医師',
        medical_institution_name: '検証医院',
        medical_institution_tel: '03-1111-1111',
        medical_institution_fax: '03-1111-2222',
        home_care_office: '検証居宅介護支援事業所',
        home_care_office_tel: '03-3333-3333',
        home_care_office_fax: '03-3333-4444',
        care_manager: '検証ケアマネ',
        pharmacist_name: '検証薬剤師',
        pharmacy_name: '検証薬局',
        pharmacy_address: '東京都検証区1-2-3',
        pharmacy_tel: '03-5555-5555',
        pharmacy_fax: '03-5555-6666',
        prescription_date: '2026-06-10',
        dispensing_date: '2026-06-10',
        visit_date: '2026-06-10',
        default_prescription_days: '28',
        regular_medication_supply_until: '2026-07-07',
        medications_check_list: [],
        medications_check_list_prn: [],
        chief_complaint: '朝薬服用後の眠気あり。',
        allergy_history: 'なし',
        guidance_recipient: '家族',
        medication_status: '良好',
        storage_status: '良好',
        other_dept_consultation: 'なし',
        concomitant_medications: 'なし',
        interaction_status: '併用薬/飲食物による相互作用なし',
        medication_instruction: '服薬状況を確認。',
        side_effects: '',
        next_visit_date: '2026-06-24',
        ...overrides
    }
}
