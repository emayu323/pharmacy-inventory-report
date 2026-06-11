import assert from 'node:assert/strict'
import test from 'node:test'
import {
    formatVercelProductionSmokeText,
    runVercelProductionSmoke
} from '../scripts/vercel_production_smoke.mjs'

test('Vercel production smoke passes entry and invalid install-code API checks', async () => {
    const requests = []
    const status = await runVercelProductionSmoke({
        baseUrl: 'https://example.vercel.app/some/path',
        fetchImpl: async (input, init) => {
            requests.push({
                url: input.href,
                method: init?.method || 'GET',
                body: init?.body
            })
            if (input.pathname === '/entry') {
                return new Response('<div id="root"></div>', { status: 200 })
            }
            return Response.json({
                status: 'invalid',
                message: '導入コードを確認できません'
            }, { status: 400 })
        }
    })

    assert.equal(status.ok, true)
    assert.equal(status.ready, true)
    assert.equal(status.baseUrl, 'https://example.vercel.app')
    assert.equal(status.entry.status, 'pass')
    assert.equal(status.installCodeApi.status, 'pass')
    assert.deepEqual(requests.map(request => `${request.method} ${new URL(request.url).pathname}`), [
        'GET /entry',
        'POST /api/install-code/verify'
    ])
    assert.match(String(requests[1].body), /INVALID-0000/)
    assert.equal(status.nextActions.length, 0)
})

test('Vercel production smoke fails when install-code API has a server error', async () => {
    const status = await runVercelProductionSmoke({
        baseUrl: 'https://example.vercel.app',
        fetchImpl: async input => {
            if (input.pathname === '/entry') {
                return new Response('', { status: 200 })
            }
            return new Response('A server error has occurred', { status: 500 })
        }
    })

    assert.equal(status.ok, true)
    assert.equal(status.ready, false)
    assert.equal(status.entry.status, 'pass')
    assert.equal(status.installCodeApi.status, 'fail')
    assert.match(status.installCodeApi.message, /500/)
    assert.deepEqual(status.nextActions, [
        'npm run release:vercel-smoke',
        'vercel logs https://example.vercel.app --since 10m --expand --level error'
    ])
})

test('Vercel production smoke text is human readable', async () => {
    const status = await runVercelProductionSmoke({
        baseUrl: 'https://example.vercel.app',
        fetchImpl: async input => {
            if (input.pathname === '/entry') {
                return new Response('', { status: 200 })
            }
            return Response.json({ status: 'invalid' }, { status: 400 })
        }
    })
    const text = formatVercelProductionSmokeText(status)

    assert.match(text, /Vercel production smoke判定: 完了/)
    assert.match(text, /entry: pass/)
    assert.match(text, /install-code API: pass/)
    assert.match(text, /次の作業: なし/)
})
