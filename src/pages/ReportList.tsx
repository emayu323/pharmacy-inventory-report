import { useNavigate } from 'react-router-dom'
import { Plus, Search, User, ChevronRight } from 'lucide-react'
import type { Patient } from '../types'
import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

export default function ReportList() {
    const [patients, setPatients] = useState<Patient[]>([])
    const [searchTerm, setSearchTerm] = useState('')
    const [loading, setLoading] = useState(true)
    const navigate = useNavigate()

    useEffect(() => {
        fetchPatients()
    }, [])

    const fetchPatients = async () => {
        try {
            setLoading(true)
            const { data, error } = await supabase
                .from('patients')
                .select('*')
                .order('name', { ascending: true })

            if (error) throw error
            if (data) setPatients(data as Patient[])
        } catch (error) {
            console.error('Error fetching patients:', error)
            alert('データの取得に失敗しました')
        } finally {
            setLoading(false)
        }
    }

    const filteredPatients = patients.filter(p =>
        p.name.includes(searchTerm) || (p.kana && p.kana.includes(searchTerm))
    )

    if (loading) {
        return <div className="container" style={{ padding: '2rem', textAlign: 'center' }}>読み込み中...</div>
    }

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 600 }}>患者一覧（カルテ）</h2>
                <button
                    onClick={() => navigate('/patients/new')}
                    className="btn btn-primary"
                >
                    <Plus size={18} />
                    新規患者登録
                </button>
            </div>

            <div className="card" style={{ marginBottom: '1.5rem', padding: '1rem' }}>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', color: 'var(--color-text-muted)' }}>
                    <Search size={20} />
                    <input
                        type="text"
                        placeholder="氏名で検索..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        style={{ border: 'none', outline: 'none', width: '100%', fontSize: '1rem' }}
                    />
                </div>
            </div>

            <div style={{ display: 'grid', gap: '1rem' }}>
                {filteredPatients.length === 0 && (
                    <div style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '2rem' }}>
                        該当する患者は見つかりませんでした
                    </div>
                )}

                {filteredPatients.map(patient => (
                    <div key={patient.id} className="card" style={{ overflow: 'hidden' }}>
                        <div
                            onClick={() => navigate(`/patients/${patient.id}`)}
                            style={{
                                padding: '1.25rem',
                                cursor: 'pointer',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                transition: 'background-color 0.2s'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--color-bg)'}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                <div style={{
                                    width: '40px', height: '40px',
                                    borderRadius: '50%',
                                    backgroundColor: 'var(--color-primary)',
                                    color: 'white',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                                }}>
                                    <User size={20} />
                                </div>
                                <div>
                                    <h3 style={{ fontSize: '1.125rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        {patient.name} 様
                                    </h3>
                                    <div style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>
                                        {patient.gender === 'male' ? '男性' : patient.gender === 'female' ? '女性' : 'その他'} / {patient.dob.replace(/-/g, '/')}生
                                    </div>
                                </div>
                            </div>
                            <ChevronRight size={20} color="var(--color-text-muted)" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
