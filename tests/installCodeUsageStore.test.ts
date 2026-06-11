import assert from 'node:assert/strict'
import test from 'node:test'
import {
    createSupabaseInstallCodeUsageStore,
    normalizeInstallDeviceId
} from '../api/install-code/supabaseUsageStore.ts'

test('Supabase usage store reads device counts through REST without SDK', async () => {
    const requests: Request[] = []
    const store = createSupabaseInstallCodeUsageStore({
        url: 'https://example.supabase.co',
        serviceRoleKey: 'service-role-key',
        fetchImpl: async (input, init) => {
            requests.push(new Request(input, init))
            return Response.json([
                { device_id: 'device-0001' },
                { device_id: 'device-0002' }
            ])
        }
    })

    const usage = await store.getUsage('demo-1234', 'device-0002')

    assert.equal(usage.usedDevicesCount, 2)
    assert.equal(usage.deviceAlreadyRegistered, true)
    assert.equal(requests.length, 1)
    assert.equal(requests[0].url, 'https://example.supabase.co/rest/v1/install_code_devices?select=device_id&code=eq.DEMO1234')
    assert.equal(requests[0].headers.get('apikey'), 'service-role-key')
    assert.equal(requests[0].headers.get('authorization'), 'Bearer service-role-key')
})

test('Supabase usage store updates an existing device when insert conflicts', async () => {
    const requests: Request[] = []
    const store = createSupabaseInstallCodeUsageStore({
        url: 'https://example.supabase.co/rest/v1',
        serviceRoleKey: 'service-role-key',
        fetchImpl: async (input, init) => {
            const request = new Request(input, init)
            requests.push(request)
            if (request.method === 'POST') {
                return new Response('duplicate key', { status: 409 })
            }
            return new Response(null, { status: 204 })
        }
    })

    await store.registerDevice({
        code: 'demo-1234',
        deviceId: 'device-0001',
        label: ' テスト薬局 '
    })

    assert.equal(requests.map(request => request.method).join(','), 'POST,PATCH')
    assert.equal(
        requests[1].url,
        'https://example.supabase.co/rest/v1/install_code_devices?code=eq.DEMO1234&device_id=eq.device-0001'
    )
    const body = await requests[1].json()
    assert.equal(body.label, 'テスト薬局')
    assert.equal(typeof body.last_verified_at, 'string')
})

test('install device id is strict enough for a browser-generated local id', () => {
    assert.equal(normalizeInstallDeviceId('device_ABC-123.456'), 'device_ABC-123.456')
    assert.equal(normalizeInstallDeviceId('short'), '')
    assert.equal(normalizeInstallDeviceId('bad/id'), '')
})
