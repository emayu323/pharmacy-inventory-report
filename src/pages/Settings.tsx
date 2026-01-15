import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthProvider'
import { supabase } from '../supabase'
import { Save, User as UserIcon } from 'lucide-react'
import toast from 'react-hot-toast'

export default function Settings() {
    const { user } = useAuth()
    const [displayName, setDisplayName] = useState('')
    const [isLoading, setIsLoading] = useState(false)

    useEffect(() => {
        if (user?.user_metadata?.display_name) {
            setDisplayName(user.user_metadata.display_name)
        }
    }, [user])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsLoading(true)

        try {
            const { error } = await supabase.auth.updateUser({
                data: { display_name: displayName }
            })

            if (error) throw error

            toast.success('設定を保存しました')
            // Refresh logic might be handled by AuthProvider subscription automatically
        } catch (error: any) {
            console.error(error)
            toast.error(`保存に失敗しました: ${error.message}`)
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '2rem' }}>設定</h2>

            <section className="card" style={{ padding: '2rem' }}>
                <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <UserIcon size={20} />
                    プロフィール設定
                </h3>

                <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '1.5rem' }}>
                    <div>
                        <label className="label" style={{ marginBottom: '0.5rem', display: 'block', fontWeight: 500 }}>
                            メールアドレス
                        </label>
                        <input
                            type="text"
                            value={user?.email || ''}
                            disabled
                            className="input"
                            style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text-secondary)', cursor: 'not-allowed' }}
                        />
                        <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginTop: '0.25rem' }}>
                            メールアドレスの変更はできません
                        </p>
                    </div>

                    <div>
                        <label className="label" style={{ marginBottom: '0.5rem', display: 'block', fontWeight: 500 }}>
                            表示名（薬剤師名）
                        </label>
                        <input
                            type="text"
                            value={displayName}
                            onChange={(e) => setDisplayName(e.target.value)}
                            className="input"
                            placeholder="例: 山田 太郎"
                        />
                        <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginTop: '0.25rem' }}>
                            報告書の「担当薬剤師」欄に自動入力されます
                        </p>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button
                            type="submit"
                            className="btn btn-primary"
                            disabled={isLoading}
                            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                        >
                            <Save size={18} />
                            {isLoading ? '保存中...' : '保存する'}
                        </button>
                    </div>
                </form>
            </section>
        </div>
    )
}
