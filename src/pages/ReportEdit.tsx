import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { ArrowLeft, Save, ChevronDown, ChevronRight } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import { useReactToPrint } from 'react-to-print'
import { ReportPrint } from '../components/ReportPrint'
import { supabase } from '../supabase'
import type { Report } from '../types'
import MedicationListForm from '../components/MedicationListForm'
import { useAuth } from '../contexts/AuthProvider'
import toast from 'react-hot-toast'
import { calculateAge } from '../utils'

// Mock for edit, would fetch based on ID in real app
const EMPTY_REPORT: Omit<Report, 'id' | 'created_at' | 'updated_at'> = {
    patient_name: '',
    patient_dob: '',
    patient_gender: 'female',
    doctor_name: '',
    medical_institution_name: '',
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
    regular_medication_supply_until: '',

    // Default Values for New Fields
    allergy_history: 'なし',
    guidance_recipient: '家族',
    medication_status: '良好',
    storage_status: '良好',
    other_dept_consultation: 'なし',
    concomitant_medications: 'なし',
    interaction_status: '併用薬/飲食物による相互作用なし',
}

const EditableSelect = ({ label, name, value, options, onChange }: {
    label: string,
    name: string,
    value: string,
    options: string[],
    onChange: (e: React.ChangeEvent<any>) => void
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
        onChange({ target: { name, value: val } } as any);
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
    const [drugOptions, setDrugOptions] = useState<string[]>([])
    const [patientMemo, setPatientMemo] = useState('')
    const [isBasicInfoOpen, setIsBasicInfoOpen] = useState(false) // Default collapsed
    const printRef = useRef<HTMLDivElement>(null)
    const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const handleDrugSearch = (query: string) => {
        if (!query || query.length < 1) {
            setDrugOptions([])
            return
        }

        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)

        searchTimeoutRef.current = setTimeout(async () => {
            const { data, error } = await supabase
                .from('medications')
                .select('name')
                .ilike('name', `%${query}%`)
                .limit(20)

            if (error) {
                console.error('Search error', error)
            } else if (data) {
                setDrugOptions(data.map(d => d.name))
            }
        }, 300)
    }

    const handlePrint = useReactToPrint({
        contentRef: printRef,
        documentTitle: `居宅療養管理指導報告書_${formData.patient_name || '名称未設定'}`,
    })

    // Hack: We need a full Report object for ReportPrint but formData is Partial
    const reportForPrint = { ...formData, id: id || 'preview', created_at: '', updated_at: '' } as Report

    useEffect(() => {
        if (id) {
            fetchReport(id)
        } else if (location.state && location.state.copyFrom) {
            // Copy logic
            const source = location.state.copyFrom as Report
            const { id: _, created_at: __, updated_at: ___, ...rest } = source

            // Reset Dates to Today
            const today = new Date().toISOString().split('T')[0]
            setFormData({
                ...EMPTY_REPORT,
                ...rest,
                // Ensure defaults for new fields if null in source
                allergy_history: rest.allergy_history ?? EMPTY_REPORT.allergy_history,
                guidance_recipient: rest.guidance_recipient ?? EMPTY_REPORT.guidance_recipient,
                medication_status: rest.medication_status ?? EMPTY_REPORT.medication_status,
                storage_status: rest.storage_status ?? EMPTY_REPORT.storage_status,
                other_dept_consultation: rest.other_dept_consultation ?? EMPTY_REPORT.other_dept_consultation,
                concomitant_medications: rest.concomitant_medications ?? EMPTY_REPORT.concomitant_medications,
                interaction_status: rest.interaction_status ?? EMPTY_REPORT.interaction_status,

                visit_date: today,
                prescription_date: today,
                dispensing_date: today,
            })
            // If copying from prev report, we might want to copy the memo too, or clear it.
            // Since it's a "handover" for THAT visit, maybe it makes sense to start empty, or copy.
            // Let's copy it for now as it's a "Copy" function.
            if (source.memo) setPatientMemo(source.memo)
            else setPatientMemo('')
        } else if (location.state && location.state.patientId) {
            // New Report from Patient Chart
            setFormData({
                ...formData,
                patient_name: location.state.patientName,
                patient_dob: location.state.patientDob,
                patient_gender: location.state.patientGender,
                patient_id: location.state.patientId,
                visit_date: new Date().toISOString().split('T')[0],
                prescription_date: new Date().toISOString().split('T')[0],
                dispensing_date: new Date().toISOString().split('T')[0],
                pharmacist_name: user?.user_metadata?.display_name || ''
            })
            setPatientMemo('') // Start empty for new report

            // Auto-fill medication instruction from latest report
            const fetchLatest = async () => {
                const { data } = await supabase
                    .from('reports')
                    .select('medication_instruction')
                    .eq('patient_id', location.state.patientId)
                    .order('visit_date', { ascending: false })
                    .limit(1)
                    .maybeSingle()

                if (data && data.medication_instruction) {
                    setFormData(prev => ({ ...prev, medication_instruction: data.medication_instruction }))
                }
            }
            fetchLatest()
        }
    }, [id, location.state])

    const fetchReport = async (reportId: string) => {
        const { data, error } = await supabase
            .from('reports')
            .select('*')
            .eq('id', reportId)
            .single()
        if (error) {
            console.error(error)
            alert('読み込みエラー')
        } else if (data) {
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

                medications_check_list: data.medications_check_list || [],
                medications_check_list_prn: data.medications_check_list_prn || []
            })
            // Load the snapshot memo if it exists
            if (data.memo) setPatientMemo(data.memo)
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        try {
            if (id) {
                // Update Logic
                const { error: updateError } = await supabase
                    .from('reports')
                    .update({ ...formData, memo: patientMemo })
                    .eq('id', id)
                if (updateError) throw updateError
            } else {
                // Insert Logic
                const { error: insertError } = await supabase.from('reports').insert([{ ...formData, memo: patientMemo }])
                if (insertError) throw insertError
            }

            toast.success('保存しました')
            navigate('/reports')
        } catch (error) {
            console.error(error)
            toast.error('保存に失敗しました')
        }
    }

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target
        setFormData(prev => ({ ...prev, [name]: value }))
    }

    return (
        <div>
            <div style={{ marginBottom: '1.5rem' }}>
                <button onClick={() => navigate(-1)} className="btn btn-ghost" style={{ paddingLeft: 0, marginBottom: '0.5rem' }}>
                    <ArrowLeft size={18} />
                    戻る
                </button>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 600 }}>
                    {id ? '報告書編集' : '新規報告書作成'}
                </h2>
            </div>

            <form
                onSubmit={handleSubmit}
                style={{ display: 'grid', gap: '2rem' }}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        // Allow Enter in Textareas, prevent in Inputs (except submit button which handles itself)
                        if (e.target instanceof HTMLTextAreaElement) return;
                        e.preventDefault();
                    }
                }}
            >

                {/* 基本情報 */}
                <section className="card" style={{ padding: '0.5rem 1.5rem' }}>
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
                                    {formData.patient_name} 様 ({calculateAge(formData.patient_dob)}歳)
                                </span>
                            )}
                        </h3>
                        {isBasicInfoOpen ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                    </div>

                    {isBasicInfoOpen && (
                        <div className="responsive-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem', paddingBottom: '1.5rem', borderTop: '1px solid var(--color-border)', paddingTop: '1rem' }}>
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
                        </div>
                    )}
                </section>

                {/* 訪問情報 */}
                <section className="card" style={{ padding: '1.5rem' }}>
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
                <section className="card" style={{ padding: '1.5rem' }}>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.5rem' }}>
                        状況確認
                    </h3>
                    <div className="responsive-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' }}>
                        <EditableSelect
                            label="アレルギー/副作用歴"
                            name="allergy_history"
                            value={formData.allergy_history || ''}
                            options={['なし']}
                            onChange={handleChange}
                        />
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
                        <EditableSelect
                            label="保管状況"
                            name="storage_status"
                            value={formData.storage_status || ''}
                            options={['良好', '本人管理', '家族管理', '看護師管理', '介護者管理']}
                            onChange={handleChange}
                        />

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
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '-1rem' }}>
                    <label className="label" style={{ marginBottom: 0 }}>定期薬残あり:</label>
                    <input
                        type="date"
                        name="regular_medication_supply_until"
                        className="input"
                        style={{ width: 'auto' }}
                        value={formData.regular_medication_supply_until || ''}
                        onChange={handleChange}
                    />
                    <span style={{ fontSize: '0.9rem' }}>まで</span>
                </div>

                <MedicationListForm
                    title="残薬詳細確認 (定期薬)"
                    items={formData.medications_check_list || []}
                    onUpdate={(newItems) => setFormData({ ...formData, medications_check_list: newItems })}
                    onSearchDrug={handleDrugSearch}
                    drugOptions={drugOptions}
                />

                <MedicationListForm
                    title="残薬詳細確認 (臨時薬・その他)"
                    items={formData.medications_check_list_prn || []}
                    onUpdate={(newItems) => setFormData({ ...formData, medications_check_list_prn: newItems })}
                    onSearchDrug={handleDrugSearch}
                    drugOptions={drugOptions}
                />

                {/* 指導内容・計画 */}
                <section className="card" style={{ padding: '1.5rem' }}>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.5rem' }}>
                        指導内容・計画
                    </h3>
                    <div style={{ display: 'grid', gap: '1rem' }}>
                        <div>
                            <label className="label">主訴等</label>
                            <textarea name="chief_complaint" className="input" rows={2} value={formData.chief_complaint || ''} onChange={handleChange}></textarea>
                        </div>
                        <div>
                            <label className="label">服薬指導内容</label>
                            <textarea name="medication_instruction" className="input" rows={4} value={formData.medication_instruction} onChange={handleChange}></textarea>
                        </div>
                        <div>
                            <label className="label">その他伝達事項</label>
                            <textarea name="side_effects" className="input" rows={2} value={formData.side_effects} onChange={handleChange}></textarea>
                        </div>
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
                                onChange={(e) => setPatientMemo(e.target.value)}
                                placeholder="今回の訪問に関する申し送り事項を入力してください（患者詳細の履歴に表示されます）"
                            ></textarea>
                        </div>
                    </div>
                </section>

                <div style={{
                    position: 'sticky',
                    bottom: '0',
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    backdropFilter: 'blur(10px)',
                    padding: '1rem',
                    margin: '0 -1rem -1rem -1rem', // Negative margin to stretch to edges if container has padding
                    borderTop: '1px solid var(--color-border)',
                    display: 'flex',
                    justifyContent: 'flex-end',
                    gap: '1rem',
                    zIndex: 50,
                    boxShadow: '0 -4px 6px -1px rgba(0, 0, 0, 0.05)'
                }}>
                    <button type="button" onClick={() => handlePrint()} className="btn btn-ghost" style={{ border: '1px solid var(--color-primary)', color: 'var(--color-primary)' }}>
                        <span style={{ marginRight: '0.5rem' }}>🖨️</span> 印刷 / PDFプレビュー
                    </button>
                    <button type="button" onClick={() => navigate(-1)} className="btn btn-ghost">キャンセル</button>
                    <button type="submit" className="btn btn-primary" style={{ padding: '0.75rem 2rem' }}>
                        <Save size={18} />
                        保存する
                    </button>
                </div>

            </form>

            <datalist id="drug-options-shared">
                {drugOptions.map((drug) => (
                    <option key={drug} value={drug} />
                ))}
            </datalist>

            {/* Hidden Print Component */}
            <div style={{ display: 'none' }}>
                <ReportPrint ref={printRef} report={reportForPrint} />
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

        /* Medication List Row Labels */
        .medication-row-label {
          display: none !important; /* Hide on Desktop by default */
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
