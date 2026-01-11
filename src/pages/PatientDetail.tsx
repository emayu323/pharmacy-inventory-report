import { useParams, Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, User, PlusCircle, FileText, Calendar, Edit2, Save, NotebookPen, Clock, Copy } from 'lucide-react'
import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import type { Patient, Report } from '../types'

export default function PatientDetail() {
    const { id } = useParams()
    const navigate = useNavigate()
    const [patient, setPatient] = useState<Patient | null>(null)
    const [reports, setReports] = useState<Report[]>([])
    const [memo, setMemo] = useState('')
    const [loading, setLoading] = useState(true)
    const [savingMemo, setSavingMemo] = useState(false)

    // Profile Edit State
    const [isEditingProfile, setIsEditingProfile] = useState(false)
    const [savingProfile, setSavingProfile] = useState(false)
    const [editForm, setEditForm] = useState<Partial<Patient>>({})

    const handleSaveProfile = async () => {
        if (!patient || !editForm.name || !editForm.dob || !editForm.gender) {
            alert('必須項目を入力してください')
            return
        }
        try {
            setSavingProfile(true)
            const { error } = await supabase
                .from('patients')
                .update({
                    name: editForm.name,
                    kana: editForm.kana,
                    dob: editForm.dob,
                    gender: editForm.gender
                })
                .eq('id', patient.id)

            if (error) throw error

            setPatient({ ...patient, ...editForm } as Patient)
            setIsEditingProfile(false)
            alert('基本情報を更新しました')
        } catch (error) {
            console.error('Error updating profile:', error)
            alert('更新に失敗しました')
        } finally {
            setSavingProfile(false)
        }
    }

    useEffect(() => {
        if (id) fetchPatientData(id)
    }, [id])

    const fetchPatientData = async (patientId: string) => {
        try {
            setLoading(true)

            // Fetch Patient Info
            const { data: pData, error: pError } = await supabase
                .from('patients')
                .select('*')
                .eq('id', patientId)
                .single()

            if (pError) throw pError
            setPatient(pData as Patient)
            setMemo(pData.memo || '')

            // Fetch Reports History
            const { data: rData, error: rError } = await supabase
                .from('reports')
                .select('*')
                .eq('patient_id', patientId)
                .order('visit_date', { ascending: false })

            if (rError) throw rError
            setReports(rData as Report[])

        } catch (error) {
            console.error('Error fetching data:', error)
            alert('データの読み込みに失敗しました')
        } finally {
            setLoading(false)
        }
    }

    const handleSaveMemo = async () => {
        if (!patient) return
        try {
            setSavingMemo(true)
            const { error } = await supabase
                .from('patients')
                .update({ memo })
                .eq('id', patient.id)

            if (error) throw error
            alert('申し送り事項を保存しました')
        } catch (error) {
            console.error('Error saving memo:', error)
            alert('保存に失敗しました')
        } finally {
            setSavingMemo(false)
        }
    }

    if (loading) return <div className="container" style={{ padding: '2rem', textAlign: 'center' }}>読み込み中...</div>
    if (!patient) return <div className="container">患者が見つかりません</div>

    return (
        <div>
            {/* Header / Breadcrumb */}
            <div style={{ marginBottom: '1.5rem' }}>
                <Link to="/reports" className="btn btn-ghost" style={{ paddingLeft: 0, marginBottom: '0.5rem', display: 'inline-flex' }}>
                    <ArrowLeft size={18} />
                    患者一覧に戻る
                </Link>
            </div>

            {/* Patient Profile Card */}
            <div className="card" style={{ padding: '1.5rem', marginBottom: '2rem', display: 'flex', gap: '1.5rem', alignItems: 'start' }}>
                <div style={{
                    width: '80px', height: '80px',
                    borderRadius: '50%',
                    backgroundColor: 'var(--color-primary)',
                    color: 'white',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '2rem'
                }}>
                    <User size={40} />
                </div>

                {isEditingProfile ? (
                    // EDIT MODE
                    <div style={{ flex: 1 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                            <div>
                                <label className="label">氏名</label>
                                <input
                                    className="input"
                                    value={editForm.name}
                                    onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="label">カナ</label>
                                <input
                                    className="input"
                                    value={editForm.kana || ''}
                                    placeholder="カナ"
                                    onChange={e => setEditForm({ ...editForm, kana: e.target.value })}
                                />
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                            <div>
                                <label className="label">性別</label>
                                <select
                                    className="input"
                                    value={editForm.gender}
                                    onChange={e => setEditForm({ ...editForm, gender: e.target.value as any })}
                                >
                                    <option value="male">男性</option>
                                    <option value="female">女性</option>
                                    <option value="other">その他</option>
                                </select>
                            </div>
                            <div>
                                <label className="label">生年月日</label>
                                <input
                                    type="date"
                                    className="input"
                                    value={editForm.dob}
                                    onChange={e => setEditForm({ ...editForm, dob: e.target.value })}
                                />
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button className="btn btn-primary" onClick={handleSaveProfile} disabled={savingProfile}>
                                <Save size={18} /> 保存
                            </button>
                            <button className="btn btn-ghost" onClick={() => setIsEditingProfile(false)} disabled={savingProfile}>
                                キャンセル
                            </button>
                        </div>
                    </div>
                ) : (
                    // VIEW MODE
                    <div style={{ flex: 1 }}>
                        <h2 style={{ fontSize: '1.75rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                            {patient.name}
                            <span style={{ fontSize: '1rem', fontWeight: 400, color: 'var(--color-text-muted)' }}>様</span>
                            <button
                                onClick={() => {
                                    setEditForm(patient)
                                    setIsEditingProfile(true)
                                }}
                                className="btn btn-ghost"
                                style={{
                                    padding: '0.4rem 0.8rem',
                                    height: 'auto',
                                    fontSize: '0.875rem',
                                    color: 'var(--color-primary)',
                                    border: '1px solid var(--color-primary-light, #e0e7ff)',
                                    backgroundColor: 'var(--color-bg-subtle, #f8fafc)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    borderRadius: '6px'
                                }}
                            >
                                <Edit2 size={16} />
                                基本情報を編集
                            </button>
                        </h2>
                        {patient.kana && <div style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>{patient.kana}</div>}

                        <div style={{ display: 'grid', gridTemplateColumns: 'auto auto', gap: '1rem 2rem', marginTop: '0.5rem', maxWidth: '400px' }}>
                            <div>
                                <span style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', display: 'block' }}>性別</span>
                                <span style={{ fontWeight: 500 }}>{patient.gender === 'male' ? '男性' : patient.gender === 'female' ? '女性' : 'その他'}</span>
                            </div>
                            <div>
                                <span style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', display: 'block' }}>生年月日</span>
                                <span style={{ fontWeight: 500 }}>{patient.dob.replace(/-/g, '/')}</span>
                            </div>
                        </div>
                    </div>
                )}

                <div>
                    {!isEditingProfile && (
                        <button
                            onClick={() => navigate('/reports/new', { state: { patientId: patient.id, patientName: patient.name, patientDob: patient.dob, patientGender: patient.gender } })}
                            className="btn btn-primary"
                        >
                            <PlusCircle size={18} />
                            報告書作成
                        </button>
                    )}
                </div>
            </div>

            {/* Memo Section - Enhanced Design */}
            <div className="card" style={{
                padding: '0',
                marginBottom: '2rem',
                borderLeft: '5px solid var(--color-primary)',
                overflow: 'hidden'
            }}>
                <div style={{
                    padding: '1rem 1.5rem',
                    borderBottom: '1px solid var(--color-border)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    backgroundColor: 'rgba(var(--color-primary-rgb), 0.03)'
                }}>
                    <h3 style={{
                        fontSize: '1.125rem',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        color: 'var(--color-primary)'
                    }}>
                        <NotebookPen size={20} />
                        申し送り事項 / 特記事項
                    </h3>
                    {savingMemo && (
                        <span style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                            <Clock size={14} /> 保存中...
                        </span>
                    )}
                </div>

                <div style={{ padding: '1.5rem' }}>
                    <textarea
                        style={{
                            width: '100%',
                            minHeight: '120px',
                            resize: 'vertical',
                            border: '1px solid var(--color-border)',
                            borderRadius: '8px',
                            padding: '1rem',
                            fontSize: '1rem',
                            lineHeight: '1.6',
                            outline: 'none',
                            backgroundColor: 'var(--color-bg)',
                            transition: 'border-color 0.2s, box-shadow 0.2s'
                        }}
                        onFocus={(e) => {
                            e.currentTarget.style.borderColor = 'var(--color-primary)';
                            e.currentTarget.style.boxShadow = '0 0 0 3px rgba(var(--color-primary-rgb), 0.1)';
                            e.currentTarget.style.backgroundColor = '#fff';
                        }}
                        onBlur={(e) => {
                            e.currentTarget.style.borderColor = 'var(--color-border)';
                            e.currentTarget.style.boxShadow = 'none';
                            e.currentTarget.style.backgroundColor = 'var(--color-bg)';
                        }}
                        placeholder="・アレルギー情報&#13;&#10;・家族構成やキーパーソン&#13;&#10;・服薬管理の注意点&#13;&#10;など、継続的に確認すべき事項を入力してください。"
                        value={memo}
                        onChange={(e) => setMemo(e.target.value)}
                    />

                    <div style={{ textAlign: 'right', marginTop: '1rem' }}>
                        <button
                            onClick={handleSaveMemo}
                            className="btn btn-primary"
                            disabled={savingMemo}
                            style={{
                                padding: '0.6rem 2rem',
                                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                            }}
                        >
                            <Save size={18} />
                            変更を保存
                        </button>
                    </div>
                </div>
            </div>

            {/* History Section */}
            <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Calendar size={20} />
                訪問履歴
            </h3>

            <div style={{ display: 'grid', gap: '1rem' }}>
                {reports.length === 0 && (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)', border: '1px dashed var(--color-border)', borderRadius: 'var(--radius-md)' }}>
                        まだ報告書がありません
                    </div>
                )}

                {reports.map(report => (
                    <div key={report.id} className="card" style={{ padding: '1rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
                            <div style={{
                                backgroundColor: 'var(--color-bg)',
                                padding: '0.5rem',
                                borderRadius: '8px',
                                textAlign: 'center',
                                minWidth: '80px'
                            }}>
                                <div style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>訪問日</div>
                                <div style={{ fontWeight: 600, fontSize: '1.125rem' }}>{report.visit_date.replace(/-/g, '/')}</div>
                            </div>
                            <div>
                                <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>担当: {report.pharmacist_name}</div>
                                <div style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', display: 'flex', gap: '1rem' }}>
                                    <span>処方: {report.prescription_date?.replace(/-/g, '/') || '-'}</span>
                                    <span>次回: {report.next_visit_plan || '未定'}</span>
                                </div>
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button
                                onClick={() => navigate('/reports/new', { state: { copyFrom: report } })}
                                className="btn btn-ghost"
                                title="この内容をコピーして新規作成"
                                style={{ border: '1px solid var(--color-border)', color: 'var(--color-primary)' }}
                            >
                                <Copy size={16} />
                            </button>
                            <Link to={`/reports/${report.id}`} className="btn btn-ghost" style={{ border: '1px solid var(--color-border)' }}>
                                <FileText size={16} />
                                詳細・印刷
                            </Link>
                            <Link to={`/reports/${report.id}/edit`} className="btn btn-ghost" title="編集">
                                <Edit2 size={16} />
                            </Link>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
