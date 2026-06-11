import assert from 'node:assert/strict'
import test from 'node:test'
import { verifyVercelProductionEnv } from '../scripts/verify_vercel_production_env.mjs'

test('verifies required Vercel production environment variables', () => {
    const result = verifyVercelProductionEnv({
        INSTALL_CODE_REGISTRY: JSON.stringify({
            codes: [
                {
                    code: 'ABCD-1234',
                    label: '検証薬局',
                    expiresAt: '2026-12-31',
                    maxDevices: 3
                }
            ]
        }),
        WINDOWS_INSTALLER_URL: 'https://example.com/pharmacy-report-setup.exe'
    }, {
        now: new Date('2026-06-11T00:00:00.000Z')
    })

    assert.equal(result.ok, true)
    assert.equal(result.summary.installCodeCount, 1)
    assert.equal(result.summary.enabledInstallCodeCount, 1)
    assert.equal(result.summary.hasDefaultInstallerUrl, true)
    assert.equal(result.summary.hasSupabaseUsageStore, false)
    assert.equal(result.warnings.some(warning => warning.includes('Supabase usage store')), true)
})

test('accepts optional Supabase usage store settings without leaking secrets', () => {
    const result = verifyVercelProductionEnv({
        INSTALL_CODE_REGISTRY: JSON.stringify([
            {
                code: 'SUPA-1234',
                maxDevices: 2,
                installerUrl: 'https://example.com/setup.exe'
            }
        ]),
        WINDOWS_INSTALLER_URL: 'https://example.com/setup.exe',
        INSTALL_CODE_USAGE_SUPABASE_URL: 'https://example.supabase.co',
        INSTALL_CODE_USAGE_SUPABASE_SERVICE_ROLE_KEY: 'secret-service-role-key',
        INSTALL_CODE_USAGE_TABLE: 'install_code_devices'
    })

    assert.equal(result.ok, true)
    assert.equal(result.summary.hasSupabaseUsageStore, true)
    assert.equal(result.summary.hasSupabaseServiceRoleKey, true)
    assert.equal(JSON.stringify(result).includes('secret-service-role-key'), false)
})

test('warns when stale app Supabase env vars remain after local-only migration', () => {
    const result = verifyVercelProductionEnv({
        INSTALL_CODE_REGISTRY: JSON.stringify({
            codes: [
                {
                    code: 'LOCAL-1234',
                    maxDevices: 2
                }
            ]
        }),
        WINDOWS_INSTALLER_URL: 'https://example.com/setup.exe',
        VITE_SUPABASE_URL: 'https://old-project.supabase.co',
        VITE_SUPABASE_ANON_KEY: 'old-public-anon-key'
    })

    assert.equal(result.ok, true)
    assert.equal(result.warnings.some(warning => warning.includes('VITE_SUPABASE_URL')), true)
    assert.equal(result.warnings.some(warning => warning.includes('VITE_SUPABASE_ANON_KEY')), true)
    assert.equal(JSON.stringify(result).includes('old-public-anon-key'), false)
})

test('reports invalid production environment values', () => {
    const result = verifyVercelProductionEnv({
        INSTALL_CODE_REGISTRY: JSON.stringify({
            codes: [
                {
                    code: 'BAD-1',
                    expiresAt: 'not-a-date',
                    maxDevices: 0,
                    installerUrl: 'http://example.com/setup.exe'
                },
                {
                    code: 'BAD-1'
                },
                {
                    code: 'NO-LIMIT'
                },
                {
                    code: 'OVER-USED',
                    maxDevices: 1,
                    usedDevicesCount: 2
                },
                {
                    code: 'DISABLED-ONLY',
                    maxDevices: 1,
                    disabled: true
                }
            ]
        }),
        WINDOWS_INSTALLER_URL: 'http://example.com/setup.exe',
        INSTALL_CODE_USAGE_SUPABASE_URL: 'not-a-url',
        INSTALL_CODE_USAGE_TABLE: 'bad-name!'
    })

    assert.equal(result.ok, false)
    assert.equal(result.errors.some(error => error.includes('WINDOWS_INSTALLER_URL')), true)
    assert.equal(result.errors.some(error => error.includes('expiresAt')), true)
    assert.equal(result.errors.some(error => error.includes('maxDevices')), true)
    assert.equal(result.errors.some(error => error.includes('usedDevicesCount') && error.includes('maxDevices')), true)
    assert.equal(result.errors.some(error => error.includes('installerUrl')), true)
    assert.equal(result.errors.some(error => error.includes('duplicated')), true)
    assert.equal(result.errors.some(error => error.includes('codes[2]') && error.includes('maxDevices')), true)
    assert.equal(result.errors.some(error => error.includes('SERVICE_ROLE_KEY')), true)
    assert.equal(result.errors.some(error => error.includes('TABLE')), true)
    assert.equal(JSON.stringify(result).includes('NO-LIMIT'), false)
})

test('requires Windows installer URLs to point to exe files', () => {
    const result = verifyVercelProductionEnv({
        INSTALL_CODE_REGISTRY: JSON.stringify({
            codes: [
                {
                    code: 'URL-1234',
                    maxDevices: 1,
                    installerUrl: 'https://example.com/download'
                }
            ]
        }),
        WINDOWS_INSTALLER_URL: 'https://example.com/download'
    })

    assert.equal(result.ok, false)
    assert.equal(result.errors.some(error => error.includes('WINDOWS_INSTALLER_URL') && error.includes('.exe')), true)
    assert.equal(result.errors.some(error => error.includes('installerUrl') && error.includes('.exe')), true)
})

test('requires at least one enabled production install code', () => {
    const result = verifyVercelProductionEnv({
        INSTALL_CODE_REGISTRY: JSON.stringify({
            codes: [
                {
                    code: 'OLD-1234',
                    maxDevices: 1,
                    disabled: true
                }
            ]
        }),
        WINDOWS_INSTALLER_URL: 'https://example.com/setup.exe'
    })

    assert.equal(result.ok, false)
    assert.equal(result.errors.some(error => error.includes('enabled install code')), true)
})

test('rejects expired enabled production install codes', () => {
    const result = verifyVercelProductionEnv({
        INSTALL_CODE_REGISTRY: JSON.stringify({
            codes: [
                {
                    code: 'EXPIRED-1234',
                    expiresAt: '2026-06-10',
                    maxDevices: 1
                }
            ]
        }),
        WINDOWS_INSTALLER_URL: 'https://example.com/setup.exe'
    }, {
        now: new Date('2026-06-11T00:00:00.000Z')
    })

    assert.equal(result.ok, false)
    assert.equal(result.errors.some(error => error.includes('expiresAt') && error.includes('expired')), true)
    assert.equal(JSON.stringify(result).includes('EXPIRED-1234'), false)
})
