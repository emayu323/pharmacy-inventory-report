import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Bot, CheckCircle2, Database, Download, ExternalLink, Loader2, MonitorUp, RefreshCcw, Rocket } from 'lucide-react'
import {
    createDemoInstallCodeRegistry,
    isInstallCodeVerificationResult,
    verifyInstallCodeFromRegistry,
    type InstallCodeVerificationResult
} from '../installCode'
import { LOCAL_APP_PORT_CANDIDATES, LOCAL_APP_URI, probeLocalApp, type LocalAppProbeResult, type LocalAppStatus } from '../localAppConnection'

const INSTALLER_URL = import.meta.env.VITE_WINDOWS_INSTALLER_URL || ''
const DEMO_INSTALL_CODES = import.meta.env.VITE_DEMO_INSTALL_CODES || ''
const INSTALL_DEVICE_ID_STORAGE_KEY = 'pharmacy-report:install-device-id:v1'

type CheckState = 'idle' | 'checking' | 'checked'
type InstallCodeCheckState = 'idle' | 'checking' | 'checked'

export default function EntryPortal() {
    const [checkState, setCheckState] = useState<CheckState>('idle')
    const [result, setResult] = useState<LocalAppProbeResult>({ status: 'not_detected' })
    const [installCode, setInstallCode] = useState('')
    const [installCodeCheckState, setInstallCodeCheckState] = useState<InstallCodeCheckState>('idle')
    const [installCodeResult, setInstallCodeResult] = useState<InstallCodeVerificationResult | null>(null)

    const canDownload = installCodeResult?.status === 'valid' && Boolean(installCodeResult.installerUrl)
    const status = useMemo(() => getStatusView(result.status), [result.status])

    const checkConnection = useCallback(async () => {
        setCheckState('checking')
        const nextResult = await probeLocalApp()
        setResult(nextResult)
        setCheckState('checked')
    }, [])

    useEffect(() => {
        let cancelled = false
        queueMicrotask(() => {
            if (!cancelled) void checkConnection()
        })
        return () => {
            cancelled = true
        }
    }, [checkConnection])

    const openLocalApp = () => {
        window.location.href = LOCAL_APP_URI
        window.setTimeout(checkConnection, 1400)
    }

    const openAppUrl = () => {
        if (result.appUrl) {
            window.location.href = result.appUrl
            return
        }
        if (result.port) {
            window.location.href = `http://127.0.0.1:${result.port}/`
        }
    }

    const focusInstallerSection = () => {
        document.getElementById('install-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }

    const openInstallerOrGuide = () => {
        if (canDownload && installCodeResult?.installerUrl) {
            window.location.href = installCodeResult.installerUrl
            return
        }
        focusInstallerSection()
    }

    const verifyInstallCode = async () => {
        setInstallCodeCheckState('checking')
        const nextResult = await requestInstallCodeVerification(installCode)
        setInstallCodeResult(nextResult)
        setInstallCodeCheckState('checked')
    }

    return (
        <div style={{ minHeight: '100vh', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}>
            <header style={{ backgroundColor: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)', padding: '1rem 0' }}>
                <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
                        <div style={{ backgroundColor: 'var(--color-primary)', color: 'white', padding: '0.35rem', borderRadius: '6px', display: 'grid', placeItems: 'center' }}>
                            <MonitorUp size={20} />
                        </div>
                        <div style={{ minWidth: 0 }}>
                            <h1 style={{ fontSize: '1.125rem', fontWeight: 700 }}>在宅報告アプリ 導入入口</h1>
                            <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>Vercel入口</div>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <a className="btn btn-ghost" href="/manual.html" target="_blank" rel="noreferrer">
                            <ExternalLink size={17} />
                            マニュアル
                        </a>
                        <button className="btn btn-ghost" type="button" onClick={checkConnection} disabled={checkState === 'checking'}>
                            <RefreshCcw size={17} />
                            再確認
                        </button>
                    </div>
                </div>
            </header>

            <main className="container" style={{ paddingTop: '2rem', paddingBottom: '2rem', display: 'grid', gap: '1.5rem', maxWidth: '980px' }}>
                <section className="card" style={{ padding: '1.5rem', display: 'grid', gap: '1.25rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flexWrap: 'wrap' }}>
                        <div style={{
                            width: '48px',
                            height: '48px',
                            borderRadius: '8px',
                            display: 'grid',
                            placeItems: 'center',
                            color: status.color,
                            backgroundColor: status.background
                        }}>
                            {checkState === 'checking' ? <Loader2 size={24} /> : status.icon}
                        </div>
                        <div style={{ flex: 1, minWidth: '220px' }}>
                            <h2 style={{ fontSize: '1.35rem', fontWeight: 700 }}>{checkState === 'checking' ? '接続確認中' : status.title}</h2>
                            <div style={{ color: 'var(--color-text-secondary)', marginTop: '0.25rem' }}>
                                {checkState === 'checking' ? 'ローカルアプリの応答を確認しています' : status.description}
                            </div>
                        </div>
                        {result.version && (
                            <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>
                                v{result.version}
                            </div>
                        )}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
                        <StatusItem label="接続先" value={result.port ? `127.0.0.1:${result.port}` : `候補 ${LOCAL_APP_PORT_CANDIDATES.join(', ')}`} />
                        <StatusItem label="ローカルDB" value={result.status === 'db_preparing' ? '準備中' : result.status === 'not_detected' ? '未確認' : '確認済み'} />
                        <StatusItem label="AIモード" value={result.status === 'ai_not_setup' || result.aiReady === false ? '未セットアップ' : result.status === 'not_detected' ? '未確認' : '利用可'} />
                    </div>

                    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                        {(result.status === 'ready' || result.status === 'ai_not_setup') && (
                            <button type="button" className="btn btn-primary" onClick={openAppUrl}>
                                <ExternalLink size={18} />
                                報告書作成を開く
                            </button>
                        )}
                        {result.status === 'not_detected' && (
                            <button type="button" className="btn btn-primary" onClick={openLocalApp}>
                                <Rocket size={18} />
                                ローカルアプリを起動
                            </button>
                        )}
                        {result.status === 'update_required' && (
                            <button type="button" className="btn btn-primary" onClick={openInstallerOrGuide}>
                                <Download size={18} />
                                {canDownload ? '更新版をインストール' : '導入コードを確認して更新'}
                            </button>
                        )}
                        <button type="button" className="btn btn-ghost" onClick={checkConnection} disabled={checkState === 'checking'}>
                            <RefreshCcw size={18} />
                            接続を再確認
                        </button>
                    </div>
                </section>

                <section id="install-section" className="card" style={{ padding: '1.5rem', display: 'grid', gap: '1rem' }}>
                    <h2 style={{ fontSize: '1.125rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Download size={20} />
                        Windows版インストール
                    </h2>
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 1fr) auto', gap: '0.75rem', alignItems: 'end' }}>
                        <div>
                            <label className="label" style={{ marginBottom: '0.5rem', display: 'block' }}>導入コード</label>
                            <input
                                className="input"
                                value={installCode}
                                onChange={(e) => {
                                    setInstallCode(e.target.value)
                                    setInstallCodeResult(null)
                                    setInstallCodeCheckState('idle')
                                }}
                                placeholder="導入コード"
                            />
                        </div>
                        <button type="button" className="btn btn-ghost" onClick={verifyInstallCode} disabled={installCodeCheckState === 'checking'}>
                            {installCodeCheckState === 'checking' ? <Loader2 size={18} /> : <CheckCircle2 size={18} />}
                            確認
                        </button>
                    </div>

                    {installCodeResult && (
                        <div style={{
                            color: getInstallCodeMessageColor(installCodeResult.status),
                            backgroundColor: getInstallCodeMessageBackground(installCodeResult.status),
                            border: '1px solid var(--color-border)',
                            borderRadius: '8px',
                            padding: '0.85rem',
                            display: 'grid',
                            gap: '0.4rem'
                        }}>
                            <div style={{ fontWeight: 700 }}>{installCodeResult.message}</div>
                            {installCodeResult.label && (
                                <div style={{ fontSize: '0.9rem' }}>{installCodeResult.label}</div>
                            )}
                            {typeof installCodeResult.maxDevices === 'number' && (
                                <div style={{ fontSize: '0.9rem' }}>
                                    使用台数 {installCodeResult.usedDevicesCount ?? 0} / {installCodeResult.maxDevices}
                                </div>
                            )}
                        </div>
                    )}

                    {canDownload ? (
                        <a className="btn btn-primary" href={installCodeResult.installerUrl}>
                            <Download size={18} />
                            Windows版をインストール
                        </a>
                    ) : (
                        <button type="button" className="btn btn-ghost" disabled>
                            <Download size={18} />
                            Windows版をインストール
                        </button>
                    )}

                    {installCodeResult?.status === 'valid' && !installCodeResult.installerUrl && (
                        <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>
                            インストーラーURLは未設定です。
                        </div>
                    )}
                    {!installCodeResult && !INSTALLER_URL && !DEMO_INSTALL_CODES && (
                        <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>
                            導入コード管理表は未設定です。
                        </div>
                    )}
                </section>

                <section className="card" style={{ padding: '1.5rem', display: 'grid', gap: '0.75rem' }}>
                    <h2 style={{ fontSize: '1.125rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <ExternalLink size={20} />
                        マニュアル / FAQ
                    </h2>
                    <p style={{ margin: 0, color: 'var(--color-text-secondary)' }}>
                        初回インストール、普段の起動、更新、バックアップ、AIモードの確認手順をまとめています。
                    </p>
                    <div>
                        <a className="btn btn-ghost" href="/manual.html" target="_blank" rel="noreferrer">
                            <ExternalLink size={18} />
                            マニュアルを開く
                        </a>
                    </div>
                </section>
            </main>
        </div>
    )
}

async function requestInstallCodeVerification(code: string): Promise<InstallCodeVerificationResult> {
    const apiResult = await requestInstallCodeVerificationFromApi(code)
    if (apiResult) return apiResult

    return verifyInstallCodeFromRegistry(
        code,
        createDemoInstallCodeRegistry(DEMO_INSTALL_CODES, INSTALLER_URL),
        { defaultInstallerUrl: INSTALLER_URL }
    )
}

async function requestInstallCodeVerificationFromApi(code: string): Promise<InstallCodeVerificationResult | null> {
    try {
        const response = await fetch('/api/install-code/verify', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                code,
                deviceId: getInstallDeviceId()
            })
        })
        const contentType = response.headers.get('content-type') || ''
        if (!contentType.includes('application/json')) return null

        const data = await response.json() as unknown
        return isInstallCodeVerificationResult(data) ? data : null
    } catch {
        return null
    }
}

function getInstallDeviceId() {
    const storage = getBrowserStorage()
    const existing = storage?.getItem(INSTALL_DEVICE_ID_STORAGE_KEY)
    if (existing) return existing

    const next = crypto.randomUUID?.() || `device-${Date.now()}-${Math.random().toString(36).slice(2)}`
    storage?.setItem(INSTALL_DEVICE_ID_STORAGE_KEY, next)
    return next
}

function getBrowserStorage() {
    try {
        return typeof window !== 'undefined' ? window.localStorage : null
    } catch {
        return null
    }
}

function StatusItem({ label, value }: { label: string; value: string }) {
    return (
        <div style={{ border: '1px solid var(--color-border)', borderRadius: '8px', padding: '0.9rem', backgroundColor: 'var(--color-surface)' }}>
            <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.8rem', marginBottom: '0.25rem' }}>{label}</div>
            <div style={{ fontWeight: 700 }}>{value}</div>
        </div>
    )
}

const getInstallCodeMessageColor = (status: InstallCodeVerificationResult['status']) => {
    if (status === 'valid') return '#166534'
    if (status === 'not_configured') return '#92400e'
    return '#991b1b'
}

const getInstallCodeMessageBackground = (status: InstallCodeVerificationResult['status']) => {
    if (status === 'valid') return '#dcfce7'
    if (status === 'not_configured') return '#fef3c7'
    return '#fee2e2'
}

const getStatusView = (status: LocalAppStatus) => {
    switch (status) {
        case 'ready':
            return {
                title: '接続OK',
                description: 'ローカルアプリに接続できます。',
                color: '#15803d',
                background: '#dcfce7',
                icon: <CheckCircle2 size={24} />
            }
        case 'update_required':
            return {
                title: '更新が必要です',
                description: 'ローカルアプリの更新後に接続できます。',
                color: '#b45309',
                background: '#fef3c7',
                icon: <AlertTriangle size={24} />
            }
        case 'db_preparing':
            return {
                title: 'ローカルDB準備中',
                description: 'データベース準備後に接続できます。',
                color: '#1d4ed8',
                background: '#dbeafe',
                icon: <Database size={24} />
            }
        case 'ai_not_setup':
            return {
                title: 'AI未セットアップ',
                description: '通常機能は利用できます。',
                color: '#6d28d9',
                background: '#ede9fe',
                icon: <Bot size={24} />
            }
        default:
            return {
                title: '未インストールまたは未起動',
                description: 'ローカルアプリの応答がありません。',
                color: '#b91c1c',
                background: '#fee2e2',
                icon: <AlertTriangle size={24} />
            }
    }
}
