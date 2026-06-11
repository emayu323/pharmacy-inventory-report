import assert from 'node:assert/strict'
import test from 'node:test'
import { buildPatientMasterUpdateFromReport, getPatientMasterDiffs } from '../src/reportPatientMasterSync.ts'
import type { Patient, Report } from '../src/types.ts'

test('detects report fields that differ from the patient master', () => {
    const diffs = getPatientMasterDiffs(createPatient(), {
        patient_name: '佐藤 花子',
        patient_dob: '1945-02-03',
        patient_gender: 'female',
        medical_institution_name: '新医院',
        doctor_name: '新主治医',
        home_care_office: '新居宅',
        care_manager: '新ケアマネ',
        pharmacy_name: '新薬局'
    })

    assert.deepEqual(diffs.map(diff => diff.patientField), [
        'medical_institution_name',
        'primary_doctor',
        'home_care_office',
        'care_manager',
        'pharmacy_name'
    ])
    assert.equal(diffs[0].label, '医療機関')
    assert.equal(diffs[0].patientValue, '旧医院')
    assert.equal(diffs[0].reportValue, '新医院')
})

test('builds a patient master update only from changed fields', () => {
    const report = {
        patient_name: '佐藤 花子',
        patient_dob: '1945-02-03',
        patient_gender: 'female',
        medical_institution_name: '新医院',
        doctor_name: '新主治医',
        home_care_office: '旧居宅',
        care_manager: '旧ケアマネ',
        pharmacy_name: '旧薬局'
    } satisfies Partial<Report>
    const diffs = getPatientMasterDiffs(createPatient(), report)

    assert.deepEqual(buildPatientMasterUpdateFromReport(report, diffs), {
        medical_institution_name: '新医院',
        primary_doctor: '新主治医'
    })
})

test('ignores whitespace-only differences and missing patient master', () => {
    const patient = createPatient({
        medical_institution_name: '旧医院',
        primary_doctor: '旧主治医'
    })
    assert.deepEqual(getPatientMasterDiffs(patient, {
        medical_institution_name: ' 旧医院 ',
        doctor_name: '旧主治医'
    }), [])
    assert.deepEqual(getPatientMasterDiffs(null, {
        medical_institution_name: '新医院'
    }), [])
})

function createPatient(overrides: Partial<Patient> = {}): Patient {
    return {
        id: 'patient-1',
        created_at: '2026-06-10T00:00:00.000Z',
        name: '佐藤 花子',
        dob: '1945-02-03',
        gender: 'female',
        medical_institution_name: '旧医院',
        primary_doctor: '旧主治医',
        home_care_office: '旧居宅',
        care_manager: '旧ケアマネ',
        pharmacy_name: '旧薬局',
        is_active: true,
        ...overrides
    }
}
