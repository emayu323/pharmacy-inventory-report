import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const APP_ID = 'pharmacy-report'
const BACKUP_KIND = 'encrypted-sqlite-backup'
const BACKUP_VERSION = 1
const DEFAULT_KDF_ITERATIONS = 210000
const MIN_BACKUP_PASSWORD_LENGTH = 8
const REQUIRED_TABLES = [
    'patients',
    'institutions',
    'reports',
    'report_medications',
    'templates',
    'app_settings',
    'drug_master',
    'backups',
    'schema_migrations'
]

export function createEncryptedSqliteBackup(db, {
    dbPath,
    outputDir,
    googleDriveFolder = '',
    password,
    kdfIterations = DEFAULT_KDF_ITERATIONS,
    status = 'created',
    autoBackupDate,
    metadata = {}
}) {
    validateBackupPassword(password)
    if (!db) throw new Error('ローカルDBが準備できていません')
    if (!dbPath) throw new Error('dbPath is required')
    if (!outputDir) throw new Error('outputDir is required')

    const createdAt = new Date().toISOString()
    const safeTimestamp = createdAt.replace(/[:.]/g, '-')
    const fileName = `pharmacy-report-sqlite-backup-${safeTimestamp}.json`
    const filePath = path.join(outputDir, fileName)
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pharmacy-report-backup-'))
    const tempDbPath = path.join(tempDir, 'snapshot.sqlite')

    try {
        fs.mkdirSync(outputDir, { recursive: true })
        db.exec('PRAGMA wal_checkpoint(FULL);')
        db.exec(`VACUUM INTO ${quoteSqlString(tempDbPath)};`)

        const dbBytes = fs.readFileSync(tempDbPath)
        const sha256 = createSha256(dbBytes)
        const summary = createBackupSummary(db, createdAt)
        const encryptedFile = encryptBackupFile({
            createdAt,
            dbBytes,
            sha256,
            summary,
            password,
            kdfIterations
        })

        fs.writeFileSync(filePath, JSON.stringify(encryptedFile, null, 2))

        const googleDriveFilePath = copyBackupToGoogleDrive(filePath, googleDriveFolder)
        recordBackup(db, {
            createdAt,
            filePath,
            googleDriveFilePath,
            summary,
            sha256,
            bytes: dbBytes.byteLength,
            status,
            autoBackupDate,
            metadata
        })

        return {
            fileName,
            filePath,
            googleDriveFilePath,
            created_at: createdAt,
            summary
        }
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true })
    }
}

export function createPreUpdateEncryptedSqliteBackup(db, {
    dbPath,
    outputDir,
    googleDriveFolder = '',
    backupKey,
    fromVersion = '',
    toVersion = '',
    reason = 'app_update',
    kdfIterations = DEFAULT_KDF_ITERATIONS
}) {
    validateBackupPassword(backupKey)
    return createEncryptedSqliteBackup(db, {
        dbPath,
        outputDir,
        googleDriveFolder,
        password: backupKey,
        kdfIterations,
        status: 'pre_update_created',
        metadata: {
            pre_update_backup: compactObject({
                from_version: fromVersion,
                to_version: toVersion,
                reason
            })
        }
    })
}

export function ensureDailyEncryptedSqliteBackup(db, {
    dbPath,
    outputDir,
    googleDriveFolder = '',
    backupKey,
    today = getTodayDate(),
    kdfIterations = DEFAULT_KDF_ITERATIONS
}) {
    validateBackupPassword(backupKey)
    if (hasAutoBackupForDate(db, today)) {
        return {
            created: false,
            reason: 'already_created',
            date: today
        }
    }

    const result = createEncryptedSqliteBackup(db, {
        dbPath,
        outputDir,
        googleDriveFolder,
        password: backupKey,
        kdfIterations,
        status: 'auto_created',
        autoBackupDate: today
    })

    return {
        ...result,
        created: true,
        date: today
    }
}

export function restoreEncryptedSqliteBackup({
    backupFilePath,
    dbPath,
    beforeRestoreDir,
    password
}) {
    validateBackupPassword(password)
    if (!backupFilePath) throw new Error('backupFilePath is required')
    if (!dbPath) throw new Error('dbPath is required')
    if (!beforeRestoreDir) throw new Error('beforeRestoreDir is required')

    const parsed = parseEncryptedBackupFile(fs.readFileSync(backupFilePath, 'utf8'))
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pharmacy-report-restore-'))
    const restoredTempDbPath = path.join(tempDir, 'restore.sqlite')

    try {
        const dbBytes = decryptBackupFile(parsed, password)
        const actualSha256 = createSha256(dbBytes)
        if (actualSha256 !== parsed.database.sha256) {
            throw new Error('バックアップファイルの検証に失敗しました')
        }

        fs.writeFileSync(restoredTempDbPath, dbBytes)
        validateRestoredDatabase(restoredTempDbPath)

        fs.mkdirSync(path.dirname(dbPath), { recursive: true })
        fs.mkdirSync(beforeRestoreDir, { recursive: true })
        const rollbackPath = createRollbackCopy(dbPath, beforeRestoreDir)

        removeSqliteCompanionFiles(dbPath)
        fs.copyFileSync(restoredTempDbPath, dbPath)

        return {
            restored: true,
            backupFilePath,
            rollbackPath,
            summary: parsed.summary
        }
    } catch (error) {
        if (error instanceof Error && error.message.includes('バックアップ')) {
            throw error
        }
        throw new Error('バックアップファイルを復元できません。ファイルまたはパスワードを確認してください')
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true })
    }
}

function createBackupSummary(db, createdAt) {
    return {
        created_at: createdAt,
        schema_version: getPragmaNumber(db, 'user_version'),
        patients_count: countRows(db, 'patients', 'deleted_at IS NULL'),
        reports_count: countRows(db, 'reports', 'deleted_at IS NULL'),
        institutions_count: countRows(db, 'institutions', 'deleted_at IS NULL'),
        templates_count: countRows(db, 'templates', 'deleted_at IS NULL'),
        drug_master_count: countRows(db, 'drug_master')
    }
}

function encryptBackupFile({ createdAt, dbBytes, sha256, summary, password, kdfIterations }) {
    const salt = crypto.randomBytes(16)
    const iv = crypto.randomBytes(12)
    const key = deriveBackupKey(password, salt, kdfIterations)
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
    const encrypted = Buffer.concat([cipher.update(dbBytes), cipher.final()])
    const tag = cipher.getAuthTag()

    return {
        app: APP_ID,
        kind: BACKUP_KIND,
        version: BACKUP_VERSION,
        created_at: createdAt,
        encryption: {
            algorithm: 'AES-256-GCM',
            kdf: 'PBKDF2-SHA-256',
            iterations: kdfIterations,
            salt: salt.toString('base64'),
            iv: iv.toString('base64'),
            tag: tag.toString('base64')
        },
        database: {
            file_name: 'pharmacy-report.sqlite',
            bytes: dbBytes.byteLength,
            sha256
        },
        summary,
        data: encrypted.toString('base64')
    }
}

function decryptBackupFile(file, password) {
    try {
        const salt = Buffer.from(file.encryption.salt, 'base64')
        const iv = Buffer.from(file.encryption.iv, 'base64')
        const tag = Buffer.from(file.encryption.tag, 'base64')
        const encrypted = Buffer.from(file.data, 'base64')
        const key = deriveBackupKey(password, salt, file.encryption.iterations)
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
        decipher.setAuthTag(tag)
        return Buffer.concat([decipher.update(encrypted), decipher.final()])
    } catch {
        throw new Error('バックアップファイルを復元できません。ファイルまたはパスワードを確認してください')
    }
}

function parseEncryptedBackupFile(raw) {
    try {
        const parsed = JSON.parse(raw)
        if (
            parsed?.app !== APP_ID
            || parsed?.kind !== BACKUP_KIND
            || parsed?.version !== BACKUP_VERSION
            || parsed?.encryption?.algorithm !== 'AES-256-GCM'
            || parsed?.encryption?.kdf !== 'PBKDF2-SHA-256'
            || typeof parsed?.encryption?.iterations !== 'number'
            || typeof parsed?.encryption?.salt !== 'string'
            || typeof parsed?.encryption?.iv !== 'string'
            || typeof parsed?.encryption?.tag !== 'string'
            || typeof parsed?.database?.sha256 !== 'string'
            || typeof parsed?.database?.bytes !== 'number'
            || typeof parsed?.data !== 'string'
            || !parsed?.summary
        ) {
            throw new Error('Invalid backup file')
        }
        return parsed
    } catch {
        throw new Error('バックアップファイルの形式が正しくありません')
    }
}

function validateRestoredDatabase(dbPath) {
    const { DatabaseSync } = process.getBuiltinModule('node:sqlite')
    const db = new DatabaseSync(dbPath)

    try {
        const integrity = db.prepare('PRAGMA integrity_check').get()
        if (integrity?.integrity_check !== 'ok') {
            throw new Error('SQLite integrity_check failed')
        }

        const tables = new Set(db.prepare(`
            SELECT name
            FROM sqlite_master
            WHERE type = 'table'
        `).all().map(row => row.name))

        const missing = REQUIRED_TABLES.filter(table => !tables.has(table))
        if (missing.length > 0) {
            throw new Error(`Missing tables: ${missing.join(', ')}`)
        }
    } finally {
        db.close()
    }
}

function createRollbackCopy(dbPath, beforeRestoreDir) {
    const safeTimestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const rollbackPath = path.join(beforeRestoreDir, `before-restore-${safeTimestamp}.sqlite`)

    if (fs.existsSync(dbPath)) {
        fs.copyFileSync(dbPath, rollbackPath)
        copySqliteCompanionFiles(dbPath, rollbackPath)
    }

    return rollbackPath
}

function copyBackupToGoogleDrive(filePath, googleDriveFolder) {
    const folder = typeof googleDriveFolder === 'string' ? googleDriveFolder.trim() : ''
    if (!folder) return undefined

    fs.mkdirSync(folder, { recursive: true })
    const targetPath = path.join(folder, path.basename(filePath))
    fs.copyFileSync(filePath, targetPath)
    return targetPath
}

function hasAutoBackupForDate(db, date) {
    const rows = db.prepare(`
        SELECT metadata_json
        FROM backups
        WHERE status = ?
        ORDER BY created_at DESC
    `).all('auto_created')

    return rows.some(row => {
        try {
            const metadata = JSON.parse(row.metadata_json)
            return metadata?.auto_backup?.date === date
        } catch {
            return false
        }
    })
}

function recordBackup(db, { createdAt, filePath, googleDriveFilePath, summary, sha256, bytes, status, autoBackupDate, metadata }) {
    db.prepare(`
        INSERT INTO backups (id, created_at, path, status, metadata_json)
        VALUES (?, ?, ?, ?, ?)
    `).run(
        createBackupId(),
        createdAt,
        filePath,
        status,
        JSON.stringify({
            kind: BACKUP_KIND,
            google_drive_path: googleDriveFilePath,
            sha256,
            bytes,
            summary,
            ...(autoBackupDate ? { auto_backup: { date: autoBackupDate } } : {}),
            ...metadata
        })
    )
}

function compactObject(object) {
    return Object.fromEntries(
        Object.entries(object).filter(([, value]) => value !== undefined && value !== null && value !== '')
    )
}

function copySqliteCompanionFiles(sourceDbPath, rollbackPath) {
    for (const suffix of ['-wal', '-shm']) {
        const source = `${sourceDbPath}${suffix}`
        if (fs.existsSync(source)) {
            fs.copyFileSync(source, `${rollbackPath}${suffix}`)
        }
    }
}

function removeSqliteCompanionFiles(dbPath) {
    for (const suffix of ['', '-wal', '-shm']) {
        fs.rmSync(`${dbPath}${suffix}`, { force: true })
    }
}

function countRows(db, table, whereClause = '') {
    const sql = `SELECT COUNT(*) AS count FROM ${table}${whereClause ? ` WHERE ${whereClause}` : ''}`
    const row = db.prepare(sql).get()
    return Number(row?.count ?? 0)
}

function getPragmaNumber(db, name) {
    const row = db.prepare(`PRAGMA ${name}`).get()
    return Number(row?.[name] ?? 0)
}

function deriveBackupKey(password, salt, iterations) {
    return crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256')
}

function createSha256(buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex')
}

function validateBackupPassword(password) {
    if (typeof password !== 'string' || password.length < MIN_BACKUP_PASSWORD_LENGTH) {
        throw new Error(`バックアップパスワードは${MIN_BACKUP_PASSWORD_LENGTH}文字以上で入力してください`)
    }
}

function quoteSqlString(value) {
    return `'${String(value).replace(/'/g, "''")}'`
}

function createBackupId() {
    return `backup-${crypto.randomUUID()}`
}

function getTodayDate() {
    return new Date().toISOString().slice(0, 10)
}
