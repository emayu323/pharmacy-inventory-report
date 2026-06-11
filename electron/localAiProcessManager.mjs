import { spawn } from 'node:child_process'

export function createLocalAiProcessManager(options = {}) {
    const spawnImpl = options.spawnImpl || spawn
    const logger = options.logger || console
    const processes = new Map()

    const startFromSettings = (settings = {}) => {
        const definitions = buildAiProcessDefinitions(settings)

        for (const definition of definitions) {
            const existing = processes.get(definition.id)
            if (existing?.status === 'running' && !existing.child?.killed) continue

            const parsed = parseCommandLine(definition.commandLine)
            if (!parsed) continue

            try {
                const child = spawnImpl(parsed.command, parsed.args, {
                    detached: false,
                    shell: false,
                    stdio: 'ignore',
                    windowsHide: true
                })
                const entry = {
                    id: definition.id,
                    label: definition.label,
                    commandLine: definition.commandLine,
                    child,
                    pid: child.pid,
                    started_at: new Date().toISOString(),
                    status: 'running',
                    message: '起動しました'
                }
                processes.set(definition.id, entry)

                child.on?.('error', error => {
                    entry.status = 'error'
                    entry.message = error instanceof Error ? error.message : '起動に失敗しました'
                    logger.warn?.(`Local AI process ${definition.id} failed:`, error)
                })
                child.on?.('exit', (code, signal) => {
                    entry.status = 'exited'
                    entry.message = signal ? `終了しました: ${signal}` : `終了しました: ${code ?? 'unknown'}`
                })
                child.unref?.()
                logger.info?.(`Local AI process started: ${definition.id} pid=${child.pid ?? 'unknown'}`)
            } catch (error) {
                processes.set(definition.id, {
                    id: definition.id,
                    label: definition.label,
                    commandLine: definition.commandLine,
                    status: 'error',
                    message: error instanceof Error ? error.message : '起動に失敗しました'
                })
                logger.warn?.(`Local AI process ${definition.id} could not start:`, error)
            }
        }

        return getStatus(settings)
    }

    const stopAll = () => {
        for (const entry of processes.values()) {
            if (entry.status !== 'running' || !entry.child || entry.child.killed) continue
            try {
                entry.child.kill()
                entry.status = 'stopping'
                entry.message = '停止中です'
            } catch (error) {
                entry.status = 'error'
                entry.message = error instanceof Error ? error.message : '停止に失敗しました'
            }
        }
    }

    const getStatus = (settings = {}) => {
        const configured = buildAiProcessDefinitions(settings)
        const configuredIds = new Set(configured.map(definition => definition.id))
        const entries = [
            ...configured.map(definition => {
                const entry = processes.get(definition.id)
                return toProcessStatus(definition, entry)
            }),
            ...Array.from(processes.values())
                .filter(entry => !configuredIds.has(entry.id))
                .map(entry => toProcessStatus({
                    id: entry.id,
                    label: entry.label,
                    commandLine: entry.commandLine
                }, entry))
        ]

        return {
            enabled: Boolean(settings.ai_mode_enabled && settings.ai_auto_start_enabled),
            processes: entries
        }
    }

    return {
        startFromSettings,
        stopAll,
        getStatus
    }
}

export function buildAiProcessDefinitions(settings = {}) {
    if (!settings.ai_mode_enabled || !settings.ai_auto_start_enabled) return []

    return [
        {
            id: 'ollama',
            label: 'Ollama',
            commandLine: normalizeCommand(settings.ai_ollama_start_command)
        }
    ].filter(definition => definition.commandLine)
}

export function parseCommandLine(commandLine) {
    const tokens = tokenizeCommandLine(commandLine)
    if (tokens.length === 0) return null
    const [command, ...args] = tokens
    return {
        command,
        args
    }
}

function tokenizeCommandLine(commandLine) {
    const value = normalizeCommand(commandLine)
    if (!value) return []

    const tokens = []
    let current = ''
    let quote = ''
    let escaping = false

    for (const char of value) {
        if (escaping) {
            current += char
            escaping = false
            continue
        }
        if (char === '\\') {
            escaping = true
            continue
        }
        if (quote) {
            if (char === quote) {
                quote = ''
            } else {
                current += char
            }
            continue
        }
        if (char === '"' || char === "'") {
            quote = char
            continue
        }
        if (/\s/.test(char)) {
            if (current) {
                tokens.push(current)
                current = ''
            }
            continue
        }
        current += char
    }

    if (current) tokens.push(current)
    return tokens
}

function toProcessStatus(definition, entry) {
    return {
        id: definition.id,
        label: definition.label,
        commandLine: definition.commandLine,
        pid: entry?.pid,
        started_at: entry?.started_at,
        status: entry?.status || 'not_started',
        message: entry?.message || '未起動です'
    }
}

function normalizeCommand(value) {
    return typeof value === 'string' ? value.trim().replace(/\r?\n/g, ' ') : ''
}
