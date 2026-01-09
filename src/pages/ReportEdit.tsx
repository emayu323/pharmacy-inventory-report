import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { ArrowLeft, Save } from 'lucide-react'
import { useState, useRef, useEffect } from 'react' // Import useEffect
import { useReactToPrint } from 'react-to-print' // Import react-to-print
import { ReportPrint } from '../components/ReportPrint'
import { supabase } from '../supabase'
import { Plus, Trash2 } from 'lucide-react' // Add Plus, Trash2
import type { Report, MedicationCheckItem } from '../types' // Import Item type
import { COMMON_DRUGS } from '../data/drug_data'

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
    compliance_status: '',
    leftover_meds: '',
    storage_status: '',
    medication_instruction: '',
    side_effects: '',
    next_visit_plan: '',
    next_visit_date: '',
    medications_check_list: []
}

export default function ReportEdit() {
    const { id } = useParams()
    const navigate = useNavigate()
    const location = useLocation()
    // const isEdit = Boolean(id) // Unused for now

    // State for form
    const [formData, setFormData] = useState(EMPTY_REPORT)
    const printRef = useRef<HTMLDivElement>(null)

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
            setFormData(data)
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        try {
            if (id) {
                // Update Logic
                const { error: updateError } = await supabase
                    .from('reports')
                    .update(formData)
                    .eq('id', id)
                if (updateError) throw updateError
            } else {
                // Insert Logic
                const { error: insertError } = await supabase.from('reports').insert([formData])
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

            <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '2rem' }}>

                {/* 基本情報 */}
                <section className="card" style={{ padding: '1.5rem' }}>
                    <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.5rem' }}>
                        基本情報
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
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
                    <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.5rem' }}>
                        訪問・処方情報
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
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
                <section className="card" style={{ padding: '1.5rem' }}>
                    <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.5rem' }}>
                        薬剤管理状況
                    </h3>

                    {/* Medication Leftover Details */}
                    <div style={{ marginBottom: '1.5rem' }}>
                        <label className="label" style={{ marginBottom: '0.5rem' }}>残薬詳細確認</label>
                        <div style={{ display: 'grid', gap: '0.5rem' }}>
                            {(formData.medications_check_list || []).map((item, index) => (
                                <div key={item.id} style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'minmax(150px, 2fr) 1fr 1fr 1fr 1.5fr auto',
                                    gap: '0.5rem',
                                    alignItems: 'end',
                                    backgroundColor: 'var(--color-bg)',
                                    padding: '0.75rem',
                                    borderRadius: '6px'
                                }}>
                                    <div>
                                        <label className="label" style={{ fontSize: '0.75rem' }}>薬品名</label>
                                        <input
                                            type="text"
                                            className="input"
                                            placeholder="薬品名"
                                            list={`drug-options-${item.id}`}
                                            value={item.name}
                                            onChange={(e) => {
                                                const newList = [...(formData.medications_check_list || [])];
                                                newList[index].name = e.target.value;
                                                setFormData({ ...formData, medications_check_list: newList });
                                            }}
                                        />
                                        <datalist id={`drug-options-${item.id}`}>
                                            {COMMON_DRUGS.map((drug) => (
                                                <option key={drug} value={drug} />
                                            ))}
                                        </datalist>
                                    </div>
                                    <div>
                                        <label className="label" style={{ fontSize: '0.75rem' }}>現在残数</label>
                                        <input
                                            type="text"
                                            className="input"
                                            placeholder="残数"
                                            value={item.current_amount}
                                            onChange={(e) => {
                                                const newList = [...(formData.medications_check_list || [])];
                                                newList[index].current_amount = e.target.value;
                                                setFormData({ ...formData, medications_check_list: newList });
                                            }}
                                        />
                                    </div>
                                    <div>
                                        <label className="label" style={{ fontSize: '0.75rem' }}>次回必要数</label>
                                        <input
                                            type="text"
                                            className="input"
                                            placeholder="必要数"
                                            value={item.next_required_amount}
                                            onChange={(e) => {
                                                const newList = [...(formData.medications_check_list || [])];
                                                newList[index].next_required_amount = e.target.value;
                                                setFormData({ ...formData, medications_check_list: newList });
                                            }}
                                        />
                                    </div>
                                    <div>
                                        <label className="label" style={{ fontSize: '0.75rem' }}>単位</label>
                                        <input
                                            type="text"
                                            list={`unit-options-${item.id}`}
                                            className="input"
                                            placeholder="単位"
                                            value={item.unit}
                                            onChange={(e) => {
                                                const newList = [...(formData.medications_check_list || [])];
                                                newList[index].unit = e.target.value;
                                                setFormData({ ...formData, medications_check_list: newList });
                                            }}
                                        />
                                        <datalist id={`unit-options-${item.id}`}>
                                            <option value="日分" />
                                            <option value="錠" />
                                            <option value="包" />
                                            <option value="枚" />
                                            <option value="シート" />
                                            <option value="本" />
                                            <option value="g" />
                                            <option value="ml" />
                                        </datalist>
                                    </div>
                                    <div>
                                        <label className="label" style={{ fontSize: '0.75rem' }}>備考</label>
                                        <input
                                            type="text"
                                            className="input"
                                            placeholder="備考"
                                            value={item.notes}
                                            onChange={(e) => {
                                                const newList = [...(formData.medications_check_list || [])];
                                                newList[index].notes = e.target.value;
                                                setFormData({ ...formData, medications_check_list: newList });
                                            }}
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        className="btn btn-ghost"
                                        style={{ color: 'red', padding: '0.6rem' }}
                                        onClick={() => {
                                            const newList = (formData.medications_check_list || []).filter((_, i) => i !== index);
                                            setFormData({ ...formData, medications_check_list: newList });
                                        }}
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            ))}

                            <button
                                type="button"
                                className="btn btn-ghost"
                                style={{ border: '1px dashed var(--color-border)', justifyContent: 'center', color: 'var(--color-primary)' }}
                                onClick={() => {
                                    const newItem: MedicationCheckItem = {
                                        id: crypto.randomUUID(),
                                        name: '',
                                        current_amount: '',
                                        next_required_amount: '',
                                        unit: '日分',
                                        notes: '',
                                        checked: false
                                    };
                                    setFormData({
                                        ...formData,
                                        medications_check_list: [...(formData.medications_check_list || []), newItem]
                                    });
                                }}
                            >
                                <Plus size={18} style={{ marginRight: '0.5rem' }} />
                                医薬品を追加
                            </button>
                        </div>
                    </div>

                    <div style={{ display: 'grid', gap: '1rem' }}>
                        <div>
                            <label className="label">服薬コンプライアンス</label>
                            <textarea name="compliance_status" className="input" rows={2} placeholder="飲み忘れ、飲み残しの有無など" value={formData.compliance_status} onChange={handleChange}></textarea>
                        </div>
                        <div>
                            <label className="label">残薬確認</label>
                            <input type="text" name="leftover_meds" className="input" placeholder="残数など" value={formData.leftover_meds} onChange={handleChange} />
                        </div>
                        <div>
                            <label className="label">保管状況</label>
                            <input type="text" name="storage_status" className="input" placeholder="温度、湿度、整理状況など" value={formData.storage_status} onChange={handleChange} />
                        </div>
                    </div>
                </section>

                {/* 指導内容・計画 */}
                <section className="card" style={{ padding: '1.5rem' }}>
                    <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.5rem' }}>
                        指導内容・計画
                    </h3>
                    <div style={{ display: 'grid', gap: '1rem' }}>
                        <div>
                            <label className="label">服薬指導内容</label>
                            <textarea name="medication_instruction" className="input" rows={4} value={formData.medication_instruction} onChange={handleChange}></textarea>
                        </div>
                        <div>
                            <label className="label">副作用確認</label>
                            <textarea name="side_effects" className="input" rows={2} value={formData.side_effects} onChange={handleChange}></textarea>
                        </div>
                        <div>
                            <label className="label">次回訪問予定日</label>
                            <input type="date" name="next_visit_date" className="input" value={formData.next_visit_date || ''} onChange={handleChange} />
                        </div>
                        <div>
                            <label className="label">次回訪問予定・計画メモ</label>
                            <textarea name="next_visit_plan" className="input" rows={2} value={formData.next_visit_plan} onChange={handleChange}></textarea>
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
