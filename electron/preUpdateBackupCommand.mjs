import {
    ensureBackupKey,
    getAppSettings
} from './localAppSettingsRepository.mjs'
import { initializeLocalDatabase } from './localDatabase.mjs'
import { createPreUpdateEncryptedSqliteBackup } from './localSqliteBackupRepository.mjs'

export const PRE_UPDATE_BACKUP_ARG = '--pre-update-backup'

export function parsePreUpdateBackupCommand(argv = []) {
    if (!argv.includes(PRE_UPDATE_BACKUP_ARG)) return null

    return {
        dbPath: readArgValue(argv, '--db-path'),
        outputDir: readArgValue(argv, '--backup-dir'),
        fromVersion: readArgValue(argv, '--from-version'),
        toVersion: readArgValue(argv, '--to-version'),
        googleDriveFolder: readArgValue(argv, '--google-drive-folder')
    }
}

export async function runPreUpdateBackupCommand({
    dbPath,
    outputDir,
    googleDriveFolder,
    fromVersion = '',
    toVersion = '',
    currentVersion = '',
    kdfIterations
}) {
    if (!dbPath) throw new Error('dbPath is required')
    if (!outputDir) throw new Error('outputDir is required')

    const initialized = await initializeLocalDatabase({ dbPath })
    try {
        const settings = ensureBackupKey(initialized.db)
        const currentSettings = getAppSettings(initialized.db)
        const result = createPreUpdateEncryptedSqliteBackup(initialized.db, {
            dbPath,
            outputDir,
            googleDriveFolder: googleDriveFolder ?? currentSettings.google_drive_folder,
            backupKey: settings.backup_key,
            fromVersion: normalizeVersion(fromVersion || currentVersion || currentSettings.last_app_version),
            toVersion: normalizeVersion(toVersion),
            reason: 'updater_cli',
            kdfIterations
        })

        return {
            ok: true,
            mode: 'pre_update_backup',
            dbPath,
            filePath: result.filePath,
            googleDriveFilePath: result.googleDriveFilePath,
            summary: result.summary
        }
    } finally {
        initialized.db.close()
    }
}

function readArgValue(argv, name) {
    const exactIndex = argv.indexOf(name)
    if (exactIndex >= 0) {
        const nextValue = argv[exactIndex + 1]
        return typeof nextValue === 'string' && !nextValue.startsWith('--') ? nextValue.trim() : ''
    }

    const prefixed = argv.find(arg => arg.startsWith(`${name}=`))
    if (!prefixed) return ''
    return prefixed.slice(name.length + 1).trim()
}

function normalizeVersion(value) {
    return typeof value === 'string' ? value.trim() : ''
}
