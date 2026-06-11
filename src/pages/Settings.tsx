import { useCallback, useState, useEffect } from 'react'
import { useAuth } from '../contexts/authContext'
import { Bot, Building2, Copy, Database, Download, Edit2, Eye, EyeOff, FolderSync, Lock, Plus, RefreshCw, RotateCcw, Save, Trash2, Upload, User as UserIcon } from 'lucide-react'
import toast from 'react-hot-toast'
import type { AppSettings, Patient, Report, TextTemplate, TextTemplateTarget } from '../types'
import { deleteTextTemplate, listTextTemplates, saveTextTemplate } from '../templateRepository'
import { getTextTemplateTargetLabel, TEXT_TEMPLATE_TARGETS } from '../templateTargets'
import { clearLocalPin, DEFAULT_APP_SETTINGS, ensureBackupKey, getAppSettings, rotateBackupKey, saveAppSettings, setLocalPin } from '../appSettingsRepository'
import { createEncryptedLocalBackup, restoreEncryptedLocalBackup, type LocalBackupSummary } from '../localBackupRepository'
import { getNativeBridge, type NativeAiEnvironmentStatus, type NativeBackupSummary, type NativeDrugMasterStatus, type NativeSecurityStatus, type NativeUpdateStatus } from '../nativeBridge'
import { createAiSetupGuide, type AiSetupStep } from '../aiSetupGuide'
import { createBackupKeyLedgerTsv } from '../backupKeyLedger'
import { isLocalPatientStorage, listDeletedPatients, restorePatient } from '../patientRepository'
import { listDeletedReports, restoreReport } from '../reportRepository'
import { dispatchAppSettingsUpdated } from '../appSettingsEvents'

type BackupSummaryView = LocalBackupSummary | NativeBackupSummary

export default function Settings() {
    const { user } = useAuth()
    const [displayName, setDisplayName] = useState('')
    const [settingsLoading, setSettingsLoading] = useState(false)
    const [appSettings, setAppSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS)
    const [backupPassword, setBackupPassword] = useState('')
    const [restorePassword, setRestorePassword] = useState('')
    const [restoreFile, setRestoreFile] = useState<File | null>(null)
    const [backupLoading, setBackupLoading] = useState(false)
    const [preUpdateBackupLoading, setPreUpdateBackupLoading] = useState(false)
    const [restoreLoading, setRestoreLoading] = useState(false)
    const [backupKeyLoading, setBackupKeyLoading] = useState(false)
    const [backupSummary, setBackupSummary] = useState<BackupSummaryView | null>(null)
    const [backupPath, setBackupPath] = useState('')
    const [drugMasterStatus, setDrugMasterStatus] = useState<NativeDrugMasterStatus | null>(null)
    const [drugMasterLoading, setDrugMasterLoading] = useState(false)
    const [aiEnvironmentStatus, setAiEnvironmentStatus] = useState<NativeAiEnvironmentStatus | null>(null)
    const [aiEnvironmentLoading, setAiEnvironmentLoading] = useState(false)
    const [securityStatus, setSecurityStatus] = useState<NativeSecurityStatus | null>(null)
    const [securityLoading, setSecurityLoading] = useState(false)
    const [updateStatus, setUpdateStatus] = useState<NativeUpdateStatus | null>(null)
    const [updateChecking, setUpdateChecking] = useState(false)
    const [hasNativeDrugMaster, setHasNativeDrugMaster] = useState(false)
    const [hasNativeBackup, setHasNativeBackup] = useState(false)
    const [hasNativeAi, setHasNativeAi] = useState(false)
    const [hasNativeSecurity, setHasNativeSecurity] = useState(false)
    const [hasNativeUpdates, setHasNativeUpdates] = useState(false)
    const [showBackupKey, setShowBackupKey] = useState(false)
    const [pinForm, setPinForm] = useState({
        enablePin: false,
        newPin: '',
        confirmPin: ''
    })
    const [templates, setTemplates] = useState<TextTemplate[]>([])
    const [templateForm, setTemplateForm] = useState<{
        id?: string
        target: TextTemplateTarget
        title: string
        body: string
    }>({
        target: 'medication_instruction',
        title: '',
        body: ''
    })
    const [deletedPatients, setDeletedPatients] = useState<Patient[]>([])
    const [deletedReports, setDeletedReports] = useState<Report[]>([])
    const [deletedItemsLoading, setDeletedItemsLoading] = useState(false)

    const refreshDeletedItems = useCallback(async (showSuccess = false) => {
        try {
            setDeletedItemsLoading(true)
            if (!getNativeBridge() && !isLocalPatientStorage() && !user) {
                setDeletedPatients([])
                setDeletedReports([])
                return
            }
            const [patients, reports] = await Promise.all([
                listDeletedPatients(),
                listDeletedReports()
            ])
            setDeletedPatients(patients)
            setDeletedReports(reports)
            if (showSuccess) toast.success('削除済みデータを更新しました')
        } catch (error) {
            console.error(error)
            toast.error('削除済みデータの読み込みに失敗しました')
        } finally {
            setDeletedItemsLoading(false)
        }
    }, [user])

    useEffect(() => {
        if (user?.user_metadata?.display_name) {
            setDisplayName(user.user_metadata.display_name)
        }
    }, [user])

    useEffect(() => {
        let cancelled = false
        const fetchAppSettings = async () => {
            const bridge = getNativeBridge()
            const data = bridge?.backups
                ? await ensureBackupKey()
                : await getAppSettings()
            if (!cancelled) {
                setAppSettings(data)
                setPinForm(prev => ({ ...prev, enablePin: data.pin_enabled }))
            }
        }

        fetchAppSettings()
        return () => {
            cancelled = true
        }
    }, [])

    useEffect(() => {
        let cancelled = false
        const fetchTemplates = async () => {
            const data = await listTextTemplates()
            if (!cancelled) setTemplates(data)
        }

        fetchTemplates()
        return () => {
            cancelled = true
        }
    }, [])

    useEffect(() => {
        refreshDeletedItems()
    }, [refreshDeletedItems])

    useEffect(() => {
        const bridge = getNativeBridge()
        const available = Boolean(bridge?.drugMaster)
        setHasNativeDrugMaster(available)
        setHasNativeBackup(Boolean(bridge?.backups))
        setHasNativeAi(Boolean(bridge?.ai))
        setHasNativeSecurity(Boolean(bridge?.security))
        setHasNativeUpdates(Boolean(bridge?.updates))
        if (!bridge?.drugMaster && !bridge?.ai && !bridge?.security && !bridge?.updates) return

        let cancelled = false
        let unsubscribeUpdates: (() => void) | undefined
        if (bridge.drugMaster) {
            bridge.drugMaster.getStatus()
                .then(status => {
                    if (!cancelled) setDrugMasterStatus(status)
                })
                .catch(error => {
                    console.error(error)
                })
        }
        if (bridge.ai) {
            bridge.ai.getStatus()
                .then(status => {
                    if (!cancelled) setAiEnvironmentStatus(status)
                })
                .catch(error => {
                    console.error(error)
                })
        }
        if (bridge.security) {
            bridge.security.getStatus()
                .then(status => {
                    if (!cancelled) setSecurityStatus(status)
                })
                .catch(error => {
                    console.error(error)
                })
        }
        if (bridge.updates) {
            bridge.updates.getStatus()
                .then(status => {
                    if (!cancelled) setUpdateStatus(status)
                })
                .catch(error => {
                    console.error(error)
                })
            unsubscribeUpdates = bridge.updates.onStatusChanged(status => {
                if (!cancelled) setUpdateStatus(status)
            })
        }

        return () => {
            cancelled = true
            unsubscribeUpdates?.()
        }
    }, [])

    const resetTemplateForm = () => {
        setTemplateForm({
            target: 'medication_instruction',
            title: '',
            body: ''
        })
    }

    const handleTemplateSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!templateForm.title.trim() || !templateForm.body.trim()) {
            toast.error('定型文名と本文を入力してください')
            return
        }

        try {
            const savedTemplate = await saveTextTemplate(templateForm)
            setTemplates(prev => {
                const exists = prev.some(template => template.id === savedTemplate.id)
                const next = exists
                    ? prev.map(template => template.id === savedTemplate.id ? savedTemplate : template)
                    : [savedTemplate, ...prev]
                return next.sort((a, b) => {
                    if (a.target !== b.target) return a.target.localeCompare(b.target)
                    return a.title.localeCompare(b.title, 'ja')
                })
            })
            toast.success(templateForm.id ? '定型文を更新しました' : '定型文を登録しました')
            resetTemplateForm()
        } catch (error) {
            console.error(error)
            toast.error('定型文の保存に失敗しました')
        }
    }

    const handleTemplateEdit = (template: TextTemplate) => {
        setTemplateForm({
            id: template.id,
            target: template.target,
            title: template.title,
            body: template.body
        })
    }

    const handleTemplateDelete = async (templateId: string) => {
        try {
            await deleteTextTemplate(templateId)
            setTemplates(prev => prev.filter(template => template.id !== templateId))
            if (templateForm.id === templateId) resetTemplateForm()
            toast.success('定型文を削除しました')
        } catch (error) {
            console.error(error)
            toast.error('定型文の削除に失敗しました')
        }
    }

    const handleAppSettingsSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (pinForm.enablePin && !appSettings.pin_enabled && !pinForm.newPin) {
            toast.error('PINロックを有効にするにはPINを設定してください')
            return
        }
        if (pinForm.newPin && pinForm.newPin !== pinForm.confirmPin) {
            toast.error('PINと確認入力が一致しません')
            return
        }

        try {
            setSettingsLoading(true)
            let savedSettings = await saveAppSettings({
                pharmacy_name: appSettings.pharmacy_name,
                pharmacy_address: appSettings.pharmacy_address,
                pharmacy_tel: appSettings.pharmacy_tel,
                pharmacy_fax: appSettings.pharmacy_fax,
                google_drive_folder: appSettings.google_drive_folder,
                ai_mode_enabled: appSettings.ai_mode_enabled,
                ai_ollama_url: appSettings.ai_ollama_url,
                ai_ollama_model: appSettings.ai_ollama_model,
                ai_auto_start_enabled: appSettings.ai_auto_start_enabled,
                ai_ollama_start_command: appSettings.ai_ollama_start_command,
                lock_timeout_minutes: appSettings.lock_timeout_minutes
            })

            if (pinForm.enablePin && pinForm.newPin) {
                savedSettings = await setLocalPin(pinForm.newPin)
            } else if (!pinForm.enablePin) {
                savedSettings = await clearLocalPin()
            }

            setAppSettings(savedSettings)
            setPinForm({
                enablePin: savedSettings.pin_enabled,
                newPin: '',
                confirmPin: ''
            })
            dispatchAppSettingsUpdated(window, savedSettings)
            toast.success('ローカル設定を保存しました')
        } catch (error) {
            console.error(error)
            const message = error instanceof Error ? error.message : 'ローカル設定の保存に失敗しました'
            toast.error(message)
        } finally {
            setSettingsLoading(false)
        }
    }

    const handleBackupExport = async () => {
        try {
            setBackupLoading(true)
            const bridge = getNativeBridge()
            if (bridge?.backups) {
                const result = await bridge.backups.create(backupPassword)
                setBackupSummary(result.summary)
                setBackupPath(result.googleDriveFilePath
                    ? `${result.filePath} / Google Drive: ${result.googleDriveFilePath}`
                    : result.filePath)
                setBackupPassword('')
                toast.success('SQLiteバックアップを作成しました')
                return
            }

            const { fileName, blob, summary } = await createEncryptedLocalBackup(backupPassword)
            downloadBlob(blob, fileName)
            setBackupSummary(summary)
            setBackupPath(fileName)
            setBackupPassword('')
            toast.success('バックアップを作成しました')
        } catch (error) {
            console.error(error)
            const message = error instanceof Error ? error.message : 'バックアップを作成できませんでした'
            toast.error(message)
        } finally {
            setBackupLoading(false)
        }
    }

    const handlePreUpdateBackup = async () => {
        const bridge = getNativeBridge()
        if (!bridge?.backups) {
            toast.error('ローカルアプリで開いてください')
            return
        }

        try {
            setPreUpdateBackupLoading(true)
            const result = await bridge.backups.createPreUpdate()
            setBackupSummary(result.summary)
            setBackupPath(result.googleDriveFilePath
                ? `${result.filePath} / Google Drive: ${result.googleDriveFilePath}`
                : result.filePath)
            setAppSettings(await getAppSettings())
            toast.success('アップデート前バックアップを作成しました')
        } catch (error) {
            console.error(error)
            const message = error instanceof Error ? error.message : 'アップデート前バックアップを作成できませんでした'
            toast.error(message)
        } finally {
            setPreUpdateBackupLoading(false)
        }
    }

    const handleBackupRestore = async () => {
        const bridge = getNativeBridge()
        if (bridge?.backups) {
            if (!window.confirm('現在のSQLite DBをバックアップ内容で置き換えます。復元前に現在DBを退避してから復元しますか？')) {
                return
            }

            try {
                setRestoreLoading(true)
                const result = await bridge.backups.restore(restorePassword)
                if (result.canceled) return
                if (result.summary) setBackupSummary(result.summary)
                setBackupPath(result.rollbackPath ? `復元前DB退避先: ${result.rollbackPath}` : '')
                setAppSettings(await getAppSettings())
                setTemplates(await listTextTemplates())
                setRestorePassword('')
                toast.success('SQLiteバックアップを復元しました')
            } catch (error) {
                console.error(error)
                const message = error instanceof Error ? error.message : 'バックアップを復元できませんでした'
                toast.error(message)
            } finally {
                setRestoreLoading(false)
            }
            return
        }

        if (!restoreFile) {
            toast.error('復元ファイルを選択してください')
            return
        }

        if (!window.confirm('現在のローカルデータをバックアップ内容で置き換えます。復元しますか？')) {
            return
        }

        try {
            setRestoreLoading(true)
            const summary = await restoreEncryptedLocalBackup(restoreFile, restorePassword)
            setBackupSummary(summary)
            setAppSettings(await getAppSettings())
            setTemplates(await listTextTemplates())
            setRestorePassword('')
            setRestoreFile(null)
            toast.success('バックアップを復元しました')
        } catch (error) {
            console.error(error)
            const message = error instanceof Error ? error.message : 'バックアップを復元できませんでした'
            toast.error(message)
        } finally {
            setRestoreLoading(false)
        }
    }

    const handleEnsureBackupKey = async () => {
        try {
            const settings = await ensureBackupKey()
            setAppSettings(settings)
            toast.success('薬局キーを生成しました')
        } catch (error) {
            console.error(error)
            toast.error('薬局キーを生成できませんでした')
        }
    }

    const handleCopyBackupKey = async () => {
        if (!appSettings.backup_key) {
            toast.error('薬局キーがありません')
            return
        }
        try {
            await navigator.clipboard.writeText(appSettings.backup_key)
            toast.success('薬局キーをコピーしました')
        } catch (error) {
            console.error(error)
            toast.error('コピーできませんでした')
        }
    }

    const handleCopyBackupKeyLedger = async () => {
        if (!appSettings.backup_key) {
            toast.error('薬局キーがありません')
            return
        }
        try {
            await navigator.clipboard.writeText(createBackupKeyLedgerTsv(appSettings))
            toast.success('台帳用にコピーしました')
        } catch (error) {
            console.error(error)
            toast.error('コピーできませんでした')
        }
    }

    const handleRotateBackupKey = async () => {
        if (!appSettings.backup_key) {
            await handleEnsureBackupKey()
            return
        }
        if (!window.confirm('薬局キーを再発行します。旧キーで作成済みの自動バックアップは旧キーがないと復元できません。現在のキーを管理者台帳へ控えてから続行してください。')) {
            return
        }

        try {
            setBackupKeyLoading(true)
            const settings = await rotateBackupKey()
            setAppSettings(settings)
            setShowBackupKey(true)
            toast.success('薬局キーを再発行しました')
        } catch (error) {
            console.error(error)
            toast.error('薬局キーを再発行できませんでした')
        } finally {
            setBackupKeyLoading(false)
        }
    }

    const handleCopySetupCommand = async (command: string) => {
        try {
            await navigator.clipboard.writeText(command)
            toast.success('コマンドをコピーしました')
        } catch (error) {
            console.error(error)
            toast.error('コピーできませんでした')
        }
    }

    const handleDrugMasterImport = async () => {
        const bridge = getNativeBridge()
        if (!bridge?.drugMaster) {
            toast.error('ローカルアプリで開いてください')
            return
        }

        try {
            setDrugMasterLoading(true)
            const result = await bridge.drugMaster.importCsv()
            if (result.canceled) return
            setDrugMasterStatus({
                count: result.count,
                source: result.source,
                updated_at: result.updated_at
            })
            toast.success(`薬剤マスタを更新しました（${result.count.toLocaleString('ja-JP')}件）`)
        } catch (error) {
            console.error(error)
            const message = error instanceof Error ? error.message : '薬剤マスタを更新できませんでした'
            toast.error(message)
        } finally {
            setDrugMasterLoading(false)
        }
    }

    const handleAiEnvironmentRefresh = async () => {
        const bridge = getNativeBridge()
        if (!bridge?.ai) {
            toast.error('ローカルアプリで開いてください')
            return
        }

        try {
            setAiEnvironmentLoading(true)
            const status = await bridge.ai.getStatus()
            setAiEnvironmentStatus(status)
            toast.success('AI環境を確認しました')
        } catch (error) {
            console.error(error)
            toast.error('AI環境を確認できませんでした')
        } finally {
            setAiEnvironmentLoading(false)
        }
    }

    const handleSecurityRefresh = async () => {
        const bridge = getNativeBridge()
        if (!bridge?.security) {
            toast.error('ローカルアプリで開いてください')
            return
        }

        try {
            setSecurityLoading(true)
            const status = await bridge.security.getStatus()
            setSecurityStatus(status)
            toast.success('DB保護状態を確認しました')
        } catch (error) {
            console.error(error)
            toast.error('DB保護状態を確認できませんでした')
        } finally {
            setSecurityLoading(false)
        }
    }

    const handleUpdateCheck = async () => {
        const bridge = getNativeBridge()
        if (!bridge?.updates) {
            toast.error('ローカルアプリで開いてください')
            return
        }

        try {
            setUpdateChecking(true)
            const status = await bridge.updates.checkNow()
            setUpdateStatus(status)
            if (status.status === 'error') {
                toast.error(status.lastError || status.message || '更新確認に失敗しました')
            } else {
                toast.success(status.message || '更新状態を確認しました')
            }
        } catch (error) {
            console.error(error)
            toast.error('更新状態を確認できませんでした')
        } finally {
            setUpdateChecking(false)
        }
    }

    const handleRestorePatient = async (patient: Patient) => {
        try {
            setDeletedItemsLoading(true)
            const restoredPatient = await restorePatient(patient.id)
            if (!restoredPatient) {
                toast.error('患者を復元できませんでした')
                return
            }
            setDeletedPatients(prev => prev.filter(item => item.id !== patient.id))
            toast.success('患者を復元しました')
        } catch (error) {
            console.error(error)
            toast.error('患者の復元に失敗しました')
        } finally {
            setDeletedItemsLoading(false)
        }
    }

    const handleRestoreReport = async (report: Report) => {
        try {
            setDeletedItemsLoading(true)
            const restoredReport = await restoreReport(report.id)
            if (!restoredReport) {
                toast.error('報告書を復元できませんでした')
                return
            }
            setDeletedReports(prev => prev.filter(item => item.id !== report.id))
            toast.success('報告書を復元しました')
        } catch (error) {
            console.error(error)
            toast.error('報告書の復元に失敗しました')
        } finally {
            setDeletedItemsLoading(false)
        }
    }

    const aiSetupGuide = createAiSetupGuide(appSettings, aiEnvironmentStatus)

    return (
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '2rem' }}>設定</h2>

            <section className="card" style={{ padding: '2rem' }}>
                <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <UserIcon size={20} />
                    プロフィール設定
                </h3>

                <div style={{ display: 'grid', gap: '1.5rem' }}>
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
                            ローカルアプリではオンライン認証を使用しません
                        </p>
                    </div>

                    <div>
                        <label className="label" style={{ marginBottom: '0.5rem', display: 'block', fontWeight: 500 }}>
                            表示名（薬剤師名）
                        </label>
                        <input
                            type="text"
                            value={displayName}
                            disabled
                            className="input"
                            style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text-secondary)', cursor: 'not-allowed' }}
                        />
                        <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginTop: '0.25rem' }}>
                            報告書の「担当薬剤師」欄は、報告書作成画面で入力します
                        </p>
                    </div>
                </div>
            </section>

            <section className="card" style={{ padding: '2rem', marginTop: '1.5rem' }}>
                <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Building2 size={20} />
                    ローカル設定
                </h3>

                <form onSubmit={handleAppSettingsSubmit} style={{ display: 'grid', gap: '1.5rem' }}>
                    <div>
                        <h4 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Building2 size={18} />
                            薬局情報
                        </h4>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
                            <div>
                                <label className="label" style={{ marginBottom: '0.5rem', display: 'block', fontWeight: 500 }}>薬局名</label>
                                <input
                                    className="input"
                                    value={appSettings.pharmacy_name}
                                    onChange={(e) => setAppSettings(prev => ({ ...prev, pharmacy_name: e.target.value }))}
                                    placeholder="例: 〇〇薬局"
                                />
                            </div>
                            <div>
                                <label className="label" style={{ marginBottom: '0.5rem', display: 'block', fontWeight: 500 }}>所在地</label>
                                <input
                                    className="input"
                                    value={appSettings.pharmacy_address}
                                    onChange={(e) => setAppSettings(prev => ({ ...prev, pharmacy_address: e.target.value }))}
                                    placeholder="薬局住所"
                                />
                            </div>
                            <div>
                                <label className="label" style={{ marginBottom: '0.5rem', display: 'block', fontWeight: 500 }}>TEL</label>
                                <input
                                    className="input"
                                    value={appSettings.pharmacy_tel}
                                    onChange={(e) => setAppSettings(prev => ({ ...prev, pharmacy_tel: e.target.value }))}
                                    placeholder="03-0000-0000"
                                />
                            </div>
                            <div>
                                <label className="label" style={{ marginBottom: '0.5rem', display: 'block', fontWeight: 500 }}>FAX</label>
                                <input
                                    className="input"
                                    value={appSettings.pharmacy_fax}
                                    onChange={(e) => setAppSettings(prev => ({ ...prev, pharmacy_fax: e.target.value }))}
                                    placeholder="03-0000-0001"
                                />
                            </div>
                        </div>
                    </div>

                    <div>
                        <h4 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <FolderSync size={18} />
                            バックアップ連携
                        </h4>
                        <label className="label" style={{ marginBottom: '0.5rem', display: 'block', fontWeight: 500 }}>
                            Google Drive同期フォルダ
                        </label>
                        <input
                            className="input"
                            value={appSettings.google_drive_folder}
                            onChange={(e) => setAppSettings(prev => ({ ...prev, google_drive_folder: e.target.value }))}
                            placeholder="例: G:\\マイドライブ\\在宅報告バックアップ"
                        />

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
                            <div>
                                <label className="label" style={{ marginBottom: '0.5rem', display: 'block', fontWeight: 500 }}>
                                    バックアップパスワード
                                </label>
                                <input
                                    className="input"
                                    type="password"
                                    value={backupPassword}
                                    onChange={(e) => setBackupPassword(e.target.value)}
                                    placeholder="8文字以上"
                                />
                                <button
                                    type="button"
                                    className="btn btn-primary"
                                    disabled={backupLoading}
                                    onClick={handleBackupExport}
                                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.75rem', width: '100%', justifyContent: 'center' }}
                                >
                                    <Download size={18} />
                                    {backupLoading ? '作成中...' : hasNativeBackup ? 'SQLite暗号化バックアップ作成' : '暗号化バックアップ作成'}
                                </button>
                                {hasNativeBackup && (
                                    <button
                                        type="button"
                                        className="btn btn-ghost"
                                        disabled={preUpdateBackupLoading}
                                        onClick={handlePreUpdateBackup}
                                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.75rem', width: '100%', justifyContent: 'center' }}
                                    >
                                        <Download size={18} />
                                        {preUpdateBackupLoading ? '作成中...' : 'アップデート前バックアップ'}
                                    </button>
                                )}
                            </div>

                            <div>
                                {hasNativeBackup ? (
                                    <div style={{ padding: '0.75rem', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>
                                        復元時はボタン押下後にバックアップファイルを選択します。
                                    </div>
                                ) : (
                                    <>
                                        <label className="label" style={{ marginBottom: '0.5rem', display: 'block', fontWeight: 500 }}>
                                            復元ファイル
                                        </label>
                                        <input
                                            className="input"
                                            type="file"
                                            accept="application/json,.json"
                                            onChange={(e) => setRestoreFile(e.target.files?.[0] ?? null)}
                                        />
                                    </>
                                )}
                                <label className="label" style={{ marginBottom: '0.5rem', marginTop: '0.75rem', display: 'block', fontWeight: 500 }}>
                                    復元パスワード
                                </label>
                                <input
                                    className="input"
                                    type="password"
                                    value={restorePassword}
                                    onChange={(e) => setRestorePassword(e.target.value)}
                                    placeholder="バックアップ作成時のパスワード"
                                />
                                <button
                                    type="button"
                                    className="btn btn-ghost"
                                    disabled={restoreLoading}
                                    onClick={handleBackupRestore}
                                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.75rem', width: '100%', justifyContent: 'center' }}
                                >
                                    <Upload size={18} />
                                    {restoreLoading ? '復元中...' : hasNativeBackup ? 'ファイルを選択して復元' : '復元する'}
                                </button>
                            </div>
                        </div>

                        {backupSummary && (
                            <div style={{ marginTop: '0.75rem', color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>
                                {new Date(backupSummary.created_at).toLocaleString('ja-JP')} /
                                患者{backupSummary.patients_count} /
                                報告書{backupSummary.reports_count} /
                                関係機関{backupSummary.institutions_count} /
                                定型文{backupSummary.templates_count}
                                {'drug_master_count' in backupSummary ? ` / 薬剤マスタ${backupSummary.drug_master_count}` : ''}
                                {backupPath && (
                                    <div style={{ marginTop: '0.35rem', overflowWrap: 'anywhere' }}>
                                        {backupPath}
                                    </div>
                                )}
                            </div>
                        )}

                        {hasNativeBackup && (
                            <div style={{
                                marginTop: '1rem',
                                padding: '1rem',
                                border: '1px solid var(--color-border)',
                                borderRadius: 'var(--radius-md)',
                                backgroundColor: 'var(--color-bg)',
                                display: 'grid',
                                gap: '0.75rem'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                                    <div>
                                        <div style={{ fontWeight: 700 }}>薬局キー</div>
                                        <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem', marginTop: '0.15rem' }}>
                                            自動バックアップ復元用
                                        </div>
                                    </div>
                                    {!appSettings.backup_key && (
                                        <button type="button" className="btn btn-ghost" onClick={handleEnsureBackupKey}>
                                            生成
                                        </button>
                                    )}
                                </div>

                                {appSettings.backup_key && (
                                    <>
                                        <input
                                            className="input"
                                            readOnly
                                            value={showBackupKey ? appSettings.backup_key : maskBackupKey(appSettings.backup_key)}
                                            style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' }}
                                            aria-label="薬局キー"
                                        />
                                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                            <button
                                                type="button"
                                                className="btn btn-ghost"
                                                onClick={() => setShowBackupKey(prev => !prev)}
                                                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                                            >
                                                {showBackupKey ? <EyeOff size={16} /> : <Eye size={16} />}
                                                {showBackupKey ? '隠す' : '表示'}
                                            </button>
                                            <button
                                                type="button"
                                                className="btn btn-ghost"
                                                onClick={handleCopyBackupKey}
                                                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                                            >
                                                <Copy size={16} />
                                                コピー
                                            </button>
                                            <button
                                                type="button"
                                                className="btn btn-ghost"
                                                onClick={handleCopyBackupKeyLedger}
                                                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                                            >
                                                <Database size={16} />
                                                台帳用
                                            </button>
                                            <button
                                                type="button"
                                                className="btn btn-ghost"
                                                disabled={backupKeyLoading}
                                                onClick={handleRotateBackupKey}
                                                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                                            >
                                                <RefreshCw size={16} />
                                                {backupKeyLoading ? '再発行中' : '再発行'}
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                    </div>

                    <div>
                        <h4 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Lock size={18} />
                            DB本体の保護
                        </h4>
                        <div style={{
                            display: 'grid',
                            gap: '0.75rem',
                            padding: '1rem',
                            border: '1px solid var(--color-border)',
                            borderRadius: 'var(--radius-md)',
                            backgroundColor: 'var(--color-bg)'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: '0.75rem', flexWrap: 'wrap' }}>
                                <div>
                                    <div style={{ fontWeight: 700, color: getSecurityStatusColor(securityStatus?.dbProtection.status) }}>
                                        {securityStatus ? getSecurityStatusLabel(securityStatus.dbProtection.status) : hasNativeSecurity ? '未確認' : 'ローカルアプリで確認'}
                                    </div>
                                    <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
                                        {securityStatus?.dbProtection.message || '暗号化バックアップとは別に、稼働中のSQLite DBはWindows端末のBitLockerで保護します。'}
                                    </div>
                                    {securityStatus?.dbProtection.drive && (
                                        <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.82rem', marginTop: '0.25rem' }}>
                                            対象ドライブ: {securityStatus.dbProtection.drive}
                                        </div>
                                    )}
                                </div>
                                <button
                                    type="button"
                                    className="btn btn-ghost"
                                    onClick={handleSecurityRefresh}
                                    disabled={!hasNativeSecurity || securityLoading}
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                                >
                                    <RefreshCw size={16} />
                                    {securityLoading ? '確認中...' : '状態確認'}
                                </button>
                            </div>
                        </div>
                    </div>

                    <div>
                        <h4 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <RefreshCw size={18} />
                            アプリ更新
                        </h4>
                        <div style={{
                            display: 'grid',
                            gap: '0.75rem',
                            padding: '1rem',
                            border: '1px solid var(--color-border)',
                            borderRadius: 'var(--radius-md)',
                            backgroundColor: 'var(--color-bg)'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: '0.75rem', flexWrap: 'wrap' }}>
                                <div>
                                    <div style={{ fontWeight: 700, color: getUpdateStatusColor(updateStatus?.status) }}>
                                        {getUpdateStatusLabel(updateStatus?.status)}
                                    </div>
                                    <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
                                        {updateStatus?.message || (hasNativeUpdates ? '更新状態を確認できます' : 'ローカルアプリで確認')}
                                    </div>
                                    <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.82rem', marginTop: '0.25rem' }}>
                                        現在のバージョン: {updateStatus?.currentVersion || '-'}
                                        {updateStatus?.updateVersion ? ` / 更新版: ${updateStatus.updateVersion}` : ''}
                                    </div>
                                    {updateStatus?.lastCheckedAt && (
                                        <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.82rem', marginTop: '0.25rem' }}>
                                            最終確認: {formatDateTime(updateStatus.lastCheckedAt)}
                                        </div>
                                    )}
                                </div>
                                <button
                                    type="button"
                                    className="btn btn-ghost"
                                    onClick={handleUpdateCheck}
                                    disabled={!hasNativeUpdates || updateChecking}
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                                >
                                    <RefreshCw size={16} />
                                    {updateChecking ? '確認中...' : '更新を確認'}
                                </button>
                            </div>
                        </div>
                    </div>

                    <div>
                        <h4 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Bot size={18} />
                            AIモード
                        </h4>
                        <div style={{
                            display: 'grid',
                            gap: '0.9rem',
                            padding: '1rem',
                            border: '1px solid var(--color-border)',
                            borderRadius: 'var(--radius-md)',
                            backgroundColor: 'var(--color-bg)'
                        }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <input
                                    type="checkbox"
                                    checked={appSettings.ai_mode_enabled}
                                    onChange={(e) => setAppSettings(prev => ({ ...prev, ai_mode_enabled: e.target.checked }))}
                                />
                                AIモードを有効にする
                            </label>

                            <div style={{
                                display: 'grid',
                                gap: '0.75rem',
                                padding: '0.9rem',
                                border: '1px solid var(--color-border)',
                                borderRadius: 'var(--radius-md)',
                                backgroundColor: 'var(--color-surface)'
                            }}>
                                <div>
                                    <div style={{ fontWeight: 700 }}>自動起動</div>
                                    <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem', marginTop: '0.15rem' }}>
                                        ローカルアプリ起動時に、薬局PC内のAIサーバー起動コマンドを実行します。
                                    </div>
                                </div>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: appSettings.ai_mode_enabled ? 'inherit' : 'var(--color-text-secondary)' }}>
                                    <input
                                        type="checkbox"
                                        disabled={!appSettings.ai_mode_enabled}
                                        checked={appSettings.ai_mode_enabled && appSettings.ai_auto_start_enabled}
                                        onChange={(e) => setAppSettings(prev => ({ ...prev, ai_auto_start_enabled: e.target.checked }))}
                                    />
                                    アプリ起動時にローカルAIサーバーも起動する
                                </label>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
                                    <div>
                                        <label className="label" style={{ marginBottom: '0.5rem', display: 'block', fontWeight: 500 }}>
                                            Ollama起動コマンド
                                        </label>
                                        <input
                                            className="input"
                                            value={appSettings.ai_ollama_start_command}
                                            disabled={!appSettings.ai_mode_enabled}
                                            onChange={(e) => setAppSettings(prev => ({ ...prev, ai_ollama_start_command: e.target.value }))}
                                            placeholder="ollama serve"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div style={{
                                display: 'grid',
                                gap: '0.75rem',
                                padding: '0.9rem',
                                border: '1px solid var(--color-border)',
                                borderRadius: 'var(--radius-md)',
                                backgroundColor: 'var(--color-surface)'
                            }}>
                                <div>
                                    <div style={{ fontWeight: 700 }}>接続設定</div>
                                    <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem', marginTop: '0.15rem' }}>
                                        薬局PC内で起動しているOllamaを指定します。
                                    </div>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
                                    <div>
                                        <label className="label" style={{ marginBottom: '0.5rem', display: 'block', fontWeight: 500 }}>
                                            Ollama URL
                                        </label>
                                        <input
                                            className="input"
                                            value={appSettings.ai_ollama_url}
                                            onChange={(e) => setAppSettings(prev => ({ ...prev, ai_ollama_url: e.target.value }))}
                                            placeholder="http://127.0.0.1:11434"
                                        />
                                    </div>
                                    <div>
                                        <label className="label" style={{ marginBottom: '0.5rem', display: 'block', fontWeight: 500 }}>
                                            Ollamaモデル
                                        </label>
                                        <input
                                            className="input"
                                            value={appSettings.ai_ollama_model}
                                            onChange={(e) => setAppSettings(prev => ({ ...prev, ai_ollama_model: e.target.value }))}
                                            placeholder="例: llama3.1:8b"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div style={{
                                display: 'grid',
                                gap: '0.75rem',
                                padding: '0.9rem',
                                border: '1px solid var(--color-border)',
                                borderRadius: 'var(--radius-md)',
                                backgroundColor: 'var(--color-surface)'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                                    <div>
                                        <div style={{ fontWeight: 700 }}>ローカルAI環境</div>
                                        <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem', marginTop: '0.15rem' }}>
                                            Ollama / 空き容量 / 処理時間目安
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        className="btn btn-ghost"
                                        onClick={handleAiEnvironmentRefresh}
                                        disabled={!hasNativeAi || aiEnvironmentLoading}
                                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                                    >
                                        <RefreshCw size={16} />
                                        {aiEnvironmentLoading ? '確認中...' : '状態確認'}
                                    </button>
                                </div>
                                {aiEnvironmentStatus ? (
                                    <div style={{ display: 'grid', gap: '0.5rem' }}>
                                        <AiStatusLine label="Ollama" status={aiEnvironmentStatus.ollama.status} message={aiEnvironmentStatus.ollama.message} />
                                        <AiStatusLine label="空き容量" status={getDiskAiStatus(aiEnvironmentStatus.disk.status)} message={aiEnvironmentStatus.disk.message} />
                                        <AiStatusLine label="PC性能" status="ready" message={`CPU ${aiEnvironmentStatus.performance.cpuCount}コア / ${aiEnvironmentStatus.performance.message}`} />
                                        <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>
                                            {aiEnvironmentStatus.estimate.message}
                                        </div>
                                    </div>
                                ) : (
                                    <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>
                                        {hasNativeAi ? '状態確認を押してください' : 'ローカルアプリで開くと状態確認できます'}
                                    </div>
                                )}
                                <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '0.75rem', display: 'grid', gap: '0.6rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                                        <div style={{ fontWeight: 700 }}>セットアップ手順</div>
                                        <span style={{ color: aiSetupGuide.ready ? '#166534' : '#92400e', fontSize: '0.85rem', fontWeight: 700 }}>
                                            {aiSetupGuide.ready ? '準備完了' : '未完了あり'}
                                        </span>
                                    </div>
                                    <div style={{ display: 'grid', gap: '0.5rem' }}>
                                        {aiSetupGuide.steps.map(step => (
                                            <AiSetupStepRow
                                                key={step.id}
                                                step={step}
                                                onCopyCommand={handleCopySetupCommand}
                                            />
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div>
                        <h4 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Lock size={18} />
                            PINロック
                        </h4>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                            <input
                                type="checkbox"
                                checked={pinForm.enablePin}
                                onChange={(e) => setPinForm(prev => ({ ...prev, enablePin: e.target.checked }))}
                            />
                            ローカルPINロックを有効にする
                        </label>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
                            <div>
                                <label className="label" style={{ marginBottom: '0.5rem', display: 'block', fontWeight: 500 }}>
                                    新しいPIN
                                </label>
                                <input
                                    className="input"
                                    type="password"
                                    inputMode="numeric"
                                    value={pinForm.newPin}
                                    onChange={(e) => setPinForm(prev => ({ ...prev, newPin: e.target.value }))}
                                    placeholder={appSettings.pin_enabled ? '変更時のみ入力' : '4〜8桁'}
                                />
                            </div>
                            <div>
                                <label className="label" style={{ marginBottom: '0.5rem', display: 'block', fontWeight: 500 }}>
                                    PIN確認
                                </label>
                                <input
                                    className="input"
                                    type="password"
                                    inputMode="numeric"
                                    value={pinForm.confirmPin}
                                    onChange={(e) => setPinForm(prev => ({ ...prev, confirmPin: e.target.value }))}
                                    placeholder="再入力"
                                />
                            </div>
                            <div>
                                <label className="label" style={{ marginBottom: '0.5rem', display: 'block', fontWeight: 500 }}>
                                    無操作ロック
                                </label>
                                <input
                                    className="input"
                                    type="number"
                                    min={1}
                                    max={240}
                                    value={appSettings.lock_timeout_minutes}
                                    onChange={(e) => setAppSettings(prev => ({ ...prev, lock_timeout_minutes: Number(e.target.value) }))}
                                />
                            </div>
                        </div>
                    </div>

                    <div>
                        <h4 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Database size={18} />
                            薬剤マスタ
                        </h4>
                        <div style={{
                            display: 'grid',
                            gap: '0.75rem',
                            padding: '1rem',
                            border: '1px solid var(--color-border)',
                            borderRadius: 'var(--radius-md)',
                            backgroundColor: 'var(--color-bg)'
                        }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem', fontSize: '0.9rem' }}>
                                <div>
                                    <div style={{ color: 'var(--color-text-secondary)', marginBottom: '0.2rem' }}>登録件数</div>
                                    <div style={{ fontWeight: 700 }}>{drugMasterStatus ? drugMasterStatus.count.toLocaleString('ja-JP') : '-'}</div>
                                </div>
                                <div>
                                    <div style={{ color: 'var(--color-text-secondary)', marginBottom: '0.2rem' }}>更新日時</div>
                                    <div style={{ fontWeight: 700 }}>
                                        {drugMasterStatus?.updated_at ? new Date(drugMasterStatus.updated_at).toLocaleString('ja-JP') : '-'}
                                    </div>
                                </div>
                            </div>
                            <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', overflowWrap: 'anywhere' }}>
                                {drugMasterStatus?.source || '更新元なし'}
                            </div>
                            <button
                                type="button"
                                className="btn btn-ghost"
                                onClick={handleDrugMasterImport}
                                disabled={!hasNativeDrugMaster || drugMasterLoading}
                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                            >
                                <RefreshCw size={18} />
                                {drugMasterLoading ? '更新中...' : 'CSVを選択して更新'}
                            </button>
                        </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button
                            type="submit"
                            className="btn btn-primary"
                            disabled={settingsLoading}
                            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                        >
                            <Save size={18} />
                            {settingsLoading ? '保存中...' : 'ローカル設定を保存'}
                        </button>
                    </div>
                </form>
            </section>

            <section className="card" style={{ padding: '2rem', marginTop: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                    <div>
                        <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Trash2 size={20} />
                            削除済みデータ
                        </h3>
                        <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>
                            誤って削除した患者と報告書を復元できます
                        </p>
                    </div>
                    <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => refreshDeletedItems(true)}
                        disabled={deletedItemsLoading}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                    >
                        <RefreshCw size={16} />
                        {deletedItemsLoading ? '更新中...' : '更新'}
                    </button>
                </div>

                <DeletedDataList
                    title="患者"
                    emptyText="削除済みの患者はありません"
                    items={deletedPatients.map(patient => ({
                        id: patient.id,
                        primary: patient.name,
                        secondary: [
                            patient.dob ? `生年月日 ${formatPlainDate(patient.dob)}` : '',
                            patient.deleted_at ? `削除 ${formatDateTime(patient.deleted_at)}` : ''
                        ].filter(Boolean).join(' / '),
                        onRestore: () => handleRestorePatient(patient)
                    }))}
                    loading={deletedItemsLoading}
                />

                <DeletedDataList
                    title="報告書"
                    emptyText="削除済みの報告書はありません"
                    items={deletedReports.map(report => ({
                        id: report.id,
                        primary: `${report.patient_name || '患者名未設定'} / ${formatPlainDate(report.visit_date)}`,
                        secondary: [
                            report.prescription_date ? `処方 ${formatPlainDate(report.prescription_date)}` : '',
                            report.deleted_at ? `削除 ${formatDateTime(report.deleted_at)}` : ''
                        ].filter(Boolean).join(' / '),
                        onRestore: () => handleRestoreReport(report)
                    }))}
                    loading={deletedItemsLoading}
                />
            </section>

            <section className="card" style={{ padding: '2rem', marginTop: '1.5rem' }}>
                <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Plus size={20} />
                    定型文
                </h3>

                <form onSubmit={handleTemplateSubmit} style={{ display: 'grid', gap: '1rem', marginBottom: '1.5rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(140px, 0.8fr) minmax(180px, 1.2fr)', gap: '1rem' }}>
                        <div>
                            <label className="label" style={{ marginBottom: '0.5rem', display: 'block', fontWeight: 500 }}>
                                対象欄
                            </label>
                            <select
                                className="input"
                                value={templateForm.target}
                                onChange={(e) => setTemplateForm(prev => ({ ...prev, target: e.target.value as TextTemplateTarget }))}
                            >
                                {TEXT_TEMPLATE_TARGETS.map(target => (
                                    <option key={target.id} value={target.id}>{target.label}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="label" style={{ marginBottom: '0.5rem', display: 'block', fontWeight: 500 }}>
                                定型文名
                            </label>
                            <input
                                type="text"
                                className="input"
                                value={templateForm.title}
                                onChange={(e) => setTemplateForm(prev => ({ ...prev, title: e.target.value }))}
                                placeholder="例: 眠気の訴え"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="label" style={{ marginBottom: '0.5rem', display: 'block', fontWeight: 500 }}>
                            本文
                        </label>
                        <textarea
                            className="input"
                            rows={3}
                            value={templateForm.body}
                            onChange={(e) => setTemplateForm(prev => ({ ...prev, body: e.target.value }))}
                            placeholder="報告書へ挿入する文章"
                        />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                        {templateForm.id && (
                            <button type="button" className="btn btn-ghost" onClick={resetTemplateForm}>
                                キャンセル
                            </button>
                        )}
                        <button type="submit" className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Save size={18} />
                            {templateForm.id ? '更新する' : '登録する'}
                        </button>
                    </div>
                </form>

                <div style={{ display: 'grid', gap: '0.75rem' }}>
                    {templates.length === 0 ? (
                        <div style={{ padding: '1rem', color: 'var(--color-text-secondary)', border: '1px dashed var(--color-border)', borderRadius: 'var(--radius-md)' }}>
                            登録済みの定型文はありません
                        </div>
                    ) : templates.map(template => (
                        <div
                            key={template.id}
                            style={{
                                display: 'grid',
                                gridTemplateColumns: 'minmax(0, 1fr) auto',
                                gap: '1rem',
                                padding: '1rem',
                                border: '1px solid var(--color-border)',
                                borderRadius: 'var(--radius-md)'
                            }}
                        >
                            <div style={{ minWidth: 0 }}>
                                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.35rem', flexWrap: 'wrap' }}>
                                    <span style={{ fontWeight: 700 }}>{template.title}</span>
                                    <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                                        {getTextTemplateTargetLabel(template.target)}
                                    </span>
                                </div>
                                <div style={{ color: 'var(--color-text-secondary)', whiteSpace: 'pre-wrap', fontSize: '0.9rem' }}>
                                    {template.body}
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'start' }}>
                                <button type="button" className="btn btn-ghost" onClick={() => handleTemplateEdit(template)} title="編集">
                                    <Edit2 size={16} />
                                </button>
                                <button type="button" className="btn btn-ghost" onClick={() => handleTemplateDelete(template.id)} title="削除" style={{ color: 'var(--color-danger)' }}>
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </section>
        </div>
    )
}

function DeletedDataList({
    title,
    emptyText,
    items,
    loading
}: {
    title: string
    emptyText: string
    items: Array<{
        id: string
        primary: string
        secondary: string
        onRestore: () => void
    }>
    loading: boolean
}) {
    return (
        <div style={{ display: 'grid', gap: '0.75rem', marginTop: '1.25rem' }}>
            <h4 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>{title}</h4>
            {items.length === 0 ? (
                <div style={{ padding: '1rem', color: 'var(--color-text-secondary)', border: '1px dashed var(--color-border)', borderRadius: 'var(--radius-md)' }}>
                    {emptyText}
                </div>
            ) : items.map(item => (
                <div
                    key={item.id}
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'minmax(0, 1fr) auto',
                        gap: '1rem',
                        padding: '1rem',
                        border: '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-md)'
                    }}
                >
                    <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{item.primary}</div>
                        {item.secondary && (
                            <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem', marginTop: '0.25rem', overflowWrap: 'anywhere' }}>
                                {item.secondary}
                            </div>
                        )}
                    </div>
                    <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={item.onRestore}
                        disabled={loading}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', color: 'var(--color-primary)' }}
                    >
                        <RotateCcw size={16} />
                        復元
                    </button>
                </div>
            ))}
        </div>
    )
}

function AiStatusLine({
    label,
    status,
    message
}: {
    label: string
    status: NativeAiEnvironmentStatus['ollama']['status']
    message: string
}) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600 }}>{label}</span>
            <span style={{ color: getAiStatusColor(status), fontSize: '0.9rem' }}>{message}</span>
        </div>
    )
}

function AiSetupStepRow({
    step,
    onCopyCommand
}: {
    step: AiSetupStep
    onCopyCommand: (command: string) => void
}) {
    return (
        <div style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) auto',
            gap: '0.75rem',
            alignItems: 'start',
            padding: '0.7rem',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--color-bg)'
        }}>
            <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700 }}>{step.title}</span>
                    <span style={{
                        color: getAiSetupStepColor(step.status),
                        fontSize: '0.8rem',
                        fontWeight: 700
                    }}>
                        {getAiSetupStepLabel(step.status)}
                    </span>
                </div>
                <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
                    {step.detail}
                </div>
                {step.command && (
                    <code style={{
                        display: 'block',
                        marginTop: '0.45rem',
                        padding: '0.45rem',
                        borderRadius: 'var(--radius-sm)',
                        backgroundColor: 'var(--color-surface)',
                        fontSize: '0.82rem',
                        overflowWrap: 'anywhere'
                    }}>
                        {step.command}
                    </code>
                )}
            </div>
            {step.command && (
                <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => onCopyCommand(step.command || '')}
                    title="コピー"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.4rem 0.65rem' }}
                >
                    <Copy size={15} />
                    コピー
                </button>
            )}
        </div>
    )
}

const getAiStatusColor = (status: NativeAiEnvironmentStatus['ollama']['status']) => {
    if (status === 'ready') return '#166534'
    if (status === 'not_configured' || status === 'model_missing') return '#92400e'
    return '#991b1b'
}

const getAiSetupStepColor = (status: AiSetupStep['status']) => {
    if (status === 'done') return '#166534'
    if (status === 'todo') return '#92400e'
    return 'var(--color-text-secondary)'
}

const getAiSetupStepLabel = (status: AiSetupStep['status']) => {
    if (status === 'done') return '完了'
    if (status === 'todo') return '対応必要'
    return '確認待ち'
}

const getDiskAiStatus = (status: NativeAiEnvironmentStatus['disk']['status']): NativeAiEnvironmentStatus['ollama']['status'] => {
    if (status === 'ready') return 'ready'
    if (status === 'low_space') return 'error'
    if (status === 'unknown') return 'error'
    return 'not_configured'
}

const getSecurityStatusLabel = (status?: NativeSecurityStatus['dbProtection']['status']) => {
    if (status === 'protected') return '保護されています'
    if (status === 'unprotected') return '有効化が必要です'
    if (status === 'not_windows') return 'Windowsで確認します'
    if (status === 'error') return '確認できません'
    if (status === 'unknown') return '判定できません'
    return '未確認'
}

const getSecurityStatusColor = (status?: NativeSecurityStatus['dbProtection']['status']) => {
    if (status === 'protected') return '#166534'
    if (status === 'unprotected' || status === 'error') return '#991b1b'
    if (status === 'unknown' || status === 'not_windows') return '#92400e'
    return 'var(--color-text-secondary)'
}

const getUpdateStatusLabel = (status?: NativeUpdateStatus['status']) => {
    if (status === 'idle') return '最新状態を確認できます'
    if (status === 'checking') return '確認中'
    if (status === 'downloading') return 'ダウンロード中'
    if (status === 'backup_running') return '更新前バックアップ中'
    if (status === 'downloaded') return '更新準備済み'
    if (status === 'installing') return '更新中'
    if (status === 'error') return '確認できません'
    if (status === 'disabled') return '無効'
    return '未確認'
}

const getUpdateStatusColor = (status?: NativeUpdateStatus['status']) => {
    if (status === 'downloaded' || status === 'idle') return '#166534'
    if (status === 'error') return '#991b1b'
    if (status === 'checking' || status === 'downloading' || status === 'backup_running' || status === 'installing') return '#92400e'
    return 'var(--color-text-secondary)'
}

const downloadBlob = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    link.click()
    URL.revokeObjectURL(url)
}

const maskBackupKey = (backupKey: string) => {
    if (backupKey.length <= 12) return '********'
    return `${backupKey.slice(0, 8)}${'•'.repeat(24)}${backupKey.slice(-6)}`
}

const formatPlainDate = (value?: string) => {
    if (!value) return '-'
    return value.replace(/-/g, '/')
}

const formatDateTime = (value?: string) => {
    if (!value) return '-'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    return date.toLocaleString('ja-JP')
}
