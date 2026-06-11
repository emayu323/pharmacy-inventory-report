import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const packageJson = require('../package.json')
const DEFAULT_RESULT_PATH = 'output/windows-target-smoke-result.json'

export const WINDOWS_TARGET_SMOKE_CHECKS = [
    { id: 'installer_installed', label: 'Windows版インストーラーを実行し、インストールが完了する' },
    { id: 'desktop_shortcut_launch', label: 'デスクトップショートカットから起動できる' },
    { id: 'local_health_ready', label: 'ローカルヘルスAPIがreadyになる' },
    { id: 'local_db_ready', label: 'ローカルDBが作成または既存DBを読める' },
    { id: 'pin_lock_ready', label: 'PINロック画面が表示され、解除できる' },
    { id: 'report_save', label: 'テスト用報告書を作成し、保存後に再表示できる' },
    { id: 'print_preview', label: '印刷プレビューまたは印刷ダイアログを開ける' },
    { id: 'backup_create', label: '手動バックアップを作成できる' },
    { id: 'windows_auto_launch_enabled', label: 'Windowsログイン時の自動起動設定が有効になる' },
    { id: 'pre_update_backup_created', label: '自動更新前バックアップが作成される' },
    { id: 'auto_update_completed', label: '旧バージョンから新バージョンへの自動更新が完了する' },
    { id: 'data_intact_after_update', label: '更新後もDBと保存済みテストデータが残っている' }
]

export function parseWindowsTargetSmokeArgs(argv = []) {
    const options = {}
    const args = Array.from(argv)

    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index]
        const [name, inlineValue] = splitArg(arg)
        const readValue = () => inlineValue ?? args[++index] ?? ''

        if (name === '--all-confirmed') {
            options.allConfirmed = true
        } else if (name === '--result-path') {
            options.resultPath = readValue()
        } else if (name === '--source-revision') {
            options.sourceRevision = readValue()
        } else if (name === '--app-version') {
            options.appVersion = readValue()
        } else if (name === '--created-at') {
            options.createdAt = readValue()
        } else {
            throw new Error(`未対応の引数です: ${arg}`)
        }
    }

    return options
}

export function createWindowsTargetSmokeReceipt(options = {}) {
    const platform = String(options.platform || process.platform)
    if (platform !== 'win32') {
        throw new Error('Windows実機でスモーク確認後に実行してください')
    }
    if (options.allConfirmed !== true) {
        throw new Error('全確認項目を完了後、--all-confirmed を指定してください')
    }

    const sourceRevision = normalizeSha(options.sourceRevision || readSourceRevision(options.cwd || process.cwd()))
    if (!sourceRevision) {
        throw new Error('source_revision には現在ソースの40文字SHAが必要です')
    }

    return {
        created_at: options.createdAt || (typeof options.now === 'function' ? options.now() : new Date()).toISOString(),
        app_version: options.appVersion || packageJson.version,
        source_revision: sourceRevision,
        platform: 'win32',
        ok: true,
        ready: true,
        checks: Object.fromEntries(WINDOWS_TARGET_SMOKE_CHECKS.map(check => [check.id, true]))
    }
}

export function writeWindowsTargetSmokeReceipt(resultPath = DEFAULT_RESULT_PATH, options = {}) {
    const receipt = createWindowsTargetSmokeReceipt(options)
    fs.mkdirSync(path.dirname(resultPath), { recursive: true })
    fs.writeFileSync(resultPath, `${JSON.stringify(receipt, null, 2)}\n`)
    return receipt
}

function splitArg(arg) {
    const value = String(arg || '')
    const separatorIndex = value.indexOf('=')
    if (separatorIndex < 0) return [value, undefined]
    return [value.slice(0, separatorIndex), value.slice(separatorIndex + 1)]
}

function readSourceRevision(cwd) {
    try {
        return normalizeSha(execFileSync('git', ['rev-parse', 'HEAD'], {
            cwd,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore']
        }))
    } catch {
        return ''
    }
}

function normalizeSha(value) {
    const text = String(value || '').trim()
    return /^[a-f0-9]{40}$/i.test(text) ? text.toLowerCase() : ''
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
        const options = parseWindowsTargetSmokeArgs(process.argv.slice(2))
        const resultPath = options.resultPath || process.env.WINDOWS_TARGET_SMOKE_RESULT_PATH || DEFAULT_RESULT_PATH
        const receipt = writeWindowsTargetSmokeReceipt(resultPath, options)
        console.log(JSON.stringify({ ...receipt, receiptPath: resultPath }, null, 2))
    } catch (error) {
        console.error(error instanceof Error ? error.message : error)
        process.exitCode = 1
    }
}
