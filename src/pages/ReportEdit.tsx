import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { ArrowLeft, Save } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import { useReactToPrint } from 'react-to-print'
import { ReportPrint } from '../components/ReportPrint'
import { supabase } from '../supabase'
import type { Report } from '../types'
import MedicationListForm from '../components/MedicationListForm'

// Mock for edit, would fetch based on ID in real app
const EMPTY_REPORT: Omit<Report, 'id' | 'created_at' | 'updated_at'> = {
    patient_name: '',
    patient_dob: '',
    patient_gender: 'female',
    doctor_name: '',
    pharmacist_name: '',
    prescription_date: new Date().toISOString().split('T')[0],
    dispensing_date: new Date().toISOString().split('T')[0],
    visit_date: new Date().toISOString().split('T')[0],
    medication_instruction: '',
    side_effects: '',
    next_visit_date: '',
    medications_check_list: [],
    medications_check_list_prn: []
}

export default function ReportEdit() {
    const { id } = useParams()
    const navigate = useNavigate()
    const location = useLocation()
    // const isEdit = Boolean(id) // Unused for now

    // State for form
    const [formData, setFormData] = useState(EMPTY_REPORT)
    const [drugOptions, setDrugOptions] = useState<string[]>([])
    const [patientMemo, setPatientMemo] = useState('') // New: Patient Memo
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
        documentTitle: `訪問薬剤管理指導報告書_${formData.patient_name || '名称未設定'}`,
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
                ...rest,
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

            alert('保存しました')
            navigate('/reports')
        } catch (error) {
            console.error(error)
            alert('保存に失敗しました')
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
                <section className="card" style={{ padding: '1.5rem' }}>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.5rem' }}>
                        基本情報
                    </h3>
                    <div className="responsive-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
                        <div>
                            <label className="label">患者氏名</label>
                            <input type="text" name="patient_name" className="input" required value={formData.patient_name} onChange={handleChange} />
                        </div>
                        <div>
                            <label className="label">生年月日</label>
                            <input type="date" name="patient_dob" className="input" required value={formData.patient_dob} onChange={handleChange} />
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
                            <label className="label">主治医</label>
                            <input type="text" name="doctor_name" className="input" value={formData.doctor_name} onChange={handleChange} />
                        </div>
                    </div>
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

                {/* 薬剤管理状況 */}
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

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
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
      `}</style>
        </div>
    )
}
