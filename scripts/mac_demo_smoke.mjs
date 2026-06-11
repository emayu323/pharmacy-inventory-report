import { pathToFileURL } from 'node:url'

const DEFAULT_ENTRY_URL = 'http://127.0.0.1:5174/entry'
const DEFAULT_PORTS = [47831, 47832, 47833]
const DEFAULT_TIMEOUT_MS = 1500
const LOCAL_HEALTH_PATH = '/api/local/health'

const VALID_LOCAL_APP_STATUSES = new Set([
    'ready',
    'ok',
    'ai_not_setup',
    'db_preparing',
    'update_required'
])

export async function verifyMacDemoRuntime(options = {}) {
    const env = options.env || process.env
    const entryUrl = String(options.entryUrl || env.MAC_DEMO_ENTRY_URL || DEFAULT_ENTRY_URL).trim()
    const ports = normalizePorts(options.ports ?? env.LOCAL_APP_PORT_CANDIDATES ?? env.LOCAL_APP_PORT, DEFAULT_PORTS)
    const timeoutMs = normalizeTimeout(options.timeoutMs ?? env.MAC_DEMO_TIMEOUT_MS, DEFAULT_TIMEOUT_MS)
    const fetchImpl = options.fetchImpl || globalThis.fetch

    const entry = await verifyEntryPage(entryUrl, fetchImpl, timeoutMs)
    const health = await verifyLocalHealth(ports, fetchImpl, timeoutMs)

    return {
        ok: entry.status === 'pass' && health.status === 'pass',
        entry,
        health,
        ports,
        timeoutMs
    }
}

export function formatMacDemoSmokeText(report) {
    const lines = [
        `macデモ実行確認: ${report.ok ? 'OK' : '要確認'}`,
        `entry: ${report.entry.status} - ${report.entry.message}`,
        `local health: ${report.health.status} - ${report.health.message}`
    ]

    if (report.health.port) {
        lines.push(`local health URL: http://127.0.0.1:${report.health.port}${LOCAL_HEALTH_PATH}`)
    }
    if (report.health.localStatus) {
        lines.push(`local app status: ${report.health.localStatus}`)
    }
    if (report.health.version) {
        lines.push(`local app version: ${report.health.version}`)
    }
    if (!report.ok) {
        lines.push('', '確認してください:')
        if (report.entry.status !== 'pass') {
            lines.push('- Vite dev server が起動しているか')
        }
        if (report.health.status !== 'pass') {
            lines.push('- local health server または Electron 開発版が起動しているか')
        }
    }

    return lines.join('\n')
}

async function verifyEntryPage(entryUrl, fetchImpl, timeoutMs) {
    try {
        const response = await fetchWithTimeout(fetchImpl, entryUrl, timeoutMs)
        if (!response.ok) {
            return {
                status: 'fail',
                url: entryUrl,
                message: `Entry page returned HTTP ${response.status}`
            }
        }
        const html = await response.text()
        if (!isViteAppShell(html)) {
            return {
                status: 'fail',
                url: entryUrl,
                message: 'Entry page did not return the Vite app shell'
            }
        }
        return {
            status: 'pass',
            url: entryUrl,
            message: `Entry page is available at ${entryUrl}`
        }
    } catch (error) {
        return {
            status: 'fail',
            url: entryUrl,
            message: `Entry page could not be reached: ${formatError(error)}`
        }
    }
}

async function verifyLocalHealth(ports, fetchImpl, timeoutMs) {
    for (const port of ports) {
        const url = `http://127.0.0.1:${port}${LOCAL_HEALTH_PATH}`
        try {
            const response = await fetchWithTimeout(fetchImpl, url, timeoutMs)
            if (!response.ok) continue
            const health = await response.json()
            if (!isLocalHealth(health)) continue
            return {
                status: 'pass',
                port,
                url,
                localStatus: health.status || 'ready',
                version: health.version,
                aiReady: health.ai_ready,
                dbReady: health.db_ready,
                message: `Local health API responded on 127.0.0.1:${port}`
            }
        } catch {
            // Try the next candidate port.
        }
    }

    return {
        status: 'fail',
        port: null,
        message: `Local health API did not respond on candidate ports: ${ports.join(', ')}`
    }
}

async function fetchWithTimeout(fetchImpl, url, timeoutMs) {
    const controller = new AbortController()
    const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs)
    try {
        return await fetchImpl(url, {
            method: 'GET',
            cache: 'no-store',
            signal: controller.signal
        })
    } finally {
        globalThis.clearTimeout(timeout)
    }
}

function isViteAppShell(html) {
    return /<div\s+id=["']root["']/.test(html)
}

function isLocalHealth(value) {
    if (!value || typeof value !== 'object') return false
    if (value.app && value.app !== 'pharmacy-report-local') return false
    if (value.status && !VALID_LOCAL_APP_STATUSES.has(value.status)) return false
    return Boolean(value.app || value.status || value.version)
}

function normalizePorts(value, fallback) {
    const rawValues = Array.isArray(value)
        ? value
        : String(value || '').split(',')
    const seen = new Set()
    const ports = []

    for (const rawValue of rawValues) {
        const port = Number.parseInt(String(rawValue).trim(), 10)
        if (!Number.isInteger(port) || port <= 0 || port > 65535 || seen.has(port)) continue
        seen.add(port)
        ports.push(port)
    }

    return ports.length ? ports : [...fallback]
}

function normalizeTimeout(value, fallback) {
    const timeoutMs = Number.parseInt(String(value ?? ''), 10)
    return Number.isInteger(timeoutMs) && timeoutMs > 0 ? timeoutMs : fallback
}

function formatError(error) {
    if (error?.name === 'AbortError') return 'timeout'
    return error instanceof Error ? error.message : String(error)
}

function parseArgs(argv) {
    const options = {}
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index]
        if (arg === '--entry-url') {
            options.entryUrl = argv[index + 1]
            index += 1
        } else if (arg === '--ports') {
            options.ports = argv[index + 1]
            index += 1
        } else if (arg === '--timeout-ms') {
            options.timeoutMs = argv[index + 1]
            index += 1
        } else if (arg === '--format') {
            options.format = argv[index + 1]
            index += 1
        }
    }
    return options
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    const options = parseArgs(process.argv.slice(2))
    const report = await verifyMacDemoRuntime(options)
    if (options.format === 'json') {
        console.log(JSON.stringify(report, null, 2))
    } else {
        console.log(formatMacDemoSmokeText(report))
    }
    if (!report.ok) process.exitCode = 1
}
