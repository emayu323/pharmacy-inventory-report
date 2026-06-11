import assert from 'node:assert/strict'
import test from 'node:test'
import {
    createVercelCloudEnvStatus,
    formatVercelCloudEnvStatusText,
    parseVercelEnvListJson
} from '../scripts/vercel_cloud_env_status.mjs'

test('parses noisy Vercel env JSON output without reading secret values', () => {
    const parsed = parseVercelEnvListJson([
        'Vercel CLI 54.11.1',
        'Retrieving project...',
        JSON.stringify({
            envs: [
                {
                    key: 'INSTALL_CODE_REGISTRY',
                    type: 'encrypted',
                    value: 'should-not-be-present'
                }
            ]
        })
    ].join('\n'))

    assert.equal(parsed.envs[0].key, 'INSTALL_CODE_REGISTRY')
})

test('reports Vercel production env ready when required keys are present and stale app keys are absent', () => {
    const status = createVercelCloudEnvStatus({
        envs: [
            { key: 'INSTALL_CODE_REGISTRY', target: ['production'] },
            { key: 'WINDOWS_INSTALLER_URL', target: ['production'] }
        ]
    })

    assert.equal(status.ok, true)
    assert.equal(status.ready, true)
    assert.deepEqual(status.missingRequired, [])
    assert.deepEqual(status.staleAppEnv, [])
    assert.deepEqual(status.nextActions, [])
})

test('reports missing required and stale Supabase app env without exposing values', () => {
    const status = createVercelCloudEnvStatus({
        envs: [
            { key: 'VITE_SUPABASE_URL', value: 'https://old.example.supabase.co', target: ['production'] },
            { key: 'VITE_SUPABASE_ANON_KEY', value: 'secret-anon-key', target: ['production'] }
        ]
    })
    const text = formatVercelCloudEnvStatusText(status)

    assert.equal(status.ok, true)
    assert.equal(status.ready, false)
    assert.deepEqual(status.missingRequired, ['INSTALL_CODE_REGISTRY', 'WINDOWS_INSTALLER_URL'])
    assert.deepEqual(status.staleAppEnv, ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'])
    assert.match(text, /vercel env rm VITE_SUPABASE_URL production/)
    assert.match(text, /vercel env add INSTALL_CODE_REGISTRY production/)
    assert.equal(text.includes('secret-anon-key'), false)
    assert.equal(text.includes('old.example.supabase.co'), false)
})

test('reports invalid Vercel env JSON as a command failure', () => {
    const status = createVercelCloudEnvStatus('not json')

    assert.equal(status.ok, false)
    assert.equal(status.ready, false)
    assert.match(status.message, /JSON payload/)
})
