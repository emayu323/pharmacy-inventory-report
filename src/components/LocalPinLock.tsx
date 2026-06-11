import { useCallback, useEffect, useRef, useState } from 'react'
import { Lock } from 'lucide-react'
import { getAppSettings, verifyLocalPin } from '../appSettingsRepository'
import type { AppSettings } from '../types'
import { APP_SETTINGS_UPDATED_EVENT, isAppSettingsUpdatedEvent } from '../appSettingsEvents'

const ACTIVITY_EVENTS = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll']

export default function LocalPinLock({ children }: { children: React.ReactNode }) {
    const [settings, setSettings] = useState<AppSettings | null>(null)
    const [locked, setLocked] = useState(false)
    const [pin, setPin] = useState('')
    const [error, setError] = useState('')
    const lockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const lock = useCallback(() => {
        if (settings?.pin_enabled) {
            setLocked(true)
            setPin('')
        }
    }, [settings])

    const resetTimer = useCallback(() => {
        if (!settings?.pin_enabled || locked) return
        if (lockTimerRef.current) clearTimeout(lockTimerRef.current)
        lockTimerRef.current = setTimeout(lock, settings.lock_timeout_minutes * 60 * 1000)
    }, [locked, lock, settings])

    useEffect(() => {
        let cancelled = false
        const fetchSettings = async () => {
            const data = await getAppSettings()
            if (cancelled) return
            setSettings(data)
            setLocked(data.pin_enabled)
        }

        fetchSettings()
        return () => {
            cancelled = true
        }
    }, [])

    useEffect(() => {
        const handleSettingsUpdated = (event: Event) => {
            if (!isAppSettingsUpdatedEvent(event)) return
            setSettings(event.detail)
            if (!event.detail.pin_enabled) {
                setLocked(false)
                setPin('')
                setError('')
            }
        }

        window.addEventListener(APP_SETTINGS_UPDATED_EVENT, handleSettingsUpdated)
        return () => {
            window.removeEventListener(APP_SETTINGS_UPDATED_EVENT, handleSettingsUpdated)
        }
    }, [])

    useEffect(() => {
        if (!settings?.pin_enabled || locked) return
        ACTIVITY_EVENTS.forEach(eventName => window.addEventListener(eventName, resetTimer, { passive: true }))
        resetTimer()

        return () => {
            ACTIVITY_EVENTS.forEach(eventName => window.removeEventListener(eventName, resetTimer))
            if (lockTimerRef.current) clearTimeout(lockTimerRef.current)
        }
    }, [locked, resetTimer, settings])

    const handleUnlock = async (e: React.FormEvent) => {
        e.preventDefault()
        const verified = await verifyLocalPin(pin)
        if (!verified) {
            setError('PINが違います')
            setPin('')
            return
        }

        setError('')
        setLocked(false)
        setPin('')
    }

    if (!settings?.pin_enabled || !locked) {
        return <>{children}</>
    }

    return (
        <div style={{ minHeight: '70vh', display: 'grid', placeItems: 'center', padding: '2rem' }}>
            <form
                onSubmit={handleUnlock}
                className="card"
                style={{ width: '100%', maxWidth: '360px', padding: '2rem', display: 'grid', gap: '1rem' }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <Lock size={22} />
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>ロック中</h2>
                </div>
                <input
                    className="input"
                    type="password"
                    inputMode="numeric"
                    autoFocus
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    placeholder="PIN"
                />
                {error && <div style={{ color: 'var(--color-danger)', fontSize: '0.9rem' }}>{error}</div>}
                <button type="submit" className="btn btn-primary">
                    解除
                </button>
            </form>
        </div>
    )
}
