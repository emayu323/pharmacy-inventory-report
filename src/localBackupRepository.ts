const APP_ID = 'pharmacy-report'
const BACKUP_KIND = 'encrypted-local-backup'
const BACKUP_VERSION = 1
const KDF_ITERATIONS = 210000
const MIN_BACKUP_PASSWORD_LENGTH = 8

const LOCAL_DATA_KEYS = [
    { id: 'reports', storageKey: 'pharmacy-report:reports:v1' },
    { id: 'patients', storageKey: 'pharmacy-report:patients:v1' },
    { id: 'institutions', storageKey: 'pharmacy-report:institutions:v1' },
    { id: 'text_templates', storageKey: 'pharmacy-report:text-templates:v1' },
    { id: 'app_settings', storageKey: 'pharmacy-report:app-settings:v1' },
    { id: 'storage_mode', storageKey: 'report_storage_mode' }
] as const

type LocalDataId = typeof LOCAL_DATA_KEYS[number]['id']
type LocalBackupData = Record<LocalDataId, string | null>

export type LocalBackupSummary = {
    created_at: string
    reports_count: number
    patients_count: number
    institutions_count: number
    templates_count: number
    has_app_settings: boolean
}

type LocalBackupPayload = {
    app: typeof APP_ID
    version: typeof BACKUP_VERSION
    created_at: string
    data: LocalBackupData
    summary: LocalBackupSummary
}

type EncryptedLocalBackupFile = {
    app: typeof APP_ID
    kind: typeof BACKUP_KIND
    version: typeof BACKUP_VERSION
    created_at: string
    encryption: {
        algorithm: 'AES-GCM'
        kdf: 'PBKDF2-SHA-256'
        iterations: number
        salt: string
        iv: string
    }
    data: string
}

export const createEncryptedLocalBackup = async (
    password: string
): Promise<{ fileName: string; blob: Blob; summary: LocalBackupSummary }> => {
    validateBackupPassword(password)

    const createdAt = new Date().toISOString()
    const data = readLocalBackupData()
    const summary = createBackupSummary(createdAt, data)
    const payload: LocalBackupPayload = {
        app: APP_ID,
        version: BACKUP_VERSION,
        created_at: createdAt,
        data,
        summary
    }
    const encryptedFile = await encryptBackupPayload(payload, password)
    const blob = new Blob([JSON.stringify(encryptedFile, null, 2)], { type: 'application/json' })

    return {
        fileName: `pharmacy-report-backup-${createdAt.slice(0, 10)}.json`,
        blob,
        summary
    }
}

export const restoreEncryptedLocalBackup = async (
    file: File,
    password: string
): Promise<LocalBackupSummary> => {
    validateBackupPassword(password)
    const raw = await file.text()
    const parsed = parseEncryptedBackupFile(raw)
    const payload = await decryptBackupPayload(parsed, password)

    if (payload.app !== APP_ID || payload.version !== BACKUP_VERSION) {
        throw new Error('このバックアップファイルは現在のアプリで復元できません')
    }

    writeLocalBackupData(payload.data)
    return payload.summary
}

const readLocalBackupData = (): LocalBackupData => {
    const storage = getBrowserStorage()
    if (!storage) {
        throw new Error('ローカル保存領域にアクセスできません')
    }

    return LOCAL_DATA_KEYS.reduce((result, item) => ({
        ...result,
        [item.id]: storage.getItem(item.storageKey)
    }), {} as LocalBackupData)
}

const writeLocalBackupData = (data: LocalBackupData) => {
    const storage = getBrowserStorage()
    if (!storage) {
        throw new Error('ローカル保存領域にアクセスできません')
    }

    LOCAL_DATA_KEYS.forEach(item => {
        const value = data[item.id]
        if (value === null || typeof value === 'undefined') {
            storage.removeItem(item.storageKey)
        } else {
            storage.setItem(item.storageKey, value)
        }
    })
}

const createBackupSummary = (createdAt: string, data: LocalBackupData): LocalBackupSummary => ({
    created_at: createdAt,
    reports_count: countArrayItems(data.reports),
    patients_count: countArrayItems(data.patients),
    institutions_count: countArrayItems(data.institutions),
    templates_count: countArrayItems(data.text_templates),
    has_app_settings: Boolean(data.app_settings)
})

const countArrayItems = (raw: string | null) => {
    if (!raw) return 0
    try {
        const parsed = JSON.parse(raw) as unknown
        return Array.isArray(parsed) ? parsed.length : 0
    } catch {
        return 0
    }
}

const encryptBackupPayload = async (
    payload: LocalBackupPayload,
    password: string
): Promise<EncryptedLocalBackupFile> => {
    const webCrypto = getWebCrypto()
    const salt = createRandomBytes(16)
    const iv = createRandomBytes(12)
    const key = await deriveBackupKey(password, salt)
    const encodedPayload = new TextEncoder().encode(JSON.stringify(payload))
    const encrypted = await webCrypto.subtle.encrypt(
        { name: 'AES-GCM', iv: toArrayBuffer(iv) },
        key,
        toArrayBuffer(encodedPayload)
    )

    return {
        app: APP_ID,
        kind: BACKUP_KIND,
        version: BACKUP_VERSION,
        created_at: payload.created_at,
        encryption: {
            algorithm: 'AES-GCM',
            kdf: 'PBKDF2-SHA-256',
            iterations: KDF_ITERATIONS,
            salt: bytesToBase64(salt),
            iv: bytesToBase64(iv)
        },
        data: bytesToBase64(new Uint8Array(encrypted))
    }
}

const decryptBackupPayload = async (
    file: EncryptedLocalBackupFile,
    password: string
): Promise<LocalBackupPayload> => {
    try {
        const webCrypto = getWebCrypto()
        const salt = base64ToBytes(file.encryption.salt)
        const iv = base64ToBytes(file.encryption.iv)
        const key = await deriveBackupKey(password, salt, file.encryption.iterations)
        const encrypted = base64ToBytes(file.data)
        const decrypted = await webCrypto.subtle.decrypt(
            { name: 'AES-GCM', iv: toArrayBuffer(iv) },
            key,
            toArrayBuffer(encrypted)
        )
        const payload = JSON.parse(new TextDecoder().decode(decrypted)) as LocalBackupPayload
        return payload
    } catch {
        throw new Error('バックアップファイルを復元できません。ファイルまたはパスワードを確認してください')
    }
}

const deriveBackupKey = async (
    password: string,
    salt: Uint8Array,
    iterations = KDF_ITERATIONS
) => {
    const webCrypto = getWebCrypto()
    const baseKey = await webCrypto.subtle.importKey(
        'raw',
        toArrayBuffer(new TextEncoder().encode(password)),
        'PBKDF2',
        false,
        ['deriveKey']
    )

    return webCrypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: toArrayBuffer(salt),
            iterations,
            hash: 'SHA-256'
        },
        baseKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    )
}

const parseEncryptedBackupFile = (raw: string): EncryptedLocalBackupFile => {
    try {
        const parsed = JSON.parse(raw) as Partial<EncryptedLocalBackupFile>
        if (
            parsed.app !== APP_ID
            || parsed.kind !== BACKUP_KIND
            || parsed.version !== BACKUP_VERSION
            || parsed.encryption?.algorithm !== 'AES-GCM'
            || parsed.encryption.kdf !== 'PBKDF2-SHA-256'
            || typeof parsed.encryption.iterations !== 'number'
            || typeof parsed.encryption.salt !== 'string'
            || typeof parsed.encryption.iv !== 'string'
            || typeof parsed.data !== 'string'
            || typeof parsed.created_at !== 'string'
        ) {
            throw new Error('Invalid backup file')
        }
        return parsed as EncryptedLocalBackupFile
    } catch {
        throw new Error('バックアップファイルの形式が正しくありません')
    }
}

const validateBackupPassword = (password: string) => {
    if (password.length < MIN_BACKUP_PASSWORD_LENGTH) {
        throw new Error(`バックアップパスワードは${MIN_BACKUP_PASSWORD_LENGTH}文字以上で入力してください`)
    }
}

const createRandomBytes = (length: number) => {
    const webCrypto = getWebCrypto()
    const bytes = new Uint8Array(length)
    webCrypto.getRandomValues(bytes)
    return bytes
}

const bytesToBase64 = (bytes: Uint8Array) => {
    let binary = ''
    bytes.forEach(byte => {
        binary += String.fromCharCode(byte)
    })
    return btoa(binary)
}

const base64ToBytes = (value: string) => {
    const binary = atob(value)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i)
    }
    return bytes
}

const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer => {
    const buffer = new ArrayBuffer(bytes.byteLength)
    new Uint8Array(buffer).set(bytes)
    return buffer
}

const getWebCrypto = () => {
    if (typeof crypto === 'undefined' || !crypto.subtle) {
        throw new Error('この環境では暗号化バックアップを作成できません')
    }
    return crypto
}

const getBrowserStorage = (): Storage | null => {
    if (typeof window === 'undefined') return null
    try {
        return window.localStorage
    } catch {
        return null
    }
}
