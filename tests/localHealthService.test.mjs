import assert from 'node:assert/strict'
import test from 'node:test'
import { readHealthConfigFromEnv, startLocalHealthServer } from '../scripts/local_health_service.js'

test('reads boolean health settings from environment-like object', () => {
    const config = readHealthConfigFromEnv({
        LOCAL_APP_PORT: '48000',
        LOCAL_APP_STATUS: 'ready',
        LOCAL_APP_VERSION: '2.0.0',
        LOCAL_APP_AI_READY: 'false',
        LOCAL_APP_DB_READY: 'true',
        LOCAL_APP_URL: 'pharmacy-report://open',
        LOCAL_APP_PORT_CANDIDATES: '48000,48001',
        LOCAL_HEALTH_ALLOWED_ORIGINS: 'https://portal.example.com/, https://report.example.jp'
    })

    assert.equal(config.port, 48000)
    assert.equal(config.status, 'ready')
    assert.equal(config.version, '2.0.0')
    assert.equal(config.aiReady, false)
    assert.equal(config.dbReady, true)
    assert.equal(config.appUrl, 'pharmacy-report://open')
    assert.deepEqual(config.portCandidates, [48000, 48001])
    assert.deepEqual(config.allowedOrigins, ['https://portal.example.com', 'https://report.example.jp'])
})

test('serves local health JSON with CORS for localhost origins', async () => {
    const { server } = await startLocalHealthServer({
        port: 0,
        status: 'ai_not_setup',
        version: '0.2.0-test',
        appUrl: 'pharmacy-report://open',
        aiReady: false,
        dbReady: true
    })

    try {
        const address = server.address()
        assert.equal(typeof address, 'object')
        assert(address && 'port' in address)

        const response = await fetch(`http://127.0.0.1:${address.port}/api/local/health`, {
            headers: {
                Origin: 'http://127.0.0.1:5174'
            }
        })
        const body = await response.json()

        assert.equal(response.status, 200)
        assert.equal(response.headers.get('access-control-allow-origin'), 'http://127.0.0.1:5174')
        assert.equal(body.app, 'pharmacy-report-local')
        assert.equal(body.status, 'ai_not_setup')
        assert.equal(body.version, '0.2.0-test')
        assert.equal(body.db_ready, true)
        assert.equal(body.ai_ready, false)
        assert.equal(body.app_url, 'pharmacy-report://open')
    } finally {
        await new Promise(resolve => server.close(resolve))
    }
})

test('starts local health server on the next candidate when the first port is busy', async () => {
    const blocker = await startLocalHealthServer({ port: 0 })
    const blockerAddress = blocker.server.address()
    assert.equal(typeof blockerAddress, 'object')
    assert(blockerAddress && 'port' in blockerAddress)

    const freeCandidate = await getAvailablePort()
    const fallback = await startLocalHealthServer({
        portCandidates: [blockerAddress.port, freeCandidate],
        status: 'ready'
    })

    try {
        assert.equal(fallback.config.port, freeCandidate)

        const response = await fetch(`http://127.0.0.1:${fallback.config.port}/api/local/health`)
        const body = await response.json()

        assert.equal(response.status, 200)
        assert.equal(body.status, 'ready')
    } finally {
        await new Promise(resolve => fallback.server.close(resolve))
        await new Promise(resolve => blocker.server.close(resolve))
    }
})

test('limits local health CORS to Vercel localhost and configured origins', async () => {
    const { server } = await startLocalHealthServer({
        port: 0,
        allowedOrigins: ['https://portal.example.com/']
    })

    try {
        const address = server.address()
        assert.equal(typeof address, 'object')
        assert(address && 'port' in address)

        const requestWithOrigin = (origin) => fetch(`http://127.0.0.1:${address.port}/api/local/health`, {
            headers: { Origin: origin }
        })

        const vercelResponse = await requestWithOrigin('https://pharmacy-report.vercel.app')
        const customResponse = await requestWithOrigin('https://portal.example.com')
        const unknownResponse = await requestWithOrigin('https://unknown.example.net')

        assert.equal(vercelResponse.headers.get('access-control-allow-origin'), 'https://pharmacy-report.vercel.app')
        assert.equal(customResponse.headers.get('access-control-allow-origin'), 'https://portal.example.com')
        assert.equal(unknownResponse.headers.get('access-control-allow-origin'), null)
    } finally {
        await new Promise(resolve => server.close(resolve))
    }
})

async function getAvailablePort() {
    const probe = await startLocalHealthServer({ port: 0 })
    const address = probe.server.address()
    assert.equal(typeof address, 'object')
    assert(address && 'port' in address)
    const port = address.port
    await new Promise(resolve => probe.server.close(resolve))
    return port
}
