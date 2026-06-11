import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { pathToFileURL } from 'node:url'

const REQUIRED_PRODUCTION_ENV = [
    'INSTALL_CODE_REGISTRY',
    'WINDOWS_INSTALLER_URL'
]

const STALE_APP_ENV = [
    'VITE_SUPABASE_URL',
    'VITE_SUPABASE_ANON_KEY'
]

export function parseVercelEnvListJson(output) {
    const source = String(output || '')
    const start = source.indexOf('{')
    const end = source.lastIndexOf('}')
    if (start < 0 || end < start) {
        throw new Error('Vercel env JSON payload was not found')
    }
    return JSON.parse(source.slice(start, end + 1))
}

export function createVercelCloudEnvStatus(input, options = {}) {
    const environment = options.environment || 'production'
    try {
        const data = typeof input === 'string' ? parseVercelEnvListJson(input) : input
        const envs = Array.isArray(data?.envs) ? data.envs : []
        const keys = new Set(envs.map(env => String(env?.key || '').trim()).filter(Boolean))
        const presentRequired = REQUIRED_PRODUCTION_ENV.filter(name => keys.has(name))
        const missingRequired = REQUIRED_PRODUCTION_ENV.filter(name => !keys.has(name))
        const staleAppEnv = STALE_APP_ENV.filter(name => keys.has(name))
        const ready = missingRequired.length === 0 && staleAppEnv.length === 0

        return {
            ok: true,
            ready,
            environment,
            envCount: envs.length,
            presentRequired,
            missingRequired,
            staleAppEnv,
            nextActions: createNextActions(missingRequired, staleAppEnv),
            message: ready
                ? `Vercel ${environment} env has required install-code variables and no stale app Supabase variables`
                : `Vercel ${environment} env is not ready: ${[
                    missingRequired.length ? `missing ${missingRequired.join(', ')}` : '',
                    staleAppEnv.length ? `remove stale ${staleAppEnv.join(', ')}` : ''
                ].filter(Boolean).join('; ')}`
        }
    } catch (error) {
        return {
            ok: false,
            ready: false,
            environment,
            envCount: 0,
            presentRequired: [],
            missingRequired: REQUIRED_PRODUCTION_ENV,
            staleAppEnv: [],
            nextActions: [
                `vercel env ls ${environment} --format json`
            ],
            message: error instanceof Error ? error.message : 'Vercel env JSON could not be parsed'
        }
    }
}

export function formatVercelCloudEnvStatusText(status) {
    const state = status.ready ? '完了' : status.ok ? '未完了' : '要修正'
    const lines = [
        `Vercel cloud env判定: ${state}`,
        `ok: ${status.ok}`,
        `ready: ${status.ready}`,
        `environment: ${status.environment}`,
        `env count: ${status.envCount}`,
        `required present: ${status.presentRequired.join(', ') || 'none'}`,
        `missing required: ${status.missingRequired.join(', ') || 'none'}`,
        `stale app env: ${status.staleAppEnv.join(', ') || 'none'}`,
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

export function readVercelCloudEnvStatus(options = {}) {
    const environment = options.environment || 'production'
    try {
        return createVercelCloudEnvStatus(readCloudEnvOutput({ ...options, environment }), {
            environment
        })
    } catch (error) {
        const status = createVercelCloudEnvStatus('', { environment })
        return {
            ...status,
            message: error instanceof Error ? error.message : status.message
        }
    }
}

function createNextActions(missingRequired, staleAppEnv) {
    return [
        ...staleAppEnv.map(name => `vercel env rm ${name} production`),
        ...missingRequired.map(name => `vercel env add ${name} production`)
    ]
}

function readCloudEnvOutput(options) {
    if (options.jsonFile) {
        return fs.readFileSync(options.jsonFile, 'utf8')
    }

    const result = spawnSync('vercel', ['env', 'ls', options.environment, '--format', 'json'], {
        cwd: process.cwd(),
        encoding: 'utf8'
    })
    const combinedOutput = `${result.stdout || ''}\n${result.stderr || ''}`
    if (result.error) throw result.error
    if (result.status !== 0 && !combinedOutput.includes('{')) {
        throw new Error(combinedOutput.trim() || `vercel env ls exited with ${result.status}`)
    }
    return combinedOutput
}

function parseArgs(argv) {
    const options = {
        environment: 'production',
        format: 'text'
    }
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index]
        if (arg === '--json-file') {
            options.jsonFile = argv[index + 1]
            index += 1
        } else if (arg === '--environment') {
            options.environment = argv[index + 1]
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
    const status = readVercelCloudEnvStatus(options)
    console.log(options.format === 'json' ? JSON.stringify(status, null, 2) : formatVercelCloudEnvStatusText(status))
    if (!status.ok) {
        process.exitCode = 1
    }
}
