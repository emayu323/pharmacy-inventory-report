import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Save } from 'lucide-react'
import { supabase } from '../supabase'
import type { Gender } from '../types'

export default function PatientCreate() {
    const navigate = useNavigate()
    const [loading, setLoading] = useState(false)
    const [formData, setFormData] = useState({
        name: '',
        kana: '',
        dob: '',
        gender: 'female' as Gender,
        memo: ''
    })

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target
        setFormData(prev => ({ ...prev, [name]: value }))
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        if (!formData.name || !formData.dob) {
            alert('氏名と生年月日は必須です')
            return
        }

        try {
            setLoading(true)
            const { data, error } = await supabase
                .from('patients')
                .insert([{
                    id: crypto.randomUUID(),
                    name: formData.name,
                    kana: formData.kana,
                    dob: formData.dob,
                    gender: formData.gender,
                    memo: formData.memo
                }])
                .select()
                .single()

            if (error) throw error

            alert('患者登録を行いました')
            if (data) {
                navigate(`/patients/${data.id}`)
            } else {
                navigate('/')
            }
        } catch (error) {
            console.error('Error creating patient:', error)
            alert('登録に失敗しました')
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

            <form onSubmit={handleSubmit} className="card" style={{ padding: '2rem', display: 'grid', gap: '1.5rem' }}>
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

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
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
                    </div>
                    <div>
                        <label className="label">性別</label>
                        <select
                            name="gender"
                            className="input"
                            value={formData.gender}
                            onChange={handleChange}
                        >
                            <option value="male">男性</option>
                            <option value="female">女性</option>
                            <option value="other">その他</option>
                        </select>
                    </div>
                </div>

                <div>
                    <label className="label">申し送り事項・メモ</label>
                    <textarea
                        name="memo"
                        className="input"
                        rows={4}
                        placeholder="患者に関する特記事項や申し送り..."
                        value={formData.memo}
                        onChange={handleChange}
                    />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
                    <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={loading}
                        style={{ padding: '0.75rem 2rem' }}
                    >
                        <Save size={18} />
                        {loading ? '登録中...' : '登録する'}
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
        </div>
    )
}
