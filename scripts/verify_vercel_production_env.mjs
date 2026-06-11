import fs from 'node:fs'

const REQUIRED_ENV = [
    'INSTALL_CODE_REGISTRY',
    'WINDOWS_INSTALLER_URL'
]

const OPTIONAL_SUPABASE_ENV = [
    'INSTALL_CODE_USAGE_SUPABASE_URL',
    'INSTALL_CODE_USAGE_SUPABASE_SERVICE_ROLE_KEY',
    'INSTALL_CODE_USAGE_TABLE'
]

export function verifyVercelProductionEnv(env = process.env, options = {}) {
    const errors = []
    const warnings = []

    for (const name of REQUIRED_ENV) {
        if (!normalizeText(env[name])) {
            errors.push(`${name} is required`)
        }
    }

    const installerUrl = normalizeText(env.WINDOWS_INSTALLER_URL)
    if (installerUrl && !isHttpsUrl(installerUrl)) {
        errors.push('WINDOWS_INSTALLER_URL must be an https URL')
    } else if (installerUrl && !isWindowsInstallerUrl(installerUrl)) {
        errors.push('WINDOWS_INSTALLER_URL must point to a .exe installer file')
    }

    const registryResult = parseInstallCodeRegistry(env.INSTALL_CODE_REGISTRY, {
        now: options.now ?? new Date()
    })
    errors.push(...registryResult.errors)
    warnings.push(...registryResult.warnings)

    const supabaseResult = validateSupabaseUsageEnv(env)
    errors.push(...supabaseResult.errors)
    warnings.push(...supabaseResult.warnings)

    return {
        ok: errors.length === 0,
        errors,
        warnings,
        summary: {
            installCodeCount: registryResult.records.length,
            enabledInstallCodeCount: registryResult.records.filter(record => !record.disabled).length,
            hasDefaultInstallerUrl: Boolean(installerUrl),
            hasSupabaseUsageStore: supabaseResult.enabled,
            hasSupabaseServiceRoleKey: Boolean(normalizeText(env.INSTALL_CODE_USAGE_SUPABASE_SERVICE_ROLE_KEY)),
            supabaseUsageTable: normalizeText(env.INSTALL_CODE_USAGE_TABLE) || 'install_code_devices'
        }
    }
}

export function readEnvFile(filePath) {
    const env = {}
    const raw = fs.readFileSync(filePath, 'utf8')
    for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) continue
        const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
        if (!match) continue
        env[match[1]] = unquoteEnvValue(match[2])
    }
    return env
}

function parseInstallCodeRegistry(raw, options = {}) {
    const source = normalizeText(raw)
    const errors = []
    const warnings = []
    if (!source) {
        return {
            records: [],
            errors: ['INSTALL_CODE_REGISTRY is required'],
            warnings
        }
    }

    let parsed
    try {
        parsed = JSON.parse(source)
    } catch {
        return {
            records: [],
            errors: ['INSTALL_CODE_REGISTRY must be valid JSON for production'],
            warnings
        }
    }

    const records = Array.isArray(parsed)
        ? parsed
        : isObject(parsed) && Array.isArray(parsed.codes)
            ? parsed.codes
            : []
    if (records.length === 0) {
        errors.push('INSTALL_CODE_REGISTRY must include at least one code')
    }

    const normalizedCodes = new Set()
    const normalizedRecords = []
    records.forEach((record, index) => {
        const prefix = `INSTALL_CODE_REGISTRY.codes[${index}]`
        if (!isObject(record)) {
            errors.push(`${prefix} must be an object`)
            return
        }

        const code = normalizeInstallCode(record.code)
        const codeLabel = prefix
        if (code.length < 4) {
            errors.push(`${prefix}.code is required`)
        } else if (normalizedCodes.has(code)) {
            errors.push(`${prefix}.code is duplicated`)
        } else {
            normalizedCodes.add(code)
        }

        const disabled = record.disabled === true
        if (record.expiresAt !== undefined && !isValidExpiry(record.expiresAt)) {
            errors.push(`${prefix}.expiresAt must be a valid date or datetime`)
        } else if (!disabled && record.expiresAt !== undefined && isExpired(record.expiresAt, options.now ?? new Date())) {
            errors.push(`${prefix}.expiresAt is expired`)
        }
        if (!disabled && record.maxDevices === undefined) {
            errors.push(`${codeLabel}.maxDevices is required for production install codes`)
        } else if (record.maxDevices !== undefined && !isPositiveInteger(record.maxDevices)) {
            errors.push(`${prefix}.maxDevices must be a positive integer`)
        }
        if (record.usedDevicesCount !== undefined && !isNonNegativeInteger(record.usedDevicesCount)) {
            errors.push(`${prefix}.usedDevicesCount must be a non-negative integer`)
        }
        if (
            isPositiveInteger(record.maxDevices)
            && isNonNegativeInteger(record.usedDevicesCount)
            && record.usedDevicesCount > record.maxDevices
        ) {
            errors.push(`${prefix}.usedDevicesCount must not exceed maxDevices`)
        }
        if (record.usedDevices !== undefined && !Array.isArray(record.usedDevices)) {
            errors.push(`${prefix}.usedDevices must be an array`)
        } else if (
            Array.isArray(record.usedDevices)
            && isPositiveInteger(record.maxDevices)
            && record.usedDevices.length > record.maxDevices
        ) {
            errors.push(`${prefix}.usedDevices must not exceed maxDevices`)
        }
        const recordInstallerUrl = normalizeText(record.installerUrl)
        if (record.installerUrl !== undefined && recordInstallerUrl && !isHttpsUrl(recordInstallerUrl)) {
            errors.push(`${prefix}.installerUrl must be an https URL`)
        } else if (record.installerUrl !== undefined && recordInstallerUrl && !isWindowsInstallerUrl(recordInstallerUrl)) {
            errors.push(`${prefix}.installerUrl must point to a .exe installer file`)
        }
        if (disabled) {
            warnings.push(`${prefix}.disabled is true`)
        }

        normalizedRecords.push({
            code,
            disabled
        })
    })

    if (normalizedRecords.length > 0 && normalizedRecords.every(record => record.disabled)) {
        errors.push('INSTALL_CODE_REGISTRY must include at least one enabled install code')
    }

    return {
        records: normalizedRecords,
        errors,
        warnings
    }
}

function validateSupabaseUsageEnv(env) {
    const values = Object.fromEntries(
        OPTIONAL_SUPABASE_ENV.map(name => [name, normalizeText(env[name])])
    )
    const enabled = Object.values(values).some(Boolean)
    if (!enabled) {
        return {
            enabled: false,
            errors: [],
            warnings: ['Supabase usage store is not configured; usedDevicesCount must be managed manually']
        }
    }

    const errors = []
    if (!values.INSTALL_CODE_USAGE_SUPABASE_URL) {
        errors.push('INSTALL_CODE_USAGE_SUPABASE_URL is required when Supabase usage store is configured')
    } else if (!isHttpsUrl(values.INSTALL_CODE_USAGE_SUPABASE_URL)) {
        errors.push('INSTALL_CODE_USAGE_SUPABASE_URL must be an https URL')
    }
    if (!values.INSTALL_CODE_USAGE_SUPABASE_SERVICE_ROLE_KEY) {
        errors.push('INSTALL_CODE_USAGE_SUPABASE_SERVICE_ROLE_KEY is required when Supabase usage store is configured')
    }
    if (
        values.INSTALL_CODE_USAGE_TABLE
        && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(values.INSTALL_CODE_USAGE_TABLE)
    ) {
        errors.push('INSTALL_CODE_USAGE_TABLE must be a simple table name')
    }

    return {
        enabled: true,
        errors,
        warnings: []
    }
}

function normalizeText(value) {
    return typeof value === 'string' ? value.trim() : ''
}

function normalizeInstallCode(value) {
    return normalizeText(value).toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function isHttpsUrl(value) {
    try {
        const parsed = new URL(normalizeText(value))
        return parsed.protocol === 'https:'
    } catch {
        return false
    }
}

function isWindowsInstallerUrl(value) {
    try {
        const parsed = new URL(normalizeText(value))
        return parsed.pathname.toLowerCase().endsWith('.exe')
    } catch {
        return false
    }
}

function isValidExpiry(value) {
    const text = normalizeText(value)
    if (!text) return false
    return typeof parseExpiryTime(text) === 'number'
}

function isExpired(value, now) {
    const expiryTime = parseExpiryTime(value)
    return typeof expiryTime === 'number' && now.getTime() > expiryTime
}

function parseExpiryTime(value) {
    const text = normalizeText(value)
    if (!text) return undefined
    const parsed = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T23:59:59.999Z` : text)
    return Number.isNaN(parsed) ? undefined : parsed
}

function isPositiveInteger(value) {
    return Number.isInteger(value) && value > 0
}

function isNonNegativeInteger(value) {
    return Number.isInteger(value) && value >= 0
}

function isObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function unquoteEnvValue(value) {
    const trimmed = value.trim()
    if (
        (trimmed.startsWith('"') && trimmed.endsWith('"'))
        || (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ) {
        return trimmed.slice(1, -1)
    }
    return trimmed
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
    const envFileIndex = process.argv.indexOf('--env-file')
    const env = envFileIndex >= 0
        ? readEnvFile(process.argv[envFileIndex + 1])
        : process.env
    const result = verifyVercelProductionEnv(env)
    console.log(JSON.stringify(result, null, 2))
    if (!result.ok) {
        process.exitCode = 1
    }
}
