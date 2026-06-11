import { AuthContext, type LocalAuthSession, type LocalAuthUser } from './authContext'

const LOCAL_USER: LocalAuthUser = {
    id: '00000000-0000-0000-0000-000000000001',
    email: 'local-user@example.local',
    user_metadata: { display_name: 'ローカル利用者' }
}

const LOCAL_SESSION: LocalAuthSession = {
    user: LOCAL_USER
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const signOut = async () => {
        alert('ローカルアプリはPINロックで保護されています')
    }

    return (
        <AuthContext.Provider value={{ session: LOCAL_SESSION, user: LOCAL_USER, loading: false, signOut }}>
            {children}
        </AuthContext.Provider>
    )
}
