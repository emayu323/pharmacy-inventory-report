import { useState, useEffect } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { ArrowLeft, Save, Trash2 } from 'lucide-react'
import { supabase } from '../supabase'
import { useAuth } from '../contexts/AuthProvider'
import type { InstitutionType } from '../types'
import toast from 'react-hot-toast'
import ConfirmToast from '../components/ConfirmToast'

export default function InstitutionEdit() {
    const { id } = useParams()
    const navigate = useNavigate()
    const location = useLocation()
    const [loading, setLoading] = useState(false)
    const [fetching, setFetching] = useState(!!id)
    const { user } = useAuth()

    // Initial type from navigation state or default to hospital
    const initialType: InstitutionType = (location.state as any)?.type || 'hospital'

    const [formData, setFormData] = useState({
        type: initialType,
        name: '',
        address: '',
        tel: '',
        fax: '',
        doctor_name: ''
    })

    useEffect(() => {
        if (id) fetchInstitution()
    }, [id])

    const fetchInstitution = async () => {
        try {
            const { data, error } = await supabase
                .from('institutions')
                .select('*')
                .eq('id', id)
                .single()

            if (error) throw error
            if (data) setFormData({
                type: data.type,
                name: data.name,
                address: data.address || '',
                tel: data.tel || '',
                fax: data.fax || '',
                doctor_name: data.doctor_name || ''
            })
        } catch (error) {
            console.error('Error fetching institution:', error)
            toast.error('データの取得に失敗しました')
            navigate('/institutions')
        } finally {
            setFetching(false)
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!formData.name) {
            toast.error('名称を入力してください')
            return
        }

        try {
            setLoading(true)

            // In Test Mode, supabase.auth.getUser() returns null
            // We must use the user from AuthProvider


            const payload = {
                type: formData.type,
                name: formData.name,
                address: formData.type === 'pharmacy' ? formData.address : null,
                doctor_name: formData.type === 'hospital' ? formData.doctor_name : null,
                tel: formData.tel,
                fax: formData.fax,
                user_id: user?.id
            }

            if (id) {
                // Update
                const { error } = await supabase
                    .from('institutions')
                    .update(payload)
                    .eq('id', id)
                if (error) throw error
            } else {
                // Create
                const { error } = await supabase
                    .from('institutions')
                    .insert([payload])
                if (error) throw error
            }

            toast.success('保存しました')
            navigate('/institutions')
        } catch (error) {
            console.error('Error saving institution:', error)
            toast.error('保存に失敗しました')
        } finally {
            setLoading(false)
        }
    }





    if (fetching) return <div className="container" style={{ padding: '2rem' }}>読み込み中...</div>

    return (
        <div className="container" style={{ maxWidth: '600px', margin: '0 auto' }}>
            <div style={{ marginBottom: '1.5rem' }}>
                <button onClick={() => navigate('/institutions')} className="btn btn-ghost" style={{ paddingLeft: 0, marginBottom: '0.5rem' }}>
                    <ArrowLeft size={18} />
                    一覧に戻る
                </button>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 600 }}>
                    {id ? '関係機関の編集' : '新規登録'}
                </h2>
            </div>

            <form onSubmit={handleSubmit} className="card" style={{ padding: '2rem', display: 'grid', gap: '1.5rem' }}>

                {!id && (
                    <div>
                        <label className="label">種別</label>
                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                                <input
                                    type="radio"
                                    checked={formData.type === 'hospital'}
                                    onChange={() => setFormData({ ...formData, type: 'hospital' })}
                                />
                                医療機関
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                                <input
                                    type="radio"
                                    checked={formData.type === 'pharmacy'}
                                    onChange={() => setFormData({ ...formData, type: 'pharmacy' })}
                                />
                                薬局
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                                <input
                                    type="radio"
                                    checked={formData.type === 'care_office'}
                                    onChange={() => setFormData({ ...formData, type: 'care_office' })}
                                />
                                居宅介護事業所
                            </label>
                        </div>
                    </div>
                )}

                <div>
                    <label className="label">
                        {formData.type === 'hospital' ? '病院名' :
                            formData.type === 'pharmacy' ? '薬局名' : '事業所名'}
                        <span style={{ color: 'red' }}> *</span>
                    </label>
                    <input
                        type="text"
                        className="input"
                        value={formData.name}
                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                        required
                        placeholder={`例: ${formData.type === 'hospital' ? '〇〇病院' : '〇〇薬局'}`}
                    />
                </div>

                {formData.type === 'hospital' && (
                    <div>
                        <label className="label">主治医名</label>
                        <input
                            type="text"
                            className="input"
                            value={formData.doctor_name}
                            onChange={e => setFormData({ ...formData, doctor_name: e.target.value })}
                            placeholder="例: 鈴木 太郎"
                        />
                    </div>
                )}

                {formData.type === 'pharmacy' && (
                    <div>
                        <label className="label">所在地 (住所)</label>
                        <input
                            type="text"
                            className="input"
                            value={formData.address}
                            onChange={e => setFormData({ ...formData, address: e.target.value })}
                            placeholder="例: 東京都渋谷区..."
                        />
                    </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div>
                        <label className="label">TEL</label>
                        <input
                            type="tel"
                            className="input"
                            value={formData.tel}
                            onChange={e => setFormData({ ...formData, tel: e.target.value })}
                            placeholder="03-1234-5678"
                        />
                    </div>
                    <div>
                        <label className="label">FAX</label>
                        <input
                            type="tel"
                            className="input"
                            value={formData.fax}
                            onChange={e => setFormData({ ...formData, fax: e.target.value })}
                            placeholder="03-1234-5679"
                        />
                    </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1rem' }}>
                    {id ? (
                        <button
                            type="button"
                            onClick={() => {
                                toast((t) => (
                                    <ConfirmToast
                                        t={t}
                                        message="本当にこの機関を削除しますか？"
                                        confirmText="削除する"
                                        type="danger"
                                        onConfirm={async () => {
                                            try {
                                                const { error } = await supabase
                                                    .from('institutions')
                                                    .delete()
                                                    .eq('id', id)
                                                if (error) throw error
                                                toast.success('削除しました')
                                                navigate('/institutions')
                                            } catch (error) {
                                                console.error('Error deleting institution:', error)
                                                toast.error('削除に失敗しました')
                                            }
                                        }}
                                    />
                                ), { duration: Infinity, position: 'top-center' })
                            }}
                            className="btn btn-ghost"
                            style={{ color: 'red' }}
                        >
                            <Trash2 size={18} /> 削除
                        </button>
                    ) : <div></div>}

                    <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={loading}
                        style={{ padding: '0.75rem 2rem' }}
                    >
                        <Save size={18} />
                        {loading ? '保存中...' : '保存する'}
                    </button>
                </div>
            </form>
            <style>{`
                .label {
                    display: block;
                    font-weight: 600;
                    margin-bottom: 0.5rem;
                    color: var(--color-text);
                }
                .input {
                    display: block;
                    width: 100%;
                    padding: 0.625rem 0.875rem;
                    font-size: 1rem;
                    line-height: 1.5;
                    color: var(--color-text-main);
                    background-color: #fff;
                    background-clip: padding-box;
                    border: 1px solid var(--color-border);
                    border-radius: var(--radius-md);
                    transition: border-color 0.15s ease-in-out, box-shadow 0.15s ease-in-out;
                }
                .input:focus {
                    border-color: var(--color-primary);
                    outline: 0;
                    box-shadow: 0 0 0 3px rgba(var(--color-primary-rgb), 0.1);
                }
            `}</style>
        </div>
    )
}
