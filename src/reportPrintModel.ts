import type { Report } from './types'

export type ReportPrintRecipient = 'medical' | 'care_manager'
export type ReportPrintTarget = ReportPrintRecipient | 'both'

export interface ResolvedReportRecipient {
    kind: ReportPrintRecipient
    label: string
    name: string
    tel?: string
    fax?: string
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export const getReportPrintRecipients = (target: ReportPrintTarget): ReportPrintRecipient[] => {
    if (target === 'both') return ['medical', 'care_manager']
    return [target]
}

export const resolveReportRecipient = (
    report: Pick<Report,
        | 'medical_institution_name'
        | 'medical_institution_tel'
        | 'medical_institution_fax'
        | 'doctor_name'
        | 'home_care_office'
        | 'home_care_office_tel'
        | 'home_care_office_fax'
        | 'care_manager'
    >,
    kind: ReportPrintRecipient
): ResolvedReportRecipient => {
    if (kind === 'care_manager') {
        const office = cleanText(report.home_care_office)
        const manager = cleanText(report.care_manager)
        const name = office
            ? `${office} ${manager ? `${manager} 様` : '御中'}`
            : manager
                ? `${manager} 様`
                : 'ケアマネ/介護事業所'

        return {
            kind,
            label: 'ケアマネ/介護事業所',
            name,
            tel: cleanText(report.home_care_office_tel),
            fax: cleanText(report.home_care_office_fax)
        }
    }

    const institution = cleanText(report.medical_institution_name)
    const doctor = cleanText(report.doctor_name)
    const name = institution
        ? `${institution}${doctor ? ` ${doctor} 先生` : ' 御中'}`
        : doctor
            ? `${doctor} 先生`
            : '医療機関'

    return {
        kind,
        label: '医療機関',
        name,
        tel: cleanText(report.medical_institution_tel),
        fax: cleanText(report.medical_institution_fax)
    }
}

export const getReportPrintWarnings = (report: Report, target: ReportPrintTarget): string[] => {
    const warnings: string[] = []

    if (hasMissingCareManagerRecipient(report, target)) {
        warnings.push('ケアマネ向けの報告先またはFAX番号が未入力です。今回報告書だけの一時入力を確認してください。')
    }

    if (estimateReportPrintPages(report) > 1) {
        warnings.push('薬剤数または本文量が多いため、1通あたり2枚になる可能性があります。')
    }

    return warnings
}

export const hasMissingCareManagerRecipient = (
    report: Pick<Report,
        | 'home_care_office'
        | 'home_care_office_tel'
        | 'home_care_office_fax'
        | 'care_manager'
    >,
    target: ReportPrintTarget
): boolean => {
    const recipients = getReportPrintRecipients(target)
    if (!recipients.includes('care_manager')) return false

    return !cleanText(report.home_care_office) || !cleanText(report.home_care_office_fax)
}

export const estimateReportPrintPages = (report: Pick<Report,
    | 'chief_complaint'
    | 'medication_instruction'
    | 'side_effects'
    | 'medications_check_list'
    | 'medications_check_list_prn'
>): 1 | 2 => {
    const regularCount = report.medications_check_list?.length ?? 0
    const otherCount = report.medications_check_list_prn?.length ?? 0
    const medicationTextLength = getMedicationTextLength([
        ...(report.medications_check_list ?? []),
        ...(report.medications_check_list_prn ?? [])
    ])
    const textLength = [
        report.chief_complaint,
        report.medication_instruction,
        report.side_effects
    ].filter(Boolean).join('\n').length

    if (regularCount + otherCount >= 12) return 2
    if (textLength >= 520) return 2
    if (medicationTextLength >= 420) return 2
    if (regularCount + otherCount >= 8 && textLength >= 260) return 2
    if (regularCount + otherCount >= 6 && medicationTextLength >= 260) return 2
    return 1
}

export const calculateAgeAtDate = (dob: string, atDate: string): number | '' => {
    if (!DATE_PATTERN.test(dob) || !DATE_PATTERN.test(atDate)) return ''

    const [birthYear, birthMonth, birthDay] = dob.split('-').map(Number)
    const [targetYear, targetMonth, targetDay] = atDate.split('-').map(Number)
    let age = targetYear - birthYear

    if (targetMonth < birthMonth || (targetMonth === birthMonth && targetDay < birthDay)) {
        age -= 1
    }

    return age
}

export const resolvePatientAgeAtVisit = (
    dob: string,
    atDate: string,
    fallbackAge?: number | string | null
): number | '' => {
    const ageAtVisit = calculateAgeAtDate(dob, atDate)
    if (typeof ageAtVisit === 'number' && Number.isFinite(ageAtVisit)) return ageAtVisit
    if (typeof fallbackAge === 'number' && Number.isFinite(fallbackAge)) return fallbackAge
    return ''
}

export const formatPrintDate = (value?: string) => {
    return value ? value.replace(/-/g, '/') : ''
}

const cleanText = (value?: string) => {
    const text = typeof value === 'string' ? value.trim() : ''
    return text || undefined
}

const getMedicationTextLength = (
    medications: NonNullable<Report['medications_check_list']>
) => {
    return medications
        .map(item => [
            item.name,
            item.current_amount,
            item.unit,
            item.notes,
            item.calculated_total_days
        ].filter(Boolean).join(''))
        .join('\n')
        .length
}
