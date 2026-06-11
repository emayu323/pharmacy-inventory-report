import type { AppSettings, Report } from './types'
import { resolvePatientAgeAtVisit } from './reportPrintModel.ts'

export interface ReportSaveAudioResult {
    filePath: string
    fileName: string
    mimeType: string
    saved_at: string
}

export interface ReportSaveInputOptions {
    formData: Omit<Report, 'id' | 'created_at' | 'updated_at'>
    patientMemo: string
    aiTranscript: string
    appSettings: Pick<AppSettings, 'ai_save_audio_enabled' | 'ai_save_transcript_enabled'>
    audioResult?: ReportSaveAudioResult | null
    now?: string
}

export const buildReportInputForSave = ({
    formData,
    patientMemo,
    aiTranscript,
    appSettings,
    audioResult,
    now = new Date().toISOString()
}: ReportSaveInputOptions): Omit<Report, 'id' | 'created_at' | 'updated_at'> => {
    const {
        ai_transcript: previousAiTranscript,
        ai_transcript_saved_at: previousAiTranscriptSavedAt,
        ai_audio_file_path: previousAiAudioFilePath,
        ai_audio_file_name: previousAiAudioFileName,
        ai_audio_mime_type: previousAiAudioMimeType,
        ai_audio_saved_at: previousAiAudioSavedAt,
        ...cleanFormData
    } = formData

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
    const transcript = aiTranscript.trim()

    if (appSettings.ai_save_transcript_enabled && transcript) {
        report.ai_transcript = transcript
        report.ai_transcript_saved_at = transcript === previousAiTranscript && previousAiTranscriptSavedAt
            ? previousAiTranscriptSavedAt
            : now
    }

    if (audioResult) {
        report.ai_audio_file_path = audioResult.filePath
        report.ai_audio_file_name = audioResult.fileName
        report.ai_audio_mime_type = audioResult.mimeType
        report.ai_audio_saved_at = audioResult.saved_at
    } else if (appSettings.ai_save_audio_enabled && previousAiAudioFilePath) {
        report.ai_audio_file_path = previousAiAudioFilePath
        report.ai_audio_file_name = previousAiAudioFileName
        report.ai_audio_mime_type = previousAiAudioMimeType
        report.ai_audio_saved_at = previousAiAudioSavedAt
    }

    return report
}
