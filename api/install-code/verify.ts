type InstallCodeVerificationStatus =
    | 'valid'
    | 'invalid'
    | 'expired'
    | 'usage_limit_reached'
    | 'usage_store_error'
    | 'not_configured'

type InstallCodeRecord = {
    code: string
    label?: string
    expiresAt?: string
    maxDevices?: number
    usedDevices?: string[]
    usedDevicesCount?: number
    installerUrl?: string
    disabled?: boolean
}

type InstallCodeVerificationResult = {
    status: InstallCodeVerificationStatus
    code?: string
    label?: string
    expiresAt?: string
    maxDevices?: number
    usedDevicesCount?: number
    installerUrl?: string
    message: string
}

type VerifyInstallCodeOptions = {
    now?: Date
    defaultInstallerUrl?: string
    usedDevicesCountOverride?: number
    allowExistingDeviceAtLimit?: boolean
    ignoreRecordUsageCount?: boolean
}

type InstallCodeUsage = {
    usedDevicesCount: number
    deviceAlreadyRegistered: boolean
}

type InstallCodeUsageStore = {
    getUsage: (code: string, deviceId: string) => Promise<InstallCodeUsage>
    registerDevice: (input: {
        code: string
        deviceId: string
        label?: string
    }) => Promise<void>
}

type FetchLike = typeof fetch
type Env = Record<string, string | undefined>

type JsonBody = {
    code?: unknown
    deviceId?: unknown
}

type ApiRequest = {
    method?: string
    body?: unknown
    usageStore?: InstallCodeUsageStore | null
}

type ApiResponse = {
    setHeader: (name: string, value: string) => void
    status: (statusCode: number) => ApiResponse
    json: (body: unknown) => void
    end: () => void
}

export default async function handler(request: ApiRequest, response: ApiResponse) {
    setResponseHeaders(response)

    if (request.method === 'OPTIONS') {
        response.status(204).end()
        return
    }

    if (request.method !== 'POST') {
        response.status(405).json({
            status: 'invalid',
            message: 'POSTで送信してください'
        })
        return
    }

    const body = parseRequestBody(request.body)
    const registry = parseInstallCodeRegistry(process.env.INSTALL_CODE_REGISTRY)
    const options = {
        defaultInstallerUrl: process.env.WINDOWS_INSTALLER_URL || ''
    }
    const usageStore = typeof request.usageStore === 'undefined'
        ? createSupabaseInstallCodeUsageStoreFromEnv()
        : request.usageStore
    const result = usageStore
        ? await verifyInstallCodeWithUsageStore({
            code: String(body.code ?? ''),
            deviceId: body.deviceId,
            registry,
            usageStore,
            defaultInstallerUrl: options.defaultInstallerUrl
        })
        : verifyInstallCodeFromRegistry(String(body.code ?? ''), registry, options)

    response.status(getStatusCode(result.status)).json(result)
}

async function verifyInstallCodeWithUsageStore({
    code,
    deviceId,
    registry,
    usageStore,
    defaultInstallerUrl
}: {
    code: string
    deviceId: unknown
    registry: readonly InstallCodeRecord[]
    usageStore: InstallCodeUsageStore
    defaultInstallerUrl: string
}): Promise<InstallCodeVerificationResult> {
    const baseResult = verifyInstallCodeFromRegistry(code, registry, {
        defaultInstallerUrl,
        ignoreRecordUsageCount: true
    })
    if (baseResult.status !== 'valid') return baseResult

    const normalizedCode = normalizeInstallCode(code)
    const normalizedDeviceId = normalizeInstallDeviceId(deviceId)
    if (!normalizedDeviceId) {
        return {
            status: 'invalid',
            message: '端末IDを確認できません'
        }
    }

    try {
        const usage = await usageStore.getUsage(normalizedCode, normalizedDeviceId)
        let result = verifyInstallCodeFromRegistry(code, registry, {
            defaultInstallerUrl,
            usedDevicesCountOverride: usage.usedDevicesCount,
            allowExistingDeviceAtLimit: usage.deviceAlreadyRegistered
        })
        if (result.status !== 'valid') return result

        if (!usage.deviceAlreadyRegistered) {
            await usageStore.registerDevice({
                code: normalizedCode,
                deviceId: normalizedDeviceId,
                label: result.label
            })
            const updatedUsage = await usageStore.getUsage(normalizedCode, normalizedDeviceId)
            result = verifyInstallCodeFromRegistry(code, registry, {
                defaultInstallerUrl,
                usedDevicesCountOverride: updatedUsage.usedDevicesCount,
                allowExistingDeviceAtLimit: true
            })
        }

        return result
    } catch (error) {
        console.error('Install code usage store failed:', error)
        return {
            status: 'usage_store_error',
            message: '導入コード管理DBを確認できません'
        }
    }
}

function setResponseHeaders(response: ApiResponse) {
    response.setHeader('Cache-Control', 'no-store')
    response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

function parseRequestBody(body: unknown): JsonBody {
    if (!body) return {}
    if (typeof body === 'string') {
        try {
            const parsed = JSON.parse(body) as unknown
            return isObject(parsed) ? parsed : {}
        } catch {
            return {}
        }
    }
    return isObject(body) ? body : {}
}

function getStatusCode(status: string) {
    if (status === 'valid') return 200
    if (status === 'not_configured') return 503
    if (status === 'usage_store_error') return 503
    return 400
}

function normalizeInstallCode(value: string) {
    return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function parseInstallCodeRegistry(raw: string | undefined): InstallCodeRecord[] {
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

function verifyInstallCodeFromRegistry(
    inputCode: string,
    registry: readonly InstallCodeRecord[],
    options: VerifyInstallCodeOptions = {}
): InstallCodeVerificationResult {
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

function createSupabaseInstallCodeUsageStoreFromEnv(env: Env = process.env): InstallCodeUsageStore | null {
    const url = env.INSTALL_CODE_USAGE_SUPABASE_URL || env.SUPABASE_URL
    const serviceRoleKey = env.INSTALL_CODE_USAGE_SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !serviceRoleKey) return null

    return createSupabaseInstallCodeUsageStore({
        url,
        serviceRoleKey,
        table: env.INSTALL_CODE_USAGE_TABLE || 'install_code_devices'
    })
}

function createSupabaseInstallCodeUsageStore(options: {
    url: string
    serviceRoleKey: string
    table?: string
    fetchImpl?: FetchLike
}): InstallCodeUsageStore {
    const endpoint = normalizeSupabaseRestEndpoint(options.url)
    const serviceRoleKey = options.serviceRoleKey.trim()
    const table = normalizeTableName(options.table)
    const fetchImpl = options.fetchImpl || fetch
    if (!endpoint || !serviceRoleKey) {
        throw new Error('Supabase usage store requires url and service role key')
    }

    return {
        async getUsage(code, deviceId) {
            const normalizedCode = normalizeInstallCode(code)
            const normalizedDeviceId = normalizeInstallDeviceId(deviceId)
            if (!normalizedCode || !normalizedDeviceId) {
                return {
                    usedDevicesCount: 0,
                    deviceAlreadyRegistered: false
                }
            }

            const codeDevices = await requestSupabaseRows({
                endpoint,
                serviceRoleKey,
                table,
                fetchImpl,
                filters: {
                    code: normalizedCode
                }
            })
            const deviceAlreadyRegistered = codeDevices.some(row => row.device_id === normalizedDeviceId)

            return {
                usedDevicesCount: codeDevices.length,
                deviceAlreadyRegistered
            }
        },
        async registerDevice(input) {
            const normalizedCode = normalizeInstallCode(input.code)
            const normalizedDeviceId = normalizeInstallDeviceId(input.deviceId)
            if (!normalizedCode || !normalizedDeviceId) return

            const now = new Date().toISOString()
            const payload = {
                code: normalizedCode,
                device_id: normalizedDeviceId,
                label: normalizeLabel(input.label),
                first_verified_at: now,
                last_verified_at: now
            }
            const insertResult = await fetchImpl(createTableUrl(endpoint, table), {
                method: 'POST',
                headers: createSupabaseHeaders(serviceRoleKey, {
                    'Content-Type': 'application/json',
                    Prefer: 'return=minimal'
                }),
                body: JSON.stringify(payload)
            })

            if (insertResult.ok) return
            if (insertResult.status !== 409) {
                throw await createSupabaseError(insertResult)
            }

            const updateUrl = createTableUrl(endpoint, table, {
                code: normalizedCode,
                device_id: normalizedDeviceId
            })
            const updateResult = await fetchImpl(updateUrl, {
                method: 'PATCH',
                headers: createSupabaseHeaders(serviceRoleKey, {
                    'Content-Type': 'application/json',
                    Prefer: 'return=minimal'
                }),
                body: JSON.stringify({
                    label: normalizeLabel(input.label),
                    last_verified_at: now
                })
            })
            if (!updateResult.ok) {
                throw await createSupabaseError(updateResult)
            }
        }
    }
}

function parseJsonRegistry(source: string): InstallCodeRecord[] {
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

function normalizeRecord(value: unknown): InstallCodeRecord | null {
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

function createResult(
    record: InstallCodeRecord,
    status: InstallCodeVerificationStatus,
    options: VerifyInstallCodeOptions,
    message: string
): InstallCodeVerificationResult {
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

function getUsedDevicesCount(record: InstallCodeRecord, options: VerifyInstallCodeOptions = {}) {
    if (typeof options.usedDevicesCountOverride === 'number' && Number.isFinite(options.usedDevicesCountOverride)) {
        return Math.max(0, Math.floor(options.usedDevicesCountOverride))
    }
    if (options.ignoreRecordUsageCount) return 0
    return record.usedDevicesCount ?? record.usedDevices?.length ?? 0
}

function isExpired(expiresAt: string | undefined, now: Date) {
    if (!expiresAt) return false
    const expiryTime = parseExpiryTime(expiresAt)
    return typeof expiryTime === 'number' && now.getTime() > expiryTime
}

function parseExpiryTime(expiresAt: string) {
    const trimmed = expiresAt.trim()
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        return Date.parse(`${trimmed}T23:59:59.999Z`)
    }
    const parsed = Date.parse(trimmed)
    return Number.isNaN(parsed) ? undefined : parsed
}

function normalizeInstallDeviceId(value: unknown) {
    const normalized = typeof value === 'string' ? value.trim() : ''
    if (normalized.length < 8 || normalized.length > 128) return ''
    return /^[A-Za-z0-9._:-]+$/.test(normalized) ? normalized : ''
}

function normalizeSupabaseRestEndpoint(value: string) {
    const normalized = value.trim().replace(/\/+$/, '')
    if (!normalized) return ''
    return normalized.endsWith('/rest/v1') ? normalized : `${normalized}/rest/v1`
}

function normalizeTableName(value = 'install_code_devices') {
    const normalized = value.trim()
    if (!/^[A-Za-z0-9_]+$/.test(normalized)) {
        throw new Error('Supabase usage table name is invalid')
    }
    return normalized
}

async function requestSupabaseRows({
    endpoint,
    serviceRoleKey,
    table,
    filters,
    fetchImpl
}: {
    endpoint: string
    serviceRoleKey: string
    table: string
    filters: Record<string, string>
    fetchImpl: FetchLike
}) {
    const response = await fetchImpl(createTableUrl(endpoint, table, filters, 'device_id'), {
        method: 'GET',
        headers: createSupabaseHeaders(serviceRoleKey)
    })
    if (!response.ok) {
        throw await createSupabaseError(response)
    }

    const rows = await response.json()
    return Array.isArray(rows) ? rows as Array<{ device_id?: string }> : []
}

function createTableUrl(
    endpoint: string,
    table: string,
    filters: Record<string, string> = {},
    select = ''
) {
    const url = new URL(`${endpoint}/${table}`)
    if (select) url.searchParams.set('select', select)
    Object.entries(filters).forEach(([key, value]) => {
        url.searchParams.set(key, `eq.${value}`)
    })
    return url
}

function createSupabaseHeaders(serviceRoleKey: string, extra: Record<string, string> = {}) {
    return {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        ...extra
    }
}

async function createSupabaseError(response: Response) {
    let detail = ''
    try {
        detail = await response.text()
    } catch {
        detail = ''
    }
    const message = detail
        ? `Supabase usage store request failed (${response.status}): ${detail}`
        : `Supabase usage store request failed (${response.status})`
    return new Error(message)
}

function normalizeLabel(value: unknown) {
    const normalized = typeof value === 'string' ? value.trim() : ''
    return normalized || null
}

function isObject(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object'
}
