import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { saveAiAudioArtifact } from '../electron/localAiArtifactRepository.mjs'

test('saves AI audio artifact under report-specific file name', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'report-ai-artifact-'))

    try {
        const result = saveAiAudioArtifact({
            outputDir: tmpDir,
            reportId: 'local-report-abc/unsafe',
            audioBytes: new Uint8Array([1, 2, 3, 4]),
            mimeType: 'audio/webm',
            now: () => new Date('2026-06-10T12:34:56.789Z')
        })

        assert.equal(result.fileName, 'local-report-abc-unsafe-2026-06-10T12-34-56-789Z.webm')
        assert.equal(result.mimeType, 'audio/webm')
        assert.equal(result.byteLength, 4)
        assert.equal(result.saved_at, '2026-06-10T12:34:56.789Z')
        assert.deepEqual([...fs.readFileSync(result.filePath)], [1, 2, 3, 4])
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true })
    }
})

test('rejects empty AI audio artifacts', () => {
    assert.throws(
        () => saveAiAudioArtifact({
            outputDir: os.tmpdir(),
            reportId: 'local-report-empty',
            audioBytes: new Uint8Array(),
            mimeType: 'audio/webm'
        }),
        /空です/
    )
})
