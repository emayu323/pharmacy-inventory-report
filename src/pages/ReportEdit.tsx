import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { ArrowLeft, Bot, Mic, Pause, Play, Save, ChevronDown, ChevronRight, Printer, Square, Undo2 } from 'lucide-react'
import { useState, useRef, useEffect, useCallback, type ChangeEvent, type FormEvent } from 'react'
import { useReactToPrint } from 'react-to-print'
import { ReportPrint } from '../components/ReportPrint'
import { supabase } from '../supabase'
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
import { getNativeBridge, type NativeAiAudioSaveResult } from '../nativeBridge'
import { createCopiedReportDraft } from '../reportCopy'

type FormFieldChange =
    | ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
    | { target: { name: string; value: string } }

type TemplateInsertMode = 'append' | 'replace'
type AiRecordingState = 'idle' | 'recording' | 'paused' | 'processing' | 'stopped'
type PatientMasterSaveChoice = 'report_only' | 'update_patient'

const AI_DRAFT_TARGET_LABELS: Record<AiDraftTarget, string> = {
    chief_complaint: '主訴等',
    medication_instruction: '服薬指導内容'
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
    const [selectedTemplateIds, setSelectedTemplateIds] = useState<Partial<Record<TextTemplateTarget, string>>>({})
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
    const [aiTranscript, setAiTranscript] = useState('')
    const [aiDraft, setAiDraft] = useState<AiDraft | null>(null)
    const [aiDraftChoices, setAiDraftChoices] = useState<Partial<Record<AiDraftTarget, AiDraftApplyMode>>>({})
    const [aiDraftAppliedFields, setAiDraftAppliedFields] = useState<Partial<Record<AiDraftTarget, AiDraftFieldPatch>>>({})
    const [aiRecordingState, setAiRecordingState] = useState<AiRecordingState>('idle')
    const [aiError, setAiError] = useState('')
    const [aiAudioReady, setAiAudioReady] = useState(false)
    const printRef = useRef<HTMLDivElement>(null)
    const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const selectedTemplateIdsRef = useRef<Partial<Record<TextTemplateTarget, string>>>({})
    const mediaRecorderRef = useRef<MediaRecorder | null>(null)
    const mediaStreamRef = useRef<MediaStream | null>(null)
    const recordedAudioChunksRef = useRef<BlobPart[]>([])
    const aiRecordedAudioBlobRef = useRef<Blob | null>(null)
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

    const applyTextTemplate = (target: TextTemplateTarget, mode: TemplateInsertMode) => {
        const templateId = selectedTemplateIdsRef.current[target] || selectedTemplateIds[target]
        const template = textTemplates.find(item => item.id === templateId)
        if (!template) {
            toast.error('定型文を選択してください')
            return
        }

        setFormData(prev => {
            const currentValue = String(prev[target] || '')
            const nextValue = mode === 'replace'
                ? template.body
                : [currentValue, template.body].filter(Boolean).join('\n')
            return { ...prev, [target]: nextValue }
        })
        markUnsaved()
    }

    const stopAiMediaStream = useCallback(() => {
        mediaStreamRef.current?.getTracks().forEach(track => track.stop())
        mediaStreamRef.current = null
    }, [])

    const handleAiRecordStart = async () => {
        setAiError('')
        if (!appSettings.ai_mode_enabled) {
            toast.error('AIモードがOFFです')
            return
        }
        if (!appSettings.ai_consent_mode_enabled) {
            toast.error('患者会話録音がOFFです')
            return
        }
        if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
            toast.error('この環境では録音できません')
            return
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
            const recorder = new MediaRecorder(stream)
            mediaStreamRef.current = stream
            mediaRecorderRef.current = recorder
            recordedAudioChunksRef.current = []

            recorder.ondataavailable = (event) => {
                if (event.data.size > 0) recordedAudioChunksRef.current.push(event.data)
            }
            recorder.onstop = () => {
                void handleAiRecordingStopped()
            }

            recorder.start()
            setAiRecordingState('recording')
        } catch (error) {
            console.error(error)
            setAiError('録音を開始できませんでした')
            toast.error('録音を開始できませんでした')
            stopAiMediaStream()
            setAiRecordingState('idle')
        }
    }

    const handleAiRecordingStopped = async () => {
        stopAiMediaStream()
        setAiRecordingState('processing')
        try {
            const audioBlob = new Blob(recordedAudioChunksRef.current, { type: 'audio/webm' })
            aiRecordedAudioBlobRef.current = audioBlob
            setAiAudioReady(audioBlob.size > 0)
            recordedAudioChunksRef.current = []
            const bridge = getNativeBridge()
            if (!bridge?.ai) {
                throw new Error('ローカルアプリで開くと録音から下書きを作成できます')
            }

            const draft = await bridge.ai.transcribeAndDraft(new Uint8Array(await audioBlob.arrayBuffer()))
            setAiTranscript(draft.transcript)
            setAiDraft(draft)
            setAiDraftChoices({})
            setAiDraftAppliedFields({})
            markUnsaved()
            toast.success('AI下書きを作成しました')
            setAiRecordingState('stopped')
        } catch (error) {
            console.error(error)
            const message = error instanceof Error ? error.message : 'AI下書きを作成できませんでした'
            setAiError(message)
            toast.error(message)
            setAiRecordingState('stopped')
        }
    }

    const handleAiRecordPause = () => {
        const recorder = mediaRecorderRef.current
        if (!recorder || recorder.state !== 'recording') return
        recorder.pause()
        setAiRecordingState('paused')
    }

    const handleAiRecordResume = () => {
        const recorder = mediaRecorderRef.current
        if (!recorder || recorder.state !== 'paused') return
        recorder.resume()
        setAiRecordingState('recording')
    }

    const handleAiRecordStop = () => {
        const recorder = mediaRecorderRef.current
        if (!recorder || recorder.state === 'inactive') {
            stopAiMediaStream()
            setAiRecordingState('stopped')
            return
        }
        recorder.stop()
    }

    const handleCreateAiDraftFromTranscript = async () => {
        if (!appSettings.ai_mode_enabled) {
            toast.error('AIモードがOFFです')
            return
        }
        if (!aiTranscript.trim()) {
            toast.error('文字起こしを入力してください')
            return
        }

        try {
            setAiRecordingState('processing')
            const bridge = getNativeBridge()
            const draft = bridge?.ai
                ? await bridge.ai.createDraftFromTranscript(aiTranscript)
                : createRuleBasedAiDraft(aiTranscript)
            setAiDraft(draft)
            setAiDraftChoices({})
            setAiDraftAppliedFields({})
            toast.success('AI下書きを作成しました')
        } catch (error) {
            console.error(error)
            const message = error instanceof Error ? error.message : 'AI下書きを作成できませんでした'
            setAiError(message)
            toast.error(message)
        } finally {
            setAiRecordingState('stopped')
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
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                <select
                    className="input"
                    value={selectedTemplateIds[target] || ''}
                    onChange={(e) => {
                        selectedTemplateIdsRef.current[target] = e.target.value
                        setSelectedTemplateIds(prev => ({ ...prev, [target]: e.target.value }))
                    }}
                    aria-label="定型文を選択"
                    style={{ maxWidth: '18rem', padding: '0.45rem 0.6rem' }}
                >
                    <option value="">定型文を選択</option>
                    {templates.map(template => (
                        <option key={template.id} value={template.id}>{template.title}</option>
                    ))}
                </select>
                <button type="button" className="btn btn-ghost" onClick={() => applyTextTemplate(target, 'append')} style={{ padding: '0.45rem 0.75rem' }}>
                    追記
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => applyTextTemplate(target, 'replace')} style={{ padding: '0.45rem 0.75rem' }}>
                    置換
                </button>
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

            const { data, error } = await supabase
                .from('medications')
                .select('name')
                .ilike('name', `%${query}%`)
                .limit(20)

            if (error) {
                console.error('Search error', error)
            } else if (data) {
                setDrugOptions(data.map(d => ({
                    name: d.name,
                    kana: '',
                    unit: ''
                })))
            }
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
        return () => {
            stopAiMediaStream()
        }
    }, [stopAiMediaStream])

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
            setAiTranscript(data.ai_transcript || '')
            aiRecordedAudioBlobRef.current = null
            setAiAudioReady(false)
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
                setAiTranscript('')
                aiRecordedAudioBlobRef.current = null
                setAiAudioReady(false)
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
            setAiTranscript('')
            aiRecordedAudioBlobRef.current = null
            setAiAudioReady(false)
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

    const buildReportInputForSave = useCallback((
        audioResult?: NativeAiAudioSaveResult
    ): Omit<Report, 'id' | 'created_at' | 'updated_at'> => {
        return createReportInputForSave({
            formData: buildReportSnapshot(formData),
            patientMemo,
            aiTranscript,
            appSettings,
            audioResult
        })
    }, [aiTranscript, appSettings, formData, patientMemo])

    const savePendingAiAudio = async (reportId: string): Promise<NativeAiAudioSaveResult | null> => {
        if (!appSettings.ai_save_audio_enabled) return null

        const audioBlob = aiRecordedAudioBlobRef.current
        if (!audioBlob || audioBlob.size === 0) return null

        const bridge = getNativeBridge()
        if (!bridge?.ai?.saveAudio) {
            toast.error('音声保存はローカルアプリで開いた場合のみ利用できます')
            return null
        }

        const result = await bridge.ai.saveAudio(
            reportId,
            new Uint8Array(await audioBlob.arrayBuffer()),
            audioBlob.type || 'audio/webm'
        )
        aiRecordedAudioBlobRef.current = null
        setAiAudioReady(false)
        return result
    }

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
            let savedReport = await saveReport(activeReportId || id, buildReportInputForSave())
            const audioResult = await savePendingAiAudio(savedReport.id)
            if (audioResult) {
                savedReport = await saveReport(savedReport.id, buildReportInputForSave(audioResult))
            }
            setActiveReportId(savedReport.id)
            lastAutoSaveFingerprintRef.current = createReportAutoSaveFingerprint(buildReportInputForSave(audioResult || undefined))

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
            <div style={{
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
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
                    }} className="no-scrollbar">
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
                style={{ display: 'grid', gap: '1.5rem' }}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        // Allow Enter in Textareas, prevent in Inputs (except submit button which handles itself)
                        if (e.target instanceof HTMLTextAreaElement) return;
                        e.preventDefault();
                    }
                }}
            >

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
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.5rem' }}>
                        訪問・処方情報
                    </h3>
                    <div className="responsive-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
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
                </section>

                {/* 状況確認 (New Section) */}
                <section id="section-status" className="card" style={{ padding: '1.5rem' }}>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.5rem' }}>
                        状況確認
                    </h3>
                    <div className="responsive-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' }}>

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
                </section>

                {/* 薬剤管理状況 */}
                <div className="card" style={{ padding: '1rem', display: 'grid', gap: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
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

                            <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>
                                録音を使う場合は薬局の運用ルールに従って同意確認を行います。
                            </div>
                            <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>
                                保存設定:
                                文字起こし{appSettings.ai_save_transcript_enabled ? '保存ON' : '保存OFF'} /
                                音声{appSettings.ai_save_audio_enabled ? (aiAudioReady ? '保存ON・録音あり' : '保存ON') : '保存OFF'}
                            </div>

                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                <button
                                    type="button"
                                    className="btn btn-primary"
                                    onClick={handleAiRecordStart}
                                    disabled={!appSettings.ai_mode_enabled || !appSettings.ai_consent_mode_enabled || aiRecordingState === 'recording' || aiRecordingState === 'paused' || aiRecordingState === 'processing'}
                                >
                                    <Mic size={18} />
                                    録音開始
                                </button>
                                {aiRecordingState === 'recording' && (
                                    <button type="button" className="btn btn-ghost" onClick={handleAiRecordPause}>
                                        <Pause size={18} />
                                        一時停止
                                    </button>
                                )}
                                {aiRecordingState === 'paused' && (
                                    <button type="button" className="btn btn-ghost" onClick={handleAiRecordResume}>
                                        <Play size={18} />
                                        再開
                                    </button>
                                )}
                                {(aiRecordingState === 'recording' || aiRecordingState === 'paused') && (
                                    <button type="button" className="btn btn-ghost" onClick={handleAiRecordStop}>
                                        <Square size={18} />
                                        停止
                                    </button>
                                )}
                                {aiRecordingState === 'processing' && (
                                    <span style={{ color: 'var(--color-text-secondary)', alignSelf: 'center', fontSize: '0.9rem' }}>
                                        処理中...
                                    </span>
                                )}
                            </div>

                            {!appSettings.ai_consent_mode_enabled && appSettings.ai_mode_enabled && (
                                <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>
                                    録音を使うには設定画面で患者会話録音をONにしてください。
                                </div>
                            )}

                            <div>
                                <label className="label">文字起こし</label>
                                <textarea
                                    className="input"
                                    rows={3}
                                    value={aiTranscript}
                                    onChange={(e) => {
                                        markUnsaved()
                                        setAiTranscript(e.target.value)
                                    }}
                                    disabled={!appSettings.ai_mode_enabled || aiRecordingState === 'processing'}
                                    placeholder="録音後の文字起こし、または手入力した会話メモ"
                                />
                                <button
                                    type="button"
                                    className="btn btn-ghost"
                                    onClick={handleCreateAiDraftFromTranscript}
                                    disabled={!appSettings.ai_mode_enabled || aiRecordingState === 'processing' || !aiTranscript.trim()}
                                    style={{ marginTop: '0.5rem' }}
                                >
                                    <Bot size={18} />
                                    下書き作成
                                </button>
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

                <div className="report-action-bar">
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
                        <span style={{
                            color: saveStatus === 'error' ? '#991b1b' : 'var(--color-text-secondary)',
                            fontSize: '0.9rem',
                            fontWeight: 600,
                            whiteSpace: 'nowrap'
                        }}>
                            {saveStatusLabel}
                        </span>
                    )}
                    <button type="button" onClick={handlePrintClick} className="btn btn-ghost" style={{ border: '1px solid var(--color-primary)', color: 'var(--color-primary)' }}>
                        <Printer size={18} />
                        印刷 / PDFプレビュー
                    </button>
                    <button type="button" onClick={() => navigate(-1)} className="btn btn-ghost">キャンセル</button>
                    <button type="submit" className="btn btn-primary" style={{ padding: '0.75rem 2rem' }} disabled={isSaving}>
                        <Save size={18} />
                        {isSaving ? '保存中...' : '保存する'}
                    </button>
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
	        @media (max-width: 640px) {
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
