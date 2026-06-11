import assert from 'node:assert/strict'
import test from 'node:test'
import {
    formatMacDemoSmokeText,
    verifyMacDemoRuntime
} from '../scripts/mac_demo_smoke.mjs'

test('mac demo smoke verifies entry page and local health API across port candidates', async () => {
    const requestedUrls = []
    const result = await verifyMacDemoRuntime({
        entryUrl: 'http://127.0.0.1:5174/entry',
        ports: [47830, 47831],
        fetchImpl: async (url) => {
            requestedUrls.push(String(url))
            if (String(url) === 'http://127.0.0.1:5174/entry') {
                return htmlResponse('<!doctype html><div id="root"></div><script type="module" src="/src/main.tsx"></script>')
            }
            if (String(url) === 'http://127.0.0.1:47830/api/local/health') {
                throw new Error('port closed')
            }
            return jsonResponse({
                app: 'pharmacy-report-local',
                status: 'ready',
                version: '0.1.0',
                db_ready: true,
                ai_ready: true
            })
        }
    })

    assert.equal(result.ok, true)
    assert.equal(result.entry.status, 'pass')
    assert.equal(result.health.status, 'pass')
    assert.equal(result.health.port, 47831)
    assert.deepEqual(requestedUrls, [
        'http://127.0.0.1:5174/entry',
        'http://127.0.0.1:47830/api/local/health',
        'http://127.0.0.1:47831/api/local/health'
    ])

    const text = formatMacDemoSmokeText(result)
    assert.match(text, /macデモ実行確認: OK/)
    assert.match(text, /entry: pass/)
    assert.match(text, /local health: pass/)
    assert.match(text, /127\.0\.0\.1:47831/)
})

test('mac demo smoke fails when entry HTML is not the Vite app shell', async () => {
    const result = await verifyMacDemoRuntime({
        fetchImpl: async (url) => {
            if (String(url).includes('/entry')) return htmlResponse('<!doctype html><main>missing root</main>')
            return jsonResponse({
                app: 'pharmacy-report-local',
                status: 'ready'
            })
        }
    })

    assert.equal(result.ok, false)
    assert.equal(result.entry.status, 'fail')
    assert.match(result.entry.message, /Vite app shell/)
})

test('mac demo smoke fails when no local health API responds', async () => {
    const result = await verifyMacDemoRuntime({
        ports: [47831, 47832],
        fetchImpl: async (url) => {
            if (String(url).includes('/entry')) return htmlResponse('<div id="root"></div>')
            throw new Error('not listening')
        }
    })

    assert.equal(result.ok, false)
    assert.equal(result.health.status, 'fail')
    assert.match(result.health.message, /47831, 47832/)
})

function htmlResponse(body, ok = true) {
    return {
        ok,
        status: ok ? 200 : 500,
        text: async () => body,
        json: async () => JSON.parse(body)
    }
}

function jsonResponse(body, ok = true) {
    return {
        ok,
        status: ok ? 200 : 500,
        text: async () => JSON.stringify(body),
        json: async () => body
    }
}
