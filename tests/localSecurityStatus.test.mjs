import assert from 'node:assert/strict'
import test from 'node:test'
import {
    createStartupSecurityWarning,
    getLocalSecurityStatus,
    parseBitLockerProtectionStatus
} from '../electron/localSecurityStatus.mjs'

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

test('creates a non-blocking startup warning when BitLocker is disabled', () => {
    const warning = createStartupSecurityWarning({
        checked_at: '2026-06-11T00:00:00.000Z',
        dbProtection: {
            status: 'unprotected',
            method: 'BitLocker',
            drive: 'C:',
            message: 'BitLockerが無効です。導入時に有効化してください'
        }
    })

    assert.equal(warning?.type, 'warning')
    assert.deepEqual(warning?.buttons, ['このまま使う'])
    assert.match(warning?.message || '', /BitLockerが無効/)
    assert.match(warning?.detail || '', /利用は継続できます/)
    assert.match(warning?.detail || '', /C:/)
})

test('does not create a startup warning outside disabled BitLocker state', () => {
    assert.equal(createStartupSecurityWarning({
        checked_at: '2026-06-11T00:00:00.000Z',
        dbProtection: {
            status: 'protected',
            method: 'BitLocker',
            drive: 'C:',
            message: 'BitLockerは有効です'
        }
    }), null)
    assert.equal(createStartupSecurityWarning({
        checked_at: '2026-06-11T00:00:00.000Z',
        dbProtection: {
            status: 'not_windows',
            method: 'BitLocker',
            message: 'BitLocker確認はWindows端末で実行します'
        }
    }), null)
})
