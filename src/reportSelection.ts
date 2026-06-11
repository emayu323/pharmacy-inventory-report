import type { Report } from './types'

export function selectLatestReportByVisitDate(reports: Report[]): Report | null {
    return reports
        .filter(report => !report.deleted_at)
        .sort(compareReportsByNewestVisitDate)[0] ?? null
}

export function compareReportsByNewestVisitDate(a: Report, b: Report): number {
    const visitDateDifference = getTimeValue(b.visit_date || b.created_at) - getTimeValue(a.visit_date || a.created_at)
    if (visitDateDifference !== 0) return visitDateDifference
    return getTimeValue(b.created_at) - getTimeValue(a.created_at)
}

export function compareReportsByNewestDeletedAt(a: Report, b: Report): number {
    return getTimeValue(b.deleted_at) - getTimeValue(a.deleted_at)
}

function getTimeValue(value?: string) {
    if (!value) return 0
    const time = Date.parse(value)
    return Number.isNaN(time) ? 0 : time
}
