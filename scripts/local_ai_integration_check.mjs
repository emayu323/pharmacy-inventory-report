import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import {
    createAiDraftFromAudio,
    createAiDraftFromTranscript
} from '../electron/localAiDraftService.mjs'
import { getLocalAiEnvironmentStatus } from '../electron/localAiEnvironment.mjs'

const require = createRequire(import.meta.url)
const packageJson = require('../package.json')
const DEFAULT_TRANSCRIPT = '主訴等: 眠気の訴えあり。\n服薬指導内容: 主治医へ相談するよう説明。'

export async function runLocalAiIntegrationCheck(options = {}) {
    const env = options.env || process.env
    const config = buildIntegrationConfig(env, options)
    if (!config.enabled) {
        return {
            skipped: true,
            reason: '--run または LOCAL_AI_INTEGRATION=1 を指定した時だけ実サーバー結合テストを実行します'
        }
    }
    if (!config.ollamaModel) {
        throw new Error('LOCAL_OLLAMA_MODEL または --ollama-model でOllamaモデルを指定してください')
    }

    const serviceOptions = {
        env,
        fetchImpl: options.fetchImpl || globalThis.fetch,
        timeoutMs: config.timeoutMs,
        ollamaUrl: config.ollamaUrl,
        ollamaModel: config.ollamaModel,
        whisperHealthUrl: config.whisperHealthUrl,
        whisperTranscribeUrl: config.whisperTranscribeUrl,
        whisperFieldName: config.whisperFieldName
    }

    const status = await getLocalAiEnvironmentStatus(serviceOptions)
    if (status.ollama.status !== 'ready') {
        throw new Error(`Ollamaが利用できません: ${status.ollama.message}`)
    }
    if (config.requireWhisperHealth && status.whisper.status !== 'ready') {
        throw new Error(`Whisperが利用できません: ${status.whisper.message}`)
    }

    const draft = await createAiDraftFromTranscript(config.transcript, serviceOptions)
    if (config.ollamaModel && draft.source !== 'local_llm') {
        throw new Error('Ollama経由の下書き作成を確認できませんでした')
    }

    let audioDraft
    if (config.audioPath) {
        if (!config.whisperTranscribeUrl) {
            throw new Error('--audio-path を使う場合は --whisper-transcribe-url が必要です')
        }
        const audioBytes = fs.readFileSync(config.audioPath)
        audioDraft = await createAiDraftFromAudio(audioBytes, serviceOptions)
        if (config.ollamaModel && audioDraft.source !== 'local_llm') {
            throw new Error('Whisper文字起こし後のOllama下書き作成を確認できませんでした')
        }
    }

    const result = {
        skipped: false,
        status,
        draft,
        audioDraft,
        audioPath: config.audioPath || undefined
    }
    if (config.resultPath) {
        writeIntegrationReceipt(config.resultPath, result, {
            createdAt: (typeof options.now === 'function' ? options.now() : new Date()).toISOString()
        })
        result.receiptPath = config.resultPath
    }
    return result
}

export function buildIntegrationConfig(env = process.env, options = {}) {
    const enabled = readBoolean(options.enabled ?? env.LOCAL_AI_INTEGRATION)
    return {
        enabled,
        timeoutMs: readNumber(options.timeoutMs ?? env.LOCAL_AI_TIMEOUT_MS, 30000),
        ollamaUrl: String(options.ollamaUrl || env.LOCAL_OLLAMA_URL || 'http://127.0.0.1:11434').trim(),
        ollamaModel: String(options.ollamaModel || env.LOCAL_OLLAMA_MODEL || '').trim(),
        whisperHealthUrl: String(options.whisperHealthUrl || env.LOCAL_WHISPER_HEALTH_URL || env.LOCAL_WHISPER_URL || '').trim(),
        whisperTranscribeUrl: String(options.whisperTranscribeUrl || env.LOCAL_WHISPER_TRANSCRIBE_URL || '').trim(),
        whisperFieldName: String(options.whisperFieldName || env.LOCAL_WHISPER_FILE_FIELD || 'audio').trim(),
        transcript: String(options.transcript || env.LOCAL_AI_TEST_TRANSCRIPT || DEFAULT_TRANSCRIPT).trim(),
        audioPath: String(options.audioPath || env.LOCAL_AI_TEST_AUDIO_PATH || '').trim(),
        resultPath: String(options.resultPath || env.LOCAL_AI_INTEGRATION_RESULT_PATH || '').trim(),
        requireWhisperHealth: options.requireWhisperHealth ?? readBoolean(env.LOCAL_AI_REQUIRE_WHISPER_HEALTH ?? '1')
    }
}

export function parseLocalAiIntegrationArgs(argv = []) {
    const options = {}
    const args = Array.from(argv)

    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index]
        const [name, inlineValue] = splitArg(arg)
        const readValue = () => inlineValue ?? args[++index] ?? ''

        if (name === '--run') {
            options.enabled = true
        } else if (name === '--text-only') {
            options.requireWhisperHealth = false
        } else if (name === '--require-whisper') {
            options.requireWhisperHealth = true
        } else if (name === '--ollama-url') {
            options.ollamaUrl = readValue()
        } else if (name === '--ollama-model') {
            options.ollamaModel = readValue()
        } else if (name === '--whisper-health-url') {
            options.whisperHealthUrl = readValue()
        } else if (name === '--whisper-transcribe-url') {
            options.whisperTranscribeUrl = readValue()
        } else if (name === '--whisper-file-field') {
            options.whisperFieldName = readValue()
        } else if (name === '--audio-path') {
            options.audioPath = readValue()
        } else if (name === '--result-path') {
            options.resultPath = readValue()
        } else if (name === '--transcript') {
            options.transcript = readValue()
        } else if (name === '--timeout-ms') {
            options.timeoutMs = readValue()
        } else {
            throw new Error(`未対応の引数です: ${arg}`)
        }
    }

    return options
}

export function writeIntegrationReceipt(resultPath, result, options = {}) {
    const receipt = createIntegrationReceipt(result, options)
    fs.mkdirSync(path.dirname(resultPath), { recursive: true })
    fs.writeFileSync(resultPath, `${JSON.stringify(receipt, null, 2)}\n`)
    return receipt
}

export function createIntegrationReceipt(result, options = {}) {
    if (result.skipped) {
        return {
            created_at: options.createdAt || new Date().toISOString(),
            app_version: options.appVersion || packageJson.version,
            ok: false,
            skipped: true,
            reason: result.reason
        }
    }

    return {
        created_at: options.createdAt || new Date().toISOString(),
        app_version: options.appVersion || packageJson.version,
        ok: true,
        skipped: false,
        ready: result.status.ready,
        ollama: {
            status: result.status.ollama.status,
            url: result.status.ollama.url,
            requiredModel: result.status.ollama.requiredModel,
            installedModelCount: Array.isArray(result.status.ollama.installedModels)
                ? result.status.ollama.installedModels.length
                : 0
        },
        whisper: {
            status: result.status.whisper.status,
            url: result.status.whisper.url
        },
        draft: {
            source: result.draft.source,
            chiefComplaintPresent: Boolean(result.draft.chief_complaint),
            medicationInstructionPresent: Boolean(result.draft.medication_instruction)
        },
        audioDraft: result.audioDraft
            ? {
                source: result.audioDraft.source,
                chiefComplaintPresent: Boolean(result.audioDraft.chief_complaint),
                medicationInstructionPresent: Boolean(result.audioDraft.medication_instruction)
            }
            : undefined,
        audioTested: Boolean(result.audioDraft),
        audioPathProvided: Boolean(result.audioPath)
    }
}

function readBoolean(value) {
    return ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase())
}

function readNumber(value, fallback) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
}

function splitArg(arg) {
    const value = String(arg || '')
    const separatorIndex = value.indexOf('=')
    if (separatorIndex < 0) return [value, undefined]
    return [value.slice(0, separatorIndex), value.slice(separatorIndex + 1)]
}

function summarizeResult(result) {
    if (result.skipped) return result
    return {
        ...createIntegrationReceipt(result),
        receiptPath: result.receiptPath
    }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    runLocalAiIntegrationCheck(parseLocalAiIntegrationArgs(process.argv.slice(2)))
        .then(result => {
            console.log(JSON.stringify(summarizeResult(result), null, 2))
        })
        .catch(error => {
            console.error(error instanceof Error ? error.message : error)
            process.exitCode = 1
        })
}
