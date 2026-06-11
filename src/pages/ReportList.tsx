import { useNavigate } from 'react-router-dom'
import { Search, User, FilePlus, Copy, Plus } from 'lucide-react'
import type { Patient, Report } from '../types'
import { useState, useEffect } from 'react'
import { getLatestReportByPatientId } from '../reportRepository'
import { listPatients } from '../patientRepository'
import toast from 'react-hot-toast'

import { calculateAge } from '../utils'

export default function ReportList() {
    const [patients, setPatients] = useState<Patient[]>([])
    const [searchTerm, setSearchTerm] = useState('')
    const [showFinished, setShowFinished] = useState(false)
    const [loading, setLoading] = useState(true)
    const [confirmModalOpen, setConfirmModalOpen] = useState(false)
    const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null)
    const [latestReport, setLatestReport] = useState<Report | null>(null)
    const navigate = useNavigate()

    useEffect(() => {
        fetchPatients()
    }, [])

    const fetchPatients = async () => {
        try {
            setLoading(true)
            const data = await listPatients()
            setPatients(data)
        } catch (error) {
            console.error('Error fetching patients:', error)
            toast.error('データの取得に失敗しました')
        } finally {
            setLoading(false)
        }
    }

    const handleCreateReport = async (patient: Patient) => {
        setSelectedPatient(patient)

        // Fetch latest report for this patient
        try {
            const data = await getLatestReportByPatientId(patient.id)

            if (data) {
                setLatestReport(data)
                setConfirmModalOpen(true)
            } else {
                // No previous report, create new directly
                navigate('/reports/new', {
                    state: {
                        patientId: patient.id,
                        patientName: patient.name,
                        patientDob: patient.dob,
                        patientGender: patient.gender
                    }
                })
            }
        } catch (error) {
            console.error('Error fetching latest report:', error)
            // On error, just go to new
            navigate('/reports/new', {
                state: {
                    patientId: patient.id,
                    patientName: patient.name,
                    patientDob: patient.dob,
                    patientGender: patient.gender
                }
            })
        }
    }

    const handleConfirmCopy = () => {
        if (!selectedPatient || !latestReport) return
        navigate('/reports/new', {
            state: {
                copyFrom: latestReport
            }
        })
    }

    const handleConfirmNew = () => {
        if (!selectedPatient) return
        navigate('/reports/new', {
            state: {
                patientId: selectedPatient.id,
                patientName: selectedPatient.name,
                patientDob: selectedPatient.dob,
                patientGender: selectedPatient.gender
            }
        })
    }

    const filteredPatients = patients.filter(p => {
        const matchesSearch = p.name.includes(searchTerm) || (p.kana && p.kana.includes(searchTerm))
        const matchesStatus = showFinished ? true : (p.is_active !== false)
        return matchesSearch && matchesStatus
    })

    if (loading) {
        return <div className="container" style={{ padding: '2rem', textAlign: 'center' }}>読み込み中...</div>
    }

    return (
        <div>
            <div style={{ marginBottom: '1.5rem' }}>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 600 }}>患者一覧</h2>
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

            <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
                    <input
                        type="checkbox"
                        checked={showFinished}
                        onChange={(e) => setShowFinished(e.target.checked)}
                        style={{ width: '1rem', height: '1rem' }}
                    />
                    完了した患者も表示する
                </label>
            </div>

            <div style={{ display: 'grid', gap: '1rem' }}>
                {filteredPatients.length === 0 && (
                    <div style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '2rem' }}>
                        該当する患者は見つかりませんでした
                    </div>
                )}

                {filteredPatients.map(patient => (
                    <div key={patient.id} className="card" style={{ overflow: 'hidden', opacity: patient.is_active === false ? 0.7 : 1 }}>
                        <div
                            onClick={() => navigate(`/patients/${patient.id}`)}
                            style={{
                                padding: '1.25rem',
                                cursor: 'pointer',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                transition: 'background-color 0.2s',
                                filter: patient.is_active === false ? 'grayscale(0.5)' : 'none'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--color-bg)'}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                <div style={{
                                    width: '40px', height: '40px',
                                    borderRadius: '50%',
                                    backgroundColor: patient.is_active === false
                                        ? '#9ca3af'
                                        : patient.gender === 'female'
                                            ? 'var(--color-danger)'
                                            : 'var(--color-primary)',
                                    color: 'white',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                                }}>
                                    <User size={20} />
                                </div>
                                <div>
                                    <h3 style={{ fontSize: '1.375rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        {patient.name} <span style={{ fontSize: '1rem', fontWeight: 400 }}>様</span>
                                        {patient.is_active === false && (
                                            <span style={{ fontSize: '0.875rem', backgroundColor: '#9ca3af', color: 'white', padding: '0.2rem 0.6rem', borderRadius: '4px', fontWeight: 500 }}>
                                                完了
                                            </span>
                                        )}
                                    </h3>
                                    <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.9rem', color: 'var(--color-text-muted)', marginTop: '0.35rem', alignItems: 'center' }}>
                                        <span style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            padding: '0.1rem 0.5rem',
                                            borderRadius: '4px',
                                            backgroundColor: patient.gender === 'female' ? '#fee2e2' : patient.gender === 'male' ? '#dbeafe' : '#f3f4f6',
                                            color: patient.gender === 'female' ? '#991b1b' : patient.gender === 'male' ? '#1e40af' : '#374151',
                                            fontSize: '0.8rem',
                                            fontWeight: 500
                                        }}>
                                            {patient.gender === 'male' ? '男性' : patient.gender === 'female' ? '女性' : 'その他'}
                                        </span>
                                        <span>
                                            {patient.dob.replace(/-/g, '/')}
                                            <span style={{ marginLeft: '0.3rem', fontWeight: 600, color: 'var(--color-text-main)' }}>
                                                ({calculateAge(patient.dob)}歳)
                                            </span>
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginLeft: 'auto' }}>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        handleCreateReport(patient)
                                    }}
                                    className="btn"
                                    style={{
                                        background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dark, #1d4ed8))',
                                        color: 'white',
                                        padding: '0.6rem 1.2rem',
                                        fontSize: '0.9rem',
                                        fontWeight: 600,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.5rem',
                                        borderRadius: '50px',
                                        border: 'none',
                                        boxShadow: '0 4px 6px rgba(37, 99, 235, 0.2), 0 1px 3px rgba(37, 99, 235, 0.1)',
                                        transition: 'all 0.2s ease',
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.transform = 'translateY(-1px)'
                                        e.currentTarget.style.boxShadow = '0 6px 8px rgba(37, 99, 235, 0.3), 0 2px 4px rgba(37, 99, 235, 0.15)'
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.transform = 'translateY(0)'
                                        e.currentTarget.style.boxShadow = '0 4px 6px rgba(37, 99, 235, 0.2), 0 1px 3px rgba(37, 99, 235, 0.1)'
                                    }}
                                >
                                    <FilePlus size={18} strokeWidth={2.5} />
                                    <span>報告書作成</span>
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Create Report Modal */}
            {
                confirmModalOpen && (
                    <div style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                        backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        padding: '1rem'
                    }} onClick={() => setConfirmModalOpen(false)}>
                        <div style={{
                            backgroundColor: 'white', borderRadius: '12px', width: '100%', maxWidth: '400px',
                            padding: '1.5rem', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                            animation: 'fadeIn 0.2s ease-out'
                        }} onClick={e => e.stopPropagation()}>
                            <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem', textAlign: 'center' }}>
                                報告書の作成
                            </h3>
                            <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', marginBottom: '1.5rem', fontSize: '0.95rem' }}>
                                前回の報告書が見つかりました。<br />
                                内容をコピーして作成しますか？
                            </p>

                            <div style={{ display: 'grid', gap: '0.75rem' }}>
                                <button
                                    onClick={handleConfirmCopy}
                                    className="btn btn-primary"
                                    style={{
                                        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        gap: '0.5rem', padding: '0.75rem'
                                    }}
                                >
                                    <Copy size={18} />
                                    前回の内容をコピーして作成
                                </button>

                                <button
                                    onClick={handleConfirmNew}
                                    className="btn btn-outline"
                                    style={{
                                        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        gap: '0.5rem', padding: '0.75rem'
                                    }}
                                >
                                    <Plus size={18} />
                                    新規作成
                                </button>

                                <button
                                    onClick={() => setConfirmModalOpen(false)}
                                    style={{
                                        width: '100%', padding: '0.75rem', color: 'var(--color-text-muted)',
                                        background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.9rem',
                                        marginTop: '0.5rem'
                                    }}
                                >
                                    キャンセル
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    )
}
