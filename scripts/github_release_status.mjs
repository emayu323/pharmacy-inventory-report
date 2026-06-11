import { execFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import { pathToFileURL } from 'node:url'

const execFileAsync = promisify(execFile)
const DEFAULT_WORKFLOW_FILE = 'windows-installer.yml'
const DEFAULT_ARTIFACT_NAME = 'pharmacy-report-windows-installer'

export async function createGitHubReleaseStatus(options = {}) {
    const workflowFile = options.workflowFile || DEFAULT_WORKFLOW_FILE
    const artifactName = options.artifactName || DEFAULT_ARTIFACT_NAME
    const execFileImpl = options.execFileImpl || execFileAsync
    const cwd = options.cwd || process.cwd()
    const releaseRepository = options.releaseRepository || readReleaseRepositoryConfig(cwd)

    const workflowResult = await runGh(execFileImpl, ['workflow', 'view', workflowFile], cwd)
    if (!workflowResult.ok) {
        const missing = isWorkflowMissing(workflowResult)
        return {
            ok: missing,
            ready: false,
            workflow: {
                file: workflowFile,
                status: missing ? 'missing' : 'error',
                message: missing
                    ? `${workflowFile} is not available on the default branch`
                    : workflowResult.message
            },
            releaseRepository: null,
            latestRun: null,
            artifact: null,
            nextActions: missing
                ? [
                    `Commit and push .github/workflows/${workflowFile} to the default branch`,
                    'Run npm run release:github-status again'
                ]
                : [
                    'Check gh authentication and repository access',
                    'Run npm run release:github-status again'
                ]
        }
    }

    const baseReport = {
        ok: true,
        ready: false,
        workflow: {
            file: workflowFile,
            status: 'present',
            message: 'Workflow is available on GitHub'
        },
        releaseRepository: null,
        latestRun: null,
        artifact: null,
        nextActions: []
    }

    const releaseRepositoryStatus = releaseRepository
        ? await readReleaseRepositoryStatus(execFileImpl, releaseRepository, cwd)
        : null
    baseReport.releaseRepository = releaseRepositoryStatus

    const runListResult = await runGh(execFileImpl, [
        'run',
        'list',
        '--workflow',
        workflowFile,
        '--limit',
        '1',
        '--json',
        'databaseId,status,conclusion,headBranch,displayTitle,createdAt,url'
    ], cwd)
    if (!runListResult.ok) {
        return {
            ...baseReport,
            ok: false,
            latestRun: {
                status: 'unknown',
                message: runListResult.message
            },
            nextActions: [
                'Check gh authentication and repository access',
                'Run npm run release:github-status again'
            ]
        }
    }

    const runs = parseJson(runListResult.stdout, [])
    const latestRun = Array.isArray(runs) ? normalizeRun(runs[0]) : null
    if (!latestRun) {
        return {
            ...baseReport,
            latestRun: null,
            artifact: {
                name: artifactName,
                status: 'none',
                message: 'No workflow runs were found'
            },
            nextActions: [
                ...createReleaseRepositoryNextActions(releaseRepositoryStatus),
                `gh workflow run ${workflowFile}`,
                'Run npm run release:github-status again after the workflow completes'
            ]
        }
    }

    if (latestRun.status !== 'completed' || latestRun.conclusion !== 'success') {
        return {
            ...baseReport,
            latestRun,
            artifact: {
                name: artifactName,
                status: 'unavailable',
                message: 'Latest workflow run did not complete successfully'
            },
            nextActions: [
                `Open ${latestRun.url || 'the latest workflow run'} and fix the failure`,
                `gh workflow run ${workflowFile}`
            ]
        }
    }

    const runViewResult = await runGh(execFileImpl, [
        'run',
        'view',
        String(latestRun.databaseId),
        '--json',
        'artifacts,url,status,conclusion'
    ], cwd)
    if (!runViewResult.ok) {
        return {
            ...baseReport,
            latestRun,
            ok: false,
            artifact: {
                name: artifactName,
                status: 'unknown',
                message: runViewResult.message
            },
            nextActions: [
                `gh run view ${latestRun.databaseId}`,
                'Run npm run release:github-status again'
            ]
        }
    }

    const runDetails = parseJson(runViewResult.stdout, {})
    const artifact = findArtifact(runDetails?.artifacts, artifactName)
    if (!artifact || artifact.expired) {
        return {
            ...baseReport,
            latestRun,
            artifact: {
                name: artifactName,
                status: artifact?.expired ? 'expired' : 'missing',
                message: artifact?.expired
                    ? 'Installer artifact has expired'
                    : 'Installer artifact was not found on the latest successful run'
            },
            nextActions: [
                `gh workflow run ${workflowFile}`,
                'Run npm run release:github-status again after the workflow completes'
            ]
        }
    }

    return {
        ...baseReport,
        ready: isReleaseRepositoryReady(releaseRepositoryStatus),
        latestRun,
        artifact: {
            name: artifactName,
            status: 'present',
            expired: Boolean(artifact.expired),
            message: 'Installer artifact is available'
        },
        nextActions: [
            ...createReleaseRepositoryNextActions(releaseRepositoryStatus),
            `gh run download ${latestRun.databaseId} -n ${artifactName} -D release`,
            'npm run release:check -- --format text'
        ]
    }
}

export function formatGitHubReleaseStatusText(report) {
    const state = report.ready ? '完了' : report.ok ? '未完了' : '要修正'
    const lines = [
        `GitHub Actions判定: ${state}`,
        `ok: ${report.ok}`,
        `ready: ${report.ready}`,
        `workflow: ${report.workflow?.status || 'unknown'} (${report.workflow?.file || DEFAULT_WORKFLOW_FILE})`,
        `release repo: ${formatReleaseRepository(report.releaseRepository)}`,
        `latest run: ${formatRun(report.latestRun)}`,
        `artifact: ${report.artifact?.status || 'unknown'} (${report.artifact?.name || DEFAULT_ARTIFACT_NAME})`
    ]

    if (report.nextActions?.length) {
        lines.push('', '次の作業:')
        report.nextActions.forEach((action, index) => {
            lines.push(`${index + 1}. ${action}`)
        })
    }
    return lines.join('\n')
}

function readReleaseRepositoryConfig(cwd) {
    try {
        const packageJson = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'))
        const publishConfig = packageJson?.build?.win?.publish
        const githubPublishConfig = Array.isArray(publishConfig)
            ? publishConfig.find(item => item?.provider === 'github' && item.owner && item.repo)
            : null
        if (!githubPublishConfig) return null
        return {
            owner: githubPublishConfig.owner,
            repo: githubPublishConfig.repo,
            nameWithOwner: `${githubPublishConfig.owner}/${githubPublishConfig.repo}`,
            expectedPrivate: Boolean(githubPublishConfig.private)
        }
    } catch {
        return null
    }
}

async function readReleaseRepositoryStatus(execFileImpl, releaseRepository, cwd) {
    const result = await runGh(execFileImpl, [
        'repo',
        'view',
        releaseRepository.nameWithOwner,
        '--json',
        'nameWithOwner,isPrivate'
    ], cwd)
    if (!result.ok) {
        const missing = /not found|could not resolve to a Repository|HTTP 404/i.test(`${result.stderr}\n${result.message}`)
        return {
            nameWithOwner: releaseRepository.nameWithOwner,
            expectedPrivate: releaseRepository.expectedPrivate,
            status: missing ? 'missing' : 'error',
            message: missing
                ? `Public release repository ${releaseRepository.nameWithOwner} is not available`
                : result.message
        }
    }
    const data = parseJson(result.stdout, {})
    const isPrivate = Boolean(data?.isPrivate)
    const expectedPrivate = releaseRepository.expectedPrivate
    const visibilityMatches = isPrivate === expectedPrivate
    return {
        nameWithOwner: data?.nameWithOwner || releaseRepository.nameWithOwner,
        expectedPrivate,
        private: isPrivate,
        status: visibilityMatches ? 'present' : 'wrong_visibility',
        message: visibilityMatches
            ? `Release repository ${releaseRepository.nameWithOwner} is accessible`
            : `Release repository ${releaseRepository.nameWithOwner} must be ${expectedPrivate ? 'private' : 'public'}`
    }
}

function isReleaseRepositoryReady(status) {
    return !status || status.status === 'present'
}

function createReleaseRepositoryNextActions(status) {
    if (!status || status.status === 'present') return []
    if (status.status === 'missing') {
        return [
            `Create public GitHub repository ${status.nameWithOwner}`,
            `Configure RELEASES_GITHUB_TOKEN with write access to ${status.nameWithOwner}`
        ]
    }
    if (status.status === 'wrong_visibility') {
        return [
            `Set GitHub repository ${status.nameWithOwner} visibility to ${status.expectedPrivate ? 'private' : 'public'}`,
            `Run npm run release:github-status again`
        ]
    }
    return [
        `Check GitHub repository access for ${status.nameWithOwner}`,
        'Run npm run release:github-status again'
    ]
}

async function runGh(execFileImpl, args, cwd) {
    try {
        const result = await execFileImpl('gh', args, { cwd })
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
            message: error?.stderr || error?.message || 'gh command failed'
        }
    }
}

function isWorkflowMissing(result) {
    return /not found on the default branch|HTTP 404/i.test(`${result.stderr}\n${result.message}`)
}

function parseJson(value, fallback) {
    try {
        return JSON.parse(String(value || ''))
    } catch {
        return fallback
    }
}

function normalizeRun(run) {
    if (!run || typeof run !== 'object') return null
    return {
        databaseId: run.databaseId,
        status: run.status || 'unknown',
        conclusion: run.conclusion || '',
        headBranch: run.headBranch || '',
        displayTitle: run.displayTitle || '',
        createdAt: run.createdAt || '',
        url: run.url || ''
    }
}

function findArtifact(artifacts, artifactName) {
    if (!Array.isArray(artifacts)) return null
    return artifacts.find(artifact => artifact?.name === artifactName) || null
}

function formatRun(run) {
    if (!run) return 'none'
    const status = [run.status, run.conclusion].filter(Boolean).join('/')
    return `${run.databaseId || 'unknown'} ${status || 'unknown'}${run.url ? ` ${run.url}` : ''}`
}

function formatReleaseRepository(repository) {
    if (!repository) return 'not configured'
    const visibility = repository.private ? 'private' : 'public'
    return `${repository.status || 'unknown'} (${repository.nameWithOwner || 'unknown'} ${visibility})`
}

function parseArgs(argv) {
    const options = {}
    let format = 'text'
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index]
        if (arg === '--workflow') {
            options.workflowFile = argv[index + 1]
            index += 1
        } else if (arg === '--artifact') {
            options.artifactName = argv[index + 1]
            index += 1
        } else if (arg === '--format') {
            format = argv[index + 1] || format
            index += 1
        }
    }
    return { options, format }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    const { options, format } = parseArgs(process.argv.slice(2))
    createGitHubReleaseStatus(options)
        .then(report => {
            if (format === 'json') {
                console.log(JSON.stringify(report, null, 2))
            } else {
                console.log(formatGitHubReleaseStatusText(report))
            }
            process.exitCode = report.ok ? 0 : 1
        })
        .catch(error => {
            console.error(error instanceof Error ? error.message : error)
            process.exitCode = 1
        })
}
