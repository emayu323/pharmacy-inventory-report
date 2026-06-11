import { createRuleBasedAiDraft } from '../src/aiDraft.ts'

const DEFAULT_OLLAMA_URL = 'http://127.0.0.1:11434'
const DEFAULT_TIMEOUT_MS = 30000

export async function createAiDraftFromVisitMemo(visitMemo, options = {}) {
    const normalizedVisitMemo = normalizeVisitMemo(visitMemo)
    if (!normalizedVisitMemo) {
        throw new Error('訪問メモが空です')
    }

    const config = normalizeDraftOptions(options)
    if (!config.ollamaModel) {
        return createRuleBasedAiDraft(normalizedVisitMemo)
    }

    try {
        return await createDraftWithOllama(normalizedVisitMemo, config)
    } catch (error) {
        console.warn('Ollama draft extraction failed, using rule-based draft:', error)
        return createRuleBasedAiDraft(normalizedVisitMemo)
    }
}

export function normalizeDraftOptions(options = {}) {
    const env = options.env || process.env
    return {
        fetchImpl: options.fetchImpl || globalThis.fetch,
        timeoutMs: options.timeoutMs ?? readNumber(env.LOCAL_AI_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
        ollamaUrl: normalizeBaseUrl(options.ollamaUrl || env.LOCAL_OLLAMA_URL || DEFAULT_OLLAMA_URL),
        ollamaModel: options.ollamaModel || env.LOCAL_OLLAMA_MODEL || ''
    }
}

async function createDraftWithOllama(visitMemo, config) {
    const response = await fetchWithTimeout(`${config.ollamaUrl}/api/chat`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: config.ollamaModel,
            stream: false,
            format: 'json',
            messages: [
                {
                    role: 'system',
                    content: 'あなたは在宅薬剤師の報告書作成補助です。訪問メモから主訴等と服薬指導内容だけを抽出し、JSONで返してください。副作用、残薬、服薬状況は自動確定しません。'
                },
                {
                    role: 'user',
                    content: `次の訪問メモからJSON {"chief_complaint":"","medication_instruction":""} を返してください。\n${visitMemo}`
                }
            ]
        })
    }, config)
    if (!response.ok) {
        throw new Error('ローカルLLMへの接続に失敗しました')
    }

    const data = await response.json()
    const parsed = parseOllamaJson(data?.message?.content)
    return {
        chief_complaint: normalizeVisitMemo(parsed.chief_complaint),
        medication_instruction: normalizeVisitMemo(parsed.medication_instruction),
        visitMemo,
        source: 'local_llm'
    }
}

async function fetchWithTimeout(url, init, config) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs)

    try {
        return await config.fetchImpl(url, {
            ...init,
            signal: controller.signal
        })
    } finally {
        clearTimeout(timeout)
    }
}

function parseOllamaJson(content) {
    if (typeof content !== 'string') return {}
    try {
        const parsed = JSON.parse(content)
        return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
        return {}
    }
}

function normalizeVisitMemo(value) {
    return typeof value === 'string' ? value.replace(/\r\n/g, '\n').trim() : ''
}

function normalizeBaseUrl(value) {
    return String(value).trim().replace(/\/+$/, '')
}

function readNumber(value, fallback) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
}
