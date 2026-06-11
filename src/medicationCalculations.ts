import type { MedicationCheckItem } from './types'

export type RegularMedicationCalculation = {
    items: MedicationCheckItem[]
    earliestSupplyUntil: string
}

const DAY_MS = 24 * 60 * 60 * 1000

export const parsePositiveNumber = (value: string | number | undefined): number => {
    if (value === undefined || value === '') return 0
    const parsed = Number(value)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

const parseDateOnly = (value: string | undefined): Date | null => {
    if (!value) return null
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
    if (!match) return null
    const [, year, month, day] = match
    return new Date(Number(year), Number(month) - 1, Number(day))
}

const formatDateOnly = (date: Date): string => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

const addDays = (date: Date, days: number): Date => {
    const next = new Date(date)
    next.setDate(next.getDate() + days)
    return next
}

export const calculatePreviousRemainingDays = (
    visitDateValue: string,
    previousSupplyUntilValue?: string
): number => {
    const visitDate = parseDateOnly(visitDateValue)
    const previousSupplyUntil = parseDateOnly(previousSupplyUntilValue)
    if (!visitDate || !previousSupplyUntil) return 0

    const diffDays = Math.floor((previousSupplyUntil.getTime() - visitDate.getTime()) / DAY_MS) + 1
    return Math.max(0, diffDays)
}

export const calculateSupplyUntil = (
    visitDateValue: string,
    totalDays: number
): string => {
    const visitDate = parseDateOnly(visitDateValue)
    if (!visitDate || totalDays <= 0) return ''
    return formatDateOnly(addDays(visitDate, totalDays - 1))
}

export const calculateRegularMedicationItem = (
    item: MedicationCheckItem,
    visitDate: string,
    defaultPrescriptionDays?: string
): MedicationCheckItem => {
    const prescriptionDays = parsePositiveNumber(item.prescription_days || defaultPrescriptionDays)
    const calculatedPreviousRemainingDays = calculatePreviousRemainingDays(visitDate, item.previous_supply_until)
    const actualRemainingDays = item.actual_remaining_days === undefined || item.actual_remaining_days === ''
        ? null
        : parsePositiveNumber(item.actual_remaining_days)
    const previousRemainingDays = actualRemainingDays ?? calculatedPreviousRemainingDays
    const totalDays = previousRemainingDays + prescriptionDays
    const supplyUntil = calculateSupplyUntil(visitDate, totalDays)

    return {
        ...item,
        prescription_days: item.prescription_days || defaultPrescriptionDays || '',
        calculated_previous_remaining_days: String(calculatedPreviousRemainingDays),
        calculated_total_days: totalDays > 0 ? String(totalDays) : '',
        calculated_supply_until: supplyUntil,
        current_amount: totalDays > 0 ? String(totalDays) : '',
        next_required_amount: supplyUntil,
        unit: item.unit || '日分'
    }
}

export const calculateRegularMedications = (
    items: MedicationCheckItem[] | undefined,
    visitDate: string,
    defaultPrescriptionDays?: string
): RegularMedicationCalculation => {
    const calculatedItems = (items || []).map(item =>
        calculateRegularMedicationItem(item, visitDate, defaultPrescriptionDays)
    )

    const earliestSupplyUntil = calculatedItems
        .map(item => item.calculated_supply_until)
        .filter((value): value is string => Boolean(value))
        .sort()[0] || ''

    return {
        items: calculatedItems,
        earliestSupplyUntil
    }
}

export const carryForwardRegularMedications = (
    items: MedicationCheckItem[] | undefined
): MedicationCheckItem[] => {
    return (items || []).map(item => ({
        ...item,
        previous_supply_until: item.calculated_supply_until || item.previous_supply_until || '',
        prescription_days: '',
        actual_remaining_days: '',
        actual_remaining_reason: '',
        calculated_previous_remaining_days: '',
        calculated_total_days: '',
        calculated_supply_until: '',
        current_amount: '',
        next_required_amount: ''
    }))
}
