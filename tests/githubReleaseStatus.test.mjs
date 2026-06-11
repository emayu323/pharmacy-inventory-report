import assert from 'node:assert/strict'
import test from 'node:test'
import {
    createGitHubReleaseStatus,
    formatGitHubReleaseStatusText
} from '../scripts/github_release_status.mjs'

test('GitHub release status reports missing workflow on default branch as pending', async () => {
    const report = await createGitHubReleaseStatus({
        execFileImpl: fakeGh({
            'workflow view windows-installer.yml': {
                code: 1,
                stderr: 'HTTP 404: workflow windows-installer.yml not found on the default branch'
            }
        })
    })

    assert.equal(report.ok, true)
    assert.equal(report.ready, false)
    assert.equal(report.workflow.status, 'missing')
    assert.match(report.workflow.message, /default branch/i)
    assert.deepEqual(report.nextActions, [
        'Commit and push .github/workflows/windows-installer.yml to the default branch',
        'Run npm run release:github-status again'
    ])
})

test('GitHub release status reports latest successful run artifact download command', async () => {
    const report = await createGitHubReleaseStatus({
        execFileImpl: fakeGh({
            'workflow view windows-installer.yml': {
                stdout: 'Windows Installer'
            },
            'run list --workflow windows-installer.yml --limit 1 --json databaseId,status,conclusion,headBranch,displayTitle,createdAt,url': {
                stdout: JSON.stringify([
                    {
                        databaseId: 12345,
                        status: 'completed',
                        conclusion: 'success',
                        headBranch: 'main',
                        displayTitle: 'Build Windows installer',
                        createdAt: '2026-06-11T09:00:00Z',
                        url: 'https://github.com/example/actions/runs/12345'
                    }
                ])
            },
            'run view 12345 --json artifacts,url,status,conclusion': {
                stdout: JSON.stringify({
                    status: 'completed',
                    conclusion: 'success',
                    url: 'https://github.com/example/actions/runs/12345',
                    artifacts: [
                        {
                            name: 'pharmacy-report-windows-installer',
                            expired: false
                        }
                    ]
                })
            }
        })
    })

    assert.equal(report.ok, true)
    assert.equal(report.ready, true)
    assert.equal(report.workflow.status, 'present')
    assert.equal(report.latestRun?.databaseId, 12345)
    assert.equal(report.artifact?.status, 'present')
    assert.deepEqual(report.nextActions, [
        'gh run download 12345 -n pharmacy-report-windows-installer -D release',
        'npm run release:check -- --format text'
    ])
})

test('GitHub release status text is human readable without raw JSON', async () => {
    const report = await createGitHubReleaseStatus({
        execFileImpl: fakeGh({
            'workflow view windows-installer.yml': {
                stdout: 'Windows Installer'
            },
            'run list --workflow windows-installer.yml --limit 1 --json databaseId,status,conclusion,headBranch,displayTitle,createdAt,url': {
                stdout: '[]'
            }
        })
    })
    const text = formatGitHubReleaseStatusText(report)

    assert.match(text, /GitHub Actions判定: 未完了/)
    assert.match(text, /workflow: present/)
    assert.match(text, /latest run: none/)
    assert.match(text, /gh workflow run windows-installer\.yml/)
    assert.doesNotMatch(text, /\{\s*"workflow"/)
})

function fakeGh(responses) {
    return async (command, args) => {
        assert.equal(command, 'gh')
        const key = args.join(' ')
        const response = responses[key]
        if (!response) {
            throw Object.assign(new Error(`Unexpected gh command: ${key}`), {
                code: 1,
                stderr: 'unexpected command'
            })
        }
        if (response.code) {
            throw Object.assign(new Error(response.stderr || 'gh failed'), {
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
