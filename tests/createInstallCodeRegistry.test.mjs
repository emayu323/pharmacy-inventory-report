import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
    createInstallCodeRegistry,
    formatVercelEnvFile,
    writeInstallCodeRegistryFiles
} from '../scripts/create_install_code_registry.mjs'
import {
    readEnvFile,
    verifyVercelProductionEnv
} from '../scripts/verify_vercel_production_env.mjs'

test('creates production install code registry records without ambiguous code format', () => {
    const registry = createInstallCodeRegistry({
        labels: ['サンプル薬局A', 'サンプル薬局B'],
        maxDevices: 3,
        expiresAt: '2026-12-31',
        installerUrl: 'https://example.com/pharmacy-report-setup-0.1.0-x64.exe',
        randomBytes: deterministicBytes()
    })

    assert.equal(registry.codes.length, 2)
    assert.equal(registry.codes[0].label, 'サンプル薬局A')
    assert.equal(registry.codes[1].label, 'サンプル薬局B')
    for (const record of registry.codes) {
        assert.match(record.code, /^[A-Z0-9]{4}-[A-Z0-9]{4}$/)
        assert.equal(record.maxDevices, 3)
        assert.equal(record.expiresAt, '2026-12-31')
        assert.equal(record.installerUrl, 'https://example.com/pharmacy-report-setup-0.1.0-x64.exe')
        assert.equal(record.disabled, false)
        assert.equal(record.usedDevicesCount, 0)
    }
    assert.notEqual(registry.codes[0].code, registry.codes[1].code)
})

test('formats a Vercel env file that passes production verifier', () => {
    const registry = createInstallCodeRegistry({
        labels: ['サンプル薬局'],
        maxDevices: 2,
        expiresAt: '2026-12-31',
        installerUrl: 'https://example.com/pharmacy-report-setup-0.1.0-x64.exe',
        randomBytes: deterministicBytes()
    })
    const envFile = formatVercelEnvFile(registry, {
        installerUrl: 'https://example.com/pharmacy-report-setup-0.1.0-x64.exe'
    })

    assert.match(envFile, /^INSTALL_CODE_REGISTRY='/m)
    assert.match(envFile, /^WINDOWS_INSTALLER_URL='https:\/\/example\.com\/pharmacy-report-setup-0\.1\.0-x64\.exe'$/m)

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'install-code-registry-'))
    const envPath = path.join(tmpDir, '.env.production.local')
    try {
        fs.writeFileSync(envPath, envFile)
        const result = verifyVercelProductionEnv(readEnvFile(envPath), {
            now: new Date('2026-06-11T00:00:00.000Z')
        })
        assert.equal(result.ok, true)
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true })
    }
})

test('writes registry and env files while returning redacted summary only', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'install-code-registry-write-'))
    const registryPath = path.join(tmpDir, 'registry.json')
    const envPath = path.join(tmpDir, '.env.production.local')

    try {
        const result = writeInstallCodeRegistryFiles({
            labels: ['サンプル薬局'],
            maxDevices: 2,
            expiresAt: '2026-12-31',
            installerUrl: 'https://example.com/pharmacy-report-setup-0.1.0-x64.exe',
            registryPath,
            envPath,
            randomBytes: deterministicBytes()
        })
        const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'))
        const generatedCode = registry.codes[0].code

        assert.equal(fs.existsSync(envPath), true)
        assert.equal(result.codeCount, 1)
        assert.equal(result.registryPath, registryPath)
        assert.equal(result.envPath, envPath)
        assert.equal(result.installCodePreview, `${generatedCode.slice(0, 4)}-****`)
        assert.equal(JSON.stringify(result).includes(generatedCode), false)
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true })
    }
})

function deterministicBytes() {
    let value = 0
    return (size) => {
        const bytes = Buffer.alloc(size)
        for (let index = 0; index < size; index += 1) {
            bytes[index] = value % 256
            value += 1
        }
        return bytes
    }
}
