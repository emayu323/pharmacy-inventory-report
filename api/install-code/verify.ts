import {
    normalizeInstallCode,
    parseInstallCodeRegistry,
    type InstallCodeRecord,
    type InstallCodeVerificationResult,
    verifyInstallCodeFromRegistry
} from '../../src/installCode.ts'
import {
    createSupabaseInstallCodeUsageStoreFromEnv,
    normalizeInstallDeviceId,
    type InstallCodeUsageStore
} from './supabaseUsageStore.ts'

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

function isObject(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object'
}
