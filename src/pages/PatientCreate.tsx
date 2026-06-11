
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Save, User as UserIcon, Building2 } from 'lucide-react'
import { useAuth } from '../contexts/authContext'
import type { Institution, InstitutionType, Gender } from '../types'
import { createPatient, isLocalPatientStorage } from '../patientRepository'
import { listInstitutions } from '../institutionRepository'
import toast from 'react-hot-toast'
import { calculateAge } from '../utils'

export default function PatientCreate() {
    const navigate = useNavigate()
    const { user } = useAuth()
    const [isLocalStorageMode] = useState(isLocalPatientStorage)
    const [institutions, setInstitutions] = useState<Institution[]>([])
    const [loading, setLoading] = useState(false)
    const [formData, setFormData] = useState({
        name: '',
        kana: '',
        dob: '',
        gender: 'male' as Gender,
        address: '',
        contact1: '',
        contact2: '',
        contact2_memo: '',
        memo: '',
        medical_institution_name: '',
        primary_doctor: '',
        home_care_office: '',
        care_manager: '',
        pharmacy_name: '',
        visiting_nursing_station_name: ''
    })

    useEffect(() => {
        let cancelled = false
        const fetchInstitutions = async () => {
            try {
                const data = await listInstitutions()
                if (!cancelled) setInstitutions(data)
            } catch (error) {
                console.error('Error fetching institutions:', error)
            }
        }

        fetchInstitutions()
        return () => {
            cancelled = true
        }
    }, [])

    const handleInstitutionSelect = (type: InstitutionType, institutionId: string) => {
        const institution = institutions.find(i => i.id === institutionId)
        if (!institution) return

        if (type === 'hospital') {
            setFormData(prev => ({
                ...prev,
                medical_institution_name: institution.name,
                primary_doctor: institution.doctor_name || prev.primary_doctor
            }))
        } else if (type === 'pharmacy') {
            setFormData(prev => ({
                ...prev,
                pharmacy_name: institution.name
            }))
        } else if (type === 'care_office') {
            setFormData(prev => ({
                ...prev,
                home_care_office: institution.name
            }))
        } else if (type === 'nursing_station') {
            setFormData(prev => ({
                ...prev,
                visiting_nursing_station_name: institution.name
            }))
        }
    }

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target
        setFormData(prev => ({ ...prev, [name]: value }))
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        if (!formData.name || !formData.dob) {
            toast.error('氏名と生年月日は必須です')
            return
        }

        try {
            setLoading(true)

            if (!isLocalStorageMode && !user) throw new Error('No authenticated user')

            const data = await createPatient({
                name: formData.name,
                kana: formData.kana,
                dob: formData.dob,
                gender: formData.gender,
                address: formData.address,
                contact1: formData.contact1,
                contact2: formData.contact2,
                contact2_memo: formData.contact2_memo,
                memo: formData.memo,
                medical_institution_name: formData.medical_institution_name,
                primary_doctor: formData.primary_doctor,
                home_care_office: formData.home_care_office,
                care_manager: formData.care_manager,
                visiting_nursing_station_name: formData.visiting_nursing_station_name,
                pharmacy_name: formData.pharmacy_name,
                is_active: true,
                user_id: user?.id
            })

            toast.success('患者登録を行いました')
            if (data) {
                navigate(`/patients/${data.id}`)
            } else {
                navigate('/')
            }
        } catch (error) {
            console.error('Error creating patient:', error)
            toast.error('登録に失敗しました')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="container" style={{ maxWidth: '800px', margin: '0 auto' }}>
            <div style={{ marginBottom: '1.5rem' }}>
                <button onClick={() => navigate(-1)} className="btn btn-ghost" style={{ paddingLeft: 0, marginBottom: '0.5rem' }}>
                    <ArrowLeft size={18} />
                    戻る
                </button>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 600 }}>新規患者登録</h2>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '2rem' }}>
                {/* Basic Info Section */}
                <div className="card" style={{ padding: '2rem' }}>
                    <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-primary)' }}>
                        <UserIcon size={20} /> 基本情報
                    </h3>
                    <div style={{ display: 'grid', gap: '1.5rem' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                            <div>
                                <label className="label">氏名 <span style={{ color: 'red' }}>*</span></label>
                                <input
                                    type="text"
                                    name="name"
                                    className="input"
                                    placeholder="例: 山田 太郎"
                                    required
                                    value={formData.name}
                                    onChange={handleChange}
                                />
                            </div>

                            <div>
                                <label className="label">フリガナ</label>
                                <input
                                    type="text"
                                    name="kana"
                                    className="input"
                                    placeholder="例: ヤマダ タロウ"
                                    value={formData.kana}
                                    onChange={handleChange}
                                />
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
                            <div>
                                <label className="label">性別</label>
                                <div style={{ position: 'relative' }}>
                                    <select
                                        name="gender"
                                        className="input"
                                        value={formData.gender}
                                        onChange={handleChange}
                                        style={{ appearance: 'none' }}
                                    >
                                        <option value="male">男性</option>
                                        <option value="female">女性</option>
                                        <option value="other">その他</option>
                                    </select>
                                    <div style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--color-text-muted)' }}>▼</div>
                                </div>
                            </div>
                            <div>
                                <label className="label">生年月日 <span style={{ color: 'red' }}>*</span></label>
                                <input
                                    type="date"
                                    name="dob"
                                    className="input"
                                    required
                                    value={formData.dob}
                                    onChange={handleChange}
                                />
                                {formData.dob && (
                                    <span style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginTop: '0.25rem', display: 'block' }}>
                                        {calculateAge(formData.dob)}歳
                                    </span>
                                )}
                            </div>
                        </div>

                        <div>
                            <label className="label">住所</label>
                                <input
                                    type="text"
                                    name="address"
                                    className="input"
                                    placeholder="例: 東京都渋谷区..."
                                    value={formData.address}
                                    onChange={handleChange}
                                />
                            </div>

                        {/* Contact Info */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
                            <div>
                                <label className="label">連絡先1</label>
                                <input
                                    type="text"
                                    name="contact1"
                                    className="input"
                                    placeholder="電話番号など"
                                    value={formData.contact1}
                                    onChange={handleChange}
                                />
                            </div>
                            <div>
                                <label className="label">連絡先2</label>
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <input
                                        type="text"
                                        name="contact2"
                                        className="input"
                                        placeholder="電話番号など"
                                        value={formData.contact2}
                                        onChange={handleChange}
                                        style={{ flex: 1 }}
                                    />
                                    <input
                                        type="text"
                                        name="contact2_memo"
                                        className="input"
                                        placeholder="メモ(家族等)"
                                        value={formData.contact2_memo}
                                        onChange={handleChange}
                                        style={{ width: '120px' }}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Relations Section */}
                <div className="card" style={{ padding: '1.5rem' }}>
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
                                    style={{ width: 'auto', padding: '0.2rem 0.5rem', fontSize: '0.8rem', height: 'auto', borderColor: 'var(--color-primary-light)' }}
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
                                        type="text"
                                        name="medical_institution_name"
                                        className="input"
                                        placeholder="医療機関名"
                                        value={formData.medical_institution_name}
                                        onChange={handleChange}
                                    />
                                </div>
                                <div>
                                    <input
                                        type="text"
                                        name="primary_doctor"
                                        className="input"
                                        placeholder="主治医"
                                        value={formData.primary_doctor}
                                        onChange={handleChange}
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
                                    style={{ width: 'auto', padding: '0.2rem 0.5rem', fontSize: '0.8rem', height: 'auto', borderColor: 'var(--color-primary-light)' }}
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
                                    type="text"
                                    name="pharmacy_name"
                                    className="input"
                                    placeholder="担当薬局"
                                    value={formData.pharmacy_name}
                                    onChange={handleChange}
                                />
                            </div>
                        </div>

                        {/* Visiting Nursing Station */}
                        <div style={{ paddingBottom: '1.5rem', borderBottom: '1px dashed var(--color-border)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                                <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-text-muted)' }}>訪問看護情報</div>
                                <select
                                    className="input"
                                    style={{ width: 'auto', padding: '0.2rem 0.5rem', fontSize: '0.8rem', height: 'auto', borderColor: 'var(--color-primary-light)' }}
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
                                    type="text"
                                    name="visiting_nursing_station_name"
                                    className="input"
                                    placeholder="訪問看護ステーション"
                                    value={formData.visiting_nursing_station_name}
                                    onChange={handleChange}
                                />
                            </div>
                        </div>

                        {/* Care */}
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                                <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-text-muted)' }}>介護情報</div>
                                <select
                                    className="input"
                                    style={{ width: 'auto', padding: '0.2rem 0.5rem', fontSize: '0.8rem', height: 'auto', borderColor: 'var(--color-primary-light)' }}
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
                                        type="text"
                                        name="home_care_office"
                                        className="input"
                                        placeholder="居宅介護支援事業所"
                                        value={formData.home_care_office}
                                        onChange={handleChange}
                                    />
                                </div>
                                <div>
                                    <input
                                        type="text"
                                        name="care_manager"
                                        className="input"
                                        placeholder="ケアマネージャー"
                                        value={formData.care_manager}
                                        onChange={handleChange}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>


                {/* Memo Section */}
                <div className="card" style={{ padding: '2rem' }}>
                    <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1.5rem', color: 'var(--color-primary)' }}>特記事項</h3>
                    <textarea
                        name="memo"
                        className="input"
                        rows={4}
                        placeholder="・訪問時の注意点&#13;&#10;・家族構成やキーパーソン&#13;&#10;など、継続的に確認すべき事項を入力してください。"
                        value={formData.memo}
                        onChange={handleChange}
                    />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
                    <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={loading}
                        style={{ padding: '0.75rem 3rem', fontSize: '1.1rem' }}
                    >
                        <Save size={20} />
                        {loading ? '登録中...' : '登録する'}
                    </button>
                </div>
            </form >

            <style>{`
                .label {
                    display: block;
                    font-weight: 600;
                    margin-bottom: 0.5rem;
                    color: var(--color-text);
                }
                .input {
                    width: 100%;
                    padding: 0.75rem;
                    border: 1px solid var(--color-border);
                    border-radius: var(--radius-md);
                    font-size: 1rem;
                    transition: border-color 0.2s;
                }
                .input:focus {
                    outline: none;
                    border-color: var(--color-primary);
                    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
                }
            `}</style>
        </div >
    )
}
