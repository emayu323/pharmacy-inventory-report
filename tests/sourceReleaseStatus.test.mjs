import assert from 'node:assert/strict'
import test from 'node:test'
import {
    createSourceReleaseStatus,
    formatSourceReleaseStatusText
} from '../scripts/source_release_status.mjs'

test('source release status reports dirty local changes without listing filenames', async () => {
    const report = await createSourceReleaseStatus({
        execFileImpl: fakeGit({
            'rev-parse --show-toplevel': { stdout: '/repo\n' },
            'status --short --branch': {
                stdout: [
                    '## main...origin/main',
                    ' M package.json',
                    '?? scripts/source_release_status.mjs',
                    '?? tests/sourceReleaseStatus.test.mjs'
                ].join('\n')
            },
            'remote get-url origin': { stdout: 'https://github.com/example/pharmacy-report.git\n' }
        })
    })

    assert.equal(report.ok, true)
    assert.equal(report.ready, false)
    assert.equal(report.clean, false)
    assert.equal(report.branch, 'main')
    assert.equal(report.upstream, 'origin/main')
    assert.equal(report.changedCount, 3)
    assert.equal(report.untrackedCount, 2)
    assert.equal(report.modifiedCount, 1)
    assert.equal(report.publishState, 'local_changes')
    assert.match(report.nextActions.join('\n'), /git status --short/)

    const text = formatSourceReleaseStatusText(report)
    assert.match(text, /ローカルGit判定: 未反映あり/)
    assert.match(text, /changed files: 3/)
    assert.match(text, /untracked files: 2/)
    assert.doesNotMatch(text, /package\.json/)
    assert.doesNotMatch(text, /source_release_status/)
})

test('source release status can include changed file details when explicitly requested', async () => {
    const report = await createSourceReleaseStatus({
        includeFiles: true,
        execFileImpl: fakeGit({
            'rev-parse --show-toplevel': { stdout: '/repo\n' },
            'status --short --branch --untracked-files=all': {
                stdout: [
                    '## main...origin/main',
                    ' M package.json',
                    'D  old-script.mjs',
                    'R  docs/old.md -> docs/new.md',
                    '?? scripts/source_release_status.mjs'
                ].join('\n')
            },
            'remote get-url origin': { stdout: 'https://github.com/example/pharmacy-report.git\n' }
        })
    })

    assert.deepEqual(report.files, [
        { status: 'M', kind: 'modified', path: 'package.json' },
        { status: 'D', kind: 'deleted', path: 'old-script.mjs' },
        { status: 'R', kind: 'renamed', path: 'docs/old.md -> docs/new.md' },
        { status: '??', kind: 'untracked', path: 'scripts/source_release_status.mjs' }
    ])
    const text = formatSourceReleaseStatusText(report, { includeFiles: true })

    assert.match(text, /変更ファイル/)
    assert.match(text, /\[modified\] package\.json/)
    assert.match(text, /\[deleted\] old-script\.mjs/)
    assert.match(text, /\[renamed\] docs\/old\.md -> docs\/new\.md/)
    assert.match(text, /\[untracked\] scripts\/source_release_status\.mjs/)
})

test('source release status expands untracked files for explicit details', async () => {
    const report = await createSourceReleaseStatus({
        includeFiles: true,
        execFileImpl: fakeGit({
            'rev-parse --show-toplevel': { stdout: '/repo\n' },
            'status --short --branch --untracked-files=all': {
                stdout: [
                    '## main...origin/main',
                    '?? tests/sourceReleaseStatus.test.mjs',
                    '?? tests/sourcePublicationChecklist.test.mjs'
                ].join('\n')
            },
            'remote get-url origin': { stdout: 'https://github.com/example/pharmacy-report.git\n' }
        })
    })

    assert.deepEqual(report.files?.map(file => file.path), [
        'tests/sourceReleaseStatus.test.mjs',
        'tests/sourcePublicationChecklist.test.mjs'
    ])
    assert.equal(report.changedCount, 2)
    assert.equal(report.untrackedCount, 2)
})

test('source release status reports clean branch with unpushed commits', async () => {
    const report = await createSourceReleaseStatus({
        execFileImpl: fakeGit({
            'rev-parse --show-toplevel': { stdout: '/repo\n' },
            'status --short --branch': { stdout: '## main...origin/main [ahead 2]\n' },
            'remote get-url origin': { stdout: 'https://github.com/example/pharmacy-report.git\n' }
        })
    })

    assert.equal(report.ok, true)
    assert.equal(report.ready, false)
    assert.equal(report.clean, true)
    assert.equal(report.ahead, 2)
    assert.equal(report.publishState, 'unpushed_commits')
    assert.match(report.nextActions.join('\n'), /Push current branch or open a PR/)
})

test('source release status reports synced source as ready', async () => {
    const report = await createSourceReleaseStatus({
        execFileImpl: fakeGit({
            'rev-parse --show-toplevel': { stdout: '/repo\n' },
            'status --short --branch': { stdout: '## main...origin/main\n' },
            'remote get-url origin': { stdout: 'https://github.com/example/pharmacy-report.git\n' },
            'ls-files': { stdout: '' }
        })
    })

    assert.equal(report.ok, true)
    assert.equal(report.ready, true)
    assert.equal(report.clean, true)
    assert.equal(report.publishState, 'synced')

    const text = formatSourceReleaseStatusText(report)
    assert.match(text, /ローカルGit判定: 同期済み/)
    assert.match(text, /ready: true/)
})

test('source release status blocks publication when sensitive local files are tracked', async () => {
    const report = await createSourceReleaseStatus({
        execFileImpl: fakeGit({
            'rev-parse --show-toplevel': { stdout: '/repo\n' },
            'status --short --branch': { stdout: '## main...origin/main\n' },
            'remote get-url origin': { stdout: 'https://github.com/example/pharmacy-report.git\n' },
            'ls-files': { stdout: '.env\nsrc/data/y_ALL20260522.csv\nsrc/App.tsx\n' }
        })
    })

    assert.equal(report.ok, true)
    assert.equal(report.ready, false)
    assert.equal(report.clean, true)
    assert.equal(report.publishState, 'tracked_sensitive_files')
    assert.deepEqual(report.trackedSensitivePaths, [
        '.env',
        'src/data/y_ALL20260522.csv'
    ])
    assert.match(report.message, /2 tracked sensitive or local-only file/)

    const text = formatSourceReleaseStatusText(report)
    assert.match(text, /tracked sensitive files: 2/)
    assert.doesNotMatch(text, /src\/App\.tsx/)
})

test('source release status returns an actionable error outside a git repository', async () => {
    const report = await createSourceReleaseStatus({
        execFileImpl: fakeGit({
            'rev-parse --show-toplevel': {
                code: 128,
                stderr: 'fatal: not a git repository'
            }
        })
    })

    assert.equal(report.ok, false)
    assert.equal(report.ready, false)
    assert.equal(report.publishState, 'unknown')
    assert.match(report.message, /not a git repository/)
    assert.match(report.nextActions.join('\n'), /Run this command inside the repository/)
})

function fakeGit(responses) {
    return async (command, args) => {
        assert.equal(command, 'git')
        const key = args.join(' ')
        const response = responses[key]
        if (!response && key === 'ls-files') {
            return {
                stdout: '',
                stderr: ''
            }
        }
        if (!response) {
            throw Object.assign(new Error(`Unexpected git command: ${key}`), {
                code: 1,
                stderr: 'unexpected command'
            })
        }
        if (response.code) {
            throw Object.assign(new Error(response.stderr || 'git failed'), {
                code: response.code,
                stdout: response.stdout || '',
                stderr: response.stderr || ''
            })
        }
        return {
            stdout: response.stdout || '',
            stderr: response.stderr || ''
        }
    }
}
