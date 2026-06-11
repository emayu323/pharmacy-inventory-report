import { supabase, hasSupabaseConfig } from './supabase'
import type { Report } from './types'
import { getNativeBridge } from './nativeBridge'
import {
    compareReportsByNewestDeletedAt,
    compareReportsByNewestVisitDate,
    selectLatestReportByVisitDate
} from './reportSelection'

export type ReportStorageMode = 'supabase' | 'local'
export type ReportInput = Omit<Report, 'id' | 'created_at' | 'updated_at'>
export type LogicalDeleteResult = {
    deleted: boolean
    deleted_at?: string
}

const LOCAL_REPORTS_KEY = 'pharmacy-report:reports:v1'
const LOCAL_STORAGE_MODE_KEY = 'report_storage_mode'

const SUPPORTED_STORAGE_MODES = new Set<ReportStorageMode>(['supabase', 'local'])

export const getReportStorageMode = (): ReportStorageMode => {
    const envMode = import.meta.env.VITE_REPORT_STORAGE
    if (SUPPORTED_STORAGE_MODES.has(envMode as ReportStorageMode)) {
        return envMode as ReportStorageMode
    }

    const browserMode = getBrowserStorage()?.getItem(LOCAL_STORAGE_MODE_KEY)
    if (SUPPORTED_STORAGE_MODES.has(browserMode as ReportStorageMode)) {
        return browserMode as ReportStorageMode
    }

    return hasSupabaseConfig ? 'supabase' : 'local'
}

export const isLocalReportStorage = () => Boolean(getNativeBridge()) || getReportStorageMode() === 'local'

export const getReportById = async (reportId: string): Promise<Report | null> => {
    const nativeBridge = getNativeBridge()
    if (nativeBridge) {
        return nativeBridge.reports.get(reportId)
    }

    if (isLocalReportStorage()) {
        return readLocalReports().find(report => report.id === reportId && !report.deleted_at) ?? null
    }

    assertSupabaseConfigured()
    const { data, error } = await supabase
        .from('reports')
        .select('*')
        .eq('id', reportId)
        .is('deleted_at', null)
        .single()

    if (error) throw error
    return data as Report
}

export const saveReport = async (reportId: string | undefined, report: ReportInput): Promise<Report> => {
    const nativeBridge = getNativeBridge()
    if (nativeBridge) {
        return nativeBridge.reports.save(reportId, report)
    }

    if (isLocalReportStorage()) {
        return saveLocalReport(reportId, report)
    }

    assertSupabaseConfigured()
    if (reportId) {
        const { data, error } = await supabase
            .from('reports')
            .update(report)
            .eq('id', reportId)
            .select('*')
            .single()

        if (error) throw error
        return data as Report
    }

    const { data, error } = await supabase
        .from('reports')
        .insert([report])
        .select('*')
        .single()

    if (error) throw error
    return data as Report
}

export const getLatestReportByPatientId = async (patientId: string): Promise<Report | null> => {
    const nativeBridge = getNativeBridge()
    if (nativeBridge) {
        return nativeBridge.reports.getLatestByPatient(patientId)
    }

    if (isLocalReportStorage()) {
        return selectLatestReportByVisitDate(
            readLocalReports().filter(report => report.patient_id === patientId)
        )
    }

    assertSupabaseConfigured()
    const { data, error } = await supabase
        .from('reports')
        .select('*')
        .eq('patient_id', patientId)
        .is('deleted_at', null)
        .order('visit_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

    if (error) throw error
    return data as Report | null
}

export const listReportsByPatientId = async (patientId: string): Promise<Report[]> => {
    const nativeBridge = getNativeBridge()
    if (nativeBridge) {
        return nativeBridge.reports.listByPatient(patientId)
    }

    if (isLocalReportStorage()) {
        return readLocalReports()
            .filter(report => report.patient_id === patientId && !report.deleted_at)
            .sort(compareReportsByNewestVisitDate)
    }

    assertSupabaseConfigured()
    const { data, error } = await supabase
        .from('reports')
        .select('*')
        .eq('patient_id', patientId)
        .is('deleted_at', null)
        .order('visit_date', { ascending: false })

    if (error) throw error
    return (data ?? []) as Report[]
}

export const listReportsByNextVisitDateRange = async (startDate: string, endDate: string): Promise<Report[]> => {
    const nativeBridge = getNativeBridge()
    if (nativeBridge) {
        return nativeBridge.reports.listByNextVisitDateRange(startDate, endDate)
    }

    if (isLocalReportStorage()) {
        return readLocalReports()
            .filter(report => {
                if (report.deleted_at) return false
                if (!report.next_visit_date) return false
                return report.next_visit_date >= startDate && report.next_visit_date <= endDate
            })
            .sort(compareReportsByNewestVisitDate)
    }

    assertSupabaseConfigured()
    const { data, error } = await supabase
        .from('reports')
        .select('*')
        .not('next_visit_date', 'is', null)
        .gte('next_visit_date', startDate)
        .lte('next_visit_date', endDate)
        .is('deleted_at', null)

    if (error) throw error
    return (data ?? []) as Report[]
}

export const listDeletedReports = async (): Promise<Report[]> => {
    const nativeBridge = getNativeBridge()
    if (nativeBridge) {
        return nativeBridge.reports.listDeleted()
    }

    if (isLocalReportStorage()) {
        return readLocalReports()
            .filter(report => Boolean(report.deleted_at))
            .sort(compareReportsByNewestDeletedAt)
    }

    assertSupabaseConfigured()
    const { data, error } = await supabase
        .from('reports')
        .select('*')
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false })

    if (error) throw error
    return (data ?? []) as Report[]
}

export const deleteReport = async (reportId: string): Promise<LogicalDeleteResult> => {
    const nativeBridge = getNativeBridge()
    if (nativeBridge) {
        return nativeBridge.reports.delete(reportId)
    }

    const deletedAt = new Date().toISOString()
    if (isLocalReportStorage()) {
        const reports = readLocalReports()
        const index = reports.findIndex(report => report.id === reportId && !report.deleted_at)
        if (index < 0) return { deleted: false }
        reports[index] = {
            ...reports[index],
            updated_at: deletedAt,
            deleted_at: deletedAt
        }
        writeLocalReports(reports)
        return {
            deleted: true,
            deleted_at: deletedAt
        }
    }

    assertSupabaseConfigured()
    const { error } = await supabase
        .from('reports')
        .update({ deleted_at: deletedAt, updated_at: deletedAt })
        .eq('id', reportId)
        .is('deleted_at', null)

    if (error) throw error
    return {
        deleted: true,
        deleted_at: deletedAt
    }
}

export const restoreReport = async (reportId: string): Promise<Report | null> => {
    const nativeBridge = getNativeBridge()
    if (nativeBridge) {
        return nativeBridge.reports.restore(reportId)
    }

    if (isLocalReportStorage()) {
        const reports = readLocalReports()
        const index = reports.findIndex(report => report.id === reportId && report.deleted_at)
        if (index < 0) return null
        const restoredReport = {
            ...reports[index],
            updated_at: new Date().toISOString()
        }
        delete restoredReport.deleted_at
        reports[index] = restoredReport
        writeLocalReports(reports)
        return restoredReport
    }

    assertSupabaseConfigured()
    const { data, error } = await supabase
        .from('reports')
        .update({ deleted_at: null, updated_at: new Date().toISOString() })
        .eq('id', reportId)
        .select('*')
        .single()

    if (error) throw error
    return data as Report
}

const saveLocalReport = (reportId: string | undefined, report: ReportInput): Report => {
    const reports = readLocalReports()
    const index = reportId ? reports.findIndex(item => item.id === reportId && !item.deleted_at) : -1
    if (reportId && index < 0) {
        throw new Error('報告書が見つかりません')
    }
    const now = new Date().toISOString()
    const existingReport = index >= 0 ? reports[index] : undefined
    const savedReport: Report = {
        ...report,
        id: reportId || createLocalReportId(),
        created_at: existingReport?.created_at || now,
        updated_at: now
    }

    if (index >= 0) {
        reports[index] = savedReport
    } else {
        reports.unshift(savedReport)
    }

    writeLocalReports(reports)
    return savedReport
}

const readLocalReports = (): Report[] => {
    const storage = getBrowserStorage()
    if (!storage) return []

    const raw = storage.getItem(LOCAL_REPORTS_KEY)
    if (!raw) return []

    try {
        const parsed = JSON.parse(raw) as unknown
        if (!Array.isArray(parsed)) return []
        return parsed.filter(isReportLike) as Report[]
    } catch {
        return []
    }
}

const writeLocalReports = (reports: Report[]) => {
    const storage = getBrowserStorage()
    if (!storage) {
        throw new Error('ローカル保存領域にアクセスできません')
    }
    storage.setItem(LOCAL_REPORTS_KEY, JSON.stringify(reports))
}

const getBrowserStorage = (): Storage | null => {
    if (typeof window === 'undefined') return null
    try {
        return window.localStorage
    } catch {
        return null
    }
}

const createLocalReportId = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return `local-${crypto.randomUUID()}`
    }
    return `local-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

const isReportLike = (value: unknown): value is Report => {
    if (!value || typeof value !== 'object') return false
    const report = value as Partial<Report>
    return typeof report.id === 'string'
        && typeof report.patient_name === 'string'
        && typeof report.visit_date === 'string'
}

const assertSupabaseConfigured = () => {
    if (!hasSupabaseConfig) {
        throw new Error('Supabaseの接続情報が未設定です。ローカル保存モードで起動してください。')
    }
}
