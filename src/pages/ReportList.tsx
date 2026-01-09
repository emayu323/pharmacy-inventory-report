import { Link, useNavigate } from 'react-router-dom'
import { Plus, Search, FileText, Copy, Folder, ChevronDown, ChevronRight } from 'lucide-react' // Add Folder and Chevrons
import type { Report } from '../types'
import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

export default function ReportList() {
    const [reports, setReports] = useState<Report[]>([])
    const [searchTerm, setSearchTerm] = useState('')
    const [loading, setLoading] = useState(true)
    const [expandedPatients, setExpandedPatients] = useState<string[]>([])
    const navigate = useNavigate()

    useEffect(() => {
        fetchReports()
    }, [])

    const fetchReports = async () => {
        try {
            setLoading(true)
            const { data, error } = await supabase
                .from('reports')
                .select('*')
                .order('visit_date', { ascending: false })

            if (error) throw error
            if (data) setReports(data as Report[])
        } catch (error) {
            console.error('Error fetching reports:', error)
            alert('データの取得に失敗しました')
        } finally {
            setLoading(false)
        }
    }

    // Grouping Logic
    const groupedReports = reports.reduce((acc, report) => {
        const key = report.patient_name
        if (!acc[key]) {
            acc[key] = {
                patient_name: report.patient_name,
                patient_dob: report.patient_dob,
                patient_gender: report.patient_gender,
                reports: []
            }
        }
        acc[key].reports.push(report)
        return acc
    }, {} as Record<string, { patient_name: string, patient_dob: string, patient_gender: string, reports: Report[] }>)

    const filteredPatientNames = Object.keys(groupedReports).filter(name =>
        name.includes(searchTerm)
    )

    const togglePatient = (name: string) => {
        setExpandedPatients(prev =>
            prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
        )
    }

    if (loading) {
        return <div className="container" style={{ padding: '2rem', textAlign: 'center' }}>読み込み中...</div>
    }

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 600 }}>報告書一覧（患者別）</h2>
                <Link to="/reports/new" className="btn btn-primary">
                    <Plus size={18} />
                    新規作成
                </Link>
            </div>

            <div className="card" style={{ marginBottom: '1.5rem', padding: '1rem' }}>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', color: 'var(--color-text-muted)' }}>
                    <Search size={20} />
                    <input
                        type="text"
                        placeholder="患者名で検索..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        style={{ border: 'none', outline: 'none', width: '100%', fontSize: '1rem' }}
                    />
                </div>
            </div>

            <div style={{ display: 'grid', gap: '1rem' }}>
                {filteredPatientNames.length === 0 && (
                    <div style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '2rem' }}>
                        該当する患者は見つかりませんでした
                    </div>
                )}

                {filteredPatientNames.map(name => {
                    const group = groupedReports[name]
                    const isExpanded = expandedPatients.includes(name)
                    const lastReportDate = group.reports[0]?.visit_date.replace(/-/g, '/') || '-'

                    return (
                        <div key={name} className="card" style={{ overflow: 'hidden' }}>
                            {/* Patient Header (Clickable) */}
                            <div
                                onClick={() => togglePatient(name)}
                                style={{
                                    padding: '1.25rem',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    backgroundColor: isExpanded ? 'var(--color-bg)' : 'transparent',
                                    transition: 'background-color 0.2s'
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                    <Folder size={24} color="var(--color-primary)" fill={isExpanded ? "var(--color-primary)" : "none"} style={{ opacity: isExpanded ? 0.2 : 1 }} />
                                    <div>
                                        <h3 style={{ fontSize: '1.125rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            {group.patient_name} 様
                                        </h3>
                                        <div style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>
                                            {group.patient_gender === 'male' ? '男性' : '女性'} / {group.patient_dob.replace(/-/g, '/')}生
                                        </div>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                    <div style={{ textAlign: 'right', fontSize: '0.875rem' }}>
                                        <div style={{ fontWeight: 600 }}>{group.reports.length}件の報告書</div>
                                        <div style={{ color: 'var(--color-text-muted)' }}>最終訪問: {lastReportDate}</div>
                                    </div>
                                    {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                                </div>
                            </div>

                            {/* Reports List (Accordion Body) */}
                            {isExpanded && (
                                <div style={{ borderTop: '1px solid var(--color-border)', backgroundColor: 'var(--color-surface)' }}>
                                    {group.reports.map(report => (
                                        <div key={report.id} style={{
                                            padding: '1rem 1.25rem',
                                            borderBottom: '1px solid var(--color-border)',
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center'
                                        }}>
                                            <Link to={`/reports/${report.id}`} style={{ flex: 1 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                                    <FileText size={18} color="var(--color-text-muted)" />
                                                    <div>
                                                        <div style={{ fontWeight: 600 }}>{report.visit_date.replace(/-/g, '/')} 訪問</div>
                                                        <div style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
                                                            担当: {report.pharmacist_name}
                                                        </div>
                                                    </div>
                                                </div>
                                            </Link>

                                            <button
                                                onClick={(e) => {
                                                    e.preventDefault()
                                                    navigate('/reports/new', { state: { copyFrom: report } })
                                                }}
                                                className="btn btn-ghost"
                                                title="この内容で新規作成"
                                                style={{ padding: '0.5rem' }}
                                            >
                                                <Copy size={16} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
