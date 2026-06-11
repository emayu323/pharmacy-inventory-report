import { createContext, useContext } from 'react'

export type LocalAuthUser = {
    id: string
    email: string
    user_metadata: {
        display_name?: string
    }
}

export type LocalAuthSession = {
    user: LocalAuthUser
}

export type AuthContextType = {
    session: LocalAuthSession | null
    user: LocalAuthUser | null
    loading: boolean
    signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextType>({
    session: null,
    user: null,
    loading: false,
    signOut: async () => { },
})

export const useAuth = () => useContext(AuthContext)
