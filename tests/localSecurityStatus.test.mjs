import assert from 'node:assert/strict'
import test from 'node:test'
import { getLocalSecurityStatus, parseBitLockerProtectionStatus } from '../electron/localSecurityStatus.mjs'

test('parses BitLocker protection on from manage-bde output', () => {
    const status = parseBitLockerProtectionStatus(`
BitLocker Drive Encryption: Configuration Tool version 10.0.22621
Volume C: [Windows]
    Conversion Status:    Fully Encrypted
    Protection Status:    Protection On
`)

    assert.equal(status, 'protected')
})

test('parses BitLocker protection off from manage-bde output', () => {
    const status = parseBitLockerProtectionStatus(`
Volume C: [Windows]
    Conversion Status:    Fully Decrypted
    Protection Status:    Protection Off
`)

    assert.equal(status, 'unprotected')
})

test('reports non-Windows development environment without failing', async () => {
    const status = await getLocalSecurityStatus({
        platform: 'darwin',
        execFileImpl: async () => {
            throw new Error('should not run')
        }
    })

    assert.equal(status.dbProtection.status, 'not_windows')
    assert.match(status.dbProtection.message, /Windows/)
})

test('checks BitLocker on Windows using manage-bde', async () => {
    const calls = []
    const status = await getLocalSecurityStatus({
        platform: 'win32',
        systemDrive: 'D:',
        execFileImpl: async (file, args) => {
            calls.push([file, args])
            return {
                stdout: 'Protection Status:    Protection On',
                stderr: ''
            }
        }
    })

    assert.deepEqual(calls, [['manage-bde', ['-status', 'D:']]])
    assert.equal(status.dbProtection.status, 'protected')
    assert.equal(status.dbProtection.method, 'BitLocker')
})

test('returns unknown when BitLocker output cannot be parsed', async () => {
    const status = await getLocalSecurityStatus({
        platform: 'win32',
        execFileImpl: async () => ({
            stdout: 'unexpected output',
            stderr: ''
        })
    })

    assert.equal(status.dbProtection.status, 'unknown')
})
