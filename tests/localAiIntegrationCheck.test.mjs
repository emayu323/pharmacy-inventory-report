import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
    buildIntegrationConfig,
    parseLocalAiIntegrationArgs,
    runLocalAiIntegrationCheck
} from '../scripts/local_ai_integration_check.mjs'

test('local AI integration check skips unless explicitly enabled', async () => {
    const result = await runLocalAiIntegrationCheck({
        env: {},
        fetchImpl: async () => {
            throw new Error('fetch should not be called')
        }
    })

    assert.equal(result.skipped, true)
    assert.match(result.reason, /LOCAL_AI_INTEGRATION/)
})

test('local AI integration CLI args support text-only checks without shell env syntax', () => {
    const options = parseLocalAiIntegrationArgs([
        '--run',
        '--text-only',
        '--ollama-model',
        'llama3.1:8b',
        '--result-path',
        'output/local-ai-integration-result.json',
        '--timeout-ms=20'
    ])
    const config = buildIntegrationConfig({}, options)

    assert.equal(config.enabled, true)
    assert.equal(config.requireWhisperHealth, false)
    assert.equal(config.ollamaModel, 'llama3.1:8b')
    assert.equal(config.resultPath, 'output/local-ai-integration-result.json')
    assert.equal(config.timeoutMs, 20)
})

test('local AI integration check requires an Ollama model when enabled', async () => {
    await assert.rejects(
        () => runLocalAiIntegrationCheck({
            env: {
                LOCAL_AI_INTEGRATION: '1'
            },
            fetchImpl: async () => {
                throw new Error('fetch should not be called before model validation')
            }
        }),
        /LOCAL_OLLAMA_MODEL|--ollama-model/
    )
})

test('local AI integration text-only mode does not require Whisper health', async () => {
    const result = await runLocalAiIntegrationCheck({
        ...parseLocalAiIntegrationArgs([
            '--run',
            '--text-only',
            '--ollama-model',
            'llama3.1:8b',
            '--timeout-ms',
            '20'
        ]),
        env: {},
        fetchImpl: async (url, init) => {
            assert.equal(String(url).includes('/health'), false)
            return fakeFetch(url, init)
        }
    })

    assert.equal(result.skipped, false)
    assert.equal(result.status.whisper.status, 'not_configured')
    assert.equal(result.draft.source, 'local_llm')
})

test('local AI integration check verifies Ollama draft path with fake services', async () => {
    const result = await runLocalAiIntegrationCheck({
        env: {
            LOCAL_AI_INTEGRATION: '1',
            LOCAL_OLLAMA_MODEL: 'llama3.1:8b',
            LOCAL_WHISPER_HEALTH_URL: 'http://127.0.0.1:8178/health',
            LOCAL_AI_TIMEOUT_MS: '20'
        },
        fetchImpl: fakeFetch
    })

    assert.equal(result.skipped, false)
    assert.equal(result.status.ready, true)
    assert.equal(result.draft.source, 'local_llm')
    assert.equal(result.draft.chief_complaint, '眠気の訴えあり。')
    assert.equal(result.audioDraft, undefined)
})

test('local AI integration check can verify audio transcription when sample audio is provided', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'report-ai-integration-'))
    const audioPath = path.join(tmpDir, 'sample.webm')
    fs.writeFileSync(audioPath, Buffer.from([1, 2, 3]))

    try {
        const result = await runLocalAiIntegrationCheck({
            env: {
                LOCAL_AI_INTEGRATION: '1',
                LOCAL_OLLAMA_MODEL: 'llama3.1:8b',
                LOCAL_WHISPER_HEALTH_URL: 'http://127.0.0.1:8178/health',
                LOCAL_WHISPER_TRANSCRIBE_URL: 'http://127.0.0.1:8178/transcribe',
                LOCAL_AI_TEST_AUDIO_PATH: audioPath,
                LOCAL_AI_TIMEOUT_MS: '20'
            },
            fetchImpl: fakeFetch
        })

        assert.equal(result.audioDraft?.chief_complaint, '眠気の訴えあり。')
        assert.equal(result.audioDraft?.source, 'local_llm')
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true })
    }
})

test('local AI integration check writes privacy-safe receipt when requested', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'report-ai-integration-receipt-'))
    const receiptPath = path.join(tmpDir, 'receipt.json')

    try {
        const result = await runLocalAiIntegrationCheck({
            env: {
                LOCAL_AI_INTEGRATION: '1',
                LOCAL_OLLAMA_MODEL: 'llama3.1:8b',
                LOCAL_WHISPER_HEALTH_URL: 'http://127.0.0.1:8178/health',
                LOCAL_AI_INTEGRATION_RESULT_PATH: receiptPath,
                LOCAL_AI_TIMEOUT_MS: '20'
            },
            fetchImpl: fakeFetch,
            now: () => new Date('2026-06-10T12:00:00.000Z')
        })

        assert.equal(result.receiptPath, receiptPath)
        const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'))
        assert.equal(receipt.created_at, '2026-06-10T12:00:00.000Z')
        assert.equal(receipt.app_version, '0.1.0')
        assert.equal(receipt.ok, true)
        assert.equal(receipt.ollama.status, 'ready')
        assert.equal(receipt.draft.source, 'local_llm')
        assert.equal(receipt.draft.chiefComplaintPresent, true)
        assert.equal(JSON.stringify(receipt).includes('眠気の訴えあり'), false)
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true })
    }
})

async function fakeFetch(url, init = {}) {
    const urlValue = String(url)
    if (urlValue.endsWith('/api/tags')) {
        return jsonResponse({
            models: [{ name: 'llama3.1:8b' }]
        })
    }
    if (urlValue.endsWith('/api/chat')) {
        assert.equal(JSON.parse(String(init.body)).model, 'llama3.1:8b')
        return jsonResponse({
            message: {
                content: JSON.stringify({
                    chief_complaint: '眠気の訴えあり。',
                    medication_instruction: '主治医へ相談するよう説明。'
                })
            }
        })
    }
    if (urlValue.endsWith('/transcribe')) {
        return jsonResponse({
            text: '主訴等: 眠気の訴えあり。\n服薬指導内容: 主治医へ相談するよう説明。'
        })
    }
    if (urlValue.endsWith('/health')) {
        return jsonResponse({ ok: true })
    }
    return new Response('', { status: 404 })
}

function jsonResponse(body) {
    return new Response(JSON.stringify(body), {
        status: 200,
        headers: {
            'Content-Type': 'application/json'
        }
    })
}
