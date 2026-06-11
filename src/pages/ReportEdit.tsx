import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, Bot, CheckCircle2, Save, ChevronDown, ChevronRight, Printer, Undo2 } from 'lucide-react'
import { useState, useRef, useEffect, useCallback, type ChangeEvent, type FormEvent } from 'react'
import { useReactToPrint } from 'react-to-print'
import { ReportPrint } from '../components/ReportPrint'
import type { AppSettings, Patient, Report, TextTemplate, TextTemplateTarget } from '../types'
import { getReportById, isLocalReportStorage, saveReport } from '../reportRepository'
import { getPatientById, updatePatient } from '../patientRepository'
import { findInstitutionByName } from '../institutionRepository'
import { DEFAULT_APP_SETTINGS, getAppSettings } from '../appSettingsRepository'
import { listTextTemplates } from '../templateRepository'
import MedicationListForm from '../components/MedicationListForm'
import { useAuth } from '../contexts/authContext'
import toast from 'react-hot-toast'
import { calculateAge } from '../utils'
import {
    calculateRegularMedications
} from '../medicationCalculations'
import { searchDrugMaster, type DrugMasterEntry } from '../drugMaster'
import {
    getReportPrintRecipients,
    getReportPrintWarnings,
    hasMissingCareManagerRecipient,
    estimateReportPrintPages,
    resolvePatientAgeAtVisit,
    type ReportPrintTarget
} from '../reportPrintModel'
import {
    buildPatientMasterUpdateFromReport,
    getPatientMasterDiffs,
    type PatientMasterDiff
} from '../reportPatientMasterSync'
import {
    canAutoSaveReportDraft,
    createReportAutoSaveFingerprint
} from '../reportAutoSave'
import { buildReportInputForSave as createReportInputForSave } from '../reportSaveModel'
import {
    applyAiDraftFieldPatch,
    createAiDraftFieldPatch,
    createRuleBasedAiDraft,
    getAiDraftFieldStates,
    revertAiDraftFieldPatch,
    type AiDraft,
    type AiDraftApplyMode,
    type AiDraftFieldPatch,
    type AiDraftTarget
} from '../aiDraft'
import { getNativeBridge } from '../nativeBridge'
import { createCopiedReportDraft } from '../reportCopy'

type FormFieldChange =
    | ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
    | { target: { name: string; value: string } }

type TemplateInsertMode = 'append' | 'replace'
type AiDraftState = 'idle' | 'processing' | 'ready'
type PatientMasterSaveChoice = 'report_only' | 'update_patient'

const AI_DRAFT_TARGET_LABELS: Record<AiDraftTarget, string> = {
    chief_complaint: '主訴等',
    medication_instruction: '服薬指導内容'
}

const formatDateForUi = (value?: string) => value ? value.replace(/-/g, '/') : ''

const getRegularMedicationSummary = (items: Report['medications_check_list'] = []) => {
    const candidates = items
        .filter(item => item.calculated_supply_until)
        .sort((a, b) => String(a.calculated_supply_until).localeCompare(String(b.calculated_supply_until)))
    const earliest = candidates[0]
    return {
        supplyUntil: earliest?.calculated_supply_until || '',
        name: earliest?.name || '',
        totalDays: earliest?.calculated_total_days || ''
    }
}

// Mock for edit, would fetch based on ID in real app
const EMPTY_REPORT: Omit<Report, 'id' | 'created_at' | 'updated_at'> = {
    patient_name: '',
    patient_dob: '',
    patient_gender: 'female',
    doctor_name: '',
    medical_institution_name: '',
    medical_institution_tel: '',
    medical_institution_fax: '',
    home_care_office: '',
    home_care_office_tel: '',
    home_care_office_fax: '',
    care_manager: '',
    pharmacist_name: '',
    prescription_date: new Date().toISOString().split('T')[0],
    dispensing_date: new Date().toISOString().split('T')[0],
    visit_date: new Date().toISOString().split('T')[0],
    chief_complaint: '',
    medication_instruction: '',
    side_effects: '',
    next_visit_date: '',
    medications_check_list: [],
    medications_check_list_prn: [],
    default_prescription_days: '28',
    regular_medication_supply_until: '',

    // Default Values for New Fields
    allergy_history: 'なし',
    guidance_recipient: '家族',
    medication_status: '良好',
    storage_status: '良好',
    other_dept_consultation: 'なし',
    concomitant_medications: 'なし',

    interaction_status: '併用薬/飲食物による相互作用なし',

    pharmacy_name: '',
    pharmacy_address: '',
    pharmacy_tel: '',
    pharmacy_fax: '',
}

const buildReportSnapshot = (
    report: Omit<Report, 'id' | 'created_at' | 'updated_at'>
): Omit<Report, 'id' | 'created_at' | 'updated_at'> => {
    const ageAtVisit = resolvePatientAgeAtVisit(
        report.patient_dob,
        report.visit_date,
        report.patient_age_at_visit
    )
    return {
        ...report,
        patient_age_at_visit: typeof ageAtVisit === 'number' ? ageAtVisit : report.patient_age_at_visit
    }
}

const EditableSelect = ({ label, name, value, options, onChange }: {
    label: string,
    name: string,
    value: string,
    options: string[],
    onChange: (e: FormFieldChange) => void
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelect = (val: string) => {
        onChange({ target: { name, value: val } });
        setIsOpen(false);
    };

    return (
        <div ref={containerRef} style={{ position: 'relative' }}>
            <label className="label">{label}</label>
            <div style={{ position: 'relative' }}>
                <input
                    type="text"
                    name={name}
                    className="input"
                    value={value || ''}
                    onChange={onChange}
                    onFocus={() => setIsOpen(true)}
                    placeholder="選択または入力..."
                    style={{ paddingRight: '2.5rem' }}
                    autoComplete="off"
                />
                <button
                    type="button"
                    onClick={() => setIsOpen(!isOpen)}
                    aria-label={`${label}の候補を開く`}
                    style={{
                        position: 'absolute',
                        right: '0',
                        top: '0',
                        bottom: '0',
                        padding: '0 0.75rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--color-text-muted)',
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer'
                    }}
                >
                    <ChevronDown size={16} style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }} />
                </button>

                {isOpen && (
                    <ul style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        backgroundColor: 'var(--color-surface)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-md)',
                        marginTop: '0.25rem',
                        maxHeight: '200px',
                        overflowY: 'auto',
                        boxShadow: 'var(--shadow-lg)',
                        zIndex: 100,
                        listStyle: 'none',
                        padding: '0.25rem 0'
                    }}>
                        {options.map((opt) => (
                            <li
                                key={opt}
                                onClick={() => handleSelect(opt)}
                                style={{
                                    padding: '0.5rem 1rem',
                                    cursor: 'pointer',
                                    fontSize: '0.925rem',
                                    transition: 'background-color 0.1s',
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--color-background)'}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                            >
                                {opt}
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
};

export default function ReportEdit() {
    const { id } = useParams()
    const navigate = useNavigate()
    const location = useLocation()
    const { user } = useAuth()
    // const isEdit = Boolean(id) // Unused for now

    // State for form
    const [formData, setFormData] = useState(EMPTY_REPORT)
    const [appSettings, setAppSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS)
    const [drugOptions, setDrugOptions] = useState<DrugMasterEntry[]>([])
    const [textTemplates, setTextTemplates] = useState<TextTemplate[]>([])
    const [sourcePatient, setSourcePatient] = useState<Patient | null>(null)
    const [patientMasterDiffs, setPatientMasterDiffs] = useState<PatientMasterDiff[]>([])
    const [isPatientMasterDialogOpen, setIsPatientMasterDialogOpen] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [saveStatus, setSaveStatus] = useState<'idle' | 'dirty' | 'saving' | 'saved' | 'error'>('idle')
    const [activeReportId, setActiveReportId] = useState<string | undefined>(id)
    const [patientMemo, setPatientMemo] = useState('')
    const [isBasicInfoOpen, setIsBasicInfoOpen] = useState(false) // Default collapsed
    const [isLocalStorageMode] = useState(isLocalReportStorage)
    const [printTarget, setPrintTarget] = useState<ReportPrintTarget>('both')
    const [aiVisitMemo, setAiVisitMemo] = useState('')
    const [aiDraft, setAiDraft] = useState<AiDraft | null>(null)
    const [aiDraftChoices, setAiDraftChoices] = useState<Partial<Record<AiDraftTarget, AiDraftApplyMode>>>({})
    const [aiDraftAppliedFields, setAiDraftAppliedFields] = useState<Partial<Record<AiDraftTarget, AiDraftFieldPatch>>>({})
    const [aiDraftState, setAiDraftState] = useState<AiDraftState>('idle')
    const [aiError, setAiError] = useState('')
    const printRef = useRef<HTMLDivElement>(null)
    const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const lastAutoSaveFingerprintRef = useRef('')
    const changedDuringSaveRef = useRef(false)
    const pharmacistDisplayName = typeof user?.user_metadata?.display_name === 'string'
        ? user.user_metadata.display_name
        : ''
    const collapsedPatientLabel = formData.patient_name && formData.patient_dob
        ? `${formData.patient_name} 様 (${resolvePatientAgeAtVisit(
            formData.patient_dob,
            formData.visit_date,
            calculateAge(formData.patient_dob)
        )}歳)`
        : '患者未選択'
    const saveStatusLabel = {
        idle: '',
        dirty: '未保存あり',
        saving: '保存中',
        saved: '保存済み',
        error: '保存失敗'
    }[saveStatus]

    const markUnsaved = () => {
        setSaveStatus(prev => {
            if (prev === 'saving') {
                changedDuringSaveRef.current = true
                return prev
            }
            return 'dirty'
        })
    }

    const updateRegularMedications = (items: Report['medications_check_list']) => {
        markUnsaved()
        setFormData(prev => {
            const calculation = calculateRegularMedications(
                items || [],
                prev.visit_date,
                prev.default_prescription_days
            )

            return {
                ...prev,
                medications_check_list: calculation.items,
                regular_medication_supply_until: calculation.earliestSupplyUntil
            }
        })
    }

    const getTemplatesForTarget = (target: TextTemplateTarget) => {
        return textTemplates.filter(template => template.target === target)
    }

    const applyTextTemplate = (target: TextTemplateTarget, template: TextTemplate, mode: TemplateInsertMode) => {
        setFormData(prev => {
            const currentValue = String(prev[target] || '')
            const nextValue = mode === 'replace'
                ? template.body
                : [currentValue, template.body].filter(Boolean).join('\n')
            return { ...prev, [target]: nextValue }
        })
        markUnsaved()
    }

    const handleCreateAiDraftFromVisitMemo = async () => {
        setAiError('')
        if (!appSettings.ai_mode_enabled) {
            toast.error('AIモードがOFFです')
            return
        }
        if (!aiVisitMemo.trim()) {
            toast.error('訪問メモを入力してください')
            return
        }

        try {
            setAiDraftState('processing')
            const bridge = getNativeBridge()
            const draft = bridge?.ai
                ? await bridge.ai.createDraftFromVisitMemo(aiVisitMemo)
                : createRuleBasedAiDraft(aiVisitMemo)
            setAiDraft(draft)
            setAiDraftChoices({})
            setAiDraftAppliedFields({})
            toast.success('AI下書きを作成しました')
            setAiDraftState('ready')
        } catch (error) {
            console.error(error)
            const message = error instanceof Error ? error.message : 'AI下書きを作成できませんでした'
            setAiError(message)
            toast.error(message)
            setAiDraftState('idle')
        } finally {
            setAiDraftState(current => current === 'processing' ? 'idle' : current)
        }
    }

    const handleApplyAiDraftField = (target: AiDraftTarget, mode: AiDraftApplyMode) => {
        if (!aiDraft) return
        const patch = createAiDraftFieldPatch(formData, aiDraft, target, mode)
        if (patch) {
            setFormData(prev => applyAiDraftFieldPatch(prev, patch))
            setAiDraftAppliedFields(prev => ({ ...prev, [target]: patch }))
            markUnsaved()
        } else {
            setAiDraftAppliedFields(prev => {
                const next = { ...prev }
                delete next[target]
                return next
            })
        }
        setAiDraftChoices(prev => ({ ...prev, [target]: mode }))
        toast.success(mode === 'cancel' ? 'AI下書きを反映しませんでした' : 'AI下書きを反映しました')
    }

    const handleUndoAiDraftField = (target: AiDraftTarget) => {
        const patch = aiDraftAppliedFields[target]
        if (!patch) return

        const currentValue = String(formData[target] || '').trim()
        if (currentValue !== patch.afterValue) {
            toast.error('反映後に欄が編集されているため、自動では戻せません')
            return
        }

        setFormData(prev => revertAiDraftFieldPatch(prev, patch))
        markUnsaved()
        setAiDraftAppliedFields(prev => {
            const next = { ...prev }
            delete next[target]
            return next
        })
        setAiDraftChoices(prev => {
            const next = { ...prev }
            delete next[target]
            return next
        })
        toast.success('AI反映を元に戻しました')
    }

    const renderTemplateControls = (target: TextTemplateTarget) => {
        const templates = getTemplatesForTarget(target)
        if (templates.length === 0) return null

        return (
            <div className="template-chip-list" aria-label="定型文">
                {templates.map(template => (
                    <div key={template.id} className="template-chip-group">
                        <button
                            type="button"
                            className="template-chip"
                            onClick={() => applyTextTemplate(target, template, 'append')}
                            title={`${template.title}を追記`}
                        >
                            {template.title}
                        </button>
                        <button
                            type="button"
                            className="template-chip template-chip-replace"
                            onClick={() => applyTextTemplate(target, template, 'replace')}
                            title={`${template.title}で置換`}
                        >
                            置換
                        </button>
                    </div>
                ))}
            </div>
        )
    }

    const handleDrugSearch = (query: string) => {
        if (!query || query.length < 1) {
            setDrugOptions([])
            return
        }

        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)

        searchTimeoutRef.current = setTimeout(async () => {
            try {
                const localResults = await searchDrugMaster(query)
                if (localResults.length > 0) {
                    setDrugOptions(localResults)
                    return
                }
            } catch (localSearchError) {
                console.warn('Local drug master search failed', localSearchError)
            }
            setDrugOptions([])
        }, 300)
    }

    const handlePrint = useReactToPrint({
        contentRef: printRef,
        documentTitle: `居宅療養管理指導報告書_${formData.patient_name || '名称未設定'}`,
    })

    // Hack: We need a full Report object for ReportPrint but formData is Partial
    const reportForPrint = {
        ...buildReportSnapshot(formData),
        id: id || 'preview',
        created_at: '',
        updated_at: ''
    } as Report
    const printRecipients = getReportPrintRecipients(printTarget)
    const printWarnings = getReportPrintWarnings(reportForPrint, printTarget)
    const isCareManagerRecipientMissing = hasMissingCareManagerRecipient(reportForPrint, printTarget)
    const reportPageCount = estimateReportPrintPages(reportForPrint)
    const regularMedicationSummary = getRegularMedicationSummary(formData.medications_check_list || [])
    const patientAgeAtVisit = resolvePatientAgeAtVisit(
        formData.patient_dob,
        formData.visit_date,
        formData.patient_age_at_visit
    )
    const patientSummaryLabel = formData.patient_name
        ? `${formData.patient_name} 様${typeof patientAgeAtVisit === 'number' ? ` / ${patientAgeAtVisit}歳` : ''}`
        : '患者未選択'
    const careManagerMissing = !String(formData.care_manager || '').trim()
    const visitInfoSummary = [
        formData.visit_date ? `訪問 ${formatDateForUi(formData.visit_date)}` : '',
        formData.prescription_date ? `処方 ${formatDateForUi(formData.prescription_date)}` : '',
        formData.pharmacist_name ? `担当 ${formData.pharmacist_name}` : ''
    ].filter(Boolean).join(' / ') || '未入力'
    const statusInfoSummary = [
        formData.guidance_recipient ? `対象 ${formData.guidance_recipient}` : '',
        formData.medication_status ? `服薬 ${formData.medication_status}` : '',
        formData.storage_status ? `保管 ${formData.storage_status}` : ''
    ].filter(Boolean).join(' / ') || '未入力'

    const renderReportActions = (className = '') => (
        <div className={`report-action-bar ${className}`.trim()}>
            <div className="print-options" aria-label="印刷対象">
                <button
                    type="button"
                    className={`btn ${printTarget === 'both' ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setPrintTarget('both')}
                >
                    2通
                </button>
                <button
                    type="button"
                    className={`btn ${printTarget === 'medical' ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setPrintTarget('medical')}
                >
                    医療機関
                </button>
                <button
                    type="button"
                    className={`btn ${printTarget === 'care_manager' ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setPrintTarget('care_manager')}
                >
                    ケアマネ
                </button>
            </div>
            {saveStatusLabel && (
                <span className={`report-save-state report-save-state-${saveStatus}`}>
                    {saveStatusLabel}
                </span>
            )}
            <button type="button" onClick={handlePrintClick} className="btn btn-ghost report-print-button">
                <Printer size={18} />
                印刷 / PDFプレビュー
            </button>
            <button type="button" onClick={() => navigate(-1)} className="btn btn-ghost">キャンセル</button>
            <button type="submit" className="btn btn-primary report-save-button" disabled={isSaving}>
                <Save size={18} />
                {isSaving ? '保存中...' : '保存する'}
            </button>
        </div>
    )

    const handlePrintClick = () => {
        if (isCareManagerRecipientMissing) {
            setIsBasicInfoOpen(true)
            window.requestAnimationFrame(() => {
                document.getElementById('section-basic')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            })
            toast('ケアマネ向けの報告先を入力してください')
            return
        }

        if (printWarnings.length > 0) {
            toast('印刷前の確認事項があります')
        }
        handlePrint()
    }

    useEffect(() => {
        let cancelled = false
        const fetchTemplates = async () => {
            const templates = await listTextTemplates()
            if (!cancelled) setTextTemplates(templates)
        }

        fetchTemplates()
        return () => {
            cancelled = true
        }
    }, [])

    useEffect(() => {
        let cancelled = false
        const fillDefaultPharmacySettings = async () => {
            const settings = await getAppSettings()
            if (cancelled) return
            setAppSettings(settings)
            setFormData(prev => ({
                ...prev,
                pharmacy_name: prev.pharmacy_name || settings.pharmacy_name,
                pharmacy_address: prev.pharmacy_address || settings.pharmacy_address,
                pharmacy_tel: prev.pharmacy_tel || settings.pharmacy_tel,
                pharmacy_fax: prev.pharmacy_fax || settings.pharmacy_fax
            }))
        }

        fillDefaultPharmacySettings()
        return () => {
            cancelled = true
        }
    }, [])

    useEffect(() => {
        setActiveReportId(id)
    }, [id])

    useEffect(() => {
        return () => {
            if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
        }
    }, [])

    const loadSourcePatient = useCallback(async (patientId?: string) => {
        if (!patientId) {
            setSourcePatient(null)
            return null
        }

        try {
            const patient = await getPatientById(patientId)
            setSourcePatient(patient)
            return patient
        } catch (error) {
            console.error('Patient master load failed', error)
            setSourcePatient(null)
            return null
        }
    }, [])

    const fetchReport = useCallback(async (reportId: string) => {
        try {
            const data = await getReportById(reportId)
            if (!data) {
                alert('報告書が見つかりません')
                return
            }
            const {
                id: _loadedReportId,
                created_at: _loadedCreatedAt,
                updated_at: _loadedUpdatedAt,
                ...loadedReportInput
            } = data
            void _loadedReportId
            void _loadedCreatedAt
            void _loadedUpdatedAt
            setActiveReportId(reportId)
            lastAutoSaveFingerprintRef.current = createReportAutoSaveFingerprint(buildReportSnapshot(loadedReportInput))
            setSaveStatus('idle')

            const regularMedicationCalculation = calculateRegularMedications(
                data.medications_check_list || [],
                data.visit_date || EMPTY_REPORT.visit_date,
                data.default_prescription_days || EMPTY_REPORT.default_prescription_days
            )

            setFormData({
                ...EMPTY_REPORT,
                ...data,
                // Ensure defaults for new fields if null in DB (old records)
                allergy_history: data.allergy_history ?? EMPTY_REPORT.allergy_history,
                guidance_recipient: data.guidance_recipient ?? EMPTY_REPORT.guidance_recipient,
                medication_status: data.medication_status ?? EMPTY_REPORT.medication_status,
                storage_status: data.storage_status ?? EMPTY_REPORT.storage_status,
                other_dept_consultation: data.other_dept_consultation ?? EMPTY_REPORT.other_dept_consultation,
                concomitant_medications: data.concomitant_medications ?? EMPTY_REPORT.concomitant_medications,

                interaction_status: data.interaction_status ?? EMPTY_REPORT.interaction_status,

                pharmacy_name: data.pharmacy_name ?? EMPTY_REPORT.pharmacy_name,
                pharmacy_address: data.pharmacy_address ?? EMPTY_REPORT.pharmacy_address,
                pharmacy_tel: data.pharmacy_tel ?? EMPTY_REPORT.pharmacy_tel,
                pharmacy_fax: data.pharmacy_fax ?? EMPTY_REPORT.pharmacy_fax,

                medical_institution_name: data.medical_institution_name ?? EMPTY_REPORT.medical_institution_name,
                medical_institution_tel: data.medical_institution_tel ?? EMPTY_REPORT.medical_institution_tel,
                medical_institution_fax: data.medical_institution_fax ?? EMPTY_REPORT.medical_institution_fax,
                home_care_office: data.home_care_office ?? EMPTY_REPORT.home_care_office,
                home_care_office_tel: data.home_care_office_tel ?? EMPTY_REPORT.home_care_office_tel,
                home_care_office_fax: data.home_care_office_fax ?? EMPTY_REPORT.home_care_office_fax,
                care_manager: data.care_manager ?? EMPTY_REPORT.care_manager,
                patient_age_at_visit: data.patient_age_at_visit ?? EMPTY_REPORT.patient_age_at_visit,

                medications_check_list: regularMedicationCalculation.items,
                regular_medication_supply_until: regularMedicationCalculation.earliestSupplyUntil,
                medications_check_list_prn: data.medications_check_list_prn || []
            })
            // Load the snapshot memo if it exists
            if (data.memo) setPatientMemo(data.memo)
            else setPatientMemo('')
            setAiVisitMemo(data.ai_visit_memo || (data as Report & { ai_transcript?: string }).ai_transcript || '')
            void loadSourcePatient(data.patient_id)
        } catch (error) {
            console.error(error)
            alert('読み込みエラー')
        }
    }, [loadSourcePatient])

    useEffect(() => {
        queueMicrotask(() => {
            if (id) {
                fetchReport(id)
            } else if (location.state && location.state.copyFrom) {
                const source = location.state.copyFrom as Report
                const today = new Date().toISOString().split('T')[0]
                const copied = createCopiedReportDraft(source, {
                    emptyReport: EMPTY_REPORT,
                    today,
                    pharmacistName: pharmacistDisplayName
                })

                setFormData(copied.report)
                setPatientMemo(copied.patientMemo)
                setAiVisitMemo('')
                setActiveReportId(undefined)
                lastAutoSaveFingerprintRef.current = ''
                setSaveStatus('idle')
                void loadSourcePatient(source.patient_id)
        } else if (location.state && location.state.patientId) {
            // New Report from Patient Chart
            setFormData(prev => ({
                ...prev,
                patient_name: location.state.patientName,
                patient_dob: location.state.patientDob,
                patient_gender: location.state.patientGender,

                patient_id: location.state.patientId,
                visit_date: new Date().toISOString().split('T')[0],
                prescription_date: new Date().toISOString().split('T')[0],
                dispensing_date: new Date().toISOString().split('T')[0],
                pharmacist_name: pharmacistDisplayName
            }))
            setPatientMemo('') // Start empty for new report
            setAiVisitMemo('')
            setActiveReportId(undefined)
            lastAutoSaveFingerprintRef.current = ''
            setSaveStatus('idle')

            // Fetch Related Info (Pharmacy & Medical Institution) from Patient -> Institution
            const fetchRelatedInfo = async () => {
                // First get patient's registered pharmacy and medical institution
                const patientData = await getPatientById(location.state.patientId)

                if (patientData) {
                    setSourcePatient(patientData)
                    const updates: Partial<Report> = {}

                    if (patientData.pharmacy_name) {
                        updates.pharmacy_name = patientData.pharmacy_name
                        const pharmacy = await findInstitutionByName(patientData.pharmacy_name, 'pharmacy')

                        if (pharmacy) {
                            updates.pharmacy_address = pharmacy.address || ''
                            updates.pharmacy_tel = pharmacy.tel || ''
                            updates.pharmacy_fax = pharmacy.fax || ''
                        }
                    }

                    if (patientData.medical_institution_name) {
                        updates.medical_institution_name = patientData.medical_institution_name
                        const medicalInstitution = await findInstitutionByName(patientData.medical_institution_name)

                        if (medicalInstitution) {
                            updates.medical_institution_tel = medicalInstitution.tel || ''
                            updates.medical_institution_fax = medicalInstitution.fax || ''
                        }
                    }

                    if (patientData.home_care_office) {
                        updates.home_care_office = patientData.home_care_office
                        const careOffice = await findInstitutionByName(patientData.home_care_office, 'care_office')

                        if (careOffice) {
                            updates.home_care_office_tel = careOffice.tel || ''
                            updates.home_care_office_fax = careOffice.fax || ''
                        }
                    }

                    if (patientData.care_manager) {
                        updates.care_manager = patientData.care_manager
                    }

                    if (Object.keys(updates).length > 0) {
                        setFormData(prev => ({ ...prev, ...updates }))
                    }
                }
            }
            fetchRelatedInfo()
        } else {
            setSourcePatient(null)
            setActiveReportId(undefined)
            lastAutoSaveFingerprintRef.current = ''
        }
        })
    }, [id, location.state, pharmacistDisplayName, fetchReport, isLocalStorageMode, loadSourcePatient])

    const buildReportInputForSave = useCallback((): Omit<Report, 'id' | 'created_at' | 'updated_at'> => {
        return createReportInputForSave({
            formData: buildReportSnapshot(formData),
            patientMemo,
            aiVisitMemo
        })
    }, [aiVisitMemo, formData, patientMemo])

    const runAutoSave = useCallback(async () => {
        if (isSaving || isPatientMasterDialogOpen) return

        const reportInput = buildReportInputForSave()
        if (!canAutoSaveReportDraft(reportInput, sourcePatient)) return

        const fingerprint = createReportAutoSaveFingerprint(reportInput)
        if (fingerprint === lastAutoSaveFingerprintRef.current) return

        setSaveStatus('saving')
        try {
            const savedReport = await saveReport(activeReportId || id, reportInput)
            setActiveReportId(savedReport.id)
            lastAutoSaveFingerprintRef.current = fingerprint
            if (changedDuringSaveRef.current) {
                changedDuringSaveRef.current = false
                setSaveStatus('dirty')
            } else {
                setSaveStatus('saved')
            }
        } catch (error) {
            console.error('Auto save failed', error)
            setSaveStatus('error')
            toast.error('自動保存に失敗しました')
        }
    }, [activeReportId, buildReportInputForSave, id, isPatientMasterDialogOpen, isSaving, sourcePatient])

    useEffect(() => {
        if (saveStatus !== 'dirty' || isSaving || isPatientMasterDialogOpen) return

        const reportInput = buildReportInputForSave()
        if (!canAutoSaveReportDraft(reportInput, sourcePatient)) return

        const fingerprint = createReportAutoSaveFingerprint(reportInput)
        if (fingerprint === lastAutoSaveFingerprintRef.current) return

        if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
        autoSaveTimerRef.current = setTimeout(() => {
            autoSaveTimerRef.current = null
            void runAutoSave()
        }, 2000)

        return () => {
            if (autoSaveTimerRef.current) {
                clearTimeout(autoSaveTimerRef.current)
                autoSaveTimerRef.current = null
            }
        }
    }, [buildReportInputForSave, isPatientMasterDialogOpen, isSaving, runAutoSave, saveStatus, sourcePatient])

    const persistReport = async (choice: PatientMasterSaveChoice) => {
        if (isSaving) return
        setIsSaving(true)
        setSaveStatus('saving')
        try {
            const savedReport = await saveReport(activeReportId || id, buildReportInputForSave())
            setActiveReportId(savedReport.id)
            lastAutoSaveFingerprintRef.current = createReportAutoSaveFingerprint(buildReportInputForSave())

            if (choice === 'update_patient' && sourcePatient && savedReport.patient_id === sourcePatient.id) {
                const diffs = patientMasterDiffs.length > 0
                    ? patientMasterDiffs
                    : getPatientMasterDiffs(sourcePatient, savedReport)
                if (diffs.length > 0) {
                    const patientUpdate = buildPatientMasterUpdateFromReport(savedReport, diffs)
                    const updatedPatient = await updatePatient(sourcePatient.id, patientUpdate)
                    setSourcePatient(updatedPatient)
                }
            }

            if (changedDuringSaveRef.current) {
                changedDuringSaveRef.current = false
                setSaveStatus('dirty')
            } else {
                setSaveStatus('saved')
            }
            setIsPatientMasterDialogOpen(false)
            setPatientMasterDiffs([])
            toast.success('保存しました')
            navigate(isLocalStorageMode ? `/reports/${savedReport.id}` : '/reports')
        } catch (error) {
            console.error(error)
            setSaveStatus('error')
            toast.error('保存に失敗しました')
        } finally {
            setIsSaving(false)
        }
    }

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault()
        if (isSaving) return

        const reportInput = buildReportInputForSave()
        const diffs = sourcePatient && reportInput.patient_id === sourcePatient.id
            ? getPatientMasterDiffs(sourcePatient, reportInput)
            : []
        if (diffs.length > 0) {
            setPatientMasterDiffs(diffs)
            setIsPatientMasterDialogOpen(true)
            return
        }

        await persistReport('report_only')
    }

    const handleChange = (e: FormFieldChange) => {
        const { name, value } = e.target
        markUnsaved()
        setFormData(prev => {
            const next = { ...prev, [name]: value }

            if (name === 'visit_date' || name === 'default_prescription_days') {
                const calculation = calculateRegularMedications(
                    next.medications_check_list || [],
                    next.visit_date,
                    next.default_prescription_days
                )
                next.medications_check_list = calculation.items
                next.regular_medication_supply_until = calculation.earliestSupplyUntil
            }

            return next
        })
    }

    const scrollToSection = (id: string) => {
        const element = document.getElementById(id);
        if (element) {
            const offset = 80; // Offset for sticky headers if any
            const elementPosition = element.getBoundingClientRect().top;
            const offsetPosition = elementPosition + window.pageYOffset - offset;
            window.scrollTo({
                top: offsetPosition,
                behavior: "smooth"
            });
        }
    }

    const aiDraftFieldStates = aiDraft ? getAiDraftFieldStates(formData, aiDraft) : []

    return (
        <div>
            <div className="report-sticky-header" style={{
                marginBottom: '1.5rem',
                position: 'sticky',
                top: 0,
                zIndex: 40,
                backgroundColor: 'var(--color-background)',
                margin: '0 -1rem 1.5rem -1rem',
                padding: '1rem 1rem 0.5rem 1rem',
                borderBottom: '1px solid var(--color-border)'
            }}>
                <button onClick={() => navigate(-1)} className="btn btn-ghost" style={{ paddingLeft: 0, marginBottom: '0.5rem' }}>
                    <ArrowLeft size={18} />
                    戻る
                </button>
                <div className="report-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 600 }}>
                        {id ? '報告書編集' : '新規報告書作成'}
                    </h2>

                    {/* Quick Navigation Bar */}
                    <div style={{
                        display: 'flex',
                        gap: '0.5rem',
                        overflowX: 'auto',
                        padding: '0.5rem',
                        background: 'var(--color-surface)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-md)',
                        boxShadow: 'var(--shadow-sm)',
                        maxWidth: '100%',
                        whiteSpace: 'nowrap'
                    }} className="report-quick-nav no-scrollbar">
                        <button type="button" onClick={() => scrollToSection('section-basic')} className="btn btn-ghost" style={{ fontSize: '0.8rem', padding: '0.25rem 0.5rem', height: 'auto' }}>基本情報</button>
                        <button type="button" onClick={() => scrollToSection('section-visit')} className="btn btn-ghost" style={{ fontSize: '0.8rem', padding: '0.25rem 0.5rem', height: 'auto' }}>訪問・処方</button>
                        <button type="button" onClick={() => scrollToSection('section-status')} className="btn btn-ghost" style={{ fontSize: '0.8rem', padding: '0.25rem 0.5rem', height: 'auto' }}>状況確認</button>
                        <button type="button" onClick={() => scrollToSection('section-meds-reg')} className="btn btn-ghost" style={{ fontSize: '0.8rem', padding: '0.25rem 0.5rem', height: 'auto' }}>残薬(定期)</button>
                        <button type="button" onClick={() => scrollToSection('section-meds-prn')} className="btn btn-ghost" style={{ fontSize: '0.8rem', padding: '0.25rem 0.5rem', height: 'auto' }}>残薬(臨時)</button>
                        <button type="button" onClick={() => scrollToSection('section-plan')} className="btn btn-ghost" style={{ fontSize: '0.8rem', padding: '0.25rem 0.5rem', height: 'auto' }}>指導内容</button>
                        <button type="button" onClick={() => scrollToSection('section-future-plan')} className="btn btn-ghost" style={{ fontSize: '0.8rem', padding: '0.25rem 0.5rem', height: 'auto' }}>計画</button>
                    </div>
                </div>
            </div>

            <form
                onSubmit={handleSubmit}
                className="report-edit-form"
                onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        // Allow Enter in Textareas, prevent in Inputs (except submit button which handles itself)
                        if (e.target instanceof HTMLTextAreaElement) return;
                        e.preventDefault();
                    }
                }}
            >
                <div className="report-edit-layout">
                    <div className="report-edit-main">

                {/* 基本情報 */}
                {/* 基本情報 */}
                <section id="section-basic" className="card" style={{ padding: '0.5rem 1.5rem' }}>
                    <div
                        onClick={() => setIsBasicInfoOpen(!isBasicInfoOpen)}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            cursor: 'pointer',
                            padding: '1rem 0'
                        }}
                    >
                        <h3 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            基本情報
                            {!isBasicInfoOpen && (
                                <span style={{ fontSize: '1rem', fontWeight: 400, color: 'var(--color-text-muted)', marginLeft: '0.5rem' }}>
                                    {collapsedPatientLabel}
                                </span>
                            )}
                        </h3>
                        {isBasicInfoOpen ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                    </div>

                    {isBasicInfoOpen && (
                        <div className="responsive-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem', paddingBottom: '1.5rem', borderTop: '1px solid var(--color-border)', paddingTop: '1rem' }}>
                            {isCareManagerRecipientMissing && (
                                <div style={{
                                    gridColumn: '1 / -1',
                                    border: '1px solid #f59e0b',
                                    backgroundColor: '#fffbeb',
                                    color: '#92400e',
                                    borderRadius: 'var(--radius-md)',
                                    padding: '0.75rem',
                                    fontSize: '0.9rem',
                                    lineHeight: 1.5
                                }}>
                                    ケアマネ向け印刷には居宅介護支援事業所と事業所FAXが必要です。ここで入力した内容は今回報告書に保存され、保存時に患者マスタへ反映するか選べます。
                                </div>
                            )}
                            <div>
                                <label className="label">患者氏名</label>
                                <input type="text" name="patient_name" className="input" required value={formData.patient_name} onChange={handleChange} />
                            </div>
                            <div>
                                <label className="label">生年月日</label>
                                <input type="date" name="patient_dob" className="input" required value={formData.patient_dob} onChange={handleChange} />
                                {formData.patient_dob && (
                                    <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginTop: '0.25rem', display: 'block' }}>
                                        {calculateAge(formData.patient_dob)}歳
                                    </span>
                                )}
                            </div>
                            <div>
                                <label className="label">性別</label>
                                <select name="patient_gender" className="input" value={formData.patient_gender} onChange={handleChange}>
                                    <option value="male">男性</option>
                                    <option value="female">女性</option>
                                    <option value="other">その他</option>
                                </select>
                            </div>
                            <div>
                                <label className="label">処方医</label>
                                <input type="text" name="doctor_name" className="input" value={formData.doctor_name} onChange={handleChange} />
                            </div>
                            <div>
                                <label className="label">医療機関名</label>
                                <input type="text" name="medical_institution_name" className="input" value={formData.medical_institution_name || ''} onChange={handleChange} />
                            </div>
                            <div>
                                <label className="label">医療機関TEL</label>
                                <input type="text" name="medical_institution_tel" className="input" value={formData.medical_institution_tel || ''} onChange={handleChange} />
                            </div>
                            <div>
                                <label className="label">医療機関FAX</label>
                                <input type="text" name="medical_institution_fax" className="input" value={formData.medical_institution_fax || ''} onChange={handleChange} />
                            </div>
                            <div>
                                <label className="label">居宅介護支援事業所</label>
                                <input type="text" name="home_care_office" className="input" value={formData.home_care_office || ''} onChange={handleChange} />
                            </div>
                            <div>
                                <label className="label">事業所TEL</label>
                                <input type="text" name="home_care_office_tel" className="input" value={formData.home_care_office_tel || ''} onChange={handleChange} />
                            </div>
                            <div>
                                <label className="label">事業所FAX</label>
                                <input type="text" name="home_care_office_fax" className="input" value={formData.home_care_office_fax || ''} onChange={handleChange} />
                            </div>
                            <div>
                                <label className="label">ケアマネージャー</label>
                                <input type="text" name="care_manager" className="input" value={formData.care_manager || ''} onChange={handleChange} />
                            </div>
                            <div>
                                <label className="label">報告元薬局名</label>
                                <input type="text" name="pharmacy_name" className="input" value={formData.pharmacy_name || ''} onChange={handleChange} />
                            </div>
                            <div>
                                <label className="label">報告元薬局住所</label>
                                <input type="text" name="pharmacy_address" className="input" value={formData.pharmacy_address || ''} onChange={handleChange} />
                            </div>
                            <div>
                                <label className="label">報告元薬局TEL</label>
                                <input type="text" name="pharmacy_tel" className="input" value={formData.pharmacy_tel || ''} onChange={handleChange} />
                            </div>
                            <div>
                                <label className="label">報告元薬局FAX</label>
                                <input type="text" name="pharmacy_fax" className="input" value={formData.pharmacy_fax || ''} onChange={handleChange} />
                            </div>
                        </div>
                    )}
                </section>

                {/* 訪問情報 */}
                <section id="section-visit" className="card" style={{ padding: '1.5rem' }}>
                    <details className="compact-section-details">
                        <summary>
                            <span>訪問・処方情報</span>
                            <span>{visitInfoSummary}</span>
                        </summary>
                        <div className="responsive-grid compact-section-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                            <div>
                                <label className="label">訪問日</label>
                                <input type="date" name="visit_date" className="input" required value={formData.visit_date} onChange={handleChange} />
                            </div>
                            <div>
                                <label className="label">担当薬剤師</label>
                                <input type="text" name="pharmacist_name" className="input" required value={formData.pharmacist_name} onChange={handleChange} />
                            </div>

                            <div>
                                <label className="label">処方日</label>
                                <input type="date" name="prescription_date" className="input" value={formData.prescription_date} onChange={handleChange} />
                            </div>
                            <div>
                                <label className="label">調剤日</label>
                                <input type="date" name="dispensing_date" className="input" value={formData.dispensing_date} onChange={handleChange} />
                            </div>
                        </div>
                    </details>
                </section>

                {/* 状況確認 (New Section) */}
                <section id="section-status" className="card" style={{ padding: '1.5rem' }}>
                    <details className="compact-section-details">
                        <summary>
                            <span>状況確認</span>
                            <span>{statusInfoSummary}</span>
                        </summary>
                        <div className="responsive-grid compact-section-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' }}>

                        <EditableSelect
                            label="指導を受けた人"
                            name="guidance_recipient"
                            value={formData.guidance_recipient || ''}
                            options={['家族', '本人']}
                            onChange={handleChange}
                        />
                        <EditableSelect
                            label="服薬状況"
                            name="medication_status"
                            value={formData.medication_status || ''}
                            options={['良好', '問題なし', '不良']}
                            onChange={handleChange}
                        />
                        {renderTemplateControls('medication_status')}
                        <EditableSelect
                            label="保管状況"
                            name="storage_status"
                            value={formData.storage_status || ''}
                            options={['良好', '本人管理', '家族管理', '看護師管理', '介護者管理']}
                            onChange={handleChange}
                        />
                        {renderTemplateControls('storage_status')}

                        <EditableSelect
                            label="他科受診"
                            name="other_dept_consultation"
                            value={formData.other_dept_consultation || ''}
                            options={['なし']}
                            onChange={handleChange}
                        />

                        <EditableSelect
                            label="併用薬"
                            name="concomitant_medications"
                            value={formData.concomitant_medications || ''}
                            options={['なし']}
                            onChange={handleChange}
                        />

                        <div style={{ gridColumn: '1 / -1' }}>
                            <EditableSelect
                                label="アレルギー/副作用歴"
                                name="allergy_history"
                                value={formData.allergy_history || ''}
                                options={['なし']}
                                onChange={handleChange}
                            />
                        </div>

                        <div style={{ gridColumn: '1 / -1' }}>
                            <EditableSelect
                                label="相互作用"
                                name="interaction_status"
                                value={formData.interaction_status || ''}
                                options={['併用薬/飲食物による相互作用なし']}
                                onChange={handleChange}
                            />
                        </div>
                        </div>
                    </details>
                </section>

                {/* 薬剤管理状況 */}
                <div className="card prescription-summary-card" style={{ padding: '1rem', display: 'grid', gap: '0.75rem' }}>
                    <div className="prescription-days-row" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <label className="label" style={{ marginBottom: 0 }}>標準処方日数</label>
                        {[14, 21, 28].map(days => (
                            <button
                                key={days}
                                type="button"
                                className={`btn ${formData.default_prescription_days === String(days) ? 'btn-primary' : 'btn-ghost'}`}
                                onClick={() => handleChange({ target: { name: 'default_prescription_days', value: String(days) } })}
                                style={{ padding: '0.45rem 0.75rem' }}
                            >
                                {days}日
                            </button>
                        ))}
                        <input
                            type="number"
                            name="default_prescription_days"
                            className="input"
                            style={{ width: '7rem' }}
                            value={formData.default_prescription_days || ''}
                            onChange={handleChange}
                            min="1"
                        />
                    </div>
                    <div className="regular-supply-row" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <span className="label" style={{ marginBottom: 0 }}>定期薬</span>
                        <span style={{
                            fontWeight: 700,
                            border: '1px solid var(--color-border)',
                            borderRadius: '6px',
                            padding: '0.4rem 0.75rem',
                            backgroundColor: 'var(--color-bg)'
                        }}>
                            {formData.regular_medication_supply_until
                                ? `最短で ${formData.regular_medication_supply_until.replace(/-/g, '/')} まで分`
                                : '最短日は未計算'}
                        </span>
                    </div>
                </div>


                <div id="section-meds-reg">
                    <MedicationListForm
                        title="残薬詳細確認 (定期薬)"
                        items={formData.medications_check_list || []}
                        onUpdate={updateRegularMedications}
                        onSearchDrug={handleDrugSearch}
                        drugOptions={drugOptions}
                        mode="regular"
                        defaultPrescriptionDays={formData.default_prescription_days}
                    />

                </div>

                <div id="section-meds-prn">
                    <MedicationListForm
                        title="残薬詳細確認 (臨時薬・その他)"
                        items={formData.medications_check_list_prn || []}
                        onUpdate={(newItems) => {
                            markUnsaved()
                            setFormData({ ...formData, medications_check_list_prn: newItems })
                        }}
                        onSearchDrug={handleDrugSearch}
                        drugOptions={drugOptions}
                        mode="other"
                    />

                </div>

                {/* 指導内容 */}
                <section id="section-plan" className="card" style={{ padding: '1.5rem' }}>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.5rem' }}>
                        指導内容
                    </h3>
                    <div style={{ display: 'grid', gap: '1rem' }}>
                        <div style={{
                            display: 'grid',
                            gap: '0.75rem',
                            padding: '1rem',
                            border: '1px solid var(--color-border)',
                            borderRadius: 'var(--radius-md)',
                            backgroundColor: 'var(--color-bg)'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                                <h4 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <Bot size={18} />
                                    AI下書き
                                </h4>
                                <span style={{ color: appSettings.ai_mode_enabled ? '#166534' : 'var(--color-text-secondary)', fontSize: '0.85rem', fontWeight: 600 }}>
                                    {appSettings.ai_mode_enabled ? 'ON' : 'OFF'}
                                </span>
                            </div>

                            <div>
                                <label className="label">訪問メモ</label>
                                <textarea
                                    className="input"
                                    rows={3}
                                    value={aiVisitMemo}
                                    onChange={(e) => {
                                        markUnsaved()
                                        setAiVisitMemo(e.target.value)
                                    }}
                                    disabled={!appSettings.ai_mode_enabled || aiDraftState === 'processing'}
                                    placeholder="訪問内容のメモ。Windowsの音声入力（Win+H）でも入力できます"
                                />
                                <button
                                    type="button"
                                    className="btn btn-ghost"
                                    onClick={handleCreateAiDraftFromVisitMemo}
                                    disabled={!appSettings.ai_mode_enabled || aiDraftState === 'processing' || !aiVisitMemo.trim()}
                                    style={{ marginTop: '0.5rem' }}
                                >
                                    <Bot size={18} />
                                    訪問メモからAI下書き
                                </button>
                                {aiDraftState === 'processing' && (
                                    <span style={{ color: 'var(--color-text-secondary)', marginLeft: '0.75rem', fontSize: '0.9rem' }}>
                                        処理中...
                                    </span>
                                )}
                            </div>

                            {aiError && (
                                <div style={{ color: '#991b1b', backgroundColor: '#fee2e2', padding: '0.75rem', borderRadius: '8px', fontSize: '0.9rem' }}>
                                    {aiError}
                                </div>
                            )}

                            {aiDraftFieldStates.length > 0 && (
                                <div style={{ display: 'grid', gap: '0.75rem' }}>
                                    {aiDraftFieldStates.map(state => (
                                        <div key={state.target} style={{ border: '1px solid var(--color-border)', borderRadius: '8px', padding: '0.85rem', backgroundColor: 'var(--color-surface)' }}>
                                            <div style={{ fontWeight: 700, marginBottom: '0.35rem' }}>
                                                {AI_DRAFT_TARGET_LABELS[state.target]}
                                            </div>
                                            <div style={{ whiteSpace: 'pre-wrap', color: 'var(--color-text-secondary)', marginBottom: '0.75rem' }}>
                                                {state.draftValue}
                                            </div>
                                            {aiDraftChoices[state.target] ? (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                                    <span style={{ color: aiDraftChoices[state.target] === 'cancel' ? 'var(--color-text-secondary)' : '#166534', fontSize: '0.85rem', fontWeight: 600 }}>
                                                        {aiDraftChoices[state.target] === 'cancel' ? 'キャンセル済み' : 'AI反映済み'}
                                                    </span>
                                                    {aiDraftAppliedFields[state.target] && (
                                                        <button
                                                            type="button"
                                                            className="btn btn-ghost"
                                                            onClick={() => handleUndoAiDraftField(state.target)}
                                                            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.35rem 0.65rem' }}
                                                        >
                                                            <Undo2 size={15} />
                                                            元に戻す
                                                        </button>
                                                    )}
                                                </div>
                                            ) : (
                                                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                                    {state.requiresChoice && (
                                                        <button type="button" className="btn btn-ghost" onClick={() => handleApplyAiDraftField(state.target, 'append')}>
                                                            追記
                                                        </button>
                                                    )}
                                                    <button type="button" className="btn btn-ghost" onClick={() => handleApplyAiDraftField(state.target, 'replace')}>
                                                        {state.requiresChoice ? '置換' : '反映'}
                                                    </button>
                                                    {state.requiresChoice && (
                                                        <button type="button" className="btn btn-ghost" onClick={() => handleApplyAiDraftField(state.target, 'cancel')}>
                                                            キャンセル
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div>
                            <label className="label">主訴等</label>
                            <textarea name="chief_complaint" className="input" rows={2} value={formData.chief_complaint || ''} onChange={handleChange}></textarea>
                            {renderTemplateControls('chief_complaint')}
                        </div>
                        <div>
                            <label className="label">服薬指導内容</label>
                            <textarea name="medication_instruction" className="input" rows={4} value={formData.medication_instruction} onChange={handleChange}></textarea>
                            {renderTemplateControls('medication_instruction')}
                        </div>
                        <div>
                            <label className="label">その他伝達事項</label>
                            <textarea name="side_effects" className="input" rows={2} value={formData.side_effects} onChange={handleChange}></textarea>
                            {renderTemplateControls('side_effects')}
                        </div>
                    </div>
                </section>

                {/* 計画・申し送り */}
                <section id="section-future-plan" className="card" style={{ padding: '1.5rem' }}>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.5rem' }}>
                        計画・申し送り
                    </h3>
                    <div style={{ display: 'grid', gap: '1rem' }}>
                        <div>
                            <label className="label">次回訪問予定日</label>
                            <input type="date" name="next_visit_date" className="input" value={formData.next_visit_date || ''} onChange={handleChange} />
                        </div>

                        <div>
                            <label className="label">申し送り事項</label>
                            <textarea
                                className="input"
                                rows={3}
                                value={patientMemo}
                                onChange={(e) => {
                                    markUnsaved()
                                    setPatientMemo(e.target.value)
                                }}
                                placeholder="今回の訪問に関する申し送り事項を入力してください（患者詳細の履歴に表示されます）"
                            ></textarea>
                        </div>
                    </div>
                </section>

                        {renderReportActions('report-action-bar-bottom')}
                    </div>

                    <aside className="report-summary-rail" aria-label="報告書サマリー">
                        <details className="report-summary-details" open>
                            <summary>
                                <span>作成サマリー</span>
                                <span className={`summary-status summary-status-${saveStatus}`}>
                                    {saveStatusLabel || '入力中'}
                                </span>
                            </summary>
                            <div className="report-summary-content">
                                <section className="summary-panel summary-patient-panel">
                                    <div className="summary-panel-label">患者</div>
                                    <div className="summary-patient-name">{patientSummaryLabel}</div>
                                    <dl className="summary-definition-list">
                                        <div>
                                            <dt>医療機関</dt>
                                            <dd>{formData.medical_institution_name || '未入力'}</dd>
                                        </div>
                                        <div>
                                            <dt>主治医</dt>
                                            <dd>{formData.doctor_name || '未入力'}</dd>
                                        </div>
                                        <div>
                                            <dt>ケアマネ</dt>
                                            <dd>{formData.care_manager || '未登録'}</dd>
                                        </div>
                                    </dl>
                                    {careManagerMissing && (
                                        <div className="summary-warning">
                                            <AlertTriangle size={16} />
                                            ケアマネ未登録
                                        </div>
                                    )}
                                    {isCareManagerRecipientMissing && (
                                        <div className="summary-warning">
                                            <AlertTriangle size={16} />
                                            ケアマネ向け宛先が不足
                                        </div>
                                    )}
                                </section>

                                <section className="summary-panel summary-supply-panel">
                                    <div className="summary-panel-label">定期薬 最短</div>
                                    <div className="summary-supply-date">
                                        {regularMedicationSummary.supplyUntil
                                            ? `${formatDateForUi(regularMedicationSummary.supplyUntil)}まで`
                                            : '未計算'}
                                    </div>
                                    <div className="summary-supply-meta">
                                        {regularMedicationSummary.name || '定期薬未入力'}
                                        {regularMedicationSummary.totalDays ? ` / ${regularMedicationSummary.totalDays}日` : ''}
                                    </div>
                                </section>

                                <section className="summary-panel">
                                    <div className="summary-panel-label">A4ページ目安</div>
                                    <div className={`summary-page-check ${reportPageCount > 1 ? 'summary-page-check-warning' : 'summary-page-check-ok'}`}>
                                        {reportPageCount > 1 ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
                                        <span>{reportPageCount}ページ見込み</span>
                                    </div>
                                    {printWarnings.length > 0 && (
                                        <div className="summary-warning-list">
                                            {printWarnings.map(warning => (
                                                <div key={warning}>{warning}</div>
                                            ))}
                                        </div>
                                    )}
                                </section>

                                {renderReportActions('report-action-bar-rail')}
                            </div>
                        </details>
                    </aside>
                </div>

            </form>

            {isPatientMasterDialogOpen && (
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-label="患者マスタ反映の確認"
                    style={{
                        position: 'fixed',
                        inset: 0,
                        zIndex: 100,
                        backgroundColor: 'rgba(15, 23, 42, 0.35)',
                        display: 'grid',
                        placeItems: 'center',
                        padding: '1rem'
                    }}
                >
                    <div style={{
                        width: 'min(560px, 100%)',
                        backgroundColor: 'var(--color-surface)',
                        borderRadius: '8px',
                        border: '1px solid var(--color-border)',
                        boxShadow: 'var(--shadow-lg)',
                        padding: '1.25rem',
                        display: 'grid',
                        gap: '1rem'
                    }}>
                        <div>
                            <h3 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '0.35rem' }}>
                                患者マスタと違う項目があります
                            </h3>
                            <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>
                                今回の報告書だけ変更するか、患者マスタにも反映するかを選んでください。
                            </div>
                        </div>
                        <div style={{ display: 'grid', gap: '0.5rem', maxHeight: '220px', overflowY: 'auto' }}>
                            {patientMasterDiffs.map(diff => (
                                <div key={`${diff.patientField}-${diff.reportField}`} style={{
                                    border: '1px solid var(--color-border)',
                                    borderRadius: '6px',
                                    padding: '0.65rem',
                                    display: 'grid',
                                    gap: '0.2rem'
                                }}>
                                    <div style={{ fontWeight: 700 }}>{diff.label}</div>
                                    <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>
                                        患者マスタ: {diff.patientValue || '未入力'}
                                    </div>
                                    <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>
                                        今回報告書: {diff.reportValue || '未入力'}
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <button
                                type="button"
                                className="btn btn-ghost"
                                disabled={isSaving}
                                onClick={() => {
                                    setIsPatientMasterDialogOpen(false)
                                    setPatientMasterDiffs([])
                                }}
                            >
                                キャンセル
                            </button>
                            <button
                                type="button"
                                className="btn btn-ghost"
                                disabled={isSaving}
                                onClick={() => void persistReport('report_only')}
                            >
                                今回だけ変更
                            </button>
                            <button
                                type="button"
                                className="btn btn-primary"
                                disabled={isSaving}
                                onClick={() => void persistReport('update_patient')}
                            >
                                患者マスタにも反映
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {printWarnings.length > 0 && (
                <div className="print-warning-box" role="status">
                    {printWarnings.map(warning => (
                        <div key={warning}>{warning}</div>
                    ))}
                </div>
            )}

            {/* Hidden Print Component */}
            <div style={{ display: 'none' }}>
                <ReportPrint ref={printRef} report={reportForPrint} recipients={printRecipients} />
            </div>

            {/* Example styling for inputs to be clean */}
            <style>{`
        .label {
          display: block;
          font-weight: 500;
          margin-bottom: 0.35rem;
          font-size: 0.925rem;
        }
        .input {
          width: 100%;
          padding: 0.625rem;
          border-radius: var(--radius-md);
          border: 1px solid var(--color-border);
          transition: border-color 0.2s;
        }
	        .input:focus {
	          outline: none;
	          border-color: var(--color-primary);
	          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
	        }

            .report-edit-form {
              display: block;
            }

            .report-header-row,
            .report-quick-nav {
              min-width: 0;
            }

            .report-quick-nav > .btn {
              flex: 0 0 auto;
            }

            .report-edit-layout {
              display: grid;
              grid-template-columns: minmax(0, 760px) minmax(296px, 340px);
              justify-content: center;
              align-items: start;
              gap: 1.25rem;
            }

            .report-edit-main {
              display: grid;
              gap: 1.5rem;
              min-width: 0;
              width: 100%;
              max-width: 760px;
            }

            .report-edit-main > * {
              max-width: 100%;
              min-width: 0;
            }

            .report-summary-rail {
              position: sticky;
              top: 8.5rem;
              min-width: 0;
            }

            .report-summary-details {
              border: 1px solid var(--color-border);
              border-radius: var(--radius-lg);
              background: var(--color-surface);
              box-shadow: var(--shadow-sm);
              max-width: 100%;
              min-width: 0;
              overflow: hidden;
            }

            .report-edit-main .card {
              min-width: 0;
              width: 100%;
            }

            .report-summary-details > summary,
            .compact-section-details > summary {
              list-style: none;
              cursor: pointer;
            }

            .report-summary-details > summary::-webkit-details-marker,
            .compact-section-details > summary::-webkit-details-marker {
              display: none;
            }

            .report-summary-details > summary {
              display: flex;
              justify-content: space-between;
              align-items: center;
              gap: 0.75rem;
              padding: 0.9rem 1rem;
              font-weight: 700;
              border-bottom: 1px solid var(--color-border);
            }

            .summary-status {
              font-size: 0.82rem;
              font-weight: 700;
              color: var(--color-text-muted);
              white-space: nowrap;
            }

            .summary-status-saved,
            .report-save-state-saved {
              color: var(--color-success);
            }

            .summary-status-dirty,
            .summary-status-saving,
            .report-save-state-dirty,
            .report-save-state-saving {
              color: var(--color-warning);
            }

            .summary-status-error,
            .report-save-state-error {
              color: var(--color-danger);
            }

            .report-summary-content {
              display: grid;
              gap: 0.9rem;
              padding: 1rem;
            }

            .summary-panel {
              border-bottom: 1px solid var(--color-border);
              display: grid;
              gap: 0.5rem;
              padding-bottom: 0.9rem;
            }

            .summary-panel:last-child {
              border-bottom: none;
              padding-bottom: 0;
            }

            .summary-panel-label {
              color: var(--color-text-muted);
              font-size: 0.78rem;
              font-weight: 700;
            }

            .summary-patient-name {
              font-size: 1rem;
              font-weight: 700;
              line-height: 1.45;
            }

            .summary-definition-list {
              display: grid;
              gap: 0.35rem;
              margin: 0;
            }

            .summary-definition-list div {
              display: grid;
              grid-template-columns: 5.5rem minmax(0, 1fr);
              gap: 0.5rem;
            }

            .summary-definition-list dt {
              color: var(--color-text-muted);
              font-size: 0.78rem;
              font-weight: 700;
            }

            .summary-definition-list dd {
              margin: 0;
              min-width: 0;
              overflow-wrap: anywhere;
            }

            .summary-warning,
            .summary-warning-list {
              align-items: center;
              background: var(--color-warning-bg);
              border: 1px solid #fbbf24;
              border-radius: var(--radius-md);
              color: #92400e;
              display: flex;
              gap: 0.45rem;
              font-size: 0.86rem;
              font-weight: 700;
              min-width: 0;
              overflow-wrap: anywhere;
              padding: 0.55rem 0.65rem;
            }

            .summary-warning svg {
              flex: 0 0 auto;
            }

            .summary-warning-list {
              align-items: stretch;
              flex-direction: column;
              font-weight: 500;
              line-height: 1.5;
            }

            .summary-warning-list div {
              min-width: 0;
              overflow-wrap: anywhere;
              word-break: break-word;
            }

            .summary-supply-date {
              color: var(--color-primary);
              font-size: 1.65rem;
              font-weight: 700;
              font-variant-numeric: tabular-nums;
              line-height: 1.2;
            }

            .summary-supply-meta {
              color: var(--color-text-muted);
              font-size: 0.9rem;
              overflow-wrap: anywhere;
            }

            .summary-page-check {
              align-items: center;
              border-radius: var(--radius-md);
              display: flex;
              gap: 0.45rem;
              font-weight: 700;
              padding: 0.55rem 0.65rem;
            }

            .summary-page-check-ok {
              background: var(--color-success-bg);
              color: var(--color-success);
            }

            .summary-page-check-warning {
              background: var(--color-warning-bg);
              color: #92400e;
            }

            .compact-section-details > summary {
              align-items: center;
              display: flex;
              gap: 0.75rem;
              justify-content: space-between;
              min-height: 2.75rem;
              min-width: 0;
              font-weight: 700;
            }

            .compact-section-details > summary span {
              min-width: 0;
            }

            .compact-section-details > summary span:last-child {
              color: var(--color-text-muted);
              font-size: 0.9rem;
              font-weight: 500;
              min-width: 0;
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
            }

            .compact-section-body {
              border-top: 1px solid var(--color-border);
              margin-top: 0.75rem;
              padding-top: 1rem;
            }

            .template-chip-list {
              display: flex;
              flex-wrap: wrap;
              gap: 0.45rem;
              margin-top: 0.5rem;
            }

            .template-chip-group {
              display: inline-flex;
              min-width: 0;
            }

            .template-chip {
              border: 1px solid var(--color-border);
              border-radius: 999px 0 0 999px;
              color: var(--color-text-main);
              font-size: 0.85rem;
              font-weight: 600;
              max-width: 18rem;
              overflow: hidden;
              padding: 0.35rem 0.65rem;
              text-overflow: ellipsis;
              white-space: nowrap;
            }

            .template-chip:hover,
            .template-chip:focus-visible {
              border-color: var(--color-primary);
              color: var(--color-primary);
            }

            .template-chip-replace {
              border-left: 0;
              border-radius: 0 999px 999px 0;
              color: var(--color-text-muted);
              max-width: none;
            }

	        #section-basic,
	        #section-visit,
	        #section-status,
	        #section-meds-reg,
	        #section-meds-prn,
	        #section-plan,
	        #section-future-plan {
	          scroll-margin-top: 8.5rem;
	        }

	        .report-action-bar {
	          background: var(--color-surface);
	          border: 1px solid var(--color-border);
	          border-radius: var(--radius-lg);
	          box-shadow: var(--shadow-sm);
	          display: flex;
	          justify-content: flex-end;
              align-items: center;
	          gap: 1rem;
	          padding: 1rem;
	          margin-top: 0.5rem;
	        }

            .report-action-bar-bottom {
              display: none;
            }

            .report-action-bar-rail {
              align-items: stretch;
              border: 0;
              box-shadow: none;
              flex-direction: column;
              margin-top: 0;
              padding: 0;
            }

            .report-action-bar-rail .print-options {
              display: grid;
              grid-template-columns: repeat(3, minmax(0, 1fr));
              margin-right: 0;
            }

            .report-action-bar-rail .btn {
              width: 100%;
            }

            .report-save-state {
              font-size: 0.9rem;
              font-weight: 700;
              white-space: nowrap;
            }

            .report-print-button {
              border: 1px solid var(--color-primary);
              color: var(--color-primary);
            }

            .report-save-button {
              padding: 0.75rem 2rem;
            }

            .print-options {
              display: flex;
              gap: 0.5rem;
              margin-right: auto;
              flex-wrap: wrap;
            }

            .print-warning-box {
              border: 1px solid #f59e0b;
              background: #fffbeb;
              color: #92400e;
              border-radius: var(--radius-md);
              padding: 0.75rem 1rem;
              font-size: 0.9rem;
              display: grid;
              gap: 0.35rem;
            }

	        /* Medication List Row Labels */
	        .medication-row-label {
	          display: none !important; /* Hide on Desktop by default */
	        }
            @media (max-width: 1099px) {
              .report-edit-layout {
                grid-template-columns: minmax(0, 1fr);
              }

              .report-edit-main {
                max-width: none;
              }

              .report-summary-rail {
                order: -1;
                position: static;
              }

              .report-action-bar-rail {
                display: none;
              }

              .report-action-bar-bottom {
                display: flex;
              }
            }

	        @media (max-width: 640px) {
              .report-header-row {
                align-items: stretch !important;
              }

              .report-sticky-header {
                margin: 0 -0.75rem 1.5rem -0.75rem !important;
                padding: 1rem 0.75rem 0.5rem 0.75rem !important;
              }

              .report-quick-nav {
                width: 100%;
                max-width: 100% !important;
              }

              .prescription-days-row {
                display: grid !important;
                grid-template-columns: repeat(3, minmax(0, 1fr));
                align-items: center !important;
              }

              .prescription-days-row .label {
                grid-column: 1 / -1;
              }

              .prescription-days-row .input {
                grid-column: 1 / -1;
                width: 100% !important;
              }

              .regular-supply-row {
                display: grid !important;
                grid-template-columns: auto minmax(0, 1fr);
              }

              .regular-supply-row span:last-child {
                min-width: 0;
                overflow-wrap: anywhere;
              }

	          .report-action-bar {
	            flex-direction: column;
                align-items: stretch;
	          }

	          .report-action-bar .btn {
	            width: 100%;
	          }

              .print-options {
                margin-right: 0;
              }
	        }
	        @media (max-width: 640px) {
	          .medication-row-label {
	            display: block !important; /* Show on Mobile */
            margin-bottom: 0.25rem;
            font-size: 0.9rem;
            font-weight: 500;
          }
        }
      `}</style>
        </div>
    )
}
