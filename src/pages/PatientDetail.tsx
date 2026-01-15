import { useParams, Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, User, PlusCircle, Calendar, Edit2, Save, Clock, Copy, Building2 } from 'lucide-react'
import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import type { Patient, Report, Institution, InstitutionType } from '../types'
import toast from 'react-hot-toast'
import ConfirmToast from '../components/ConfirmToast'
import { calculateAge } from '../utils'

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
    const [institutions, setInstitutions] = useState<Institution[]>([])
    const [showCreateReportModal, setShowCreateReportModal] = useState(false)

    useEffect(() => {
        fetchInstitutions()
    }, [])

    const fetchInstitutions = async () => {
        const { data } = await supabase
            .from('institutions')
            .select('*')
            .order('name')
        if (data) setInstitutions(data as Institution[])
    }

    const handleInstitutionSelect = (type: InstitutionType, institutionId: string) => {
        const institution = institutions.find(i => i.id === institutionId)
        if (!institution) return

        if (type === 'hospital') {
            setEditForm(prev => ({
                ...prev,
                medical_institution_name: institution.name,
                primary_doctor: institution.doctor_name || prev.primary_doctor
            }))
        } else if (type === 'pharmacy') {
            setEditForm(prev => ({
                ...prev,
                pharmacy_name: institution.name
            }))
        } else if (type === 'care_office') {
            setEditForm(prev => ({
                ...prev,
                home_care_office: institution.name
            }))
        }
    }

    const handleSaveProfile = async () => {
        if (!patient || !editForm.name || !editForm.dob || !editForm.gender) {
            toast.error('必須項目を入力してください')
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
                    gender: editForm.gender,
                    address: editForm.address,
                    medical_institution_name: editForm.medical_institution_name,
                    primary_doctor: editForm.primary_doctor,
                    home_care_office: editForm.home_care_office,
                    care_manager: editForm.care_manager,
                    pharmacy_name: editForm.pharmacy_name
                })
                .eq('id', patient.id)

            if (error) throw error

            setPatient({ ...patient, ...editForm } as Patient)
            setIsEditingProfile(false)
            toast.success('基本情報を更新しました')
        } catch (error) {
            console.error('Error updating profile:', error)
            toast.error('更新に失敗しました')
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
            toast.error('データの読み込みに失敗しました')
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
            toast.success('申し送り事項を保存しました')
        } catch (error) {
            console.error('Error saving memo:', error)
            toast.error('保存に失敗しました')
        } finally {
            setSavingMemo(false)
        }
    }

    const handleStatusToggle = async () => {
        if (!patient) return
        const newStatus = !patient.is_active
        const confirmMsg = newStatus
            ? 'この患者を「表示」に戻しますか？'
            : 'この患者を「完了」（非表示）にしますか？\n（一覧画面で「完了した患者を表示」を選択すると確認できます）'

        toast((t) => (
            <ConfirmToast
                t={t}
                message={confirmMsg}
                confirmText={newStatus ? '戻す' : '完了にする'}
                type={newStatus ? 'info' : 'danger'}
                onConfirm={async () => {
                    try {
                        const { error } = await supabase
                            .from('patients')
                            .update({ is_active: newStatus })
                            .eq('id', patient.id)

                        if (error) throw error
                        setPatient({ ...patient, is_active: newStatus })
                        toast.success(newStatus ? '表示に戻しました' : '完了にしました')
                    } catch (e) {
                        console.error(e)
                        toast.error('更新に失敗しました')
                    }
                }}
            />
        ), {
            duration: Infinity,
            position: 'top-center'
        })
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
            <div className="card" style={{ padding: '1.5rem', marginBottom: '2rem', display: 'flex', gap: '1.5rem', alignItems: 'start', opacity: patient.is_active === false ? 0.8 : 1 }}>
                <div style={{
                    width: '80px', height: '80px',
                    borderRadius: '50%',
                    backgroundColor: patient.is_active === false ? '#9ca3af' : 'var(--color-primary)',
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
                                <label className="label" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text-muted)' }}>氏名</label>
                                <input
                                    className="input"
                                    value={editForm.name}
                                    onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                                    style={{
                                        display: 'block',
                                        width: '100%',
                                        padding: '0.625rem 0.875rem',
                                        fontSize: '1rem',
                                        lineHeight: '1.5',
                                        color: 'var(--color-text-main)',
                                        backgroundColor: '#fff',
                                        border: '1px solid var(--color-border)',
                                        borderRadius: 'var(--radius-md)',
                                        boxShadow: 'var(--shadow-sm)',
                                        transition: 'all 0.2s',
                                        outline: 'none'
                                    }}
                                    onFocus={(e) => {
                                        e.currentTarget.style.borderColor = 'var(--color-primary)';
                                        e.currentTarget.style.boxShadow = '0 0 0 3px rgba(var(--color-primary-rgb, 37, 99, 235), 0.1)';
                                    }}
                                    onBlur={(e) => {
                                        e.currentTarget.style.borderColor = 'var(--color-border)';
                                        e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
                                    }}
                                />
                            </div>
                            <div>
                                <label className="label" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text-muted)' }}>カナ</label>
                                <input
                                    className="input"
                                    value={editForm.kana || ''}
                                    placeholder="カナ"
                                    onChange={e => setEditForm({ ...editForm, kana: e.target.value })}
                                    style={{
                                        display: 'block',
                                        width: '100%',
                                        padding: '0.625rem 0.875rem',
                                        fontSize: '1rem',
                                        lineHeight: '1.5',
                                        color: 'var(--color-text-main)',
                                        backgroundColor: '#fff',
                                        border: '1px solid var(--color-border)',
                                        borderRadius: 'var(--radius-md)',
                                        boxShadow: 'var(--shadow-sm)',
                                        transition: 'all 0.2s',
                                        outline: 'none'
                                    }}
                                    onFocus={(e) => {
                                        e.currentTarget.style.borderColor = 'var(--color-primary)';
                                        e.currentTarget.style.boxShadow = '0 0 0 3px rgba(var(--color-primary-rgb, 37, 99, 235), 0.1)';
                                    }}
                                    onBlur={(e) => {
                                        e.currentTarget.style.borderColor = 'var(--color-border)';
                                        e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
                                    }}
                                />
                            </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                            <div>
                                <label className="label" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text-muted)' }}>性別</label>
                                <div style={{ position: 'relative' }}>
                                    <select
                                        className="input"
                                        value={editForm.gender}
                                        onChange={e => setEditForm({ ...editForm, gender: e.target.value as any })}
                                        style={{
                                            display: 'block',
                                            width: '100%',
                                            padding: '0.625rem 0.875rem',
                                            fontSize: '1rem',
                                            lineHeight: '1.5',
                                            color: 'var(--color-text-main)',
                                            backgroundColor: '#fff',
                                            border: '1px solid var(--color-border)',
                                            borderRadius: 'var(--radius-md)',
                                            boxShadow: 'var(--shadow-sm)',
                                            transition: 'all 0.2s',
                                            outline: 'none',
                                            appearance: 'none'
                                        }}
                                        onFocus={(e) => {
                                            e.currentTarget.style.borderColor = 'var(--color-primary)';
                                            e.currentTarget.style.boxShadow = '0 0 0 3px rgba(var(--color-primary-rgb, 37, 99, 235), 0.1)';
                                        }}
                                        onBlur={(e) => {
                                            e.currentTarget.style.borderColor = 'var(--color-border)';
                                            e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
                                        }}
                                    >
                                        <option value="male">男性</option>
                                        <option value="female">女性</option>
                                        <option value="other">その他</option>
                                    </select>
                                    <div style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--color-text-muted)' }}>▼</div>
                                </div>
                            </div>
                            <div>
                                <label className="label" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text-muted)' }}>生年月日</label>
                                <input
                                    type="date"
                                    className="input"
                                    value={editForm.dob}
                                    onChange={e => setEditForm({ ...editForm, dob: e.target.value })}
                                    style={{
                                        display: 'block',
                                        width: '100%',
                                        padding: '0.625rem 0.875rem',
                                        fontSize: '1rem',
                                        lineHeight: '1.5',
                                        color: 'var(--color-text-main)',
                                        backgroundColor: '#fff',
                                        border: '1px solid var(--color-border)',
                                        borderRadius: 'var(--radius-md)',
                                        boxShadow: 'var(--shadow-sm)',
                                        transition: 'all 0.2s',
                                        outline: 'none'
                                    }}
                                    onFocus={(e) => {
                                        e.currentTarget.style.borderColor = 'var(--color-primary)';
                                        e.currentTarget.style.boxShadow = '0 0 0 3px rgba(var(--color-primary-rgb, 37, 99, 235), 0.1)';
                                    }}
                                    onBlur={(e) => {
                                        e.currentTarget.style.borderColor = 'var(--color-border)';
                                        e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
                                    }}
                                />
                            </div>
                        </div>
                        <div style={{ marginBottom: '1rem' }}>
                            <label className="label" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text-muted)' }}>住所</label>
                            <input
                                className="input"
                                value={editForm.address || ''}
                                placeholder="住所"
                                onChange={e => setEditForm({ ...editForm, address: e.target.value })}
                                style={{
                                    display: 'block',
                                    width: '100%',
                                    padding: '0.625rem 0.875rem',
                                    fontSize: '1rem',
                                    lineHeight: '1.5',
                                    color: 'var(--color-text-main)',
                                    backgroundColor: '#fff',
                                    border: '1px solid var(--color-border)',
                                    borderRadius: 'var(--radius-md)',
                                    boxShadow: 'var(--shadow-sm)',
                                    transition: 'all 0.2s',
                                    outline: 'none'
                                }}
                                onFocus={(e) => {
                                    e.currentTarget.style.borderColor = 'var(--color-primary)';
                                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(var(--color-primary-rgb, 37, 99, 235), 0.1)';
                                }}
                                onBlur={(e) => {
                                    e.currentTarget.style.borderColor = 'var(--color-border)';
                                    e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
                                }}
                            />
                        </div>

                        {/* Relations Info Section */}
                        <div style={{ marginBottom: '2rem', padding: '1.5rem', backgroundColor: 'var(--color-bg-subtle, #f8fafc)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)' }}>
                            <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-primary)' }}>
                                <Building2 size={20} /> 関係機関
                            </h3>

                            <div style={{ display: 'grid', gap: '1.5rem' }}>
                                {/* Medical */}
                                <div style={{ paddingBottom: '1.5rem', borderBottom: '1px dashed var(--color-border)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                                        <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-text-muted)' }}>医療情報</div>
                                        <select
                                            className="input"
                                            style={{ width: 'auto', padding: '0.2rem 0.5rem', fontSize: '0.8rem', height: 'auto' }}
                                            onChange={(e) => {
                                                handleInstitutionSelect('hospital', e.target.value);
                                                e.target.value = '';
                                            }}
                                        >
                                            <option value="">医療機関を引用...</option>
                                            {institutions.filter(i => i.type === 'hospital').map(i => (
                                                <option key={i.id} value={i.id}>{i.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                                        <div>
                                            <input
                                                className="input"
                                                value={editForm.medical_institution_name || ''}
                                                placeholder="医療機関名"
                                                onChange={e => setEditForm({ ...editForm, medical_institution_name: e.target.value })}
                                                style={{ display: 'block', width: '100%', padding: '0.625rem 0.875rem', fontSize: '1rem', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}
                                            />
                                        </div>
                                        <div>
                                            <input
                                                className="input"
                                                value={editForm.primary_doctor || ''}
                                                placeholder="主治医"
                                                onChange={e => setEditForm({ ...editForm, primary_doctor: e.target.value })}
                                                style={{ display: 'block', width: '100%', padding: '0.625rem 0.875rem', fontSize: '1rem', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Pharmacy */}
                                <div style={{ paddingBottom: '1.5rem', borderBottom: '1px dashed var(--color-border)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                                        <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-text-muted)' }}>薬局情報</div>
                                        <select
                                            className="input"
                                            style={{ width: 'auto', padding: '0.2rem 0.5rem', fontSize: '0.8rem', height: 'auto' }}
                                            onChange={(e) => {
                                                handleInstitutionSelect('pharmacy', e.target.value);
                                                e.target.value = '';
                                            }}
                                        >
                                            <option value="">薬局を引用...</option>
                                            {institutions.filter(i => i.type === 'pharmacy').map(i => (
                                                <option key={i.id} value={i.id}>{i.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <input
                                            className="input"
                                            value={editForm.pharmacy_name || ''}
                                            placeholder="担当薬局"
                                            onChange={e => setEditForm({ ...editForm, pharmacy_name: e.target.value })}
                                            style={{ display: 'block', width: '100%', padding: '0.625rem 0.875rem', fontSize: '1rem', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}
                                        />
                                    </div>
                                </div>

                                {/* Care */}
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                                        <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-text-muted)' }}>介護情報</div>
                                        <select
                                            className="input"
                                            style={{ width: 'auto', padding: '0.2rem 0.5rem', fontSize: '0.8rem', height: 'auto' }}
                                            onChange={(e) => {
                                                handleInstitutionSelect('care_office', e.target.value);
                                                e.target.value = '';
                                            }}
                                        >
                                            <option value="">事業所を引用...</option>
                                            {institutions.filter(i => i.type === 'care_office').map(i => (
                                                <option key={i.id} value={i.id}>{i.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                                        <div>
                                            <input
                                                className="input"
                                                value={editForm.home_care_office || ''}
                                                placeholder="居宅介護支援事業所"
                                                onChange={e => setEditForm({ ...editForm, home_care_office: e.target.value })}
                                                style={{ display: 'block', width: '100%', padding: '0.625rem 0.875rem', fontSize: '1rem', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}
                                            />
                                        </div>
                                        <div>
                                            <input
                                                className="input"
                                                value={editForm.care_manager || ''}
                                                placeholder="ケアマネージャー"
                                                onChange={e => setEditForm({ ...editForm, care_manager: e.target.value })}
                                                style={{ display: 'block', width: '100%', padding: '0.625rem 0.875rem', fontSize: '1rem', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}
                                            />
                                        </div>
                                    </div>
                                </div>
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
                        <h2 style={{ fontSize: '2rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                            {patient.name}
                            <span style={{ fontSize: '1.25rem', fontWeight: 400, color: 'var(--color-text-muted)' }}>様</span>
                            {patient.is_active === false && (
                                <span style={{ fontSize: '1rem', backgroundColor: '#9ca3af', color: 'white', padding: '0.2rem 0.6rem', borderRadius: '4px', fontWeight: 500, display: 'flex', alignItems: 'center' }}>
                                    完了
                                </span>
                            )}
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
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
                                <button
                                    onClick={handleStatusToggle}
                                    className="btn btn-ghost"
                                    style={{
                                        padding: '0.4rem 0.8rem',
                                        height: 'auto',
                                        fontSize: '0.875rem',
                                        color: patient.is_active !== false ? 'var(--color-text-muted)' : 'var(--color-primary)',
                                        border: '1px solid var(--color-border)',
                                        backgroundColor: patient.is_active !== false ? 'transparent' : '#eff6ff',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.5rem',
                                        borderRadius: '6px'
                                    }}
                                >
                                    {patient.is_active !== false ? '完了にする' : '表示に戻す'}
                                </button>
                            </div>
                        </h2>
                        {!patient.is_active && (
                            <div style={{ marginBottom: '1rem', padding: '0.5rem 1rem', backgroundColor: '#f3f4f6', borderRadius: '6px', fontSize: '0.875rem', color: '#4b5563', border: '1px solid #e5e7eb' }}>
                                ※ この患者は現在「完了」ステータスになっています（一覧で非表示）
                            </div>
                        )}
                        {patient.kana && <div style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>{patient.kana}</div>}

                        <div style={{ marginTop: '0.5rem', maxWidth: '800px' }}>
                            <div className="responsive-grid" style={{ display: 'grid', gridTemplateColumns: 'auto auto', gap: '1rem 2rem' }}>
                                <div>
                                    <span style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', display: 'block' }}>性別</span>
                                    <span style={{ fontWeight: 500 }}>{patient.gender === 'male' ? '男性' : patient.gender === 'female' ? '女性' : 'その他'}</span>
                                </div>
                                <div>
                                    <span style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', display: 'block' }}>生年月日</span>
                                    <span style={{ fontWeight: 500 }}>
                                        {patient.dob.replace(/-/g, '/')}
                                        <span style={{ marginLeft: '0.5rem', fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>
                                            ({calculateAge(patient.dob)}歳)
                                        </span>
                                    </span>
                                </div>
                                <div style={{ gridColumn: '1 / -1' }}>
                                    <span style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', display: 'block' }}>住所</span>
                                    <span style={{ fontWeight: 500 }}>{patient.address || '-'}</span>
                                </div>

                                <div className="mobile-stack" style={{ gridColumn: '1 / -1', display: 'flex', flexWrap: 'wrap', gap: '2rem', alignItems: 'flex-start' }}>
                                    <div style={{ flex: 1, minWidth: '200px' }}>
                                        <span style={{ fontSize: '0.95rem', color: 'var(--color-text-muted)', display: 'block', marginBottom: '0.25rem' }}>医療機関名</span>
                                        <span style={{ fontWeight: 600, fontSize: '1.125rem', display: 'block' }}>{patient.medical_institution_name || '-'}</span>
                                    </div>
                                    <div style={{ flex: 1, minWidth: '150px' }}>
                                        <span style={{ fontSize: '0.95rem', color: 'var(--color-text-muted)', display: 'block', marginBottom: '0.25rem' }}>主治医</span>
                                        <span style={{ fontWeight: 600, fontSize: '1.125rem' }}>{patient.primary_doctor || '-'}</span>
                                    </div>
                                    {(() => {
                                        const inst = institutions.find(i => i.name === patient.medical_institution_name && i.type === 'hospital');
                                        if (inst && (inst.tel || inst.fax)) {
                                            return (
                                                <div style={{ flex: 0, minWidth: 'auto' }}>
                                                    <span style={{ fontSize: '0.95rem', color: 'var(--color-text-muted)', display: 'block', marginBottom: '0.25rem' }}>連絡先</span>
                                                    <div style={{
                                                        display: 'inline-flex',
                                                        gap: '0.75rem',
                                                        alignItems: 'center',
                                                        backgroundColor: 'rgba(0,0,0,0.03)',
                                                        padding: '0.3rem 0.8rem',
                                                        borderRadius: '4px',
                                                        fontSize: '1rem',
                                                        color: 'var(--color-text-main)',
                                                        border: '1px solid var(--color-border)'
                                                    }}>
                                                        {inst.tel && <a href={`tel:${inst.tel}`} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: 'inherit', textDecoration: 'none' }} title="電話をかける"><span style={{ opacity: 0.7, fontSize: '0.8rem' }}>TEL</span> <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{inst.tel}</span></a>}
                                                        {inst.tel && inst.fax && <span style={{ opacity: 0.3 }}>|</span>}
                                                        {inst.fax && <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}><span style={{ opacity: 0.7, fontSize: '0.8rem' }}>FAX</span> <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{inst.fax}</span></span>}
                                                    </div>
                                                </div>
                                            );
                                        }
                                        return null;
                                    })()}
                                </div>

                                <div className="mobile-stack" style={{ gridColumn: '1 / -1', display: 'flex', flexWrap: 'wrap', gap: '2rem', alignItems: 'flex-start' }}>
                                    <div style={{ flex: 1, minWidth: '200px' }}>
                                        <span style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', display: 'block' }}>居宅介護支援事業所</span>
                                        <span style={{ fontWeight: 500, display: 'block' }}>{patient.home_care_office || '-'}</span>
                                    </div>
                                    <div style={{ flex: 1, minWidth: '150px' }}>
                                        <span style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', display: 'block' }}>ケアマネージャー</span>
                                        <span style={{ fontWeight: 500 }}>{patient.care_manager || '-'}</span>
                                    </div>
                                    {(() => {
                                        const inst = institutions.find(i => i.name === patient.home_care_office && i.type === 'care_office');
                                        if (inst && (inst.tel || inst.fax)) {
                                            return (
                                                <div style={{ flex: 0, minWidth: 'auto' }}>
                                                    <span style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', display: 'block' }}>連絡先</span>
                                                    <div style={{
                                                        display: 'inline-flex',
                                                        gap: '0.75rem',
                                                        alignItems: 'center',
                                                        backgroundColor: 'rgba(0,0,0,0.03)',
                                                        padding: '0.2rem 0.6rem',
                                                        borderRadius: '4px',
                                                        fontSize: '0.85rem',
                                                        color: 'var(--color-text-main)',
                                                        border: '1px solid var(--color-border)'
                                                    }}>
                                                        {inst.tel && <a href={`tel:${inst.tel}`} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: 'inherit', textDecoration: 'none' }} title="電話をかける"><span style={{ opacity: 0.7, fontSize: '0.75rem' }}>TEL</span> <span style={{ fontFamily: 'monospace', fontWeight: 500 }}>{inst.tel}</span></a>}
                                                        {inst.tel && inst.fax && <span style={{ opacity: 0.3 }}>|</span>}
                                                        {inst.fax && <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}><span style={{ opacity: 0.7, fontSize: '0.75rem' }}>FAX</span> <span style={{ fontFamily: 'monospace', fontWeight: 500 }}>{inst.fax}</span></span>}
                                                    </div>
                                                </div>
                                            );
                                        }
                                        return null;
                                    })()}
                                </div>

                                <div className="mobile-stack" style={{ gridColumn: '1 / -1', display: 'flex', flexWrap: 'wrap', gap: '2rem', alignItems: 'flex-start' }}>
                                    <div style={{ flex: 1, minWidth: '200px' }}>
                                        <span style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', display: 'block' }}>担当薬局</span>
                                        <span style={{ fontWeight: 500, display: 'block' }}>{patient.pharmacy_name || '-'}</span>
                                    </div>
                                    {(() => {
                                        const inst = institutions.find(i => i.name === patient.pharmacy_name && i.type === 'pharmacy');
                                        if (inst && (inst.tel || inst.fax)) {
                                            return (
                                                <div style={{ flex: 0, minWidth: 'auto' }}>
                                                    <span style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', display: 'block' }}>連絡先</span>
                                                    <div style={{
                                                        display: 'inline-flex',
                                                        gap: '0.75rem',
                                                        alignItems: 'center',
                                                        backgroundColor: 'rgba(0,0,0,0.03)',
                                                        padding: '0.2rem 0.6rem',
                                                        borderRadius: '4px',
                                                        fontSize: '0.85rem',
                                                        color: 'var(--color-text-main)',
                                                        border: '1px solid var(--color-border)'
                                                    }}>
                                                        {inst.tel && <a href={`tel:${inst.tel}`} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: 'inherit', textDecoration: 'none' }} title="電話をかける"><span style={{ opacity: 0.7, fontSize: '0.75rem' }}>TEL</span> <span style={{ fontFamily: 'monospace', fontWeight: 500 }}>{inst.tel}</span></a>}
                                                        {inst.tel && inst.fax && <span style={{ opacity: 0.3 }}>|</span>}
                                                        {inst.fax && <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}><span style={{ opacity: 0.7, fontSize: '0.75rem' }}>FAX</span> <span style={{ fontFamily: 'monospace', fontWeight: 500 }}>{inst.fax}</span></span>}
                                                    </div>
                                                </div>
                                            );
                                        }
                                        return null;
                                    })()}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                <div>
                    {!isEditingProfile && (
                        <button
                            onClick={() => {
                                if (reports.length > 0) {
                                    setShowCreateReportModal(true)
                                } else {
                                    // Default new report if no history
                                    navigate('/reports/new', { state: { patientId: patient.id, patientName: patient.name, patientDob: patient.dob, patientGender: patient.gender } })
                                }
                            }}
                            className="btn btn-primary"
                        >
                            <PlusCircle size={18} />
                            報告書作成
                        </button>
                    )}
                </div>
            </div>

            {/* Create Report Modal */}
            {showCreateReportModal && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(0, 0, 0, 0.5)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 100,
                    padding: '1rem'
                }}>
                    <div style={{
                        backgroundColor: 'white',
                        borderRadius: '12px',
                        padding: '1.5rem',
                        maxWidth: '400px',
                        width: '100%',
                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
                    }}>
                        <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1rem' }}>
                            報告書の作成
                        </h3>
                        <p style={{ color: 'var(--color-text-muted)', marginBottom: '1.5rem', lineHeight: '1.6' }}>
                            直近の報告書（{reports[0]?.visit_date?.replace(/-/g, '/')}）の内容を引き継いで作成しますか？
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            <button
                                onClick={() => {
                                    const latestReport = reports[0]
                                    navigate('/reports/new', { state: { copyFrom: latestReport } })
                                    setShowCreateReportModal(false)
                                }}
                                className="btn btn-primary"
                                style={{ justifyContent: 'center', width: '100%' }}
                            >
                                <Copy size={18} />
                                直近の内容を引き継いで作成
                            </button>
                            <button
                                onClick={() => {
                                    navigate('/reports/new', { state: { patientId: patient.id, patientName: patient.name, patientDob: patient.dob, patientGender: patient.gender } })
                                    setShowCreateReportModal(false)
                                }}
                                className="btn btn-ghost"
                                style={{ justifyContent: 'center', width: '100%', border: '1px solid var(--color-border)' }}
                            >
                                <PlusCircle size={18} />
                                新規作成（引き継がない）
                            </button>
                            <button
                                onClick={() => setShowCreateReportModal(false)}
                                className="btn btn-ghost"
                                style={{ justifyContent: 'center', width: '100%', color: 'var(--color-text-muted)' }}
                            >
                                キャンセル
                            </button>
                        </div>
                    </div>
                </div>
            )}


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
                        特記事項
                    </h3>
                    {savingMemo && (
                        <span style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                            <Clock size={14} /> 保存中...
                        </span>
                    )}
                </div>

                <div style={{ padding: '1.5rem' }}>
                    <textarea
                        ref={(el) => {
                            if (el) {
                                el.style.height = 'auto';
                                el.style.height = el.scrollHeight + 'px';
                            }
                        }}
                        style={{
                            width: '100%',
                            minHeight: '120px',
                            resize: 'none', // Disable manual resize as we auto-resize
                            border: '1px solid var(--color-border)',
                            borderRadius: '8px',
                            padding: '1rem',
                            fontSize: '1rem',
                            lineHeight: '1.6',
                            outline: 'none',
                            backgroundColor: 'var(--color-bg)',
                            transition: 'border-color 0.2s, box-shadow 0.2s',
                            overflow: 'hidden' // Hide scrollbar
                        }}
                        onInput={(e) => {
                            e.currentTarget.style.height = 'auto';
                            e.currentTarget.style.height = e.currentTarget.scrollHeight + 'px';
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
                        placeholder="・アレルギー情報&#13;&#10;・家族構成やキーパーソン&#13;&#10;など、継続的に確認すべき事項を入力してください。"
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
                    <div
                        key={report.id}
                        className="card"
                        style={{
                            padding: '1rem 1.5rem',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            cursor: 'pointer',
                            transition: 'background-color 0.2s',
                            gap: '1rem' // Add gap for mobile stack
                        }}
                        onClick={() => navigate(`/reports/${report.id}`)}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--color-bg)'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                        <div className="mobile-stack" style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', width: '100%' }}>
                            <div style={{
                                backgroundColor: 'var(--color-bg)',
                                padding: '0.5rem',
                                borderRadius: '8px',
                                textAlign: 'center',
                                minWidth: '80px',
                                flexShrink: 0
                            }}>
                                <div style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>訪問日</div>
                                <div style={{ fontWeight: 600, fontSize: '1.125rem' }}>{report.visit_date.replace(/-/g, '/')}</div>
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', display: 'flex', gap: '1rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                                    <span>処方: {report.prescription_date?.replace(/-/g, '/') || '-'}</span>
                                </div>
                                {report.memo && (
                                    <div style={{
                                        fontSize: '0.875rem',
                                        backgroundColor: '#f0f9ff',
                                        color: '#0369a1',
                                        padding: '0.4rem 0.8rem',
                                        borderRadius: '4px',
                                        borderLeft: '3px solid #0ea5e9',
                                        display: 'inline-block',
                                        maxWidth: '100%',
                                        whiteSpace: 'pre-wrap'
                                    }}>
                                        {report.memo}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '0.5rem' }} onClick={(e) => e.stopPropagation()}>
                            <button
                                onClick={() => navigate('/reports/new', { state: { copyFrom: report } })}
                                className="btn btn-ghost"
                                title="この内容をコピーして新規作成"
                                style={{ border: '1px solid var(--color-border)', color: 'var(--color-primary)' }}
                            >
                                <Copy size={16} />
                            </button>
                            <Link to={`/reports/${report.id}/edit`} className="btn btn-ghost" title="編集">
                                <Edit2 size={16} />
                            </Link>
                        </div>
                    </div>
                ))}
            </div>
        </div >
    )
}
