import { statfs } from 'node:fs/promises'
import os from 'node:os'

const DEFAULT_OLLAMA_URL = 'http://127.0.0.1:11434'
const DEFAULT_TIMEOUT_MS = 1200

export async function getLocalAiEnvironmentStatus(options = {}) {
    const config = normalizeAiEnvironmentOptions(options)
    const [ollama, disk] = await Promise.all([
        probeOllama(config),
        getDiskStatus(config)
    ])

    return {
        ready: ollama.status === 'ready' && disk.status !== 'low_space',
        ollama,
        disk,
        performance: getPerformanceStatus(),
        estimate: createProcessingEstimate()
    }
}

export function normalizeAiEnvironmentOptions(options = {}) {
    const env = options.env || process.env
    return {
        fetchImpl: options.fetchImpl || globalThis.fetch,
        timeoutMs: options.timeoutMs ?? readNumber(env.LOCAL_AI_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
        ollamaUrl: normalizeBaseUrl(options.ollamaUrl || env.LOCAL_OLLAMA_URL || DEFAULT_OLLAMA_URL),
        ollamaModel: options.ollamaModel || env.LOCAL_OLLAMA_MODEL || '',
        requiredFreeBytes: readNumber(options.requiredFreeBytes ?? env.LOCAL_AI_REQUIRED_FREE_BYTES, 0),
        diskPath: options.diskPath || env.LOCAL_AI_DISK_PATH || os.homedir(),
        statfsImpl: options.statfsImpl || statfs
    }
}

async function probeOllama(config) {
    const url = `${config.ollamaUrl}/api/tags`
    const response = await fetchJson(url, config)
    if (!response.ok) {
        return {
            status: response.error === 'timeout' ? 'not_running' : 'error',
            url: config.ollamaUrl,
            requiredModel: config.ollamaModel || undefined,
            installedModels: [],
            message: 'Ollamaに接続できません'
        }
    }

    const installedModels = Array.isArray(response.data?.models)
        ? response.data.models
            .map(model => typeof model?.name === 'string' ? model.name : '')
            .filter(Boolean)
        : []

    if (config.ollamaModel && !installedModels.includes(config.ollamaModel)) {
        return {
            status: 'model_missing',
            url: config.ollamaUrl,
            requiredModel: config.ollamaModel,
            installedModels,
            message: 'Ollamaモデルが未ダウンロードです'
        }
    }

    return {
        status: 'ready',
        url: config.ollamaUrl,
        requiredModel: config.ollamaModel || undefined,
        installedModels,
        message: 'Ollamaに接続できます'
    }
}

async function fetchJson(url, config) {
    if (!config.fetchImpl) {
        return { ok: false, error: 'fetch_unavailable' }
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs)

    try {
        const response = await config.fetchImpl(url, {
            method: 'GET',
            signal: controller.signal
        })
        if (!response.ok) return { ok: false, error: 'bad_status' }

        const contentType = response.headers?.get?.('content-type') || ''
        if (!contentType.includes('application/json')) {
            return { ok: true, data: {} }
        }

        return {
            ok: true,
            data: await response.json()
        }
    } catch (error) {
        return {
            ok: false,
            error: error?.name === 'AbortError' ? 'timeout' : 'network'
        }
    } finally {
        clearTimeout(timeout)
    }
}

async function getDiskStatus(config) {
    try {
        const stats = await config.statfsImpl(config.diskPath)
        const freeBytes = toSafeNumber(stats.bavail) * toSafeNumber(stats.bsize)
        const hasRequirement = config.requiredFreeBytes > 0
        const status = !hasRequirement || freeBytes >= config.requiredFreeBytes ? 'ready' : 'low_space'
        return {
            status,
            path: config.diskPath,
            freeBytes,
            requiredFreeBytes: hasRequirement ? config.requiredFreeBytes : undefined,
            message: createDiskStatusMessage(status, freeBytes, config.requiredFreeBytes)
        }
    } catch {
        return {
            status: 'unknown',
            path: config.diskPath,
            requiredFreeBytes: config.requiredFreeBytes > 0 ? config.requiredFreeBytes : undefined,
            message: '空き容量を確認できませんでした'
        }
    }
}

function getPerformanceStatus() {
    const cpuCount = os.cpus()?.length || 1
    return {
        cpuCount,
        gpu: 'unknown',
        message: cpuCount >= 8
            ? 'CPU処理は中程度以上の見込みです'
            : 'CPU処理のため、下書き作成に時間がかかる可能性があります'
    }
}

function createProcessingEstimate() {
    return {
        basis: 'ollama_text_only',
        message: '訪問メモから下書きを作成します。長いメモでは処理に時間がかかる場合があります'
    }
}

function normalizeBaseUrl(value) {
    return String(value).trim().replace(/\/+$/, '')
}

function readNumber(value, fallback) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
}

function toSafeNumber(value) {
    const numberValue = typeof value === 'bigint' ? Number(value) : Number(value)
    return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : 0
}

function formatBytes(value) {
    if (!Number.isFinite(value) || value <= 0) return '0GB'
    const gib = value / (1024 ** 3)
    if (gib >= 1) return `${gib.toFixed(1)}GB`
    const mib = value / (1024 ** 2)
    return `${Math.max(1, Math.round(mib))}MB`
}

function createDiskStatusMessage(status, freeBytes, requiredFreeBytes) {
    if (requiredFreeBytes <= 0) {
        return `空き容量を確認しました（${formatBytes(freeBytes)}）`
    }
    if (status === 'ready') {
        return `空き容量は十分です（${formatBytes(freeBytes)}）`
    }
    return `空き容量が不足しています（必要 ${formatBytes(requiredFreeBytes)} / 空き ${formatBytes(freeBytes)}）`
}
