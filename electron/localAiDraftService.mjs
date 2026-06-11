import { createRuleBasedAiDraft } from '../src/aiDraft.ts'

const DEFAULT_OLLAMA_URL = 'http://127.0.0.1:11434'
const DEFAULT_TIMEOUT_MS = 30000

export async function createAiDraftFromTranscript(transcript, options = {}) {
    const normalizedTranscript = normalizeTranscript(transcript)
    if (!normalizedTranscript) {
        throw new Error('文字起こしが空です')
    }

    const config = normalizeDraftOptions(options)
    if (!config.ollamaModel) {
        return createRuleBasedAiDraft(normalizedTranscript)
    }

    try {
        return await createDraftWithOllama(normalizedTranscript, config)
    } catch (error) {
        console.warn('Ollama draft extraction failed, using rule-based draft:', error)
        return createRuleBasedAiDraft(normalizedTranscript)
    }
}

export async function createAiDraftFromAudio(audio, options = {}) {
    const config = normalizeDraftOptions(options)
    if (!config.whisperTranscribeUrl) {
        throw new Error('Whisper文字起こしURLが未設定です')
    }

    const transcript = await transcribeAudio(audio, config)
    return createAiDraftFromTranscript(transcript, {
        ...config,
        transcript
    })
}

export function normalizeDraftOptions(options = {}) {
    const env = options.env || process.env
    return {
        fetchImpl: options.fetchImpl || globalThis.fetch,
        timeoutMs: options.timeoutMs ?? readNumber(env.LOCAL_AI_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
        ollamaUrl: normalizeBaseUrl(options.ollamaUrl || env.LOCAL_OLLAMA_URL || DEFAULT_OLLAMA_URL),
        ollamaModel: options.ollamaModel || env.LOCAL_OLLAMA_MODEL || '',
        whisperTranscribeUrl: options.whisperTranscribeUrl || env.LOCAL_WHISPER_TRANSCRIBE_URL || '',
        whisperFieldName: options.whisperFieldName || env.LOCAL_WHISPER_FILE_FIELD || 'audio'
    }
}

async function transcribeAudio(audio, config) {
    const audioBytes = toUint8Array(audio)
    if (audioBytes.byteLength === 0) {
        throw new Error('録音データが空です')
    }

    const formData = new FormData()
    formData.append(
        config.whisperFieldName,
        new Blob([audioBytes], { type: 'audio/webm' }),
        'recording.webm'
    )

    const response = await fetchWithTimeout(config.whisperTranscribeUrl, {
        method: 'POST',
        body: formData
    }, config)
    if (!response.ok) {
        throw new Error('ローカル文字起こしに失敗しました')
    }

    const data = await response.json()
    const transcript = typeof data?.text === 'string'
        ? data.text
        : typeof data?.transcript === 'string'
            ? data.transcript
            : ''

    if (!transcript.trim()) {
        throw new Error('文字起こし結果が空です')
    }
    return transcript
}

async function createDraftWithOllama(transcript, config) {
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
                    content: 'あなたは在宅薬剤師の報告書作成補助です。文字起こしから主訴等と服薬指導内容だけを抽出し、JSONで返してください。副作用、残薬、服薬状況は自動確定しません。'
                },
                {
                    role: 'user',
                    content: `次の文字起こしからJSON {"chief_complaint":"","medication_instruction":""} を返してください。\n${transcript}`
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
        chief_complaint: normalizeTranscript(parsed.chief_complaint),
        medication_instruction: normalizeTranscript(parsed.medication_instruction),
        transcript,
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

function toUint8Array(value) {
    if (value instanceof Uint8Array) return value
    if (value instanceof ArrayBuffer) return new Uint8Array(value)
    if (Array.isArray(value)) return Uint8Array.from(value)
    return new Uint8Array()
}

function normalizeTranscript(value) {
    return typeof value === 'string' ? value.replace(/\r\n/g, '\n').trim() : ''
}

function normalizeBaseUrl(value) {
    return String(value).trim().replace(/\/+$/, '')
}

function readNumber(value, fallback) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
}
