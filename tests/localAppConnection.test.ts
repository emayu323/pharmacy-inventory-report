import assert from 'node:assert/strict'
import test from 'node:test'
import {
    classifyLocalHealth,
    parseLocalAppPortCandidates,
    probeLocalApp
} from '../src/localAppConnection.ts'

test('parses local app port candidates for Vercel entry configuration', () => {
    assert.deepEqual(parseLocalAppPortCandidates('48000, 48001,48000,abc,70000,0'), [48000, 48001, 0])
    assert.deepEqual(parseLocalAppPortCandidates('', [47831, 47832]), [47831, 47832])
    assert.deepEqual(parseLocalAppPortCandidates('abc', [47831]), [47831])
})

test('classifies update-required health response', () => {
    const result = classifyLocalHealth({
        status: 'update_required',
        version: '1.0.0',
        latest_version: '1.1.0'
    }, 47831)

    assert.equal(result.status, 'update_required')
    assert.equal(result.version, '1.0.0')
    assert.equal(result.latestVersion, '1.1.0')
})

test('classifies db preparation before ready status', () => {
    const result = classifyLocalHealth({
        status: 'ready',
        db_ready: false
    }, 47831)

    assert.equal(result.status, 'db_preparing')
})

test('classifies missing AI setup while keeping app usable', () => {
    const result = classifyLocalHealth({
        status: 'ready',
        db_ready: true,
        ai_ready: false,
        app_url: 'http://127.0.0.1:47831/'
    }, 47831)

    assert.equal(result.status, 'ai_not_setup')
    assert.equal(result.appUrl, 'http://127.0.0.1:47831/')
})

test('probes port candidates until a local app responds', async () => {
    const calls: string[] = []
    const fetchImpl: typeof fetch = async (input) => {
        calls.push(String(input))
        if (calls.length === 1) {
            throw new Error('connection refused')
        }

        return new Response(JSON.stringify({
            status: 'ready',
            version: '1.2.3',
            app_url: 'http://127.0.0.1:47832/'
        }), { status: 200 })
    }

    const result = await probeLocalApp({
        ports: [47831, 47832],
        timeoutMs: 20,
        fetchImpl
    })

    assert.equal(result.status, 'ready')
    assert.equal(result.port, 47832)
    assert.deepEqual(calls, [
        'http://127.0.0.1:47831/api/local/health',
        'http://127.0.0.1:47832/api/local/health'
    ])
})

test('returns not detected when every local app probe fails', async () => {
    const fetchImpl: typeof fetch = async () => {
        throw new Error('connection refused')
    }

    const result = await probeLocalApp({
        ports: [47831, 47832],
        timeoutMs: 20,
        fetchImpl
    })

    assert.equal(result.status, 'not_detected')
})
