import { createContext, useContext, useEffect, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../supabase'

type AuthContextType = {
    session: Session | null
    user: User | null
    loading: boolean
    signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
    session: null,
    user: null,
    loading: true,
    signOut: async () => { },
})

export const useAuth = () => useContext(AuthContext)

export function AuthProvider({ children }: { children: React.ReactNode }) {
    // Check for Test Mode Env Var
    const isTestMode = import.meta.env.VITE_ENABLE_TEST_MODE === 'true'

    const [session, setSession] = useState<Session | null>(null)
    const [user, setUser] = useState<User | null>(null)
    const [loading, setLoading] = useState(true)

    // MOCK USER for Testing
    const TEST_USER: User = {
        id: '11111111-1111-1111-1111-111111111111',
        email: 'test-user-1@example.com',
        app_metadata: { provider: 'email' },
        user_metadata: {},
        aud: 'authenticated',
        created_at: new Date().toISOString()
    } as User

    // Synchronous Update for Test Mode
    const [session, setSession] = useState<Session | null>(isTestMode ? { user: TEST_USER } as Session : null)
    const [user, setUser] = useState<User | null>(isTestMode ? TEST_USER : null)
    // If Test Mode, loading is FALSE immediately
    const [loading, setLoading] = useState(!isTestMode)

    useEffect(() => {
        if (isTestMode) {
            console.log('AuthProvider: Test Mode ENABLED (Sync). Logged in as:', TEST_USER.id)
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
    }, [isTestMode])

    const signOut = async () => {
        if (isTestMode) {
            alert('テストモードのためログアウトできません')
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
