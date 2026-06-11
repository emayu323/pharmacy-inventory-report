import {
    ensureBackupKey,
    getAppSettings,
    saveAppSettings
} from './localAppSettingsRepository.mjs'
import { createPreUpdateEncryptedSqliteBackup } from './localSqliteBackupRepository.mjs'

export function ensureVersionChangePreUpdateBackup(db, {
    dbPath,
    outputDir,
    googleDriveFolder,
    currentVersion,
    kdfIterations
}) {
    const normalizedCurrentVersion = normalizeVersion(currentVersion)
    if (!normalizedCurrentVersion) {
        throw new Error('currentVersion is required')
    }

    const settings = getAppSettings(db)
    const previousVersion = normalizeVersion(settings.last_app_version)
    if (!previousVersion) {
        saveAppSettings(db, { last_app_version: normalizedCurrentVersion })
        return {
            created: false,
            reason: 'first_start',
            currentVersion: normalizedCurrentVersion
        }
    }

    if (previousVersion === normalizedCurrentVersion) {
        return {
            created: false,
            reason: 'same_version',
            previousVersion,
            currentVersion: normalizedCurrentVersion
        }
    }

    const keyedSettings = ensureBackupKey(db)
    const result = createPreUpdateEncryptedSqliteBackup(db, {
        dbPath,
        outputDir,
        googleDriveFolder: googleDriveFolder ?? keyedSettings.google_drive_folder,
        backupKey: keyedSettings.backup_key,
        fromVersion: previousVersion,
        toVersion: normalizedCurrentVersion,
        reason: 'version_change_startup',
        kdfIterations
    })
    saveAppSettings(db, { last_app_version: normalizedCurrentVersion })

    return {
        ...result,
        created: true,
        previousVersion,
        currentVersion: normalizedCurrentVersion
    }
}

function normalizeVersion(value) {
    return typeof value === 'string' ? value.trim() : ''
}
