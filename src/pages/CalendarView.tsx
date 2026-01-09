
import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths } from 'date-fns'
import { ja } from 'date-fns/locale'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { supabase } from '../supabase'
import type { Report } from '../types'

export default function CalendarView() {
    const [currentDate, setCurrentDate] = useState(new Date())
    const [reports, setReports] = useState<Report[]>([])
    const [, setLoading] = useState(true)

    useEffect(() => {
        fetchReports()
    }, [currentDate])

    const fetchReports = async () => {
        setLoading(true)
        const start = startOfMonth(currentDate).toISOString()
        const end = endOfMonth(currentDate).toISOString()

        const { data } = await supabase
            .from('reports')
            .select('*')
            .not('next_visit_date', 'is', null)
            .gte('next_visit_date', start)
            .lte('next_visit_date', end)

        if (data) {
            setReports(data as Report[])
        }
        setLoading(false)
    }

    const nextMonth = () => setCurrentDate(addMonths(currentDate, 1))
    const prevMonth = () => setCurrentDate(subMonths(currentDate, 1))

    const days = eachDayOfInterval({
        start: startOfMonth(currentDate),
        end: endOfMonth(currentDate),
    })

    // Group by date
    const reportsByDate = reports.reduce((acc, report) => {
        if (!report.next_visit_date) return acc
        const date = report.next_visit_date
        if (!acc[date]) acc[date] = []
        acc[date].push(report)
        return acc
    }, {} as Record<string, Report[]>)

    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 600 }}>訪問スケジュール</h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <button onClick={prevMonth} className="btn btn-ghost"><ChevronLeft /></button>
                    <span style={{ fontSize: '1.25rem', fontWeight: 600 }}>
                        {format(currentDate, 'yyyy年 M月', { locale: ja })}
                    </span>
                    <button onClick={nextMonth} className="btn btn-ghost"><ChevronRight /></button>
                </div>
            </div>

            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(7, 1fr)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-lg)',
                overflow: 'hidden',
                backgroundColor: 'var(--color-surface)'
            }}>
                {/* Weekday Headers */}
                {['日', '月', '火', '水', '木', '金', '土'].map((day, idx) => (
                    <div key={day} style={{
                        padding: '0.75rem',
                        textAlign: 'center',
                        fontWeight: 600,
                        backgroundColor: 'var(--color-bg)',
                        borderBottom: '1px solid var(--color-border)',
                        color: idx === 0 ? 'red' : idx === 6 ? 'blue' : 'inherit'
                    }}>
                        {day}
                    </div>
                ))}

                {/* Days */}
                {days.map((day, idx) => {
                    // Alignment for first day
                    const style = idx === 0 ? { gridColumnStart: day.getDay() + 1 } : {}
                    const dateKey = format(day, 'yyyy-MM-dd')
                    const dayReports = reportsByDate[dateKey] || []
                    const isToday = isSameDay(day, new Date())

                    return (
                        <div key={day.toISOString()} style={{
                            ...style,
                            minHeight: '120px',
                            padding: '0.5rem',
                            borderRight: '1px solid var(--color-border)',
                            borderBottom: '1px solid var(--color-border)',
                            backgroundColor: isToday ? '#fffbeb' : 'transparent',
                            position: 'relative'
                        }}>
                            <div style={{
                                textAlign: 'right',
                                marginBottom: '0.5rem',
                                fontSize: '0.9rem',
                                fontWeight: isToday ? 'bold' : 'normal',
                                color: isToday ? 'var(--color-primary)' : 'inherit'
                            }}>
                                {format(day, 'd')}
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                {dayReports.map(r => (
                                    <Link key={r.id} to={`/reports/${r.id}`} style={{
                                        display: 'block',
                                        fontSize: '0.75rem',
                                        backgroundColor: 'var(--color-bg)',
                                        padding: '0.25rem 0.5rem',
                                        borderRadius: '4px',
                                        borderLeft: '3px solid var(--color-primary)',
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis'
                                    }} title={`${r.patient_name} 様\n${r.next_visit_plan}`}>
                                        {r.patient_name}
                                    </Link>
                                ))}
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
