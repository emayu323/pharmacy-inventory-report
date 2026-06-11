import type { AppSettings, Institution, InstitutionType, Patient, Report, TextTemplate } from './types'
import type { AiDraft } from './aiDraft'

export type NativePatientInput = Omit<Patient, 'id' | 'created_at'> & { user_id?: string }
export type NativePatientUpdate = Partial<Omit<Patient, 'id' | 'created_at'>>
export type NativeReportInput = Omit<Report, 'id' | 'created_at' | 'updated_at'>
export type NativeInstitutionInput = {
    type: InstitutionType
    name: string
    address?: string | null
    doctor_name?: string | null
    tel?: string | null
    fax?: string | null
    user_id?: string
}
export type NativeTextTemplateInput = {
    id?: string
    target: TextTemplate['target']
    title: string
    body: string
}
export type NativeAppSettingsInput = Partial<Omit<AppSettings, 'pin_hash' | 'pin_salt'>>
export type NativeDrugMasterEntry = {
    name: string
    kana: string
    unit: string
}
export type NativeDrugMasterStatus = {
    count: number
    source: string
    updated_at: string
}
export type NativeDrugMasterImportResult = NativeDrugMasterStatus & {
    imported: boolean
    canceled?: boolean
    previousCount?: number
}
export type NativeAiServiceStatus = {
    status: 'ready' | 'not_configured' | 'not_running' | 'model_missing' | 'error'
    url: string
    requiredModel?: string
    installedModels?: string[]
    message: string
}
export type NativeAiEnvironmentStatus = {
    ready: boolean
    ollama: NativeAiServiceStatus
    whisper: NativeAiServiceStatus
    disk: {
        status: 'not_checked' | 'ready' | 'low_space' | 'unknown'
        path?: string
        freeBytes?: number
        requiredFreeBytes?: number
        message: string
    }
    performance: {
        cpuCount: number
        gpu: 'unknown'
        message: string
    }
    estimate: {
        basis: string
        transcriptionTimeRatio: string
        message: string
    }
}
export type NativeAiAudioSaveResult = {
    fileName: string
    filePath: string
    mimeType: string
    byteLength: number
    saved_at: string
}
export type NativeBackupSummary = {
    created_at: string
    schema_version: number
    patients_count: number
    reports_count: number
    institutions_count: number
    templates_count: number
    drug_master_count: number
}
export type NativeBackupCreateResult = {
    fileName: string
    filePath: string
    googleDriveFilePath?: string
    created_at: string
    summary: NativeBackupSummary
}
export type NativeBackupRestoreResult = {
    restored: boolean
    canceled?: boolean
    backupFilePath?: string
    rollbackPath?: string
    summary?: NativeBackupSummary
}
export type NativeLogicalDeleteResult = {
    deleted: boolean
    deleted_at?: string
}
export type NativeSecurityStatus = {
    checked_at: string
    dbProtection: {
        status: 'protected' | 'unprotected' | 'not_windows' | 'unknown' | 'error'
        method: 'BitLocker'
        drive?: string
        message: string
        detail?: string
    }
}

export type PharmacyReportNativeBridge = {
    storage: 'sqlite'
    patients: {
        list: () => Promise<Patient[]>
        listDeleted: () => Promise<Patient[]>
        get: (patientId: string) => Promise<Patient | null>
        create: (patient: NativePatientInput) => Promise<Patient>
        update: (patientId: string, update: NativePatientUpdate) => Promise<Patient>
        delete: (patientId: string) => Promise<NativeLogicalDeleteResult>
        restore: (patientId: string) => Promise<Patient | null>
    }
    reports: {
        get: (reportId: string) => Promise<Report | null>
        save: (reportId: string | undefined, report: NativeReportInput) => Promise<Report>
        getLatestByPatient: (patientId: string) => Promise<Report | null>
        listByPatient: (patientId: string) => Promise<Report[]>
        listByNextVisitDateRange: (startDate: string, endDate: string) => Promise<Report[]>
        listDeleted: () => Promise<Report[]>
        delete: (reportId: string) => Promise<NativeLogicalDeleteResult>
        restore: (reportId: string) => Promise<Report | null>
    }
    institutions: {
        list: () => Promise<Institution[]>
        get: (institutionId: string) => Promise<Institution | null>
        findByName: (name: string, type?: InstitutionType) => Promise<Institution | null>
        save: (institutionId: string | undefined, institution: NativeInstitutionInput) => Promise<Institution>
        delete: (institutionId: string) => Promise<void>
    }
    templates: {
        list: () => Promise<TextTemplate[]>
        save: (template: NativeTextTemplateInput) => Promise<TextTemplate>
        delete: (templateId: string) => Promise<void>
    }
    settings: {
        get: () => Promise<AppSettings>
        save: (settings: NativeAppSettingsInput) => Promise<AppSettings>
        setPin: (pin: string) => Promise<AppSettings>
        clearPin: () => Promise<AppSettings>
        verifyPin: (pin: string) => Promise<boolean>
        ensureBackupKey: () => Promise<AppSettings>
        rotateBackupKey: () => Promise<AppSettings>
    }
    drugMaster: {
        search: (query: string, limit?: number) => Promise<NativeDrugMasterEntry[]>
        getStatus: () => Promise<NativeDrugMasterStatus>
        importCsv: () => Promise<NativeDrugMasterImportResult>
    }
    ai: {
        getStatus: () => Promise<NativeAiEnvironmentStatus>
        createDraftFromTranscript: (transcript: string) => Promise<AiDraft>
        transcribeAndDraft: (audioBytes: Uint8Array) => Promise<AiDraft>
        saveAudio: (reportId: string, audioBytes: Uint8Array, mimeType: string) => Promise<NativeAiAudioSaveResult>
    }
    backups: {
        create: (password: string) => Promise<NativeBackupCreateResult>
        createPreUpdate: (toVersion?: string) => Promise<NativeBackupCreateResult>
        restore: (password: string) => Promise<NativeBackupRestoreResult>
    }
    security: {
        getStatus: () => Promise<NativeSecurityStatus>
    }
}

declare global {
    interface Window {
        pharmacyReportNative?: PharmacyReportNativeBridge
    }
}

export const getNativeBridge = (): PharmacyReportNativeBridge | null => {
    if (typeof window === 'undefined') return null
    return window.pharmacyReportNative ?? null
}
