import fs from 'node:fs'
import path from 'node:path'

export function saveAiAudioArtifact(options = {}) {
    const outputDir = typeof options.outputDir === 'string' ? options.outputDir : ''
    const reportId = normalizeReportId(options.reportId)
    const audioBytes = toBuffer(options.audioBytes)
    const mimeType = normalizeMimeType(options.mimeType)
    const now = typeof options.now === 'function' ? options.now() : new Date()

    if (!outputDir) throw new Error('音声保存先が未設定です')
    if (!reportId) throw new Error('報告書IDが未設定です')
    if (audioBytes.byteLength === 0) throw new Error('録音データが空です')

    const savedAt = now.toISOString()
    const fileName = `${reportId}-${toFileTimestamp(savedAt)}${getAudioExtension(mimeType)}`
    const filePath = path.join(outputDir, fileName)

    fs.mkdirSync(outputDir, { recursive: true })
    fs.writeFileSync(filePath, audioBytes)

    return {
        fileName,
        filePath,
        mimeType,
        byteLength: audioBytes.byteLength,
        saved_at: savedAt
    }
}

function toBuffer(value) {
    if (Buffer.isBuffer(value)) return value
    if (value instanceof Uint8Array) return Buffer.from(value)
    if (value instanceof ArrayBuffer) return Buffer.from(value)
    if (Array.isArray(value)) return Buffer.from(value)
    return Buffer.alloc(0)
}

function normalizeReportId(value) {
    return typeof value === 'string'
        ? value.trim().replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '')
        : ''
}

function normalizeMimeType(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : 'audio/webm'
}

function getAudioExtension(mimeType) {
    if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return '.mp3'
    if (mimeType.includes('wav')) return '.wav'
    if (mimeType.includes('ogg')) return '.ogg'
    if (mimeType.includes('mp4') || mimeType.includes('m4a')) return '.m4a'
    return '.webm'
}

function toFileTimestamp(value) {
    return value.replace(/[:.]/g, '-')
}
