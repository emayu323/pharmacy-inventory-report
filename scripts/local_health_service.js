import http from 'node:http'

export const DEFAULT_LOCAL_HEALTH_PORT = 47831
export const DEFAULT_LOCAL_HEALTH_PORT_CANDIDATES = [47831, 47832, 47833]
export const LOCAL_HEALTH_PATH = '/api/local/health'

const DEFAULT_ALLOWED_ORIGINS = [
    /^https:\/\/[a-z0-9-]+\.vercel\.app$/i,
    /^http:\/\/127\.0\.0\.1:\d+$/i,
    /^http:\/\/localhost:\d+$/i
]

export function createLocalHealthServer(options = {}) {
    const config = normalizeOptions(options)

    const server = http.createServer((req, res) => {
        applyCors(req, res, config.allowedOrigins)

        if (req.method === 'OPTIONS') {
            res.writeHead(204)
            res.end()
            return
        }

        if (req.method === 'GET' && req.url?.split('?')[0] === LOCAL_HEALTH_PATH) {
            sendJson(res, 200, {
                app: 'pharmacy-report-local',
                status: config.status,
                version: config.version,
                latest_version: config.latestVersion,
                db_ready: config.dbReady,
                ai_ready: config.aiReady,
                app_url: config.appUrl,
                message: createMessage(config.status)
            })
            return
        }

        sendJson(res, 404, {
            error: 'not_found'
        })
    })

    return { server, config }
}

export function startLocalHealthServer(options = {}) {
    const baseConfig = normalizeOptions(options)
    const portCandidates = baseConfig.portCandidates.length ? baseConfig.portCandidates : [baseConfig.port]

    return new Promise((resolve, reject) => {
        const tryListen = (index) => {
            const port = portCandidates[index]
            const { server, config } = createLocalHealthServer({
                ...options,
                port,
                portCandidates: [port]
            })

            const handleError = (error) => {
                server.off('listening', handleListening)
                if (isPortConflictError(error) && index < portCandidates.length - 1) {
                    tryListen(index + 1)
                    return
                }
                reject(error)
            }

            const handleListening = () => {
                server.off('error', handleError)
                const address = server.address()
                if (address && typeof address === 'object') {
                    config.port = address.port
                }
                resolve({ server, config })
            }

            server.once('error', handleError)
            server.once('listening', handleListening)
            server.listen(config.port, '127.0.0.1')
        }

        tryListen(0)
    })
}

export function readHealthConfigFromEnv(env = process.env) {
    const status = env.LOCAL_APP_STATUS || 'ready'
    const version = env.LOCAL_APP_VERSION || '0.1.0-dev'
    const configuredPort = readPort(env.LOCAL_APP_PORT, DEFAULT_LOCAL_HEALTH_PORT)
    const configuredPortCandidates = readPortCandidates(env.LOCAL_APP_PORT_CANDIDATES)
    const portCandidates = configuredPortCandidates.length
        ? configuredPortCandidates
        : env.LOCAL_APP_PORT
            ? [configuredPort]
            : DEFAULT_LOCAL_HEALTH_PORT_CANDIDATES

    return {
        port: portCandidates[0] ?? configuredPort,
        portCandidates,
        status,
        version,
        latestVersion: env.LOCAL_APP_LATEST_VERSION || version,
        appUrl: env.LOCAL_APP_URL || 'http://127.0.0.1:5174/reports',
        aiReady: readBooleanEnv(env, 'LOCAL_APP_AI_READY', status !== 'ai_not_setup'),
        dbReady: readBooleanEnv(env, 'LOCAL_APP_DB_READY', status !== 'db_preparing'),
        allowedOrigins: readAllowedOriginsEnv(env)
    }
}

function normalizeOptions(options) {
    const envConfig = readHealthConfigFromEnv()
    const status = options.status || envConfig.status
    const version = options.version || envConfig.version
    const explicitPort = readPort(options.port, envConfig.port)
    const optionPortCandidates = Array.isArray(options.portCandidates)
        ? normalizePortCandidates(options.portCandidates)
        : null
    const portCandidates = optionPortCandidates
        ?? (options.port !== undefined ? [explicitPort] : envConfig.portCandidates)
    const normalizedPortCandidates = portCandidates.length ? portCandidates : [explicitPort]

    return {
        port: normalizedPortCandidates[0],
        portCandidates: normalizedPortCandidates,
        status,
        version,
        latestVersion: options.latestVersion || envConfig.latestVersion || version,
        appUrl: options.appUrl || envConfig.appUrl,
        aiReady: options.aiReady ?? envConfig.aiReady,
        dbReady: options.dbReady ?? envConfig.dbReady,
        allowedOrigins: createAllowedOrigins(options.allowedOrigins ?? envConfig.allowedOrigins)
    }
}

function applyCors(req, res, allowedOrigins) {
    const origin = req.headers.origin
    if (origin && isAllowedOrigin(origin, allowedOrigins)) {
        res.setHeader('Access-Control-Allow-Origin', origin)
        res.setHeader('Vary', 'Origin')
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    res.setHeader('Access-Control-Max-Age', '600')
}

function sendJson(res, statusCode, body) {
    res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
    })
    res.end(JSON.stringify(body))
}

function readBooleanEnv(env, name, defaultValue) {
    const value = env[name]
    if (!value) return defaultValue
    return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase())
}

function readPort(value, defaultValue) {
    const port = Number.parseInt(String(value ?? ''), 10)
    if (Number.isInteger(port) && port >= 0 && port <= 65535) return port
    return defaultValue
}

function readPortCandidates(value) {
    return normalizePortCandidates(String(value || '').split(','))
}

function normalizePortCandidates(values) {
    const seen = new Set()
    const ports = []
    for (const value of values) {
        const port = readPort(value, NaN)
        if (!Number.isInteger(port) || seen.has(port)) continue
        seen.add(port)
        ports.push(port)
    }
    return ports
}

function isPortConflictError(error) {
    return error?.code === 'EADDRINUSE' || error?.code === 'EACCES'
}

function readAllowedOriginsEnv(env) {
    return String(env.LOCAL_HEALTH_ALLOWED_ORIGINS || '')
        .split(',')
        .map(origin => normalizeExactOrigin(origin))
        .filter(Boolean)
}

function createAllowedOrigins(extraOrigins = []) {
    const exactOrigins = new Set()
    const originRules = [...DEFAULT_ALLOWED_ORIGINS]

    for (const origin of extraOrigins) {
        if (origin instanceof RegExp) {
            originRules.push(origin)
            continue
        }

        const exactOrigin = normalizeExactOrigin(origin)
        if (exactOrigin) exactOrigins.add(exactOrigin)
    }

    return {
        patterns: originRules,
        exact: exactOrigins
    }
}

function isAllowedOrigin(origin, allowedOrigins) {
    const exactOrigin = normalizeExactOrigin(origin)
    if (!exactOrigin) return false
    return allowedOrigins.exact.has(exactOrigin)
        || allowedOrigins.patterns.some(pattern => pattern.test(exactOrigin))
}

function normalizeExactOrigin(value) {
    if (!value || typeof value !== 'string') return ''
    try {
        const url = new URL(value.trim())
        if (!['http:', 'https:'].includes(url.protocol)) return ''
        return url.origin
    } catch {
        return ''
    }
}

function createMessage(currentStatus) {
    if (currentStatus === 'update_required') return 'ローカルアプリの更新が必要です'
    if (currentStatus === 'db_preparing') return 'ローカルDBを準備しています'
    if (currentStatus === 'ai_not_setup') return 'AIモードは未セットアップです'
    return 'ローカルアプリに接続できます'
}
