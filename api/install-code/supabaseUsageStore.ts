import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { normalizeInstallCode } from '../../src/installCode.ts'

type Env = Record<string, string | undefined>

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

export function createSupabaseInstallCodeUsageStoreFromEnv(env: Env = process.env): InstallCodeUsageStore | null {
    const url = env.INSTALL_CODE_USAGE_SUPABASE_URL || env.SUPABASE_URL
    const serviceRoleKey = env.INSTALL_CODE_USAGE_SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !serviceRoleKey) return null

    const table = env.INSTALL_CODE_USAGE_TABLE || 'install_code_devices'
    const client = createClient(url, serviceRoleKey, {
        auth: {
            persistSession: false,
            autoRefreshToken: false
        }
    })

    return createSupabaseInstallCodeUsageStore(client, table)
}

export function createSupabaseInstallCodeUsageStore(
    client: SupabaseClient,
    table: string
): InstallCodeUsageStore {
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

            const countResult = await client
                .from(table)
                .select('device_id', { count: 'exact', head: true })
                .eq('code', normalizedCode)
            if (countResult.error) throw countResult.error

            const deviceResult = await client
                .from(table)
                .select('device_id')
                .eq('code', normalizedCode)
                .eq('device_id', normalizedDeviceId)
                .maybeSingle()
            if (deviceResult.error) throw deviceResult.error

            return {
                usedDevicesCount: countResult.count ?? 0,
                deviceAlreadyRegistered: Boolean(deviceResult.data)
            }
        },
        async registerDevice(input) {
            const normalizedCode = normalizeInstallCode(input.code)
            const normalizedDeviceId = normalizeInstallDeviceId(input.deviceId)
            if (!normalizedCode || !normalizedDeviceId) return

            const now = new Date().toISOString()
            const insertResult = await client
                .from(table)
                .insert({
                    code: normalizedCode,
                    device_id: normalizedDeviceId,
                    label: normalizeLabel(input.label),
                    first_verified_at: now,
                    last_verified_at: now
                })

            if (!insertResult.error) return
            if (insertResult.error.code !== '23505') throw insertResult.error

            const updateResult = await client
                .from(table)
                .update({
                    label: normalizeLabel(input.label),
                    last_verified_at: now
                })
                .eq('code', normalizedCode)
                .eq('device_id', normalizedDeviceId)
            if (updateResult.error) throw updateResult.error
        }
    }
}

export function normalizeInstallDeviceId(value: unknown) {
    const normalized = typeof value === 'string' ? value.trim() : ''
    if (normalized.length < 8 || normalized.length > 128) return ''
    return /^[A-Za-z0-9._:-]+$/.test(normalized) ? normalized : ''
}

function normalizeLabel(value: unknown) {
    const normalized = typeof value === 'string' ? value.trim() : ''
    return normalized || null
}
