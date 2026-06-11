import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
    WINDOWS_TARGET_SMOKE_CHECKS,
    createWindowsTargetSmokeReceipt,
    parseWindowsTargetSmokeArgs,
    writeWindowsTargetSmokeReceipt
} from '../scripts/create_windows_target_smoke_receipt.mjs'

test('Windows target smoke receipt args require explicit all-confirmed acknowledgement', () => {
    const options = parseWindowsTargetSmokeArgs([
        '--all-confirmed',
        '--result-path',
        'output/windows-target-smoke-result.json',
        '--source-revision',
        'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    ])

    assert.equal(options.allConfirmed, true)
    assert.equal(options.resultPath, 'output/windows-target-smoke-result.json')
    assert.equal(options.sourceRevision, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
})

test('Windows target smoke receipt requires Windows platform and every smoke check', () => {
    assert.throws(
        () => createWindowsTargetSmokeReceipt({
            platform: 'darwin',
            allConfirmed: true,
            sourceRevision: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
        }),
        /Windows実機/
    )

    assert.throws(
        () => createWindowsTargetSmokeReceipt({
            platform: 'win32',
            allConfirmed: false,
            sourceRevision: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
        }),
        /--all-confirmed/
    )

    assert.throws(
        () => createWindowsTargetSmokeReceipt({
            platform: 'win32',
            allConfirmed: true,
            sourceRevision: 'not-a-sha'
        }),
        /source_revision/
    )
})

test('Windows target smoke receipt writes privacy-safe JSON for the release gate', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'windows-smoke-receipt-'))
    const receiptPath = path.join(tmpDir, 'windows-target-smoke-result.json')

    try {
        const receipt = writeWindowsTargetSmokeReceipt(receiptPath, {
            platform: 'win32',
            allConfirmed: true,
            sourceRevision: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            appVersion: '0.1.0',
            now: () => new Date('2026-06-11T12:00:00.000Z')
        })
        const saved = JSON.parse(fs.readFileSync(receiptPath, 'utf8'))

        assert.deepEqual(saved, receipt)
        assert.equal(saved.created_at, '2026-06-11T12:00:00.000Z')
        assert.equal(saved.app_version, '0.1.0')
        assert.equal(saved.source_revision, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
        assert.equal(saved.platform, 'win32')
        assert.equal(saved.ok, true)
        assert.equal(saved.ready, true)
        for (const check of WINDOWS_TARGET_SMOKE_CHECKS) {
            assert.equal(saved.checks[check.id], true)
        }
        assert.equal(JSON.stringify(saved).includes('山田'), false)
        assert.equal(JSON.stringify(saved).includes('導入コード'), false)
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true })
    }
})
