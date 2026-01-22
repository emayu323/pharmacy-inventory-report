import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Edit2, Building2, Stethoscope, Contact } from 'lucide-react'
import { supabase } from '../supabase'
import type { Institution, InstitutionType } from '../types'
import toast from 'react-hot-toast'

export default function InstitutionList() {
    const navigate = useNavigate()
    const [institutions, setInstitutions] = useState<Institution[]>([])
    const [activeTab, setActiveTab] = useState<InstitutionType>('hospital')
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        fetchInstitutions()
    }, [])

    const fetchInstitutions = async () => {
        try {
            setLoading(true)
            const { data, error } = await supabase
                .from('institutions')
                .select('*')
                .order('name')

            if (error) throw error
            setInstitutions(data as Institution[])
        } catch (error) {
            console.error('Error fetching institutions:', error)
            toast.error('データの取得に失敗しました')
        } finally {
            setLoading(false)
        }
    }

    const filteredInstitutions = institutions.filter(i => i.type === activeTab)

    const tabs: { id: InstitutionType; label: string; icon: React.ReactNode }[] = [
        { id: 'hospital', label: '医療機関 (病院)', icon: <Building2 size={18} /> },
        { id: 'pharmacy', label: '薬局', icon: <Stethoscope size={18} /> },
        { id: 'care_office', label: '居宅介護支援事業所', icon: <Contact size={18} /> },
        { id: 'nursing_station', label: '訪問看護', icon: <Building2 size={18} /> },
    ]

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 600 }}>関係機関一覧</h2>
                <button
                    onClick={() => navigate('/institutions/new', { state: { type: activeTab } })}
                    className="btn btn-primary"
                >
                    <Plus size={18} />
                    新規登録
                </button>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border)', marginBottom: '1.5rem', gap: '1rem' }}>
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        style={{
                            padding: '0.75rem 1rem',
                            background: 'none',
                            border: 'none',
                            borderBottom: activeTab === tab.id ? '2px solid var(--color-primary)' : '2px solid transparent',
                            color: activeTab === tab.id ? 'var(--color-primary)' : 'var(--color-text-muted)',
                            fontWeight: activeTab === tab.id ? 600 : 400,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            transition: 'all 0.2s'
                        }}
                    >
                        {tab.icon}
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* List */}
            {loading ? (
                <div style={{ padding: '2rem', textAlign: 'center' }}>読み込み中...</div>
            ) : filteredInstitutions.length === 0 ? (
                <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--color-text-muted)', border: '1px dashed var(--color-border)', borderRadius: 'var(--radius-md)' }}>
                    登録されているデータがありません
                </div>
            ) : (
                <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
                    {filteredInstitutions.map(item => (
                        <div key={item.id} className="card" style={{ padding: '1.5rem', position: 'relative' }}>
                            <button
                                onClick={() => navigate(`/institutions/${item.id}/edit`)}
                                style={{
                                    position: 'absolute',
                                    top: '1rem',
                                    right: '1rem',
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    color: 'var(--color-text-muted)'
                                }}
                                title="編集"
                            >
                                <Edit2 size={16} />
                            </button>

                            <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.5rem', paddingRight: '1.5rem' }}>
                                {item.name}
                            </h3>

                            <div style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', display: 'grid', gap: '0.25rem' }}>
                                {item.type === 'hospital' && item.doctor_name && (
                                    <div><span style={{ fontWeight: 500 }}>主治医:</span> {item.doctor_name}</div>
                                )}
                                {item.type === 'pharmacy' && item.address && (
                                    <div><span style={{ fontWeight: 500 }}>住所:</span> {item.address}</div>
                                )}

                                {item.tel && (
                                    <div><span style={{ fontWeight: 500 }}>TEL:</span> {item.tel}</div>
                                )}
                                {item.fax && (
                                    <div><span style={{ fontWeight: 500 }}>FAX:</span> {item.fax}</div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
