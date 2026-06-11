import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { createSourceReleaseStatus } from './source_release_status.mjs'

const require = createRequire(import.meta.url)
const packageJson = require('../package.json')
const DEFAULT_OUTPUT_PATH = 'output/source-publication-checklist.md'
const LARGE_FILE_WARNING_BYTES = 1024 * 1024

export function createSourcePublicationChecklistMarkdown(options = {}) {
    const generatedAt = options.generatedAt || new Date().toISOString()
    const packageVersion = options.packageVersion || packageJson.version
    const sourceStatus = options.sourceStatus || {}
    const rootDir = options.rootDir || sourceStatus.rootDir || process.cwd()
    const files = addFileSizes(Array.isArray(sourceStatus.files) ? sourceStatus.files : [], rootDir)
    const trackedSensitivePaths = Array.isArray(sourceStatus.trackedSensitivePaths)
        ? sourceStatus.trackedSensitivePaths
        : []
    const deletedSensitivePaths = findDeletedSensitivePaths(files)
    const pathWarnings = findPublicationPathWarnings(files)
    const lines = [
        '# ソース公開前チェックリスト',
        '',
        `生成日時: ${generatedAt}`,
        `アプリバージョン: ${packageVersion}`,
        '',
        '## ソース状態',
        '',
        `ok: ${Boolean(sourceStatus.ok)}`,
        `ready: ${Boolean(sourceStatus.ready)}`,
        `publish state: ${sourceStatus.publishState || 'unknown'}`,
        `branch: ${sourceStatus.branch || 'unknown'}`,
        `upstream: ${sourceStatus.upstream || 'none'}`,
        `ahead: ${sourceStatus.ahead || 0}`,
        `behind: ${sourceStatus.behind || 0}`,
        `changed files: ${sourceStatus.changedCount || 0}`,
        `modified files: ${sourceStatus.modifiedCount || 0}`,
        `untracked files: ${sourceStatus.untrackedCount || 0}`,
        `tracked sensitive files: ${sourceStatus.trackedSensitiveCount || trackedSensitivePaths.length || 0}`,
        `remote: ${sourceStatus.remoteUrl || 'unknown'}`,
        '',
        '## 確認項目',
        '',
        '- [ ] `npm run release:source-status -- --details` で含めるファイルを確認する。',
        '- [ ] 秘密情報、Service Role Key、導入コード実値、患者情報が含まれていないことを確認する。',
        '- [ ] `npm run test:local-app` が通ることを確認する。',
        '- [ ] `npm run lint` が通ることを確認する。',
        '- [ ] `npm run build` が通ることを確認する。',
        '- [ ] `npm run release:check:full` の残作業を確認する。',
        '- [ ] commit/push またはPR作成後に `npm run release:github-status` を再実行する。',
        '',
        '## 自動安全確認',
        ''
    ]

    if (pathWarnings.length === 0) {
        lines.push('- 警告: なし')
    } else {
        lines.push('- 警告: 公開対象から外す、または内容を確認してください。')
        pathWarnings.forEach(warning => {
            lines.push(`- [${warning.reason}] ${warning.path}${warning.sizeLabel ? ` (${warning.sizeLabel})` : ''}`)
        })
    }

    lines.push(
        '',
        '## Git追跡済みの要確認ファイル',
        ''
    )

    if (trackedSensitivePaths.length === 0) {
        lines.push('- なし')
    } else {
        lines.push('- `.gitignore` だけでは外れないため、公開前に `git rm --cached <path>` などでGit追跡から外すか確認する。')
        trackedSensitivePaths.forEach(filePath => {
            lines.push(`- ${filePath}`)
        })
    }

    lines.push(
        '',
        '## Git追跡解除予定の要確認ファイル',
        ''
    )

    if (deletedSensitivePaths.length === 0) {
        lines.push('- なし')
    } else {
        lines.push('- 次のファイルは今回の変更でGit追跡から外れる予定です。すでに外部へ公開済みの実値がある場合は、必要ならキーのローテーションを行う。')
        deletedSensitivePaths.forEach(filePath => {
            lines.push(`- ${filePath}`)
        })
    }

    lines.push(
        '',
        '## 変更ファイル',
        ''
    )

    if (files.length === 0) {
        lines.push('- なし')
    } else {
        files.forEach(file => {
            const sizeLabel = file.sizeBytes ? ` (${formatBytes(file.sizeBytes)})` : ''
            lines.push(`- [${file.kind || 'changed'}] ${file.path || ''}${sizeLabel}`)
        })
    }

    lines.push(
        '',
        '## 注意',
        '',
        '- この文書はファイル一覧と確認項目だけを扱い、ファイル本文は含めない。',
        '- GitHubへpushする前に、必要に応じて `git diff` やレビュー画面で内容を確認する。',
        ''
    )

    return `${lines.join('\n')}\n`
}

function findPublicationPathWarnings(files) {
    return files.flatMap(file => {
        if (file?.kind === 'deleted') return []
        const filePath = String(file?.path || '')
        const normalized = filePath.replace(/\\/g, '/')
        if (!normalized) return []

        const warnings = []
        if (/(^|\/)\.env(?:\.|$)|\.local$/.test(normalized)) {
            warnings.push({ reason: 'env-or-local-secret', path: filePath })
        }
        if (/^(output|release|dist|node_modules|\.vercel)(\/|$)/.test(normalized)) {
            warnings.push({ reason: 'generated-or-local-artifact', path: filePath })
        }
        if (/src\/data\/y_ALL.*\.(csv|zip)$/i.test(normalized)) {
            warnings.push({ reason: 'raw-drug-master-source', path: filePath })
        }
        if (/\.(sqlite|db|bak|backup|webm|wav|mp3|m4a)$/i.test(normalized)) {
            warnings.push({ reason: 'local-data-or-audio-artifact', path: filePath })
        }
        if (Number(file?.sizeBytes || 0) >= LARGE_FILE_WARNING_BYTES) {
            warnings.push({
                reason: 'large-file',
                path: filePath,
                sizeLabel: formatBytes(file.sizeBytes)
            })
        }
        return warnings
    })
}

function findDeletedSensitivePaths(files) {
    return files
        .filter(file => file?.kind === 'deleted')
        .map(file => String(file?.path || ''))
        .filter(isSensitivePublicationPath)
}

function isSensitivePublicationPath(filePath) {
    const normalized = String(filePath || '').replace(/\\/g, '/')
    if (!normalized) return false
    if (/(^|\/)\.env(?:\.|$)/.test(normalized)) return true
    if (/(^|\/)[^/]+\.local$/.test(normalized)) return true
    if (/^(output|release|dist|node_modules|\.vercel)(\/|$)/.test(normalized)) return true
    if (/src\/data\/y_ALL.*\.(csv|zip)$/i.test(normalized)) return true
    if (/\.(sqlite|db|bak|backup|webm|wav|mp3|m4a)$/i.test(normalized)) return true
    return false
}

function addFileSizes(files, rootDir) {
    return files.map(file => {
        if (Number.isFinite(file?.sizeBytes)) return file
        const filePath = String(file?.path || '').split(' -> ').pop()
        if (!filePath) return file
        try {
            const stat = fs.statSync(path.resolve(rootDir, filePath))
            return stat.isFile() ? { ...file, sizeBytes: stat.size } : file
        } catch {
            return file
        }
    })
}

function formatBytes(bytes) {
    const value = Number(bytes || 0)
    if (value < 1024) return `${value} B`
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
    return `${(value / 1024 / 1024).toFixed(1)} MB`
}

export function writeSourcePublicationChecklistMarkdown(outputPath = DEFAULT_OUTPUT_PATH, options = {}) {
    const markdown = createSourcePublicationChecklistMarkdown(options)
    fs.mkdirSync(path.dirname(outputPath), { recursive: true })
    fs.writeFileSync(outputPath, markdown)
    return outputPath
}

function parseArgs(argv) {
    let outputPath = DEFAULT_OUTPUT_PATH
    for (let index = 0; index < argv.length; index += 1) {
        if (argv[index] === '--output') {
            outputPath = argv[index + 1] || outputPath
            index += 1
        }
    }
    return { outputPath }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    const { outputPath } = parseArgs(process.argv.slice(2))
    const sourceStatus = await createSourceReleaseStatus({ includeFiles: true })
    const writtenPath = writeSourcePublicationChecklistMarkdown(outputPath, { sourceStatus })
    console.log(`Source publication checklist written: ${writtenPath}`)
    process.exitCode = sourceStatus.ok ? 0 : 1
}
