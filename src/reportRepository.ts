import type { Report } from './types'
import { getNativeBridge } from './nativeBridge'
import {
    compareReportsByNewestDeletedAt,
    compareReportsByNewestVisitDate,
    selectLatestReportByVisitDate
} from './reportSelection'

export type ReportStorageMode = 'local'
export type ReportInput = Omit<Report, 'id' | 'created_at' | 'updated_at'>
export type LogicalDeleteResult = {
    deleted: boolean
    deleted_at?: string
}

const LOCAL_REPORTS_KEY = 'pharmacy-report:reports:v1'

export const getReportStorageMode = (): ReportStorageMode => 'local'
export const isLocalReportStorage = () => true

export const getReportById = async (reportId: string): Promise<Report | null> => {
    const nativeBridge = getNativeBridge()
    if (nativeBridge) {
        return nativeBridge.reports.get(reportId)
    }

    return readLocalReports().find(report => report.id === reportId && !report.deleted_at) ?? null
}

export const saveReport = async (reportId: string | undefined, report: ReportInput): Promise<Report> => {
    const nativeBridge = getNativeBridge()
    if (nativeBridge) {
        return nativeBridge.reports.save(reportId, report)
    }

    return saveLocalReport(reportId, report)
}

export const getLatestReportByPatientId = async (patientId: string): Promise<Report | null> => {
    const nativeBridge = getNativeBridge()
    if (nativeBridge) {
        return nativeBridge.reports.getLatestByPatient(patientId)
    }

    return selectLatestReportByVisitDate(
        readLocalReports().filter(report => report.patient_id === patientId)
    )
}

export const listReportsByPatientId = async (patientId: string): Promise<Report[]> => {
    const nativeBridge = getNativeBridge()
    if (nativeBridge) {
        return nativeBridge.reports.listByPatient(patientId)
    }

    return readLocalReports()
        .filter(report => report.patient_id === patientId && !report.deleted_at)
        .sort(compareReportsByNewestVisitDate)
}

export const listReportsByNextVisitDateRange = async (startDate: string, endDate: string): Promise<Report[]> => {
    const nativeBridge = getNativeBridge()
    if (nativeBridge) {
        return nativeBridge.reports.listByNextVisitDateRange(startDate, endDate)
    }

    return readLocalReports()
        .filter(report => {
            if (report.deleted_at) return false
            if (!report.next_visit_date) return false
            return report.next_visit_date >= startDate && report.next_visit_date <= endDate
        })
        .sort(compareReportsByNewestVisitDate)
}

export const listDeletedReports = async (): Promise<Report[]> => {
    const nativeBridge = getNativeBridge()
    if (nativeBridge) {
        return nativeBridge.reports.listDeleted()
    }

    return readLocalReports()
        .filter(report => Boolean(report.deleted_at))
        .sort(compareReportsByNewestDeletedAt)
}

export const deleteReport = async (reportId: string): Promise<LogicalDeleteResult> => {
    const nativeBridge = getNativeBridge()
    if (nativeBridge) {
        return nativeBridge.reports.delete(reportId)
    }

    const deletedAt = new Date().toISOString()
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

export const restoreReport = async (reportId: string): Promise<Report | null> => {
    const nativeBridge = getNativeBridge()
    if (nativeBridge) {
        return nativeBridge.reports.restore(reportId)
    }

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
