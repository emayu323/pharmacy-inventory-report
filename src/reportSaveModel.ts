import type { Report } from './types'
import { resolvePatientAgeAtVisit } from './reportPrintModel.ts'

export interface ReportSaveInputOptions {
    formData: Omit<Report, 'id' | 'created_at' | 'updated_at'>
    patientMemo: string
    aiVisitMemo: string
    now?: string
}

export const buildReportInputForSave = ({
    formData,
    patientMemo,
    aiVisitMemo,
    now = new Date().toISOString()
}: ReportSaveInputOptions): Omit<Report, 'id' | 'created_at' | 'updated_at'> => {
    const previousAiVisitMemo = formData.ai_visit_memo
    const previousAiVisitMemoSavedAt = formData.ai_visit_memo_saved_at
    const cleanFormData = { ...formData } as typeof formData & {
        ai_transcript?: string
        ai_transcript_saved_at?: string
        ai_audio_file_path?: string
        ai_audio_file_name?: string
        ai_audio_mime_type?: string
        ai_audio_saved_at?: string
    }
    delete cleanFormData.ai_visit_memo
    delete cleanFormData.ai_visit_memo_saved_at
    delete cleanFormData.ai_transcript
    delete cleanFormData.ai_transcript_saved_at
    delete cleanFormData.ai_audio_file_path
    delete cleanFormData.ai_audio_file_name
    delete cleanFormData.ai_audio_mime_type
    delete cleanFormData.ai_audio_saved_at

    const ageAtVisit = resolvePatientAgeAtVisit(
        cleanFormData.patient_dob,
        cleanFormData.visit_date,
        cleanFormData.patient_age_at_visit
    )
    const report: Omit<Report, 'id' | 'created_at' | 'updated_at'> = {
        ...cleanFormData,
        patient_age_at_visit: typeof ageAtVisit === 'number' ? ageAtVisit : cleanFormData.patient_age_at_visit,
        memo: patientMemo
    }
    const visitMemo = aiVisitMemo.trim()

    if (visitMemo) {
        report.ai_visit_memo = visitMemo
        report.ai_visit_memo_saved_at = visitMemo === previousAiVisitMemo && previousAiVisitMemoSavedAt
            ? previousAiVisitMemoSavedAt
            : now
    }

    return report
}
