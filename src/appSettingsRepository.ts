import type { AppSettings } from './types'
import { getNativeBridge } from './nativeBridge'

export type AppSettingsInput = Partial<Omit<AppSettings, 'pin_hash' | 'pin_salt'>>

const LOCAL_APP_SETTINGS_KEY = 'pharmacy-report:app-settings:v1'
const DEFAULT_LOCK_TIMEOUT_MINUTES = 15
const DEFAULT_OLLAMA_URL = 'http://127.0.0.1:11434'
const DEFAULT_WHISPER_FILE_FIELD = 'audio'
const DEFAULT_OLLAMA_START_COMMAND = 'ollama serve'

export const DEFAULT_APP_SETTINGS: AppSettings = {
    pharmacy_name: '',
    pharmacy_address: '',
    pharmacy_tel: '',
    pharmacy_fax: '',
    google_drive_folder: '',
    backup_key: undefined,
    last_app_version: '',
    ai_mode_enabled: false,
    ai_consent_mode_enabled: false,
    ai_save_audio_enabled: false,
    ai_save_transcript_enabled: false,
    ai_ollama_url: DEFAULT_OLLAMA_URL,
    ai_ollama_model: '',
    ai_whisper_health_url: '',
    ai_whisper_transcribe_url: '',
    ai_whisper_file_field: DEFAULT_WHISPER_FILE_FIELD,
    ai_auto_start_enabled: false,
    ai_ollama_start_command: DEFAULT_OLLAMA_START_COMMAND,
    ai_whisper_start_command: '',
    pin_enabled: false,
    lock_timeout_minutes: DEFAULT_LOCK_TIMEOUT_MINUTES
}

export const getAppSettings = async (): Promise<AppSettings> => {
    const nativeBridge = getNativeBridge()
    if (nativeBridge) {
        return nativeBridge.settings.get()
    }

    return readLocalSettings()
}

export const saveAppSettings = async (input: AppSettingsInput): Promise<AppSettings> => {
    const nativeBridge = getNativeBridge()
    if (nativeBridge) {
        return nativeBridge.settings.save(input)
    }

    const current = readLocalSettings()
    const next = normalizeSettings({
        ...current,
        ...input,
        lock_timeout_minutes: normalizeLockTimeout(input.lock_timeout_minutes ?? current.lock_timeout_minutes)
    })
    writeLocalSettings(next)
    return next
}

export const setLocalPin = async (pin: string): Promise<AppSettings> => {
    const nativeBridge = getNativeBridge()
    if (nativeBridge) {
        return nativeBridge.settings.setPin(pin)
    }

    validatePin(pin)
    const current = readLocalSettings()
    const salt = createSalt()
    const pinHash = await hashPin(pin, salt)
    const next: AppSettings = {
        ...current,
        pin_enabled: true,
        pin_hash: pinHash,
        pin_salt: salt,
        lock_timeout_minutes: normalizeLockTimeout(current.lock_timeout_minutes)
    }
    writeLocalSettings(next)
    return next
}

export const clearLocalPin = async (): Promise<AppSettings> => {
    const nativeBridge = getNativeBridge()
    if (nativeBridge) {
        return nativeBridge.settings.clearPin()
    }

    const current = readLocalSettings()
    const next: AppSettings = {
        ...current,
        pin_enabled: false,
        pin_hash: undefined,
        pin_salt: undefined
    }
    writeLocalSettings(next)
    return next
}

export const verifyLocalPin = async (pin: string): Promise<boolean> => {
    const nativeBridge = getNativeBridge()
    if (nativeBridge) {
        return nativeBridge.settings.verifyPin(pin)
    }

    const settings = readLocalSettings()
    if (!settings.pin_enabled || !settings.pin_hash || !settings.pin_salt) return true
    const pinHash = await hashPin(pin, settings.pin_salt)
    return pinHash === settings.pin_hash
}

export const ensureBackupKey = async (): Promise<AppSettings> => {
    const nativeBridge = getNativeBridge()
    if (nativeBridge) {
        return nativeBridge.settings.ensureBackupKey()
    }

    const current = readLocalSettings()
    if (current.backup_key) return current
    const next: AppSettings = {
        ...current,
        backup_key: createBackupKey()
    }
    writeLocalSettings(next)
    return next
}

export const rotateBackupKey = async (): Promise<AppSettings> => {
    const nativeBridge = getNativeBridge()
    if (nativeBridge) {
        return nativeBridge.settings.rotateBackupKey()
    }

    const current = readLocalSettings()
    const next: AppSettings = {
        ...current,
        backup_key: createBackupKey()
    }
    writeLocalSettings(next)
    return next
}

const readLocalSettings = (): AppSettings => {
    const storage = getBrowserStorage()
    if (!storage) return DEFAULT_APP_SETTINGS

    const raw = storage.getItem(LOCAL_APP_SETTINGS_KEY)
    if (!raw) return DEFAULT_APP_SETTINGS

    try {
        const parsed = JSON.parse(raw) as Partial<AppSettings>
        return normalizeSettings(parsed)
    } catch {
        return DEFAULT_APP_SETTINGS
    }
}

const writeLocalSettings = (settings: AppSettings) => {
    const storage = getBrowserStorage()
    if (!storage) {
        throw new Error('ローカル保存領域にアクセスできません')
    }
    storage.setItem(LOCAL_APP_SETTINGS_KEY, JSON.stringify(settings))
}

const normalizeSettings = (settings: Partial<AppSettings>): AppSettings => ({
    pharmacy_name: settings.pharmacy_name || '',
    pharmacy_address: settings.pharmacy_address || '',
    pharmacy_tel: settings.pharmacy_tel || '',
    pharmacy_fax: settings.pharmacy_fax || '',
    google_drive_folder: settings.google_drive_folder || '',
    backup_key: normalizeBackupKey(settings.backup_key),
    last_app_version: normalizeTextSetting(settings.last_app_version),
    ai_mode_enabled: Boolean(settings.ai_mode_enabled),
    ai_consent_mode_enabled: Boolean(settings.ai_mode_enabled && settings.ai_consent_mode_enabled),
    ai_save_audio_enabled: Boolean(settings.ai_mode_enabled && settings.ai_save_audio_enabled),
    ai_save_transcript_enabled: Boolean(settings.ai_mode_enabled && settings.ai_save_transcript_enabled),
    ai_ollama_url: normalizeBaseUrl(settings.ai_ollama_url, DEFAULT_OLLAMA_URL),
    ai_ollama_model: normalizeTextSetting(settings.ai_ollama_model),
    ai_whisper_health_url: normalizeUrlSetting(settings.ai_whisper_health_url),
    ai_whisper_transcribe_url: normalizeUrlSetting(settings.ai_whisper_transcribe_url),
    ai_whisper_file_field: normalizeTextSetting(settings.ai_whisper_file_field) || DEFAULT_WHISPER_FILE_FIELD,
    ai_auto_start_enabled: Boolean(settings.ai_auto_start_enabled),
    ai_ollama_start_command: normalizeCommandSetting(settings.ai_ollama_start_command, DEFAULT_OLLAMA_START_COMMAND),
    ai_whisper_start_command: normalizeCommandSetting(settings.ai_whisper_start_command, ''),
    pin_enabled: Boolean(settings.pin_enabled && settings.pin_hash && settings.pin_salt),
    pin_hash: settings.pin_hash,
    pin_salt: settings.pin_salt,
    lock_timeout_minutes: normalizeLockTimeout(settings.lock_timeout_minutes)
})

const normalizeLockTimeout = (value?: number) => {
    if (!Number.isFinite(value)) return DEFAULT_LOCK_TIMEOUT_MINUTES
    return Math.min(Math.max(Math.floor(value || DEFAULT_LOCK_TIMEOUT_MINUTES), 1), 240)
}

const normalizeBackupKey = (value?: string) => {
    return typeof value === 'string' && value.startsWith('prk_') ? value : undefined
}

const normalizeTextSetting = (value?: string) => {
    return typeof value === 'string' ? value.trim() : ''
}

const normalizeUrlSetting = (value?: string) => {
    return normalizeBaseUrl(value, '')
}

const normalizeBaseUrl = (value: unknown, fallback: string) => {
    const normalized = typeof value === 'string' ? value.trim().replace(/\/+$/, '') : ''
    return normalized || fallback
}

const normalizeCommandSetting = (value: unknown, fallback: string) => {
    const normalized = typeof value === 'string' ? value.trim().replace(/\r?\n/g, ' ') : ''
    return normalized || fallback
}

const createBackupKey = () => {
    const bytes = new Uint8Array(32)
    crypto.getRandomValues(bytes)
    const base64 = btoa(String.fromCharCode(...bytes))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '')
    return `prk_${base64}`
}

const validatePin = (pin: string) => {
    if (!/^\d{4,8}$/.test(pin)) {
        throw new Error('PINは4〜8桁の数字で設定してください')
    }
}

const hashPin = async (pin: string, salt: string) => {
    if (!crypto.subtle) {
        throw new Error('この環境ではPINハッシュを作成できません')
    }

    const data = new TextEncoder().encode(`${salt}:${pin}`)
    const digest = await crypto.subtle.digest('SHA-256', data)
    return Array.from(new Uint8Array(digest))
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join('')
}

const createSalt = () => {
    const bytes = new Uint8Array(16)
    crypto.getRandomValues(bytes)
    return Array.from(bytes)
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join('')
}

const getBrowserStorage = (): Storage | null => {
    if (typeof window === 'undefined') return null
    try {
        return window.localStorage
    } catch {
        return null
    }
}
