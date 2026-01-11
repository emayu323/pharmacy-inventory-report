import { createContext, useContext, useEffect, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
// import { supabase } from '../supabase'

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
    // MOCK USER for Testing
    const TEST_USER: User = {
        id: 'test-user-1',
        email: 'test-user-1@example.com',
        app_metadata: { provider: 'email' },
        user_metadata: {},
        aud: 'authenticated',
        created_at: new Date().toISOString()
    } as User

    /* eslint-disable @typescript-eslint/no-unused-vars */
    const [session, _setSession] = useState<Session | null>({ user: TEST_USER } as Session)
    const [user, _setUser] = useState<User | null>(TEST_USER)
    const [loading, _setLoading] = useState(false)
    /* eslint-enable @typescript-eslint/no-unused-vars */

    useEffect(() => {
        // In a real app, we would listen to Supabase here.
        // For "Test User 1" mode, we just ignore actual Supabase Auth state 
        // and correctly persist our mock user.

        // Optional: Log that we are in Test Mode
        console.log('AuthProvider: Running in TEST MODE as', TEST_USER.id)
    }, [])

    const signOut = async () => {
        // Mock SignOut - maybe just reload or do nothing
        alert('テストモードのためログアウトできません')
    }

    return (
        <AuthContext.Provider value={{ session, user, loading, signOut }}>
            {!loading && children}
        </AuthContext.Provider>
    )
}
