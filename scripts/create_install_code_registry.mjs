import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { verifyVercelProductionEnv } from './verify_vercel_production_env.mjs'

const DEFAULT_REGISTRY_PATH = 'output/install-code-registry.generated.json'
const DEFAULT_ENV_PATH = 'output/.env.production.local.generated'
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function createInstallCodeRegistry(options = {}) {
    const labels = normalizeLabels(options.labels)
    const maxDevices = normalizePositiveInteger(options.maxDevices, 1)
    const expiresAt = normalizeText(options.expiresAt)
    const installerUrl = normalizeText(options.installerUrl)
    const randomBytes = options.randomBytes || crypto.randomBytes
    const usedCodes = new Set()

    return {
        codes: labels.map(label => {
            const code = createUniqueInstallCode(usedCodes, randomBytes)
            return compactObject({
                code,
                label,
                expiresAt: expiresAt || undefined,
                maxDevices,
                usedDevicesCount: 0,
                installerUrl: installerUrl || undefined,
                disabled: false
            })
        })
    }
}

export function formatVercelEnvFile(registry, options = {}) {
    const installerUrl = normalizeText(options.installerUrl)
    const compactRegistryJson = JSON.stringify(registry)
    const lines = [
        `INSTALL_CODE_REGISTRY='${escapeSingleQuotedEnv(compactRegistryJson)}'`
    ]
    if (installerUrl) {
        lines.push(`WINDOWS_INSTALLER_URL='${escapeSingleQuotedEnv(installerUrl)}'`)
    }
    return `${lines.join('\n')}\n`
}

export function writeInstallCodeRegistryFiles(options = {}) {
    const registryPath = options.registryPath || DEFAULT_REGISTRY_PATH
    const envPath = options.envPath || DEFAULT_ENV_PATH
    const registry = createInstallCodeRegistry(options)
    const envFile = formatVercelEnvFile(registry, {
        installerUrl: options.installerUrl
    })
    const verification = options.installerUrl
        ? verifyVercelProductionEnv({
            INSTALL_CODE_REGISTRY: JSON.stringify(registry),
            WINDOWS_INSTALLER_URL: options.installerUrl
        })
        : null
    if (verification && !verification.ok) {
        throw new Error(`Generated env did not pass verification: ${verification.errors.join('; ')}`)
    }

    fs.mkdirSync(path.dirname(registryPath), { recursive: true })
    fs.mkdirSync(path.dirname(envPath), { recursive: true })
    fs.writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`)
    fs.writeFileSync(envPath, envFile)

    const firstCode = registry.codes[0]?.code || ''
    return {
        codeCount: registry.codes.length,
        registryPath,
        envPath,
        installCodePreview: firstCode ? `${firstCode.slice(0, 4)}-****` : '',
        verifierOk: verification?.ok ?? null
    }
}

function createUniqueInstallCode(usedCodes, randomBytes) {
    for (let attempts = 0; attempts < 100; attempts += 1) {
        const code = createInstallCode(randomBytes)
        if (!usedCodes.has(code)) {
            usedCodes.add(code)
            return code
        }
    }
    throw new Error('Could not create a unique install code')
}

function createInstallCode(randomBytes) {
    const bytes = randomBytes(8)
    const chars = Array.from(bytes, byte => CODE_ALPHABET[byte % CODE_ALPHABET.length])
    return `${chars.slice(0, 4).join('')}-${chars.slice(4, 8).join('')}`
}

function normalizeLabels(labels) {
    if (Array.isArray(labels)) {
        const normalized = labels.map(normalizeText).filter(Boolean)
        if (normalized.length > 0) return normalized
    }
    const label = normalizeText(labels)
    return [label || '導入先']
}

function normalizePositiveInteger(value, fallback) {
    const parsed = Number.parseInt(String(value ?? ''), 10)
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function normalizeText(value) {
    return typeof value === 'string' ? value.trim() : ''
}

function escapeSingleQuotedEnv(value) {
    return String(value).replaceAll("'", "'\\''")
}

function compactObject(value) {
    return Object.fromEntries(
        Object.entries(value).filter(([, child]) => child !== undefined && child !== '')
    )
}

function parseArgs(argv) {
    const options = {}
    const labels = []
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index]
        if (arg === '--label') {
            labels.push(argv[index + 1])
            index += 1
        } else if (arg === '--labels') {
            labels.push(...String(argv[index + 1] || '').split(','))
            index += 1
        } else if (arg === '--max-devices') {
            options.maxDevices = argv[index + 1]
            index += 1
        } else if (arg === '--expires-at') {
            options.expiresAt = argv[index + 1]
            index += 1
        } else if (arg === '--installer-url') {
            options.installerUrl = argv[index + 1]
            index += 1
        } else if (arg === '--registry-output') {
            options.registryPath = argv[index + 1]
            index += 1
        } else if (arg === '--env-output') {
            options.envPath = argv[index + 1]
            index += 1
        }
    }
    if (labels.length > 0) options.labels = labels
    return options
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
        const result = writeInstallCodeRegistryFiles(parseArgs(process.argv.slice(2)))
        console.log(JSON.stringify(result, null, 2))
    } catch (error) {
        console.error(error instanceof Error ? error.message : error)
        process.exitCode = 1
    }
}
