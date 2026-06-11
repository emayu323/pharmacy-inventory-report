import { createHash, randomBytes } from 'node:crypto'

const APP_SETTINGS_KEY = 'app-settings'
const DEFAULT_LOCK_TIMEOUT_MINUTES = 15
const DEFAULT_OLLAMA_URL = 'http://127.0.0.1:11434'
const DEFAULT_OLLAMA_START_COMMAND = 'ollama serve'

export const DEFAULT_APP_SETTINGS = {
    pharmacy_name: '',
    pharmacy_address: '',
    pharmacy_tel: '',
    pharmacy_fax: '',
    google_drive_folder: '',
    backup_key: undefined,
    last_app_version: '',
    ai_mode_enabled: false,
    ai_ollama_url: DEFAULT_OLLAMA_URL,
    ai_ollama_model: '',
    ai_auto_start_enabled: false,
    ai_ollama_start_command: DEFAULT_OLLAMA_START_COMMAND,
    pin_enabled: false,
    lock_timeout_minutes: DEFAULT_LOCK_TIMEOUT_MINUTES
}

export function getAppSettings(db) {
    const row = db.prepare(`
        SELECT value_json
        FROM app_settings
        WHERE key = ?
    `).get(APP_SETTINGS_KEY)

    if (!row?.value_json) return DEFAULT_APP_SETTINGS
    return normalizeSettings(parseSettings(row.value_json))
}

export function saveAppSettings(db, input) {
    const current = getAppSettings(db)
    const next = normalizeSettings({
        ...current,
        ...input,
        lock_timeout_minutes: normalizeLockTimeout(input?.lock_timeout_minutes ?? current.lock_timeout_minutes)
    })
    writeAppSettings(db, next)
    return next
}

export function setLocalPin(db, pin) {
    validatePin(pin)
    const current = getAppSettings(db)
    const salt = createSalt()
    const next = normalizeSettings({
        ...current,
        pin_enabled: true,
        pin_hash: hashPin(pin, salt),
        pin_salt: salt
    })
    writeAppSettings(db, next)
    return next
}

export function clearLocalPin(db) {
    const current = getAppSettings(db)
    const next = normalizeSettings({
        ...current,
        pin_enabled: false,
        pin_hash: undefined,
        pin_salt: undefined
    })
    writeAppSettings(db, next)
    return next
}

export function verifyLocalPin(db, pin) {
    const settings = getAppSettings(db)
    if (!settings.pin_enabled || !settings.pin_hash || !settings.pin_salt) return true
    return hashPin(pin, settings.pin_salt) === settings.pin_hash
}

export function ensureBackupKey(db) {
    const current = getAppSettings(db)
    if (current.backup_key) return current

    const next = normalizeSettings({
        ...current,
        backup_key: createBackupKey()
    })
    writeAppSettings(db, next)
    return next
}

export function rotateBackupKey(db) {
    const current = getAppSettings(db)
    const next = normalizeSettings({
        ...current,
        backup_key: createBackupKey()
    })
    writeAppSettings(db, next)
    return next
}

function writeAppSettings(db, settings) {
    db.prepare(`
        INSERT INTO app_settings (key, value_json, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET
            value_json = excluded.value_json,
            updated_at = excluded.updated_at
    `).run(APP_SETTINGS_KEY, JSON.stringify(settings), new Date().toISOString())
}

function normalizeSettings(settings = {}) {
    const hasPin = Boolean(settings.pin_enabled && settings.pin_hash && settings.pin_salt)
    return {
        pharmacy_name: settings.pharmacy_name || '',
        pharmacy_address: settings.pharmacy_address || '',
        pharmacy_tel: settings.pharmacy_tel || '',
        pharmacy_fax: settings.pharmacy_fax || '',
        google_drive_folder: settings.google_drive_folder || '',
        backup_key: normalizeBackupKey(settings.backup_key),
        last_app_version: normalizeTextSetting(settings.last_app_version),
        ai_mode_enabled: Boolean(settings.ai_mode_enabled),
        ai_ollama_url: normalizeBaseUrl(settings.ai_ollama_url, DEFAULT_OLLAMA_URL),
        ai_ollama_model: normalizeTextSetting(settings.ai_ollama_model),
        ai_auto_start_enabled: Boolean(settings.ai_auto_start_enabled),
        ai_ollama_start_command: normalizeCommandSetting(settings.ai_ollama_start_command, DEFAULT_OLLAMA_START_COMMAND),
        pin_enabled: hasPin,
        pin_hash: hasPin ? settings.pin_hash : undefined,
        pin_salt: hasPin ? settings.pin_salt : undefined,
        lock_timeout_minutes: normalizeLockTimeout(settings.lock_timeout_minutes)
    }
}

function normalizeLockTimeout(value) {
    if (!Number.isFinite(value)) return DEFAULT_LOCK_TIMEOUT_MINUTES
    return Math.min(Math.max(Math.floor(value || DEFAULT_LOCK_TIMEOUT_MINUTES), 1), 240)
}

function validatePin(pin) {
    if (!/^\d{4,8}$/.test(pin)) {
        throw new Error('PINは4〜8桁の数字で設定してください')
    }
}

function hashPin(pin, salt) {
    return createHash('sha256')
        .update(`${salt}:${pin}`)
        .digest('hex')
}

function createBackupKey() {
    return `prk_${randomBytes(32).toString('base64url')}`
}

function createSalt() {
    return randomBytes(16).toString('hex')
}

function normalizeBackupKey(value) {
    return typeof value === 'string' && value.startsWith('prk_') ? value : undefined
}

function normalizeTextSetting(value) {
    return typeof value === 'string' ? value.trim() : ''
}

function normalizeBaseUrl(value, fallback) {
    const normalized = typeof value === 'string' ? value.trim().replace(/\/+$/, '') : ''
    return normalized || fallback
}

function normalizeCommandSetting(value, fallback) {
    const normalized = typeof value === 'string' ? value.trim().replace(/\r?\n/g, ' ') : ''
    return normalized || fallback
}

function parseSettings(raw) {
    try {
        const parsed = JSON.parse(raw)
        return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
        return {}
    }
}
