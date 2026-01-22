import { useParams, Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, User, PlusCircle, Calendar, Save, Copy, Building2, Edit2, Phone, Printer } from 'lucide-react'
import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import type { Patient, Report, Institution, InstitutionType } from '../types'
import toast from 'react-hot-toast'
import ConfirmToast from '../components/ConfirmToast'

export default function PatientDetail() {
    const { id } = useParams()
    const navigate = useNavigate()
    const [patient, setPatient] = useState<Patient | null>(null)
    const [reports, setReports] = useState<Report[]>([])
    // editForm is now the single source of truth for the UI
    const [editForm, setEditForm] = useState<Partial<Patient>>({})
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [isEditing, setIsEditing] = useState(false)
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
        } else if (type === 'nursing_station') {
            setEditForm(prev => ({
                ...prev,
                visiting_nursing_station_name: institution.name
            }))
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
            const patientData = pData as Patient
            setPatient(patientData)
            setEditForm(patientData) // Initialize editForm

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

    const handleSaveAll = async () => {
        if (!editForm.name || !editForm.dob || !editForm.gender) {
            toast.error('氏名、生年月日、性別は必須です')
            return
        }

        try {
            setSaving(true)
            const { error } = await supabase
                .from('patients')
                .update({
                    name: editForm.name,
                    kana: editForm.kana,
                    gender: editForm.gender,
                    dob: editForm.dob,
                    address: editForm.address,
                    contact1: editForm.contact1,
                    contact2: editForm.contact2,
                    contact2_memo: editForm.contact2_memo,
                    medical_institution_name: editForm.medical_institution_name,
                    primary_doctor: editForm.primary_doctor,
                    home_care_office: editForm.home_care_office,
                    care_manager: editForm.care_manager,
                    visiting_nursing_station_name: editForm.visiting_nursing_station_name,
                    pharmacy_name: editForm.pharmacy_name,
                    memo: editForm.memo
                })
                .eq('id', patient?.id)

            if (error) throw error

            setPatient({ ...patient!, ...editForm } as Patient)
            toast.success('保存しました')
        } catch (error) {
            console.error(error)
            toast.error('保存に失敗しました')
        } finally {
            setSaving(false)
            setIsEditing(false)
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

            {/* Patient Profile Card (Always Editable) */}
            <div className="card" style={{ padding: '1.5rem', marginBottom: '2rem', display: 'flex', gap: '1.5rem', alignItems: 'start', opacity: patient.is_active === false ? 0.8 : 1 }}>
                <div style={{
                    width: '80px', height: '80px',
                    borderRadius: '50%',
                    backgroundColor: patient.is_active === false ? '#9ca3af' : 'var(--color-primary)',
                    color: 'white',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '2rem',
                    flexShrink: 0
                }}>
                    <User size={40} />
                </div>

                <div style={{ flex: 1 }}>
                    {/* Header with Name and Toggle */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                        <h2 style={{ fontSize: '1.5rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                            基本情報
                            {patient.is_active === false && (
                                <span style={{ fontSize: '1rem', backgroundColor: '#9ca3af', color: 'white', padding: '0.2rem 0.6rem', borderRadius: '4px', fontWeight: 500 }}>
                                    完了
                                </span>
                            )}
                        </h2>
                        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                            {!isEditing ? (
                                <button
                                    onClick={() => setIsEditing(true)}
                                    className="btn btn-ghost"
                                    style={{
                                        padding: '0.4rem 0.8rem',
                                        height: 'auto',
                                        fontSize: '0.875rem',
                                        border: '1px solid var(--color-border)',
                                    }}
                                >
                                    <Edit2 size={16} />
                                    編集
                                </button>
                            ) : (
                                <button
                                    onClick={() => {
                                        setIsEditing(false);
                                        setEditForm(patient || {}); // Revert changes on cancel? User didn't specify cancel logic, but View mode implies reset or show current. I'll just toggle off for now, but resetting is safer.
                                        // Actually better to just toggle off. If they want to save, they press Save. If they toggle off, maybe they expect cancel.
                                        setEditForm({ ...patient, memo: editForm.memo }); // Keep memo edits, revert profile? Complex.
                                        // Let's just toggle isEditing. If they click save later, it saves editForm.
                                        // Wait, if I change name, toggle view (seeing old name), then click save, it saves NEW name? That's confusing.
                                        // Standard UX: Cancel reverts.
                                        setEditForm({ ...patient, memo: editForm.memo }); // Revert profile fields
                                    }}
                                    className="btn btn-ghost"
                                    style={{
                                        padding: '0.4rem 0.8rem',
                                        height: 'auto',
                                        fontSize: '0.875rem',
                                        border: '1px solid var(--color-border)',
                                        color: 'var(--color-text-muted)'
                                    }}
                                >
                                    キャンセル
                                </button>
                            )}
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
                                    borderRadius: '6px'
                                }}
                            >
                                {patient.is_active !== false ? '完了にする' : '表示に戻す'}
                            </button>
                        </div>
                    </div>

                    {isEditing ? (
                        <div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                                <div>
                                    <label className="label" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text-muted)' }}>氏名</label>
                                    <input
                                        className="input"
                                        value={editForm.name || ''}
                                        onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                                        style={{ display: 'block', width: '100%', padding: '0.625rem 0.875rem', fontSize: '1rem', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}
                                    />
                                </div>
                                <div>
                                    <label className="label" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text-muted)' }}>カナ</label>
                                    <input
                                        className="input"
                                        value={editForm.kana || ''}
                                        placeholder="カナ"
                                        onChange={e => setEditForm({ ...editForm, kana: e.target.value })}
                                        style={{ display: 'block', width: '100%', padding: '0.625rem 0.875rem', fontSize: '1rem', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}
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
                                            style={{ display: 'block', width: '100%', padding: '0.625rem 0.875rem', fontSize: '1rem', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', appearance: 'none' }}
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
                                        value={editForm.dob || ''}
                                        onChange={e => setEditForm({ ...editForm, dob: e.target.value })}
                                        style={{ display: 'block', width: '100%', padding: '0.625rem 0.875rem', fontSize: '1rem', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}
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
                                    style={{ display: 'block', width: '100%', padding: '0.625rem 0.875rem', fontSize: '1rem', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}
                                />
                            </div>

                            {/* Contact Info */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                                <div>
                                    <label className="label" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text-muted)' }}>連絡先1</label>
                                    <input
                                        className="input"
                                        value={editForm.contact1 || ''}
                                        placeholder="電話番号など"
                                        onChange={e => setEditForm({ ...editForm, contact1: e.target.value })}
                                        style={{ display: 'block', width: '100%', padding: '0.625rem 0.875rem', fontSize: '1rem', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}
                                    />
                                </div>
                                <div>
                                    <label className="label" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text-muted)' }}>連絡先2</label>
                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        <input
                                            className="input"
                                            value={editForm.contact2 || ''}
                                            placeholder="電話番号など"
                                            onChange={e => setEditForm({ ...editForm, contact2: e.target.value })}
                                            style={{ display: 'block', width: '100%', padding: '0.625rem 0.875rem', fontSize: '1rem', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', flex: 1 }}
                                        />
                                        <input
                                            className="input"
                                            value={editForm.contact2_memo || ''}
                                            placeholder="メモ"
                                            onChange={e => setEditForm({ ...editForm, contact2_memo: e.target.value })}
                                            style={{ display: 'block', width: '100px', padding: '0.625rem 0.5rem', fontSize: '1rem', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gap: '1.5rem', marginBottom: '1.5rem' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
                                <div>
                                    <label className="label" style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.75rem', fontWeight: 500, color: 'var(--color-text-muted)' }}>氏名</label>
                                    <div style={{ fontSize: '1.125rem', fontWeight: 500 }}>
                                        {patient.name}
                                        {patient.kana && <span style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginLeft: '0.5rem' }}>{patient.kana}</span>}
                                    </div>
                                </div>
                                <div>
                                    <label className="label" style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.75rem', fontWeight: 500, color: 'var(--color-text-muted)' }}>性別 / 生年月日</label>
                                    <div style={{ fontSize: '1rem' }}>
                                        {patient.gender === 'male' ? '男性' : patient.gender === 'female' ? '女性' : 'その他'}
                                        <span style={{ margin: '0 0.5rem', color: 'var(--color-border)' }}>|</span>
                                        {patient.dob.replace(/-/g, '/')}
                                        <span style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginLeft: '0.25rem' }}>
                                            ({Math.floor((new Date().getTime() - new Date(patient.dob).getTime()) / 31557600000)}歳)
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label className="label" style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.75rem', fontWeight: 500, color: 'var(--color-text-muted)' }}>住所</label>
                                <div style={{ fontSize: '1rem' }}>{patient.address || '-'}</div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
                                <div>
                                    <label className="label" style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.75rem', fontWeight: 500, color: 'var(--color-text-muted)' }}>連絡先1</label>
                                    <div style={{ fontSize: '1rem' }}>{patient.contact1 || '-'}</div>
                                </div>
                                <div>
                                    <label className="label" style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.75rem', fontWeight: 500, color: 'var(--color-text-muted)' }}>連絡先2</label>
                                    <div style={{ fontSize: '1rem' }}>
                                        {patient.contact2 || '-'}
                                        {patient.contact2_memo && <span style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginLeft: '0.5rem' }}>({patient.contact2_memo})</span>}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Relations Info Section */}
                    {isEditing ? (
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

                                {/* Visiting Nursing Station */}
                                <div style={{ paddingBottom: '1.5rem', borderBottom: '1px dashed var(--color-border)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                                        <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-text-muted)' }}>訪問看護情報</div>
                                        <select
                                            className="input"
                                            style={{ width: 'auto', padding: '0.2rem 0.5rem', fontSize: '0.8rem', height: 'auto' }}
                                            onChange={(e) => {
                                                handleInstitutionSelect('nursing_station', e.target.value);
                                                e.target.value = '';
                                            }}
                                        >
                                            <option value="">事業所を引用...</option>
                                            {institutions.filter(i => i.type === 'nursing_station').map(i => (
                                                <option key={i.id} value={i.id}>{i.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <input
                                            className="input"
                                            value={editForm.visiting_nursing_station_name || ''}
                                            placeholder="訪問看護ステーション"
                                            onChange={e => setEditForm({ ...editForm, visiting_nursing_station_name: e.target.value })}
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

                    ) : (
                        (() => {
                            const hospital = institutions.find(i => i.name === patient.medical_institution_name && i.type === 'hospital');
                            const pharmacy = institutions.find(i => i.name === patient.pharmacy_name && i.type === 'pharmacy');
                            const nursingStation = institutions.find(i => i.name === patient.visiting_nursing_station_name && i.type === 'nursing_station');
                            const careOffice = institutions.find(i => i.name === patient.home_care_office && i.type === 'care_office');

                            return (
                                <div style={{ marginTop: '1rem', display: 'grid', gap: '1rem', padding: '1.25rem', backgroundColor: 'var(--color-bg-subtle, #f8fafc)', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', columnGap: '2rem', rowGap: '1rem' }}>
                                        {/* Medical */}
                                        <div>
                                            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '0.2rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                                <Building2 size={13} /> 医療機関
                                            </div>
                                            <div style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.1rem' }}>{patient.medical_institution_name || '-'}</div>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.8rem', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                                                {patient.primary_doctor && <span>主治医: {patient.primary_doctor}</span>}
                                                {hospital && hospital.tel && (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                                        <Phone size={12} />
                                                        <a href={`tel:${hospital.tel}`} style={{ color: 'inherit', textDecoration: 'none' }}>{hospital.tel}</a>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Pharmacy */}
                                        <div>
                                            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '0.2rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                                <Building2 size={13} /> 薬局
                                            </div>
                                            <div style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.1rem' }}>{patient.pharmacy_name || '-'}</div>
                                            {(pharmacy && (pharmacy.tel || pharmacy.fax)) && (
                                                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.8rem', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                                                    {pharmacy.tel && (
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                                            <Phone size={12} />
                                                            <a href={`tel:${pharmacy.tel}`} style={{ color: 'inherit', textDecoration: 'none' }}>{pharmacy.tel}</a>
                                                        </div>
                                                    )}
                                                    {pharmacy.fax && (
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                                            <Printer size={12} />
                                                            <span>{pharmacy.fax}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', columnGap: '2rem', rowGap: '1rem', borderTop: '1px dashed var(--color-border)', paddingTop: '1rem' }}>
                                        {/* Visiting Nursing */}
                                        <div>
                                            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '0.2rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                                <Building2 size={13} /> 訪問看護
                                            </div>
                                            <div style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.1rem' }}>{patient.visiting_nursing_station_name || '-'}</div>
                                            {nursingStation && nursingStation.tel && (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                                                    <Phone size={12} />
                                                    <a href={`tel:${nursingStation.tel}`} style={{ color: 'inherit', textDecoration: 'none' }}>{nursingStation.tel}</a>
                                                </div>
                                            )}
                                        </div>

                                        {/* Care Office */}
                                        <div>
                                            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '0.2rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                                <Building2 size={13} /> 居宅介護支援事業所
                                            </div>
                                            <div style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.1rem' }}>{patient.home_care_office || '-'}</div>
                                            {careOffice && careOffice.tel && (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                                                    <Phone size={12} />
                                                    <a href={`tel:${careOffice.tel}`} style={{ color: 'inherit', textDecoration: 'none' }}>{careOffice.tel}</a>
                                                </div>
                                            )}
                                            {patient.care_manager && (
                                                <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                                                    <User size={12} style={{ display: 'inline', marginRight: '3px' }} /> {patient.care_manager}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })()
                    )}

                </div>


            </div>




            {/* Create Report Modal */}
            {
                showCreateReportModal && (
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
                )
            }


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
                            resize: 'none',
                            border: '1px solid var(--color-border)',
                            borderRadius: '8px',
                            padding: '1rem',
                            fontSize: '1rem',
                            lineHeight: '1.6',
                            outline: 'none',
                            backgroundColor: 'var(--color-bg)',
                            transition: 'border-color 0.2s, box-shadow 0.2s',
                            overflow: 'hidden'
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
                        placeholder="・訪問時の注意点&#13;&#10;・家族構成やキーパーソン&#13;&#10;など、継続的に確認すべき事項を入力してください。"
                        value={editForm.memo || ''}
                        onChange={(e) => setEditForm({ ...editForm, memo: e.target.value })}
                    />
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
                                    {report.regular_medication_supply_until && (
                                        <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>
                                            定期薬残: {report.regular_medication_supply_until.replace(/-/g, '/')} まで
                                        </span>
                                    )}
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
            {/* Sticky Footer */}
            <div style={{
                position: 'fixed',
                bottom: 0,
                left: 0,
                right: 0,
                backgroundColor: 'white',
                borderTop: '1px solid var(--color-border)',
                padding: '1rem',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '1rem',
                boxShadow: '0 -4px 6px -1px rgba(0, 0, 0, 0.1)',
                zIndex: 50
            }}>
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
                    style={{
                        padding: '0.75rem 2rem',
                        fontSize: '1rem',
                        fontWeight: 600,
                        backgroundColor: 'white',
                        color: 'var(--color-primary)',
                        border: '2px solid var(--color-primary)',
                        borderRadius: '0.5rem',
                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem'
                    }}
                >
                    <PlusCircle size={20} />
                    報告書作成
                </button>
                <button
                    onClick={handleSaveAll}
                    disabled={saving}
                    className="btn btn-primary"
                    style={{
                        padding: '0.75rem 3rem',
                        fontSize: '1rem',
                        fontWeight: 600,
                        backgroundColor: 'var(--color-primary)',
                        color: 'white',
                        borderRadius: '0.5rem',
                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem'
                    }}
                >
                    <Save size={20} />
                    {saving ? '保存中...' : '変更を保存'}
                </button>
            </div>

            {/* Spacer for sticky footer */}
            <div style={{ height: '80px' }} />
        </div >
    )
}
