import { useEffect, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { hasSupabaseConfig, supabase } from '../supabase'
import { AuthContext } from './authContext'
import { getNativeBridge } from '../nativeBridge'
import { shouldUseLocalAuthMode } from '../authMode'

const TEST_USER: User = {
    id: '11111111-1111-1111-1111-111111111111',
    email: 'test-user-1@example.com',
    app_metadata: { provider: 'email' },
    user_metadata: {},
    aud: 'authenticated',
    created_at: new Date().toISOString()
} as User

const LOCAL_USER: User = {
    id: '00000000-0000-0000-0000-000000000001',
    email: 'local-user@example.local',
    app_metadata: { provider: 'local' },
    user_metadata: { display_name: 'ローカル利用者' },
    aud: 'authenticated',
    created_at: new Date().toISOString()
} as User

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const isTestMode = import.meta.env.VITE_ENABLE_TEST_MODE === 'true'
    const isLocalAuthMode = shouldUseLocalAuthMode({
        isTestMode,
        reportStorageMode: import.meta.env.VITE_REPORT_STORAGE,
        hasNativeBridge: Boolean(getNativeBridge()),
        hasSupabaseConfig
    })
    const initialUser = isTestMode ? TEST_USER : isLocalAuthMode ? LOCAL_USER : null
    const initialSession = initialUser ? { user: initialUser } as Session : null

    const [session, setSession] = useState<Session | null>(initialSession)
    const [user, setUser] = useState<User | null>(initialUser)
    const [loading, setLoading] = useState(!isLocalAuthMode)

    useEffect(() => {
        if (isLocalAuthMode) {
            return
        }

        // Real Supabase Auth
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session)
            setUser(session?.user ?? null)
            setLoading(false)
        })

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session)
            setUser(session?.user ?? null)
            setLoading(false)
        })

        return () => subscription.unsubscribe()
    }, [isLocalAuthMode])

    const signOut = async () => {
        if (isLocalAuthMode) {
            alert('ローカルアプリはPINロックで保護されています')
            return
        }
        await supabase.auth.signOut()
    }

    return (
        <AuthContext.Provider value={{ session, user, loading, signOut }}>
            {!loading && children}
        </AuthContext.Provider>
    )
}
