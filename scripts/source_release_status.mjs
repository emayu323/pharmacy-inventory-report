import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { pathToFileURL } from 'node:url'

const execFileAsync = promisify(execFile)

export async function createSourceReleaseStatus(options = {}) {
    const execFileImpl = options.execFileImpl || execFileAsync
    const cwd = options.cwd || process.cwd()
    const rootResult = await runGit(execFileImpl, ['rev-parse', '--show-toplevel'], cwd)

    if (!rootResult.ok) {
        return {
            ok: false,
            ready: false,
            clean: false,
            branch: '',
            upstream: '',
            remoteUrl: '',
            rootDir: '',
            ahead: 0,
            behind: 0,
            changedCount: 0,
            modifiedCount: 0,
            untrackedCount: 0,
            publishState: 'unknown',
            message: rootResult.message,
            nextActions: [
                'Run this command inside the repository',
                'Check git installation and repository access'
            ]
        }
    }

    const statusArgs = ['status', '--short', '--branch']
    if (options.includeFiles) {
        statusArgs.push('--untracked-files=all')
    }
    const statusResult = await runGit(execFileImpl, statusArgs, cwd)
    if (!statusResult.ok) {
        return {
            ok: false,
            ready: false,
            clean: false,
            branch: '',
            upstream: '',
            remoteUrl: '',
            rootDir: rootResult.stdout.trim(),
            ahead: 0,
            behind: 0,
            changedCount: 0,
            modifiedCount: 0,
            untrackedCount: 0,
            publishState: 'unknown',
            message: statusResult.message,
            nextActions: [
                'Run git status --short --branch',
                'Check repository state before release handoff'
            ]
        }
    }

    const remoteResult = await runGit(execFileImpl, ['remote', 'get-url', 'origin'], cwd)
    const parsed = parseShortBranchStatus(statusResult.stdout)
    const trackedSensitivePaths = await readTrackedSensitivePaths(execFileImpl, cwd)
    const publishState = determinePublishState(parsed, trackedSensitivePaths)
    const ready = publishState === 'synced'
    const files = options.includeFiles ? parseStatusFiles(statusResult.stdout) : undefined

    return {
        ok: true,
        ready,
        clean: parsed.changedCount === 0,
        branch: parsed.branch,
        upstream: parsed.upstream,
        remoteUrl: remoteResult.ok ? remoteResult.stdout.trim() : '',
        rootDir: rootResult.stdout.trim(),
        ahead: parsed.ahead,
        behind: parsed.behind,
        changedCount: parsed.changedCount,
        modifiedCount: parsed.modifiedCount,
        untrackedCount: parsed.untrackedCount,
        trackedSensitiveCount: trackedSensitivePaths.length,
        trackedSensitivePaths,
        publishState,
        message: createMessage(publishState, parsed, remoteResult, trackedSensitivePaths),
        nextActions: createNextActions(publishState),
        ...(files ? { files } : {})
    }
}

export function formatSourceReleaseStatusText(report, options = {}) {
    const state = report.ready ? '同期済み' : report.ok ? '未反映あり' : '要確認'
    const lines = [
        `ローカルGit判定: ${state}`,
        `ok: ${report.ok}`,
        `ready: ${report.ready}`,
        `publish state: ${report.publishState || 'unknown'}`,
        `branch: ${report.branch || 'unknown'}`,
        `upstream: ${report.upstream || 'none'}`,
        `ahead: ${report.ahead || 0}`,
        `behind: ${report.behind || 0}`,
        `changed files: ${report.changedCount || 0}`,
        `modified files: ${report.modifiedCount || 0}`,
        `untracked files: ${report.untrackedCount || 0}`,
        `tracked sensitive files: ${report.trackedSensitiveCount || 0}`,
        `remote: ${report.remoteUrl || 'unknown'}`
    ]

    if (report.message) {
        lines.push(`message: ${report.message}`)
    }
    if (report.nextActions?.length) {
        lines.push('', '次の作業:')
        report.nextActions.forEach((action, index) => {
            lines.push(`${index + 1}. ${action}`)
        })
    }
    if (options.includeFiles && report.files?.length) {
        const maxFiles = Number.isFinite(options.maxFiles) ? options.maxFiles : 200
        lines.push('', '変更ファイル:')
        report.files.slice(0, maxFiles).forEach(file => {
            lines.push(`- [${file.kind}] ${file.path}`)
        })
        if (report.files.length > maxFiles) {
            lines.push(`- ... ${report.files.length - maxFiles} more file(s)`)
        }
    }
    if (report.trackedSensitivePaths?.length) {
        lines.push('', '追跡済みの要確認ファイル:')
        report.trackedSensitivePaths.forEach(filePath => {
            lines.push(`- ${filePath}`)
        })
    }
    return lines.join('\n')
}

function parseShortBranchStatus(stdout) {
    const lines = String(stdout || '').split(/\r?\n/).filter(Boolean)
    const branchLine = lines.find(line => line.startsWith('## ')) || ''
    const statusLines = lines.filter(line => !line.startsWith('## '))
    const branchInfo = parseBranchLine(branchLine)
    const untrackedCount = statusLines.filter(line => line.startsWith('??')).length
    const changedCount = statusLines.length

    return {
        ...branchInfo,
        changedCount,
        untrackedCount,
        modifiedCount: changedCount - untrackedCount
    }
}

function parseStatusFiles(stdout) {
    return String(stdout || '')
        .split(/\r?\n/)
        .filter(line => line && !line.startsWith('## '))
        .map(line => {
            const status = line.slice(0, 2)
            const normalizedStatus = status.trim() || status
            return {
                status: normalizedStatus,
                kind: classifyStatus(status),
                path: line.slice(3).trim()
            }
        })
}

function classifyStatus(status) {
    if (status === '??') return 'untracked'
    if (status.includes('U')) return 'conflicted'
    if (status.includes('R')) return 'renamed'
    if (status.includes('C')) return 'copied'
    if (status.includes('D')) return 'deleted'
    if (status.includes('A')) return 'added'
    if (status.includes('M')) return 'modified'
    return 'changed'
}

function parseBranchLine(line) {
    const body = line.replace(/^##\s*/, '').trim()
    const bracketMatch = body.match(/\[(?<meta>[^\]]+)\]/)
    const branchPart = body.replace(/\s*\[[^\]]+\]\s*$/, '')
    const [branch = '', upstream = ''] = branchPart.split('...')
    const meta = bracketMatch?.groups?.meta || ''
    const ahead = parseCount(meta, /ahead\s+(\d+)/)
    const behind = parseCount(meta, /behind\s+(\d+)/)

    return {
        branch: branch.trim(),
        upstream: upstream.trim(),
        ahead,
        behind
    }
}

function parseCount(value, pattern) {
    const match = value.match(pattern)
    return match ? Number(match[1]) : 0
}

function determinePublishState(parsed, trackedSensitivePaths = []) {
    if (trackedSensitivePaths.length > 0) return 'tracked_sensitive_files'
    if (parsed.changedCount > 0) return 'local_changes'
    if (parsed.ahead > 0 && parsed.behind > 0) return 'diverged'
    if (parsed.ahead > 0) return 'unpushed_commits'
    if (parsed.behind > 0) return 'behind_remote'
    if (!parsed.upstream) return 'no_upstream'
    return 'synced'
}

function createMessage(publishState, parsed, remoteResult, trackedSensitivePaths = []) {
    if (publishState === 'tracked_sensitive_files') {
        return `${trackedSensitivePaths.length} tracked sensitive or local-only file(s) must be removed from Git before publishing`
    }
    if (publishState === 'local_changes') {
        return `${parsed.changedCount} local file(s) differ from Git, including ${parsed.untrackedCount} untracked file(s)`
    }
    if (publishState === 'unpushed_commits') {
        return `${parsed.ahead} commit(s) are ahead of ${parsed.upstream || 'upstream'}`
    }
    if (publishState === 'diverged') {
        return `Branch is ahead ${parsed.ahead} and behind ${parsed.behind}`
    }
    if (publishState === 'behind_remote') {
        return `Branch is behind ${parsed.upstream || 'upstream'} by ${parsed.behind} commit(s)`
    }
    if (publishState === 'no_upstream') {
        return 'No upstream branch is configured'
    }
    if (!remoteResult.ok) {
        return 'Origin remote could not be read'
    }
    return 'Local source is clean and synchronized with upstream'
}

function createNextActions(publishState) {
    if (publishState === 'tracked_sensitive_files') {
        return [
            'Remove tracked local-only files from Git history or untrack them before push/PR',
            'Verify .env, raw drug master CSV/ZIP, local DB, output, release, and audio files are not published',
            'Run npm run release:source-status again after cleanup'
        ]
    }
    if (publishState === 'local_changes') {
        return [
            'Review local changes with git status --short',
            'Commit release files or intentionally leave them out before push/PR',
            'Run npm run release:github-status again after publishing'
        ]
    }
    if (publishState === 'unpushed_commits' || publishState === 'diverged') {
        return [
            'Push current branch or open a PR so GitHub receives the release workflow',
            'Run npm run release:github-status again after GitHub updates'
        ]
    }
    if (publishState === 'behind_remote') {
        return [
            'Pull or inspect the remote branch before publishing release files',
            'Run npm run release:github-status again'
        ]
    }
    if (publishState === 'no_upstream') {
        return [
            'Set or verify the upstream branch before publishing release files',
            'Run npm run release:github-status again after publishing'
        ]
    }
    if (publishState === 'synced') {
        return [
            'Run npm run release:github-status to compare the GitHub Actions artifact state'
        ]
    }
    return [
        'Check git status manually before release handoff'
    ]
}

async function readTrackedSensitivePaths(execFileImpl, cwd) {
    const result = await runGit(execFileImpl, ['ls-files'], cwd)
    if (!result.ok) return []
    return result.stdout
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean)
        .filter(isSensitivePublicationPath)
}

function isSensitivePublicationPath(filePath) {
    const normalized = String(filePath || '').replace(/\\/g, '/')
    if (!normalized) return false
    if (/(^|\/)\.env(?:$|\.)/.test(normalized)) {
        return !/(^|\/)\.env(?:\..*)?\.example$/.test(normalized)
    }
    if (/(^|\/)[^/]+\.local$/.test(normalized)) return true
    if (/^(output|release|dist|node_modules|\.vercel|\.playwright-cli)(\/|$)/.test(normalized)) return true
    if (/^src\/data\/y_ALL.*\.(csv|zip)$/i.test(normalized)) return true
    if (/\.(sqlite|db|bak|backup|webm|wav|mp3|m4a)$/i.test(normalized)) return true
    return false
}

async function runGit(execFileImpl, args, cwd) {
    try {
        const result = await execFileImpl('git', args, { cwd })
        return {
            ok: true,
            stdout: result.stdout || '',
            stderr: result.stderr || '',
            message: ''
        }
    } catch (error) {
        return {
            ok: false,
            stdout: error?.stdout || '',
            stderr: error?.stderr || '',
            message: error?.stderr || error?.message || 'git command failed'
        }
    }
}

function parseArgs(argv) {
    let format = 'text'
    let includeFiles = false
    for (let index = 0; index < argv.length; index += 1) {
        if (argv[index] === '--format') {
            format = argv[index + 1] || format
            index += 1
        } else if (argv[index] === '--details') {
            includeFiles = true
        }
    }
    return { format, includeFiles }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    const { format, includeFiles } = parseArgs(process.argv.slice(2))
    createSourceReleaseStatus({ includeFiles })
        .then(report => {
            if (format === 'json') {
                console.log(JSON.stringify(report, null, 2))
            } else {
                console.log(formatSourceReleaseStatusText(report, { includeFiles }))
            }
            process.exitCode = report.ok ? 0 : 1
        })
        .catch(error => {
            console.error(error instanceof Error ? error.message : error)
            process.exitCode = 1
        })
}
