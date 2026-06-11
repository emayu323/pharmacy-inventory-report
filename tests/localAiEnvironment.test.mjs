import assert from 'node:assert/strict'
import test from 'node:test'
import { getLocalAiEnvironmentStatus } from '../electron/localAiEnvironment.mjs'

test('local AI status is ready when Ollama model and Whisper health are available', async () => {
    const status = await getLocalAiEnvironmentStatus({
        ollamaModel: 'llama3.1:8b',
        whisperHealthUrl: 'http://127.0.0.1:8178/health',
        timeoutMs: 20,
        fetchImpl: async (url) => {
            if (String(url).endsWith('/api/tags')) {
                return jsonResponse({
                    models: [
                        { name: 'llama3.1:8b' }
                    ]
                })
            }
            return jsonResponse({ ok: true })
        }
    })

    assert.equal(status.ready, true)
    assert.equal(status.ollama.status, 'ready')
    assert.equal(status.whisper.status, 'ready')
    assert.equal(status.estimate.transcriptionTimeRatio, '1x-3x')
})

test('local AI status reports missing Ollama model', async () => {
    const status = await getLocalAiEnvironmentStatus({
        ollamaModel: 'llama3.1:8b',
        whisperHealthUrl: 'http://127.0.0.1:8178/health',
        timeoutMs: 20,
        fetchImpl: async (url) => {
            if (String(url).endsWith('/api/tags')) {
                return jsonResponse({
                    models: [
                        { name: 'qwen2.5:7b' }
                    ]
                })
            }
            return jsonResponse({ ok: true })
        }
    })

    assert.equal(status.ready, false)
    assert.equal(status.ollama.status, 'model_missing')
    assert.equal(status.ollama.requiredModel, 'llama3.1:8b')
})

test('local AI status keeps app usable when Whisper URL is not configured', async () => {
    const status = await getLocalAiEnvironmentStatus({
        timeoutMs: 20,
        fetchImpl: async () => jsonResponse({ models: [] })
    })

    assert.equal(status.ready, false)
    assert.equal(status.whisper.status, 'not_configured')
    assert.match(status.whisper.message, /未設定/)
})

test('local AI status reports enough disk space when required bytes are configured', async () => {
    const status = await getLocalAiEnvironmentStatus({
        timeoutMs: 20,
        requiredFreeBytes: 20,
        diskPath: '/models',
        statfsImpl: async () => ({
            bavail: 10n,
            bsize: 4n
        }),
        fetchImpl: async () => jsonResponse({ models: [] })
    })

    assert.equal(status.disk.status, 'ready')
    assert.equal(status.disk.path, '/models')
    assert.equal(status.disk.freeBytes, 40)
    assert.equal(status.disk.requiredFreeBytes, 20)
})

test('local AI status reports measured disk space even without required bytes', async () => {
    const status = await getLocalAiEnvironmentStatus({
        timeoutMs: 20,
        diskPath: '/models',
        statfsImpl: async () => ({
            bavail: 10,
            bsize: 4
        }),
        fetchImpl: async () => jsonResponse({ models: [] })
    })

    assert.equal(status.disk.status, 'ready')
    assert.equal(status.disk.path, '/models')
    assert.equal(status.disk.freeBytes, 40)
    assert.equal(status.disk.requiredFreeBytes, undefined)
})

test('local AI status warns when disk space is below required bytes', async () => {
    const status = await getLocalAiEnvironmentStatus({
        timeoutMs: 20,
        requiredFreeBytes: 100,
        statfsImpl: async () => ({
            bavail: 10,
            bsize: 4
        }),
        fetchImpl: async () => jsonResponse({ models: [] })
    })

    assert.equal(status.disk.status, 'low_space')
    assert.equal(status.disk.freeBytes, 40)
    assert.equal(status.disk.requiredFreeBytes, 100)
})

test('local AI status keeps disk check non-blocking when statfs fails', async () => {
    const status = await getLocalAiEnvironmentStatus({
        timeoutMs: 20,
        requiredFreeBytes: 100,
        statfsImpl: async () => {
            throw new Error('permission denied')
        },
        fetchImpl: async () => jsonResponse({ models: [] })
    })

    assert.equal(status.disk.status, 'unknown')
    assert.match(status.disk.message, /確認できません/)
})

function jsonResponse(body) {
    return new Response(JSON.stringify(body), {
        status: 200,
        headers: {
            'Content-Type': 'application/json'
        }
    })
}
