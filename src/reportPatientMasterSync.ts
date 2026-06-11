import type { Patient, Report } from './types'
import type { PatientUpdate } from './patientRepository'

export type PatientMasterReportField = keyof Pick<
  Report,
  | 'patient_name'
  | 'patient_dob'
  | 'patient_gender'
  | 'medical_institution_name'
  | 'doctor_name'
  | 'home_care_office'
  | 'care_manager'
  | 'pharmacy_name'
>

export type PatientMasterField = keyof Pick<
  Patient,
  | 'name'
  | 'dob'
  | 'gender'
  | 'medical_institution_name'
  | 'primary_doctor'
  | 'home_care_office'
  | 'care_manager'
  | 'pharmacy_name'
>

export interface PatientMasterDiff {
  label: string
  patientField: PatientMasterField
  reportField: PatientMasterReportField
  patientValue: string
  reportValue: string
}

const PATIENT_MASTER_FIELD_MAP: Array<{
  label: string
  patientField: PatientMasterField
  reportField: PatientMasterReportField
}> = [
  { label: '患者氏名', patientField: 'name', reportField: 'patient_name' },
  { label: '生年月日', patientField: 'dob', reportField: 'patient_dob' },
  { label: '性別', patientField: 'gender', reportField: 'patient_gender' },
  { label: '医療機関', patientField: 'medical_institution_name', reportField: 'medical_institution_name' },
  { label: '主治医', patientField: 'primary_doctor', reportField: 'doctor_name' },
  { label: '居宅介護支援事業所', patientField: 'home_care_office', reportField: 'home_care_office' },
  { label: 'ケアマネージャー', patientField: 'care_manager', reportField: 'care_manager' },
  { label: '薬局名', patientField: 'pharmacy_name', reportField: 'pharmacy_name' }
]

export function getPatientMasterDiffs(patient: Patient | null | undefined, report: Partial<Report>): PatientMasterDiff[] {
  if (!patient) return []

  return PATIENT_MASTER_FIELD_MAP.flatMap(mapping => {
    if (!Object.prototype.hasOwnProperty.call(report, mapping.reportField)) return []

    const patientValue = normalizeValue(patient[mapping.patientField])
    const reportValue = normalizeValue(report[mapping.reportField])
    if (patientValue === reportValue) return []

    return [{
      label: mapping.label,
      patientField: mapping.patientField,
      reportField: mapping.reportField,
      patientValue,
      reportValue
    }]
  })
}

export function buildPatientMasterUpdateFromReport(
  report: Partial<Report>,
  diffs: PatientMasterDiff[]
): PatientUpdate {
  return diffs.reduce<PatientUpdate>((update, diff) => ({
    ...update,
    [diff.patientField]: normalizeValue(report[diff.reportField])
  }), {})
}

function normalizeValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}
