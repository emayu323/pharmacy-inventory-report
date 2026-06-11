import assert from 'node:assert/strict'
import test from 'node:test'
import {
    createDemoInstallCodeRegistry,
    normalizeInstallCode,
    parseInstallCodeRegistry,
    verifyInstallCodeFromRegistry
} from '../src/installCode.ts'

test('normalizes install code formatting for matching', () => {
    assert.equal(normalizeInstallCode(' oy8y-8knn2 '), 'OY8Y8KNN2')
})

test('validates install code from JSON registry with device counts', () => {
    const registry = parseInstallCodeRegistry(JSON.stringify([
        {
            code: 'OY8Y-8KNN2',
            label: 'テスト薬局',
            maxDevices: 3,
            usedDevices: ['pc-1'],
            installerUrl: 'https://example.com/app.exe'
        }
    ]))

    const result = verifyInstallCodeFromRegistry('oy8y8knn2', registry)

    assert.equal(result.status, 'valid')
    assert.equal(result.label, 'テスト薬局')
    assert.equal(result.maxDevices, 3)
    assert.equal(result.usedDevicesCount, 1)
    assert.equal(result.installerUrl, 'https://example.com/app.exe')
})

test('rejects expired install code', () => {
    const registry = parseInstallCodeRegistry(JSON.stringify([
        {
            code: 'OLD-CODE',
            expiresAt: '2026-01-01'
        }
    ]))

    const result = verifyInstallCodeFromRegistry('old-code', registry, {
        now: new Date('2026-01-02T00:00:00.000Z')
    })

    assert.equal(result.status, 'expired')
})

test('rejects install code when device limit is reached', () => {
    const registry = parseInstallCodeRegistry(JSON.stringify([
        {
            code: 'FULL-CODE',
            maxDevices: 2,
            usedDevicesCount: 2
        }
    ]))

    const result = verifyInstallCodeFromRegistry('full-code', registry)

    assert.equal(result.status, 'usage_limit_reached')
})

test('supports external usage count and existing device allowance', () => {
    const registry = parseInstallCodeRegistry(JSON.stringify([
        {
            code: 'STORE-CODE',
            maxDevices: 2,
            usedDevicesCount: 2
        }
    ]))

    const belowLimit = verifyInstallCodeFromRegistry('store-code', registry, {
        usedDevicesCountOverride: 1
    })
    const existingAtLimit = verifyInstallCodeFromRegistry('store-code', registry, {
        usedDevicesCountOverride: 2,
        allowExistingDeviceAtLimit: true
    })

    assert.equal(belowLimit.status, 'valid')
    assert.equal(belowLimit.usedDevicesCount, 1)
    assert.equal(existingAtLimit.status, 'valid')
    assert.equal(existingAtLimit.usedDevicesCount, 2)
})

test('supports demo install codes with default installer URL', () => {
    const registry = createDemoInstallCodeRegistry('DEMO-1234, DEMO-5678', 'https://example.com/demo.exe')
    const result = verifyInstallCodeFromRegistry('demo1234', registry)

    assert.equal(result.status, 'valid')
    assert.equal(result.installerUrl, 'https://example.com/demo.exe')
})

test('reports not configured when registry is empty', () => {
    const result = verifyInstallCodeFromRegistry('ANY-CODE', [])

    assert.equal(result.status, 'not_configured')
})
