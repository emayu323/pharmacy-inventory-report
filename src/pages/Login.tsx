import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'

export default function Login() {
    const navigate = useNavigate()
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [isLogin, setIsLogin] = useState(true) // Toggle state
    const [error, setError] = useState<string | null>(null)
    const [message, setMessage] = useState<string | null>(null)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError(null)
        setMessage(null)

        try {
            if (isLogin) {
                // Login Flow
                const { error } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                })
                if (error) throw error
                navigate('/')
            } else {
                // Sign Up Flow
                const { data, error } = await supabase.auth.signUp({
                    email,
                    password,
                })
                if (error) throw error

                // Check if email confirmation is required
                if (data?.user && !data.session) {
                    setMessage('確認メールを送信しました。メール内のリンクをクリックして登録を完了してください。')
                } else {
                    // Auto-login (if email confirmation is disabled)
                    navigate('/')
                }
            }
        } catch (err: unknown) {
            console.error(err)
            setError(err instanceof Error ? err.message : 'エラーが発生しました')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            height: '100vh',
            backgroundColor: 'var(--color-bg)'
        }}>
            <div className="card" style={{ width: '100%', maxWidth: '400px', padding: '2rem' }}>
                <h1 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '1.5rem', textAlign: 'center' }}>
                    {isLogin ? 'ログイン' : '新規アカウント登録'}
                </h1>

                {error && (
                    <div style={{ color: 'red', marginBottom: '1rem', backgroundColor: '#fee2e2', padding: '0.75rem', borderRadius: '0.375rem', fontSize: '0.875rem' }}>
                        {error}
                    </div>
                )}

                {message && (
                    <div style={{ color: 'green', marginBottom: '1rem', backgroundColor: '#dcfce7', padding: '0.75rem', borderRadius: '0.375rem', fontSize: '0.875rem' }}>
                        {message}
                    </div>
                )}

                <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '1rem' }}>
                    <div>
                        <label className="label">メールアドレス</label>
                        <input
                            type="email"
                            className="input"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                        />
                    </div>
                    <div>
                        <label className="label">パスワード</label>
                        <input
                            type="password"
                            className="input"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            minLength={6}
                        />
                    </div>
                    <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={loading}
                        style={{ marginTop: '1rem', justifyContent: 'center' }}
                    >
                        {loading ? '処理中...' : (isLogin ? 'ログイン' : '登録する')}
                    </button>
                </form>

                <div style={{ marginTop: '1.5rem', textAlign: 'center', fontSize: '0.875rem' }}>
                    <button
                        onClick={() => {
                            setIsLogin(!isLogin)
                            setError(null)
                            setMessage(null)
                        }}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--color-primary)',
                            cursor: 'pointer',
                            textDecoration: 'underline'
                        }}
                    >
                        {isLogin ? '新規アカウント登録はこちら' : 'ログイン画面に戻る'}
                    </button>
                </div>
            </div>
        </div>
    )
}
