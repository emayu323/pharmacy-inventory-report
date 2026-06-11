type Env = Record<string, string | undefined>
type FetchLike = typeof fetch

export type InstallCodeUsage = {
    usedDevicesCount: number
    deviceAlreadyRegistered: boolean
}

export type InstallCodeUsageStore = {
    getUsage: (code: string, deviceId: string) => Promise<InstallCodeUsage>
    registerDevice: (input: {
        code: string
        deviceId: string
        label?: string
    }) => Promise<void>
}

export type SupabaseInstallCodeUsageStoreOptions = {
    url: string
    serviceRoleKey: string
    table?: string
    fetchImpl?: FetchLike
}

export function createSupabaseInstallCodeUsageStoreFromEnv(env: Env = process.env): InstallCodeUsageStore | null {
    const url = env.INSTALL_CODE_USAGE_SUPABASE_URL || env.SUPABASE_URL
    const serviceRoleKey = env.INSTALL_CODE_USAGE_SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !serviceRoleKey) return null

    return createSupabaseInstallCodeUsageStore({
        url,
        serviceRoleKey,
        table: env.INSTALL_CODE_USAGE_TABLE || 'install_code_devices'
    })
}

export function createSupabaseInstallCodeUsageStore(
    options: SupabaseInstallCodeUsageStoreOptions
): InstallCodeUsageStore {
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

export function normalizeInstallDeviceId(value: unknown) {
    const normalized = typeof value === 'string' ? value.trim() : ''
    if (normalized.length < 8 || normalized.length > 128) return ''
    return /^[A-Za-z0-9._:-]+$/.test(normalized) ? normalized : ''
}

function normalizeInstallCode(value: string) {
    return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
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
