import assert from 'node:assert/strict'
import test from 'node:test'
import handler from '../api/install-code/verify.ts'

test('install code API validates code from environment registry', async () => {
    const originalRegistry = process.env.INSTALL_CODE_REGISTRY
    const originalInstallerUrl = process.env.WINDOWS_INSTALLER_URL
    process.env.INSTALL_CODE_REGISTRY = JSON.stringify({
        codes: [
            {
                code: 'DEMO-1234',
                label: 'APIテスト薬局',
                maxDevices: 2,
                usedDevicesCount: 1
            }
        ]
    })
    process.env.WINDOWS_INSTALLER_URL = 'https://example.com/setup.exe'

    try {
        const response = createMockResponse()
        await handler({
            method: 'POST',
            body: {
                code: 'demo1234'
            }
        }, response)

        assert.equal(response.statusCode, 200)
        assert.equal(response.body.status, 'valid')
        assert.equal(response.body.label, 'APIテスト薬局')
        assert.equal(response.body.usedDevicesCount, 1)
        assert.equal(response.body.installerUrl, 'https://example.com/setup.exe')
        assert.equal(response.headers['Cache-Control'], 'no-store')
    } finally {
        restoreEnv('INSTALL_CODE_REGISTRY', originalRegistry)
        restoreEnv('WINDOWS_INSTALLER_URL', originalInstallerUrl)
    }
})

test('install code API reports not configured without registry', async () => {
    const originalRegistry = process.env.INSTALL_CODE_REGISTRY
    delete process.env.INSTALL_CODE_REGISTRY

    try {
        const response = createMockResponse()
        await handler({
            method: 'POST',
            body: {
                code: 'demo1234'
            }
        }, response)

        assert.equal(response.statusCode, 503)
        assert.equal(response.body.status, 'not_configured')
    } finally {
        restoreEnv('INSTALL_CODE_REGISTRY', originalRegistry)
    }
})

test('install code API registers device usage through injected store', async () => {
    const originalRegistry = process.env.INSTALL_CODE_REGISTRY
    const originalInstallerUrl = process.env.WINDOWS_INSTALLER_URL
    process.env.INSTALL_CODE_REGISTRY = JSON.stringify({
        codes: [
            {
                code: 'COUNT-1234',
                label: '台数管理薬局',
                maxDevices: 2
            }
        ]
    })
    process.env.WINDOWS_INSTALLER_URL = 'https://example.com/setup.exe'

    try {
        const usageStore = createMemoryUsageStore()
        const response = createMockResponse()
        await handler({
            method: 'POST',
            body: {
                code: 'count1234',
                deviceId: 'device-0001'
            },
            usageStore
        }, response)

        assert.equal(response.statusCode, 200)
        assert.equal(response.body.status, 'valid')
        assert.equal(response.body.usedDevicesCount, 1)
        assert.deepEqual([...(usageStore.devices.get('COUNT1234') ?? [])], ['device-0001'])

        const secondResponse = createMockResponse()
        await handler({
            method: 'POST',
            body: {
                code: 'count1234',
                deviceId: 'device-0001'
            },
            usageStore
        }, secondResponse)

        assert.equal(secondResponse.statusCode, 200)
        assert.equal(secondResponse.body.usedDevicesCount, 1)
    } finally {
        restoreEnv('INSTALL_CODE_REGISTRY', originalRegistry)
        restoreEnv('WINDOWS_INSTALLER_URL', originalInstallerUrl)
    }
})

test('install code API rejects new devices after store count reaches max', async () => {
    const originalRegistry = process.env.INSTALL_CODE_REGISTRY
    process.env.INSTALL_CODE_REGISTRY = JSON.stringify({
        codes: [
            {
                code: 'FULL-1234',
                maxDevices: 1
            }
        ]
    })

    try {
        const usageStore = createMemoryUsageStore()
        usageStore.devices.set('FULL1234', new Set(['device-0001']))
        const response = createMockResponse()
        await handler({
            method: 'POST',
            body: {
                code: 'full1234',
                deviceId: 'device-0002'
            },
            usageStore
        }, response)

        assert.equal(response.statusCode, 400)
        assert.equal(response.body.status, 'usage_limit_reached')

        const existingResponse = createMockResponse()
        await handler({
            method: 'POST',
            body: {
                code: 'full1234',
                deviceId: 'device-0001'
            },
            usageStore
        }, existingResponse)

        assert.equal(existingResponse.statusCode, 200)
        assert.equal(existingResponse.body.status, 'valid')
    } finally {
        restoreEnv('INSTALL_CODE_REGISTRY', originalRegistry)
    }
})

function restoreEnv(name: string, value: string | undefined) {
    if (value === undefined) {
        delete process.env[name]
        return
    }
    process.env[name] = value
}

function createMockResponse() {
    return {
        statusCode: 200,
        headers: {} as Record<string, string>,
        body: undefined as Record<string, unknown> | undefined,
        ended: false,
        setHeader(name: string, value: string) {
            this.headers[name] = value
        },
        status(statusCode: number) {
            this.statusCode = statusCode
            return this
        },
        json(body: unknown) {
            this.body = body
        },
        end() {
            this.ended = true
        }
    }
}

function createMemoryUsageStore() {
    const devices = new Map<string, Set<string>>()
    return {
        devices,
        async getUsage(code: string, deviceId: string) {
            const codeDevices = devices.get(code) ?? new Set<string>()
            return {
                usedDevicesCount: codeDevices.size,
                deviceAlreadyRegistered: codeDevices.has(deviceId)
            }
        },
        async registerDevice(input: { code: string; deviceId: string }) {
            const codeDevices = devices.get(input.code) ?? new Set<string>()
            codeDevices.add(input.deviceId)
            devices.set(input.code, codeDevices)
        }
    }
}
