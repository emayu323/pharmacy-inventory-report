import type { Patient, Report } from './types.ts'
import { getPatientMasterDiffs } from './reportPatientMasterSync.ts'

export type ReportAutoSaveInput = Partial<Omit<Report, 'id' | 'created_at' | 'updated_at'>>

const REQUIRED_AUTO_SAVE_FIELDS: Array<keyof ReportAutoSaveInput> = [
  'patient_name',
  'patient_dob',
  'patient_gender',
  'visit_date',
  'pharmacist_name'
]

export function canAutoSaveReport(report: ReportAutoSaveInput): boolean {
  return REQUIRED_AUTO_SAVE_FIELDS.every(field => normalizeValue(report[field]).length > 0)
}

export function canAutoSaveReportDraft(
  report: ReportAutoSaveInput,
  sourcePatient?: Patient | null
): boolean {
  if (!canAutoSaveReport(report)) return false
  if (!sourcePatient || report.patient_id !== sourcePatient.id) return true

  return getPatientMasterDiffs(sourcePatient, report).length === 0
}

export function createReportAutoSaveFingerprint(report: ReportAutoSaveInput): string {
  return JSON.stringify(sortValue(report))
}

function normalizeValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue)
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, sortValue(child)])
    )
  }
  return value
}
