import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const DEFAULT_TIMEOUT_MS = 3000

export async function getLocalSecurityStatus(options = {}) {
    const platform = options.platform || process.platform
    const checkedAt = new Date().toISOString()

    if (platform !== 'win32') {
        return {
            checked_at: checkedAt,
            dbProtection: {
                status: 'not_windows',
                method: 'BitLocker',
                message: 'BitLocker確認はWindows端末で実行します'
            }
        }
    }

    const execFileImpl = options.execFileImpl || execFileAsync
    const systemDrive = normalizeSystemDrive(options.systemDrive || process.env.SystemDrive || 'C:')
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS

    try {
        const result = await execFileImpl('manage-bde', ['-status', systemDrive], {
            windowsHide: true,
            timeout: timeoutMs
        })
        const output = `${result?.stdout || ''}\n${result?.stderr || ''}`
        const parsed = parseBitLockerProtectionStatus(output)
        return {
            checked_at: checkedAt,
            dbProtection: createBitLockerProtectionResult(parsed, systemDrive)
        }
    } catch (error) {
        return {
            checked_at: checkedAt,
            dbProtection: {
                status: 'error',
                method: 'BitLocker',
                drive: systemDrive,
                message: 'BitLocker状態を確認できませんでした',
                detail: error instanceof Error ? error.message : String(error)
            }
        }
    }
}

export function parseBitLockerProtectionStatus(output) {
    const normalized = String(output || '')
        .replace(/\s+/g, ' ')
        .toLowerCase()

    if (/protection status:\s*protection on/.test(normalized)) return 'protected'
    if (/protection status:\s*protection off/.test(normalized)) return 'unprotected'
    if (/保護状態[:：][^。]*有効/.test(output)) return 'protected'
    if (/保護状態[:：][^。]*(無効|オフ)/.test(output)) return 'unprotected'

    return 'unknown'
}

function createBitLockerProtectionResult(status, drive) {
    if (status === 'protected') {
        return {
            status,
            method: 'BitLocker',
            drive,
            message: 'BitLockerは有効です'
        }
    }

    if (status === 'unprotected') {
        return {
            status,
            method: 'BitLocker',
            drive,
            message: 'BitLockerが無効です。導入時に有効化してください'
        }
    }

    return {
        status: 'unknown',
        method: 'BitLocker',
        drive,
        message: 'BitLocker状態を判定できませんでした'
    }
}

function normalizeSystemDrive(value) {
    const drive = String(value || 'C:').trim()
    if (/^[A-Za-z]:$/.test(drive)) return drive.toUpperCase()
    return 'C:'
}
