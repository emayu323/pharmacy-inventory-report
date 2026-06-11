import type { Report } from './types.ts'
import {
    calculateRegularMedications,
    carryForwardRegularMedications
} from './medicationCalculations.ts'
import { resolvePatientAgeAtVisit } from './reportPrintModel.ts'

export type ReportDraft = Omit<Report, 'id' | 'created_at' | 'updated_at'>

export type CopiedReportDraft = {
    report: ReportDraft
    patientMemo: string
}

export const createCopiedReportDraft = (
    source: Report,
    options: {
        emptyReport: ReportDraft
        today: string
        pharmacistName: string
    }
): CopiedReportDraft => {
    const rest: Partial<Report> & {
        ai_transcript?: string
        ai_transcript_saved_at?: string
        ai_audio_file_path?: string
        ai_audio_file_name?: string
        ai_audio_mime_type?: string
        ai_audio_saved_at?: string
    } = { ...source }
    delete rest.id
    delete rest.created_at
    delete rest.updated_at
    delete rest.ai_visit_memo
    delete rest.ai_visit_memo_saved_at
    delete rest.ai_transcript
    delete rest.ai_transcript_saved_at
    delete rest.ai_audio_file_path
    delete rest.ai_audio_file_name
    delete rest.ai_audio_mime_type
    delete rest.ai_audio_saved_at
    delete rest.memo

    const carriedRegularMedications = carryForwardRegularMedications(rest.medications_check_list)
    const medicationCalculation = calculateRegularMedications(
        carriedRegularMedications,
        options.today,
        rest.default_prescription_days || options.emptyReport.default_prescription_days
    )
    const patientAgeAtVisit = resolvePatientAgeAtVisit(
        rest.patient_dob || options.emptyReport.patient_dob,
        options.today,
        rest.patient_age_at_visit
    )

    return {
        report: {
            ...options.emptyReport,
            ...rest,
            allergy_history: rest.allergy_history ?? options.emptyReport.allergy_history,
            guidance_recipient: rest.guidance_recipient ?? options.emptyReport.guidance_recipient,
            medication_status: rest.medication_status ?? options.emptyReport.medication_status,
            storage_status: rest.storage_status ?? options.emptyReport.storage_status,
            other_dept_consultation: rest.other_dept_consultation ?? options.emptyReport.other_dept_consultation,
            concomitant_medications: rest.concomitant_medications ?? options.emptyReport.concomitant_medications,
            interaction_status: rest.interaction_status ?? options.emptyReport.interaction_status,
            pharmacy_name: rest.pharmacy_name ?? options.emptyReport.pharmacy_name,
            pharmacy_address: rest.pharmacy_address ?? options.emptyReport.pharmacy_address,
            pharmacy_tel: rest.pharmacy_tel ?? options.emptyReport.pharmacy_tel,
            pharmacy_fax: rest.pharmacy_fax ?? options.emptyReport.pharmacy_fax,
            home_care_office: rest.home_care_office ?? options.emptyReport.home_care_office,
            home_care_office_tel: rest.home_care_office_tel ?? options.emptyReport.home_care_office_tel,
            home_care_office_fax: rest.home_care_office_fax ?? options.emptyReport.home_care_office_fax,
            care_manager: rest.care_manager ?? options.emptyReport.care_manager,
            visit_date: options.today,
            prescription_date: options.today,
            dispensing_date: options.today,
            next_visit_date: '',
            medications_check_list: medicationCalculation.items,
            regular_medication_supply_until: medicationCalculation.earliestSupplyUntil,
            patient_age_at_visit: typeof patientAgeAtVisit === 'number' ? patientAgeAtVisit : undefined,
            chief_complaint: '',
            medication_instruction: '',
            side_effects: '',
            memo: '',
            pharmacist_name: options.pharmacistName
        },
        patientMemo: ''
    }
}
