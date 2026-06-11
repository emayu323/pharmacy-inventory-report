import { pathToFileURL } from 'node:url'

const DEFAULT_BASE_URL = 'https://pharmacy-inventory-report.vercel.app'

export async function runVercelProductionSmoke(options = {}) {
    const baseUrl = normalizeBaseUrl(options.baseUrl || DEFAULT_BASE_URL)
    const fetchImpl = options.fetchImpl || fetch

    try {
        const entry = await checkEntryPage(fetchImpl, baseUrl)
        const installCodeApi = await checkInstallCodeApi(fetchImpl, baseUrl)
        const ready = entry.status === 'pass' && installCodeApi.status === 'pass'
        return {
            ok: true,
            ready,
            baseUrl,
            entry,
            installCodeApi,
            nextActions: ready ? [] : createNextActions(baseUrl),
            message: ready
                ? 'Vercel production entry and install-code API smoke checks passed'
                : 'Vercel production smoke checks did not pass'
        }
    } catch (error) {
        return {
            ok: false,
            ready: false,
            baseUrl,
            entry: createSkippedCheck('entry page was not checked'),
            installCodeApi: createSkippedCheck('install-code API was not checked'),
            nextActions: createNextActions(baseUrl),
            message: error instanceof Error ? error.message : 'Vercel production smoke check failed'
        }
    }
}

export function formatVercelProductionSmokeText(status) {
    const state = status.ready ? '完了' : status.ok ? '未完了' : '要修正'
    const lines = [
        `Vercel production smoke判定: ${state}`,
        `ok: ${status.ok}`,
        `ready: ${status.ready}`,
        `base URL: ${status.baseUrl}`,
        `entry: ${formatCheck(status.entry)}`,
        `install-code API: ${formatCheck(status.installCodeApi)}`,
        `message: ${status.message}`
    ]

    if (status.nextActions.length > 0) {
        lines.push('', '次の作業:')
        status.nextActions.forEach((action, index) => {
            lines.push(`${index + 1}. ${action}`)
        })
    } else {
        lines.push('', '次の作業: なし')
    }

    return lines.join('\n')
}

async function checkEntryPage(fetchImpl, baseUrl) {
    const url = new URL('/entry', baseUrl)
    const response = await fetchImpl(url)
    if (!response?.ok) {
        return {
            status: 'fail',
            statusCode: response?.status || 0,
            message: `GET /entry returned ${response?.status || 'no response'}`
        }
    }

    return {
        status: 'pass',
        statusCode: response.status,
        message: 'GET /entry returned a successful response'
    }
}

async function checkInstallCodeApi(fetchImpl, baseUrl) {
    const url = new URL('/api/install-code/verify', baseUrl)
    const response = await fetchImpl(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            code: 'INVALID-0000',
            deviceId: 'release-smoke-0001'
        })
    })
    let body = {}
    try {
        body = await response.json()
    } catch {
        body = {}
    }
    const status = body?.status

    if (response.status !== 400 || status !== 'invalid') {
        return {
            status: 'fail',
            statusCode: response.status,
            message: `POST /api/install-code/verify returned ${response.status} ${status || 'unknown'}`
        }
    }

    return {
        status: 'pass',
        statusCode: response.status,
        message: 'POST /api/install-code/verify rejects invalid codes without a server error'
    }
}

function normalizeBaseUrl(value) {
    try {
        const url = new URL(String(value || DEFAULT_BASE_URL))
        url.pathname = '/'
        url.search = ''
        url.hash = ''
        return url.href.replace(/\/$/, '')
    } catch {
        return DEFAULT_BASE_URL
    }
}

function createSkippedCheck(message) {
    return {
        status: 'fail',
        statusCode: 0,
        message
    }
}

function createNextActions(baseUrl) {
    return [
        'npm run release:vercel-smoke',
        `vercel logs ${baseUrl} --since 10m --expand --level error`
    ]
}

function formatCheck(check) {
    return `${check.status} (${check.statusCode}) ${check.message}`
}

function parseArgs(argv) {
    const options = {
        baseUrl: DEFAULT_BASE_URL,
        format: 'text'
    }
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index]
        if (arg === '--url') {
            options.baseUrl = argv[index + 1]
            index += 1
        } else if (arg === '--format') {
            options.format = argv[index + 1]
            index += 1
        }
    }
    return options
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const options = parseArgs(process.argv.slice(2))
    const status = await runVercelProductionSmoke(options)
    console.log(options.format === 'json' ? JSON.stringify(status, null, 2) : formatVercelProductionSmokeText(status))
    if (!status.ok || !status.ready) {
        process.exitCode = 1
    }
}
