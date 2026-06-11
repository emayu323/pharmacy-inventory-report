export type InstallCodeVerificationStatus =
    | 'valid'
    | 'invalid'
    | 'expired'
    | 'usage_limit_reached'
    | 'usage_store_error'
    | 'not_configured'

export type InstallCodeRecord = {
    code: string
    label?: string
    expiresAt?: string
    maxDevices?: number
    usedDevices?: string[]
    usedDevicesCount?: number
    installerUrl?: string
    disabled?: boolean
}

export type InstallCodeVerificationResult = {
    status: InstallCodeVerificationStatus
    code?: string
    label?: string
    expiresAt?: string
    maxDevices?: number
    usedDevicesCount?: number
    installerUrl?: string
    message: string
}

export type VerifyInstallCodeOptions = {
    now?: Date
    defaultInstallerUrl?: string
    usedDevicesCountOverride?: number
    allowExistingDeviceAtLimit?: boolean
    ignoreRecordUsageCount?: boolean
}

export const normalizeInstallCode = (value: string) => {
    return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export const parseInstallCodeRegistry = (raw: string | undefined): InstallCodeRecord[] => {
    const source = raw?.trim()
    if (!source) return []

    if (source.startsWith('[') || source.startsWith('{')) {
        return parseJsonRegistry(source)
    }

    return source
        .split(/[\n,]/)
        .map(code => code.trim())
        .filter(Boolean)
        .map(code => ({ code }))
}

export const createDemoInstallCodeRegistry = (
    rawCodes: string | undefined,
    installerUrl: string
): InstallCodeRecord[] => {
    return parseInstallCodeRegistry(rawCodes).map(record => ({
        ...record,
        installerUrl: record.installerUrl || installerUrl || undefined
    }))
}

export const verifyInstallCodeFromRegistry = (
    inputCode: string,
    registry: readonly InstallCodeRecord[],
    options: VerifyInstallCodeOptions = {}
): InstallCodeVerificationResult => {
    const normalizedInput = normalizeInstallCode(inputCode)
    if (registry.length === 0) {
        return {
            status: 'not_configured',
            message: '導入コード管理表が未設定です'
        }
    }

    if (normalizedInput.length < 4) {
        return {
            status: 'invalid',
            message: '導入コードを確認できません'
        }
    }

    const record = registry.find(item => normalizeInstallCode(item.code) === normalizedInput)
    if (!record || record.disabled) {
        return {
            status: 'invalid',
            message: '導入コードを確認できません'
        }
    }

    if (isExpired(record.expiresAt, options.now ?? new Date())) {
        return createResult(record, 'expired', options, '導入コードの有効期限が切れています')
    }

    const usedDevicesCount = getUsedDevicesCount(record, options)
    if (
        typeof record.maxDevices === 'number'
        && usedDevicesCount >= record.maxDevices
        && !options.allowExistingDeviceAtLimit
    ) {
        return createResult(record, 'usage_limit_reached', options, '利用台数の上限に達しています')
    }

    return createResult(record, 'valid', options, '導入コードを確認しました')
}

export const isInstallCodeVerificationResult = (value: unknown): value is InstallCodeVerificationResult => {
    if (!value || typeof value !== 'object') return false
    const result = value as Partial<InstallCodeVerificationResult>
        return typeof result.message === 'string'
        && typeof result.status === 'string'
        && ['valid', 'invalid', 'expired', 'usage_limit_reached', 'usage_store_error', 'not_configured'].includes(result.status)
}

const parseJsonRegistry = (source: string): InstallCodeRecord[] => {
    try {
        const parsed = JSON.parse(source) as unknown
        const records = Array.isArray(parsed)
            ? parsed
            : isObject(parsed) && Array.isArray(parsed.codes)
                ? parsed.codes
                : []
        return records.map(normalizeRecord).filter((record): record is InstallCodeRecord => Boolean(record))
    } catch {
        return []
    }
}

const normalizeRecord = (value: unknown): InstallCodeRecord | null => {
    if (!isObject(value) || typeof value.code !== 'string' || !normalizeInstallCode(value.code)) return null

    const maxDevices = typeof value.maxDevices === 'number' && Number.isFinite(value.maxDevices)
        ? Math.max(1, Math.floor(value.maxDevices))
        : undefined
    const usedDevices = Array.isArray(value.usedDevices)
        ? value.usedDevices.filter((device): device is string => typeof device === 'string' && device.trim().length > 0)
        : undefined
    const usedDevicesCount = typeof value.usedDevicesCount === 'number' && Number.isFinite(value.usedDevicesCount)
        ? Math.max(0, Math.floor(value.usedDevicesCount))
        : undefined

    return {
        code: value.code,
        label: typeof value.label === 'string' ? value.label : undefined,
        expiresAt: typeof value.expiresAt === 'string' ? value.expiresAt : undefined,
        maxDevices,
        usedDevices,
        usedDevicesCount,
        installerUrl: typeof value.installerUrl === 'string' ? value.installerUrl : undefined,
        disabled: value.disabled === true
    }
}

const createResult = (
    record: InstallCodeRecord,
    status: InstallCodeVerificationStatus,
    options: VerifyInstallCodeOptions,
    message: string
): InstallCodeVerificationResult => {
    return {
        status,
        code: record.code,
        label: record.label,
        expiresAt: record.expiresAt,
        maxDevices: record.maxDevices,
        usedDevicesCount: getUsedDevicesCount(record, options),
        installerUrl: record.installerUrl || options.defaultInstallerUrl || undefined,
        message
    }
}

const getUsedDevicesCount = (
    record: InstallCodeRecord,
    options: VerifyInstallCodeOptions = {}
) => {
    if (typeof options.usedDevicesCountOverride === 'number' && Number.isFinite(options.usedDevicesCountOverride)) {
        return Math.max(0, Math.floor(options.usedDevicesCountOverride))
    }
    if (options.ignoreRecordUsageCount) return 0
    return record.usedDevicesCount ?? record.usedDevices?.length ?? 0
}

const isExpired = (expiresAt: string | undefined, now: Date) => {
    if (!expiresAt) return false
    const expiryTime = parseExpiryTime(expiresAt)
    return typeof expiryTime === 'number' && now.getTime() > expiryTime
}

const parseExpiryTime = (expiresAt: string) => {
    const trimmed = expiresAt.trim()
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        return Date.parse(`${trimmed}T23:59:59.999Z`)
    }
    const parsed = Date.parse(trimmed)
    return Number.isNaN(parsed) ? undefined : parsed
}

const isObject = (value: unknown): value is Record<string, unknown> => {
    return Boolean(value) && typeof value === 'object'
}
