export const DEFAULT_LOCAL_APP_PORT_CANDIDATES = [47831, 47832, 47833] as const
export const LOCAL_APP_PORT_CANDIDATES = parseLocalAppPortCandidates(
    getViteEnvValue('VITE_LOCAL_APP_PORT_CANDIDATES'),
    DEFAULT_LOCAL_APP_PORT_CANDIDATES
)
export const LOCAL_APP_HEALTH_PATH = '/api/local/health'
export const LOCAL_APP_URI = 'pharmacy-report://open'

export type LocalAppStatus =
    | 'not_detected'
    | 'update_required'
    | 'db_preparing'
    | 'ai_not_setup'
    | 'ready'

export type LocalAppHealthStatus =
    | 'ok'
    | 'ready'
    | 'update_required'
    | 'db_preparing'
    | 'ai_not_setup'

export type LocalAppHealth = {
    app?: string
    status?: LocalAppHealthStatus
    version?: string
    latest_version?: string
    db_ready?: boolean
    ai_ready?: boolean
    app_url?: string
    message?: string
}

export type LocalAppProbeResult = {
    status: LocalAppStatus
    port?: number
    url?: string
    version?: string
    latestVersion?: string
    appUrl?: string
    aiReady?: boolean
    message?: string
}

export type ProbeLocalAppOptions = {
    ports?: readonly number[]
    timeoutMs?: number
    fetchImpl?: typeof fetch
}

const DEFAULT_TIMEOUT_MS = 900

export function parseLocalAppPortCandidates(
    value?: string,
    fallback: readonly number[] = DEFAULT_LOCAL_APP_PORT_CANDIDATES
): number[] {
    const seen = new Set<number>()
    const ports = String(value || '')
        .split(',')
        .map(candidate => Number.parseInt(candidate.trim(), 10))
        .filter(port => {
            if (!Number.isInteger(port) || port < 0 || port > 65535 || seen.has(port)) return false
            seen.add(port)
            return true
        })

    return ports.length ? ports : [...fallback]
}

export const probeLocalApp = async (
    options: ProbeLocalAppOptions = {}
): Promise<LocalAppProbeResult> => {
    const ports = options.ports ?? LOCAL_APP_PORT_CANDIDATES
    const fetchImpl = options.fetchImpl ?? fetch

    for (const port of ports) {
        const url = createHealthUrl(port)
        const health = await fetchLocalHealth(url, fetchImpl, options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
        if (!health) continue
        return classifyLocalHealth(health, port, url)
    }

    return {
        status: 'not_detected',
        message: 'ローカルアプリの応答を確認できませんでした'
    }
}

export const classifyLocalHealth = (
    health: LocalAppHealth,
    port: number,
    url = createHealthUrl(port)
): LocalAppProbeResult => {
    const base = {
        port,
        url,
        version: health.version,
        latestVersion: health.latest_version,
        appUrl: health.app_url,
        aiReady: health.ai_ready,
        message: health.message
    }

    if (health.status === 'update_required') {
        return { ...base, status: 'update_required' }
    }

    if (health.status === 'db_preparing' || health.db_ready === false) {
        return { ...base, status: 'db_preparing' }
    }

    if (health.status === 'ai_not_setup' || health.ai_ready === false) {
        return { ...base, status: 'ai_not_setup' }
    }

    return { ...base, status: 'ready' }
}

const fetchLocalHealth = async (
    url: string,
    fetchImpl: typeof fetch,
    timeoutMs: number
): Promise<LocalAppHealth | null> => {
    const controller = new AbortController()
    const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs)

    try {
        const response = await fetchImpl(url, {
            method: 'GET',
            cache: 'no-store',
            signal: controller.signal
        })

        if (!response.ok) return null
        const data = await response.json() as unknown
        if (!isLocalAppHealth(data)) return null
        return data
    } catch {
        return null
    } finally {
        globalThis.clearTimeout(timeout)
    }
}

const createHealthUrl = (port: number) => `http://127.0.0.1:${port}${LOCAL_APP_HEALTH_PATH}`

function getViteEnvValue(key: string): string | undefined {
    const meta = import.meta as ImportMeta & {
        env?: Record<string, string | undefined>
    }
    return meta.env?.[key]
}

const isLocalAppHealth = (value: unknown): value is LocalAppHealth => {
    if (!value || typeof value !== 'object') return false
    const health = value as Partial<LocalAppHealth>
    return !health.status
        || ['ok', 'ready', 'update_required', 'db_preparing', 'ai_not_setup'].includes(health.status)
}
