export function createAutoUpdateService({
    app,
    autoUpdater,
    env = process.env,
    runPreUpdateBackup,
    getCurrentVersion,
    logger = console,
    notifyStatus = () => {}
}) {
    const state = {
        enabled: false,
        status: 'disabled',
        message: '',
        currentVersion: normalizeVersion(getCurrentVersion?.() || app?.getVersion?.()),
        updateVersion: '',
        checking: false,
        downloaded: false,
        backupCreated: false,
        installing: false,
        lastCheckedAt: '',
        lastError: '',
        backupFilePath: ''
    }
    const enablement = getAutoUpdateEnablement({ app, env })
    state.enabled = enablement.enabled
    state.status = enablement.enabled ? 'idle' : 'disabled'
    state.message = enablement.message

    function start() {
        if (!state.enabled) {
            emit()
            return getStatus()
        }

        autoUpdater.autoDownload = true
        autoUpdater.autoInstallOnAppQuit = false
        autoUpdater.on?.('checking-for-update', () => {
            state.status = 'checking'
            state.checking = true
            state.message = '更新を確認しています'
            emit()
        })
        autoUpdater.on?.('update-available', info => {
            state.status = 'downloading'
            state.updateVersion = normalizeVersion(info?.version)
            state.message = '新しいバージョンをダウンロードしています'
            emit()
        })
        autoUpdater.on?.('update-not-available', () => {
            state.status = 'idle'
            state.checking = false
            state.downloaded = false
            state.message = '最新バージョンです'
            emit()
        })
        autoUpdater.on?.('download-progress', progress => {
            state.status = 'downloading'
            state.message = createDownloadMessage(progress)
            emit()
        })
        autoUpdater.on?.('update-downloaded', info => {
            void prepareDownloadedUpdate(info)
        })
        autoUpdater.on?.('error', error => {
            state.status = 'error'
            state.checking = false
            state.lastError = getErrorMessage(error)
            state.message = '更新確認でエラーが発生しました'
            logger.warn?.('Electron auto update failed:', error)
            emit()
        })

        emit()
        return getStatus()
    }

    async function checkForUpdates({ manual = false } = {}) {
        if (!state.enabled) {
            state.message = enablement.message
            emit()
            return getStatus()
        }
        if (state.checking) return getStatus()

        state.checking = true
        state.status = 'checking'
        state.lastCheckedAt = new Date().toISOString()
        state.message = manual ? '更新を確認しています' : '起動時に更新を確認しています'
        emit()

        try {
            await autoUpdater.checkForUpdates()
        } catch (error) {
            state.status = 'error'
            state.lastError = getErrorMessage(error)
            state.message = '更新確認でエラーが発生しました'
            logger.warn?.('Electron auto update check failed:', error)
            emit()
        } finally {
            state.checking = false
        }
        return getStatus()
    }

    async function prepareDownloadedUpdate(info = {}) {
        if (!state.enabled) return getStatus()

        state.checking = false
        state.downloaded = true
        state.backupCreated = false
        state.updateVersion = normalizeVersion(info.version || state.updateVersion)
        state.status = 'backup_running'
        state.message = '更新前バックアップを作成しています'
        emit()

        const backup = await createPreUpdateBackup()
        if (!backup.ok) {
            state.status = 'error'
            state.downloaded = false
            state.backupCreated = false
            state.lastError = backup.message
            state.message = '更新前バックアップに失敗したため、自動更新を見送りました'
            emit()
            return getStatus()
        }

        state.status = 'downloaded'
        state.backupCreated = true
        state.backupFilePath = backup.filePath
        state.message = '新しいバージョンを準備しました。アプリ終了時に更新されます'
        emit()
        return getStatus()
    }

    function handleBeforeQuit(event) {
        if (!state.enabled || !state.downloaded || state.installing) return false

        event?.preventDefault?.()
        void installDownloadedUpdate()
        return true
    }

    async function installDownloadedUpdate() {
        if (state.installing) return getStatus()

        if (!state.backupCreated) {
            const backup = await createPreUpdateBackup()
            if (!backup.ok) {
                state.status = 'error'
                state.downloaded = false
                state.lastError = backup.message
                state.message = '更新前バックアップに失敗したため、今回は通常終了します'
                emit()
                app?.quit?.()
                return getStatus()
            }
        }

        state.installing = true
        state.status = 'installing'
        state.message = '更新をインストールしています'
        emit()
        autoUpdater.quitAndInstall(true, false)
        return getStatus()
    }

    async function createPreUpdateBackup() {
        try {
            const result = await runPreUpdateBackup({
                fromVersion: state.currentVersion,
                toVersion: state.updateVersion
            })
            return {
                ok: true,
                filePath: result?.filePath || ''
            }
        } catch (error) {
            logger.error?.('Electron auto update pre-update backup failed:', error)
            return {
                ok: false,
                message: getErrorMessage(error)
            }
        }
    }

    function getStatus() {
        return {
            enabled: state.enabled,
            status: state.status,
            currentVersion: state.currentVersion,
            updateVersion: state.updateVersion,
            message: state.message,
            lastCheckedAt: state.lastCheckedAt,
            lastError: state.lastError,
            backupCreated: state.backupCreated,
            backupFilePath: state.backupFilePath
        }
    }

    function emit() {
        notifyStatus(getStatus())
    }

    return {
        start,
        checkForUpdates,
        prepareDownloadedUpdate,
        handleBeforeQuit,
        installDownloadedUpdate,
        getStatus
    }
}

export function getAutoUpdateEnablement({ app, env = process.env }) {
    if (!isTruthy(env.LOCAL_AUTO_UPDATE_ENABLED)) {
        return {
            enabled: false,
            message: '自動更新はコード署名取得まで無効です'
        }
    }
    if (!isTruthy(env.LOCAL_CODE_SIGNING_ENABLED)) {
        return {
            enabled: false,
            message: 'コード署名が有効になるまで自動更新は本番有効化しません'
        }
    }
    if (!app?.isPackaged) {
        return {
            enabled: false,
            message: '自動更新はパッケージ版でのみ有効です'
        }
    }
    return {
        enabled: true,
        message: '自動更新を確認できます'
    }
}

function createDownloadMessage(progress) {
    const percent = Number.isFinite(progress?.percent) ? Math.round(progress.percent) : null
    return percent === null
        ? '新しいバージョンをダウンロードしています'
        : `新しいバージョンをダウンロードしています (${percent}%)`
}

function isTruthy(value) {
    return ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase())
}

function normalizeVersion(value) {
    return typeof value === 'string' ? value.trim() : ''
}

function getErrorMessage(error) {
    return error instanceof Error ? error.message : String(error || 'unknown error')
}
