import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import electronUpdater from 'electron-updater'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createAutoUpdateService } from './autoUpdateService.mjs'
import { startLocalHealthServer } from '../scripts/local_health_service.js'
import { createAiDraftFromVisitMemo } from './localAiDraftService.mjs'
import { getLocalAiEnvironmentStatus } from './localAiEnvironment.mjs'
import { createLocalAiProcessManager } from './localAiProcessManager.mjs'
import { createStartupSecurityWarning, getLocalSecurityStatus } from './localSecurityStatus.mjs'
import {
    clearLocalPin,
    ensureBackupKey,
    getAppSettings,
    rotateBackupKey,
    saveAppSettings,
    setLocalPin,
    verifyLocalPin
} from './localAppSettingsRepository.mjs'
import { initializeLocalDatabase } from './localDatabase.mjs'
import {
    ensureDrugMasterSeeded,
    getDrugMasterStatus,
    importDrugMasterCsv,
    searchDrugMaster
} from './localDrugMasterRepository.mjs'
import {
    createEncryptedSqliteBackup,
    createPreUpdateEncryptedSqliteBackup,
    ensureDailyEncryptedSqliteBackup,
    restoreEncryptedSqliteBackup
} from './localSqliteBackupRepository.mjs'
import { ensureVersionChangePreUpdateBackup } from './localVersionBackupRepository.mjs'
import {
    deleteInstitution,
    findInstitutionByName,
    getInstitutionById,
    listInstitutions,
    saveInstitution
} from './localInstitutionRepository.mjs'
import {
    createPatient,
    deletePatient,
    getPatientById,
    listDeletedPatients,
    listPatients,
    restorePatient,
    updatePatient
} from './localPatientRepository.mjs'
import {
    deleteReport,
    getLatestReportByPatientId,
    getReportById,
    listDeletedReports,
    listReportsByNextVisitDateRange,
    listReportsByPatientId,
    restoreReport,
    saveReport
} from './localReportRepository.mjs'
import {
    deleteTextTemplate,
    listTextTemplates,
    saveTextTemplate
} from './localTemplateRepository.mjs'
import {
    parsePreUpdateBackupCommand,
    runPreUpdateBackupCommand
} from './preUpdateBackupCommand.mjs'
import { configureWindowsAutoLaunch } from './windowsAutoLaunch.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')
const devUrl = process.env.ELECTRON_START_URL || ''
const localAppUrl = process.env.LOCAL_APP_URL || 'pharmacy-report://open'
const preUpdateBackupCommand = parsePreUpdateBackupCommand(process.argv)
const { autoUpdater } = electronUpdater

let mainWindow = null
let healthServer = null
let localDatabase = null
let localDatabasePath = ''
let autoUpdateService = null
const localAiProcessManager = createLocalAiProcessManager()

const gotSingleInstanceLock = preUpdateBackupCommand ? true : app.requestSingleInstanceLock()
if (!preUpdateBackupCommand && !gotSingleInstanceLock) {
    app.quit()
}

app.setName('在宅報告アプリ')

if (!preUpdateBackupCommand) {
    if (process.defaultApp) {
        app.setAsDefaultProtocolClient('pharmacy-report', process.execPath, [process.argv[1]])
    } else {
        app.setAsDefaultProtocolClient('pharmacy-report')
    }
}

app.on('second-instance', (_event, commandLine) => {
    showMainWindow()
    handleProtocolArgs(commandLine)
})

app.on('open-url', (event) => {
    event.preventDefault()
    showMainWindow()
})

app.whenReady()
    .then(async () => {
        if (preUpdateBackupCommand) {
            await runPreUpdateBackupCli(preUpdateBackupCommand)
            app.exit(0)
            return
        }

        const databaseState = await initializeDatabase()
        configureLoginStartup()
        registerIpcHandlers()
        await startHealthApi(databaseState)
        await createMainWindow()
        void showStartupSecurityWarning()
        configureAutoUpdates()
    })
    .catch(error => {
        console.error('Electron startup failed:', error)
        app.exit(1)
    })

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        void createMainWindow()
    } else {
        showMainWindow()
    }
})

app.on('before-quit', event => {
    if (autoUpdateService?.handleBeforeQuit(event)) return

    localAiProcessManager.stopAll()
    if (healthServer) {
        healthServer.close()
        healthServer = null
    }
    if (localDatabase) {
        localDatabase.close()
        localDatabase = null
    }
})

function configureLoginStartup() {
    try {
        const result = configureWindowsAutoLaunch({ app })
        if (result.configured) {
            console.log('Electron Windows login auto launch enabled')
        } else if (result.reason !== 'not_windows') {
            console.log(`Electron Windows login auto launch skipped: ${result.reason}`)
        }
    } catch (error) {
        console.warn('Electron Windows login auto launch setup failed:', error)
    }
}

async function runPreUpdateBackupCli(command) {
    const result = await runPreUpdateBackupCommand({
        dbPath: command.dbPath || getDefaultDatabasePath(),
        outputDir: command.outputDir || getBackupDirectory(),
        googleDriveFolder: command.googleDriveFolder || undefined,
        fromVersion: command.fromVersion || getAppVersion(),
        toVersion: command.toVersion,
        currentVersion: getAppVersion(),
        kdfIterations: command.kdfIterations
    })
    console.log(JSON.stringify(result))
}

async function initializeDatabase() {
    localDatabasePath = getDefaultDatabasePath()

    try {
        const initialized = await initializeLocalDatabase({ dbPath: localDatabasePath })
        localDatabase = initialized.db
        console.log(`Electron local database ready at ${initialized.dbPath} schema=${initialized.schemaVersion}`)
        await seedDrugMaster(localDatabase)
        runVersionChangePreUpdateBackup(localDatabase)
        runDailyAutoBackup(localDatabase)
        startConfiguredAiServices(localDatabase)
        return {
            dbReady: true
        }
    } catch (error) {
        console.error('Electron local database is not ready:', error)
        return {
            dbReady: false
        }
    }
}

function getDefaultDatabasePath() {
    return process.env.LOCAL_DB_PATH || path.join(app.getPath('userData'), 'data', 'pharmacy-report.sqlite')
}

async function startHealthApi(databaseState) {
    const aiStatus = await getLocalAiStatusForHealth(databaseState.dbReady ? localDatabase : null)
    const status = databaseState.dbReady
        ? process.env.LOCAL_APP_STATUS || (aiStatus.ready ? 'ready' : 'ai_not_setup')
        : 'db_preparing'
    const { server, config } = await startLocalHealthServer({
        appUrl: localAppUrl,
        version: getAppVersion(),
        status,
        dbReady: databaseState.dbReady,
        aiReady: aiStatus.ready
    })
    healthServer = server
    console.log(`Electron local health API listening at http://127.0.0.1:${config.port}/api/local/health`)
}

function registerIpcHandlers() {
    ipcMain.handle('patients:list', () => {
        return listPatients(getReadyDatabase())
    })

    ipcMain.handle('patients:list-deleted', () => {
        return listDeletedPatients(getReadyDatabase())
    })

    ipcMain.handle('patients:get', (_event, patientId) => {
        return getPatientById(getReadyDatabase(), patientId)
    })

    ipcMain.handle('patients:create', (_event, patient) => {
        return createPatient(getReadyDatabase(), patient)
    })

    ipcMain.handle('patients:update', (_event, patientId, update) => {
        return updatePatient(getReadyDatabase(), patientId, update)
    })

    ipcMain.handle('patients:delete', (_event, patientId) => {
        return deletePatient(getReadyDatabase(), patientId)
    })

    ipcMain.handle('patients:restore', (_event, patientId) => {
        return restorePatient(getReadyDatabase(), patientId)
    })

    ipcMain.handle('reports:get', (_event, reportId) => {
        return getReportById(getReadyDatabase(), reportId)
    })

    ipcMain.handle('reports:save', (_event, reportId, report) => {
        return saveReport(getReadyDatabase(), reportId, report)
    })

    ipcMain.handle('reports:get-latest-by-patient', (_event, patientId) => {
        return getLatestReportByPatientId(getReadyDatabase(), patientId)
    })

    ipcMain.handle('reports:list-by-patient', (_event, patientId) => {
        return listReportsByPatientId(getReadyDatabase(), patientId)
    })

    ipcMain.handle('reports:list-by-next-visit-range', (_event, startDate, endDate) => {
        return listReportsByNextVisitDateRange(getReadyDatabase(), startDate, endDate)
    })

    ipcMain.handle('reports:list-deleted', () => {
        return listDeletedReports(getReadyDatabase())
    })

    ipcMain.handle('reports:delete', (_event, reportId) => {
        return deleteReport(getReadyDatabase(), reportId)
    })

    ipcMain.handle('reports:restore', (_event, reportId) => {
        return restoreReport(getReadyDatabase(), reportId)
    })

    ipcMain.handle('institutions:list', () => {
        return listInstitutions(getReadyDatabase())
    })

    ipcMain.handle('institutions:get', (_event, institutionId) => {
        return getInstitutionById(getReadyDatabase(), institutionId)
    })

    ipcMain.handle('institutions:find-by-name', (_event, name, type) => {
        return findInstitutionByName(getReadyDatabase(), name, type)
    })

    ipcMain.handle('institutions:save', (_event, institutionId, institution) => {
        return saveInstitution(getReadyDatabase(), institutionId, institution)
    })

    ipcMain.handle('institutions:delete', (_event, institutionId) => {
        deleteInstitution(getReadyDatabase(), institutionId)
    })

    ipcMain.handle('templates:list', () => {
        return listTextTemplates(getReadyDatabase())
    })

    ipcMain.handle('templates:save', (_event, template) => {
        return saveTextTemplate(getReadyDatabase(), template)
    })

    ipcMain.handle('templates:delete', (_event, templateId) => {
        deleteTextTemplate(getReadyDatabase(), templateId)
    })

    ipcMain.handle('settings:get', () => {
        return getAppSettings(getReadyDatabase())
    })

    ipcMain.handle('settings:save', (_event, settings) => {
        return saveAppSettings(getReadyDatabase(), settings)
    })

    ipcMain.handle('settings:set-pin', (_event, pin) => {
        return setLocalPin(getReadyDatabase(), pin)
    })

    ipcMain.handle('settings:clear-pin', () => {
        return clearLocalPin(getReadyDatabase())
    })

    ipcMain.handle('settings:verify-pin', (_event, pin) => {
        return verifyLocalPin(getReadyDatabase(), pin)
    })

    ipcMain.handle('settings:ensure-backup-key', () => {
        return ensureBackupKey(getReadyDatabase())
    })

    ipcMain.handle('settings:rotate-backup-key', () => {
        return rotateBackupKey(getReadyDatabase())
    })

    ipcMain.handle('drug-master:search', (_event, query, limit) => {
        return searchDrugMaster(getReadyDatabase(), query, limit)
    })

    ipcMain.handle('drug-master:get-status', () => {
        return getDrugMasterStatus(getReadyDatabase())
    })

    ipcMain.handle('drug-master:import-csv', async () => {
        const result = await dialog.showOpenDialog(mainWindow ?? undefined, {
            title: '支払基金医薬品マスターCSVを選択',
            properties: ['openFile'],
            filters: [
                { name: 'CSV', extensions: ['csv'] },
                { name: 'すべてのファイル', extensions: ['*'] }
            ]
        })

        if (result.canceled || result.filePaths.length === 0) {
            return {
                imported: false,
                canceled: true,
                ...getDrugMasterStatus(getReadyDatabase())
            }
        }

        return {
            canceled: false,
            ...importDrugMasterCsv(getReadyDatabase(), result.filePaths[0])
        }
    })

    ipcMain.handle('ai:get-status', () => {
        return getLocalAiEnvironmentStatus(getLocalAiOptionsFromSettings(getReadyDatabase()))
    })

    ipcMain.handle('ai:create-draft-from-visit-memo', (_event, visitMemo) => {
        return createAiDraftFromVisitMemo(visitMemo, getLocalAiOptionsFromSettings(getReadyDatabase()))
    })

    ipcMain.handle('backups:create', (_event, password) => {
        const db = getReadyDatabase()
        const settings = getAppSettings(db)
        return createEncryptedSqliteBackup(db, {
            dbPath: localDatabasePath,
            outputDir: getBackupDirectory(),
            googleDriveFolder: settings.google_drive_folder,
            password
        })
    })

    ipcMain.handle('backups:create-pre-update', (_event, toVersion) => {
        const db = getReadyDatabase()
        const settings = ensureBackupKey(db)
        return createPreUpdateEncryptedSqliteBackup(db, {
            dbPath: localDatabasePath,
            outputDir: getBackupDirectory(),
            googleDriveFolder: settings.google_drive_folder,
            backupKey: settings.backup_key,
            fromVersion: getAppVersion(),
            toVersion: typeof toVersion === 'string' ? toVersion.trim() : '',
            reason: 'manual'
        })
    })

    ipcMain.handle('backups:restore', async (_event, password) => {
        const result = await dialog.showOpenDialog(mainWindow ?? undefined, {
            title: '暗号化バックアップファイルを選択',
            properties: ['openFile'],
            filters: [
                { name: '在宅報告バックアップ', extensions: ['json'] },
                { name: 'すべてのファイル', extensions: ['*'] }
            ]
        })

        if (result.canceled || result.filePaths.length === 0) {
            return {
                restored: false,
                canceled: true
            }
        }

        closeLocalDatabase()

        try {
            const restored = restoreEncryptedSqliteBackup({
                backupFilePath: result.filePaths[0],
                dbPath: localDatabasePath,
                beforeRestoreDir: getBeforeRestoreDirectory(),
                password
            })
            await reopenLocalDatabase()
            return {
                ...restored,
                canceled: false
            }
        } catch (error) {
            await reopenLocalDatabase()
            throw error
        }
    })

    ipcMain.handle('security:get-status', () => {
        return getLocalSecurityStatus()
    })

    ipcMain.handle('updates:get-status', () => {
        return autoUpdateService?.getStatus() || createAutoUpdateUnavailableStatus()
    })

    ipcMain.handle('updates:check-now', () => {
        return autoUpdateService?.checkForUpdates({ manual: true }) || createAutoUpdateUnavailableStatus()
    })
}

function getReadyDatabase() {
    if (!localDatabase) {
        throw new Error('ローカルDBが準備できていません')
    }
    return localDatabase
}

function closeLocalDatabase() {
    if (!localDatabase) return
    try {
        localDatabase.exec('PRAGMA wal_checkpoint(FULL);')
    } catch (error) {
        console.warn('SQLite checkpoint before close failed:', error)
    }
    localDatabase.close()
    localDatabase = null
}

async function reopenLocalDatabase() {
    const initialized = await initializeLocalDatabase({ dbPath: localDatabasePath })
    localDatabase = initialized.db
    await seedDrugMaster(localDatabase)
}

function getBackupDirectory() {
    return process.env.LOCAL_BACKUP_DIR || path.join(app.getPath('userData'), 'backups')
}

function getBeforeRestoreDirectory() {
    return process.env.LOCAL_BEFORE_RESTORE_DIR || path.join(app.getPath('userData'), 'before-restore')
}

function getAppVersion() {
    return process.env.LOCAL_APP_VERSION || (app.isPackaged ? app.getVersion() : '0.1.0-dev')
}

async function getLocalAiStatusForHealth(db) {
    if (process.env.LOCAL_APP_AI_READY) {
        return {
            ready: ['1', 'true', 'yes', 'on'].includes(process.env.LOCAL_APP_AI_READY.toLowerCase())
        }
    }

    try {
        return await getLocalAiEnvironmentStatus(db ? getLocalAiOptionsFromSettings(db) : undefined)
    } catch (error) {
        console.warn('Electron AI status check failed:', error)
        return {
            ready: false
        }
    }
}

function getLocalAiOptionsFromSettings(db) {
    const settings = getAppSettings(db)
    return {
        ollamaUrl: settings.ai_ollama_url,
        ollamaModel: settings.ai_ollama_model
    }
}

function startConfiguredAiServices(db) {
    if (process.env.LOCAL_DISABLE_AI_AUTO_START === '1') {
        console.log('Electron local AI auto start skipped by environment')
        return
    }

    try {
        const settings = getAppSettings(db)
        const status = localAiProcessManager.startFromSettings(settings)
        if (status.enabled) {
            const started = status.processes
                .filter(process => process.status === 'running')
                .map(process => process.label)
            console.log(`Electron local AI auto start: ${started.length ? started.join(', ') : 'no process started'}`)
        }
    } catch (error) {
        console.warn('Electron local AI auto start failed:', error)
    }
}

function configureAutoUpdates() {
    autoUpdateService = createAutoUpdateService({
        app,
        autoUpdater,
        runPreUpdateBackup: runAutoUpdatePreUpdateBackup,
        getCurrentVersion: getAppVersion,
        notifyStatus: emitAutoUpdateStatus
    })
    const status = autoUpdateService.start()
    if (status.enabled) {
        void autoUpdateService.checkForUpdates()
    } else {
        console.log(`Electron auto update disabled: ${status.message}`)
    }
}

async function runAutoUpdatePreUpdateBackup({ toVersion }) {
    const db = getReadyDatabase()
    const settings = ensureBackupKey(db)
    return runPreUpdateBackupCommand({
        dbPath: localDatabasePath,
        outputDir: getBackupDirectory(),
        googleDriveFolder: settings.google_drive_folder,
        fromVersion: getAppVersion(),
        toVersion,
        currentVersion: getAppVersion()
    })
}

function emitAutoUpdateStatus(status) {
    if (!mainWindow) return
    mainWindow.webContents.send('updates:status-changed', status)
}

function createAutoUpdateUnavailableStatus() {
    return {
        enabled: false,
        status: 'disabled',
        currentVersion: getAppVersion(),
        updateVersion: '',
        message: '自動更新はまだ初期化されていません',
        lastCheckedAt: '',
        lastError: '',
        backupCreated: false,
        backupFilePath: ''
    }
}

function runDailyAutoBackup(db) {
    if (process.env.LOCAL_DISABLE_AUTO_BACKUP === '1') return

    try {
        const settings = ensureBackupKey(db)
        const result = ensureDailyEncryptedSqliteBackup(db, {
            dbPath: localDatabasePath,
            outputDir: getBackupDirectory(),
            googleDriveFolder: settings.google_drive_folder,
            backupKey: settings.backup_key
        })
        if (result.created) {
            console.log(`Electron auto backup created at ${result.filePath}`)
        } else {
            console.log(`Electron auto backup skipped: ${result.reason}`)
        }
    } catch (error) {
        console.error('Electron auto backup failed:', error)
    }
}

function runVersionChangePreUpdateBackup(db) {
    if (process.env.LOCAL_DISABLE_VERSION_BACKUP === '1') return

    try {
        const result = ensureVersionChangePreUpdateBackup(db, {
            dbPath: localDatabasePath,
            outputDir: getBackupDirectory(),
            currentVersion: getAppVersion()
        })
        if (result.created) {
            console.log(`Electron version-change backup created at ${result.filePath}`)
        } else {
            console.log(`Electron version-change backup skipped: ${result.reason}`)
        }
    } catch (error) {
        console.error('Electron version-change backup failed:', error)
    }
}

async function createMainWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 900,
        minWidth: 980,
        minHeight: 700,
        title: '在宅報告アプリ',
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false
        }
    })

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        void shell.openExternal(url)
        return { action: 'deny' }
    })

    await loadApp()

    if (
        process.env.ELECTRON_SMOKE_PATIENT === '1'
        || process.env.ELECTRON_SMOKE_REPORT === '1'
        || process.env.ELECTRON_SMOKE_MASTERS === '1'
        || process.env.ELECTRON_SMOKE_DRUG_MASTER === '1'
        || process.env.ELECTRON_SMOKE_BACKUP === '1'
    ) {
        await runConfiguredSmokeTests()
    }
}

async function showStartupSecurityWarning() {
    if (!mainWindow) return

    try {
        const status = await getLocalSecurityStatus()
        const warning = createStartupSecurityWarning(status)
        if (warning) {
            await dialog.showMessageBox(mainWindow, warning)
        }
    } catch (error) {
        console.warn('Electron startup security warning failed:', error)
    }
}

async function loadApp() {
    if (!mainWindow) return

    if (devUrl) {
        await mainWindow.loadURL(devUrl)
        return
    }

    await mainWindow.loadURL(pathToFileURL(path.join(projectRoot, 'dist', 'index.html')).toString())
}

function showMainWindow() {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
}

function handleProtocolArgs(commandLine) {
    const protocolArg = commandLine.find(arg => arg.startsWith('pharmacy-report://'))
    if (protocolArg) {
        console.log(`Protocol open: ${protocolArg}`)
    }
}

async function seedDrugMaster(db) {
    const jsonPath = process.env.DRUG_MASTER_JSON_PATH
        || path.join(projectRoot, 'src', 'data', 'drug-master.generated.json')

    try {
        const result = ensureDrugMasterSeeded(db, {
            jsonPath,
            force: process.env.DRUG_MASTER_FORCE_SEED === '1'
        })
        console.log(`Electron drug master ${result.imported ? 'imported' : 'ready'} count=${result.count}`)
    } catch (error) {
        console.error('Electron drug master seed failed:', error)
    }
}

async function runConfiguredSmokeTests() {
    if (process.env.ELECTRON_SMOKE_PATIENT === '1') {
        await runPatientIpcSmoke()
    }
    if (process.env.ELECTRON_SMOKE_REPORT === '1') {
        await runReportIpcSmoke()
    }
    if (process.env.ELECTRON_SMOKE_MASTERS === '1') {
        await runMastersIpcSmoke()
    }
    if (process.env.ELECTRON_SMOKE_DRUG_MASTER === '1') {
        await runDrugMasterIpcSmoke()
    }
    if (process.env.ELECTRON_SMOKE_BACKUP === '1') {
        await runBackupIpcSmoke()
    }

    if (process.env.ELECTRON_SMOKE_EXIT !== '0') {
        app.quit()
    }
}

async function runPatientIpcSmoke() {
    if (!mainWindow) throw new Error('mainWindow is not ready')

    const result = await mainWindow.webContents.executeJavaScript(`
        (async () => {
            const bridge = window.pharmacyReportNative
            if (!bridge) throw new Error('native bridge missing')

            const created = await bridge.patients.create({
                name: 'Electron 検証',
                kana: 'エレクトロン ケンショウ',
                dob: '1940-01-01',
                gender: 'female',
                medical_institution_name: 'IPC医院',
                primary_doctor: 'IPC医師',
                is_active: true
            })
            const fetched = await bridge.patients.get(created.id)
            const updated = await bridge.patients.update(created.id, {
                care_manager: 'IPCケアマネ',
                is_active: false
            })
            const patients = await bridge.patients.list()

            return {
                storage: bridge.storage,
                createdId: created.id,
                fetchedName: fetched && fetched.name,
                updatedCareManager: updated && updated.care_manager,
                updatedActive: updated && updated.is_active,
                count: patients.length
            }
        })()
    `)

    console.log(`Electron patient IPC smoke: ${JSON.stringify(result)}`)
}

async function runReportIpcSmoke() {
    if (!mainWindow) throw new Error('mainWindow is not ready')

    const result = await mainWindow.webContents.executeJavaScript(`
        (async () => {
            const bridge = window.pharmacyReportNative
            if (!bridge) throw new Error('native bridge missing')
            if (!bridge.reports) throw new Error('report bridge missing')

            const patient = await bridge.patients.create({
                name: '報告書 検証',
                kana: 'ホウコクショ ケンショウ',
                dob: '1938-04-05',
                gender: 'male',
                medical_institution_name: '報告医院',
                primary_doctor: '報告医師',
                is_active: true
            })

            const saved = await bridge.reports.save(undefined, {
                patient_id: patient.id,
                patient_name: patient.name,
                patient_dob: patient.dob,
                patient_gender: patient.gender,
                doctor_name: '報告医師',
                medical_institution_name: '報告医院',
                pharmacist_name: '検証薬剤師',
                prescription_date: '2026-06-10',
                dispensing_date: '2026-06-10',
                visit_date: '2026-06-10',
                default_prescription_days: '28',
                regular_medication_supply_until: '2026-07-07',
                medications_check_list: [{
                    id: 'smoke-regular-1',
                    name: '定期薬A',
                    current_amount: '',
                    next_required_amount: '',
                    unit: '日',
                    notes: '',
                    checked: true,
                    calculated_total_days: '28',
                    calculated_supply_until: '2026-07-07'
                }],
                medications_check_list_prn: [{
                    id: 'smoke-other-1',
                    name: '保管薬B',
                    current_amount: '5',
                    next_required_amount: '',
                    unit: '錠',
                    notes: '期限確認',
                    checked: true
                }],
                chief_complaint: '眠気の訴えあり',
                medication_instruction: '朝薬服用後の眠気について主治医へ共有予定。',
                side_effects: '',
                next_visit_date: '2026-06-24'
            })

            const fetched = await bridge.reports.get(saved.id)
            const latest = await bridge.reports.getLatestByPatient(patient.id)
            const patientReports = await bridge.reports.listByPatient(patient.id)
            const scheduled = await bridge.reports.listByNextVisitDateRange('2026-06-01', '2026-06-30')

            return {
                savedId: saved.id,
                fetchedPatientName: fetched && fetched.patient_name,
                latestId: latest && latest.id,
                patientReportCount: patientReports.length,
                scheduledCount: scheduled.length,
                regularMedicationCount: (fetched && fetched.medications_check_list || []).length,
                otherMedicationCount: (fetched && fetched.medications_check_list_prn || []).length
            }
        })()
    `)

    console.log(`Electron report IPC smoke: ${JSON.stringify(result)}`)
}

async function runMastersIpcSmoke() {
    if (!mainWindow) throw new Error('mainWindow is not ready')

    const result = await mainWindow.webContents.executeJavaScript(`
        (async () => {
            const bridge = window.pharmacyReportNative
            if (!bridge) throw new Error('native bridge missing')
            if (!bridge.institutions) throw new Error('institution bridge missing')
            if (!bridge.templates) throw new Error('template bridge missing')
            if (!bridge.settings) throw new Error('settings bridge missing')

            const institution = await bridge.institutions.save(undefined, {
                type: 'hospital',
                name: 'IPC検証医院',
                tel: '03-0000-0000',
                fax: '03-0000-0001',
                doctor_name: 'IPC医師'
            })
            const updatedInstitution = await bridge.institutions.save(institution.id, {
                type: 'hospital',
                name: 'IPC検証医院',
                tel: '03-0000-0002',
                fax: '03-0000-0001',
                doctor_name: 'IPC医師'
            })
            const foundInstitution = await bridge.institutions.findByName('IPC検証医院', 'hospital')

            const template = await bridge.templates.save({
                target: 'chief_complaint',
                title: '眠気',
                body: '朝薬服用後の眠気の訴えあり。'
            })
            const templatesBeforeDelete = await bridge.templates.list()
            await bridge.templates.delete(template.id)
            const templatesAfterDelete = await bridge.templates.list()

            const savedSettings = await bridge.settings.save({
                pharmacy_name: 'IPC検証薬局',
                pharmacy_fax: '03-1111-2222',
                google_drive_folder: '/tmp/ipc-drive',
                lock_timeout_minutes: 20
            })
            const pinSettings = await bridge.settings.setPin('1234')
            const pinOk = await bridge.settings.verifyPin('1234')
            const pinNg = await bridge.settings.verifyPin('9999')
            const clearedSettings = await bridge.settings.clearPin()

            await bridge.institutions.delete(institution.id)
            const institutionsAfterDelete = await bridge.institutions.list()

            return {
                institutionId: institution.id,
                updatedTel: updatedInstitution && updatedInstitution.tel,
                foundInstitutionName: foundInstitution && foundInstitution.name,
                templatesBeforeDelete: templatesBeforeDelete.length,
                templatesAfterDelete: templatesAfterDelete.length,
                pharmacyName: savedSettings.pharmacy_name,
                lockTimeout: savedSettings.lock_timeout_minutes,
                pinEnabled: pinSettings.pin_enabled,
                pinOk,
                pinNg,
                pinCleared: !clearedSettings.pin_enabled,
                institutionsAfterDelete: institutionsAfterDelete.length
            }
        })()
    `)

    console.log(`Electron masters IPC smoke: ${JSON.stringify(result)}`)
}

async function runDrugMasterIpcSmoke() {
    if (!mainWindow) throw new Error('mainWindow is not ready')

    const result = await mainWindow.webContents.executeJavaScript(`
        (async () => {
            const bridge = window.pharmacyReportNative
            if (!bridge) throw new Error('native bridge missing')
            if (!bridge.drugMaster) throw new Error('drug master bridge missing')

            const status = await bridge.drugMaster.getStatus()
            const nameResults = await bridge.drugMaster.search('アムロジピン', 5)
            const kanaResults = await bridge.drugMaster.search('ﾛｷｿ', 5)

            return {
                count: status.count,
                source: status.source,
                nameCount: nameResults.length,
                firstName: nameResults[0] && nameResults[0].name,
                firstUnit: nameResults[0] && nameResults[0].unit,
                kanaCount: kanaResults.length,
                kanaFirstName: kanaResults[0] && kanaResults[0].name
            }
        })()
    `)

    console.log(`Electron drug master IPC smoke: ${JSON.stringify(result)}`)
}

async function runBackupIpcSmoke() {
    if (!mainWindow) throw new Error('mainWindow is not ready')

    const result = await mainWindow.webContents.executeJavaScript(`
        (async () => {
            const bridge = window.pharmacyReportNative
            if (!bridge) throw new Error('native bridge missing')
            if (!bridge.backups) throw new Error('backup bridge missing')

            const patient = await bridge.patients.create({
                name: 'バックアップ 検証',
                dob: '1940-01-01',
                gender: 'female',
                is_active: true
            })
            await bridge.settings.save({
                ai_ollama_url: ' http://127.0.0.1:11435/ '
            })
            const settings = await bridge.settings.ensureBackupKey()
            const aiStatus = await bridge.ai.getStatus()
            const aiDraft = await bridge.ai.createDraftFromVisitMemo('主訴等: 眠気の訴えあり。\\n服薬指導内容: 主治医へ相談するよう説明。')
            const backup = await bridge.backups.create('backup-pass-123')
            const preUpdateBackup = await bridge.backups.createPreUpdate('0.2.0-smoke')
            const rotatedSettings = await bridge.settings.rotateBackupKey()

            return {
                patientId: patient.id,
                hasBackupKey: Boolean(settings.backup_key),
                backupKeyRotated: Boolean(rotatedSettings.backup_key && rotatedSettings.backup_key !== settings.backup_key),
                aiOllamaUrl: aiStatus.ollama.url,
                aiReady: Boolean(aiStatus.ready),
                aiDraftChiefComplaint: aiDraft.chief_complaint,
                filePath: backup.filePath,
                patientsCount: backup.summary.patients_count,
                reportsCount: backup.summary.reports_count,
                preUpdateFilePath: preUpdateBackup.filePath,
                hasGoogleCopy: Boolean(backup.googleDriveFilePath)
            }
        })()
    `)

    console.log(`Electron backup IPC smoke: ${JSON.stringify(result)}`)
}
