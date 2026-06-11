import { execFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import { pathToFileURL } from 'node:url'

const execFileAsync = promisify(execFile)
const DEFAULT_WORKFLOW_FILE = 'windows-installer.yml'
const DEFAULT_ARTIFACT_NAME = 'pharmacy-report-windows-installer'
const DEFAULT_RELEASE_TOKEN_SECRET = 'RELEASES_GITHUB_TOKEN'
const DEFAULT_CODE_SIGNING_SECRETS = ['WINDOWS_CSC_LINK', 'WINDOWS_CSC_KEY_PASSWORD']
const DEFAULT_AUTO_UPDATE_VARIABLES = ['AUTO_UPDATE_RELEASE_PUBLISH_ENABLED', 'LOCAL_CODE_SIGNING_ENABLED']

export async function createGitHubReleaseStatus(options = {}) {
    const workflowFile = options.workflowFile || DEFAULT_WORKFLOW_FILE
    const artifactName = options.artifactName || DEFAULT_ARTIFACT_NAME
    const execFileImpl = options.execFileImpl || execFileAsync
    const cwd = options.cwd || process.cwd()
    const releaseRepository = options.releaseRepository || readReleaseRepositoryConfig(cwd)
    const releaseTokenSecretName = options.releaseTokenSecretName || DEFAULT_RELEASE_TOKEN_SECRET
    const codeSigningSecretNames = options.codeSigningSecretNames || DEFAULT_CODE_SIGNING_SECRETS
    const autoUpdateVariableNames = options.autoUpdateVariableNames || DEFAULT_AUTO_UPDATE_VARIABLES

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
            releaseTokenSecret: null,
            codeSigningSecrets: null,
            autoUpdateVariables: null,
            latestRun: null,
            artifact: null,
            sourceRevision: null,
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
        releaseTokenSecret: null,
        codeSigningSecrets: null,
        autoUpdateVariables: null,
        latestRun: null,
        artifact: null,
        sourceRevision: null,
        nextActions: []
    }

    const releaseRepositoryStatus = releaseRepository
        ? await readReleaseRepositoryStatus(execFileImpl, releaseRepository, cwd)
        : null
    const actionSecretNamesStatus = await readGitHubActionsNames(execFileImpl, 'secret', cwd)
    const actionVariableNamesStatus = await readGitHubActionsNames(execFileImpl, 'variable', cwd)
    const releaseTokenSecretStatus = createNamedItemStatus(actionSecretNamesStatus, [releaseTokenSecretName], 'release token secret')
    const codeSigningSecretsStatus = createNamedItemStatus(actionSecretNamesStatus, codeSigningSecretNames, 'code signing secrets')
    const autoUpdateVariablesStatus = createNamedItemStatus(actionVariableNamesStatus, autoUpdateVariableNames, 'auto-update variables')
    baseReport.releaseRepository = releaseRepositoryStatus
    baseReport.releaseTokenSecret = releaseTokenSecretStatus
    baseReport.codeSigningSecrets = codeSigningSecretsStatus
    baseReport.autoUpdateVariables = autoUpdateVariablesStatus

    const runListResult = await runGh(execFileImpl, [
        'run',
        'list',
        '--workflow',
        workflowFile,
        '--limit',
        '1',
        '--json',
        'databaseId,status,conclusion,headBranch,displayTitle,createdAt,url,headSha'
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
                ...createReleasePrerequisiteNextActions(releaseRepositoryStatus, releaseTokenSecretStatus, codeSigningSecretsStatus, autoUpdateVariablesStatus),
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
            nextActions: uniqueActions([
                ...createReleasePrerequisiteNextActions(releaseRepositoryStatus, releaseTokenSecretStatus, codeSigningSecretsStatus, autoUpdateVariablesStatus),
                `gh workflow run ${workflowFile}`,
                'Run npm run release:github-status again after the workflow completes'
            ])
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
            nextActions: uniqueActions([
                `Open ${latestRun.url || 'the latest workflow run'} and fix the failure`,
                ...createReleasePrerequisiteNextActions(releaseRepositoryStatus, releaseTokenSecretStatus, codeSigningSecretsStatus, autoUpdateVariablesStatus),
                `gh workflow run ${workflowFile}`
            ])
        }
    }

    const artifactListResult = await runGh(execFileImpl, [
        'api',
        `repos/:owner/:repo/actions/runs/${latestRun.databaseId}/artifacts`
    ], cwd)
    if (!artifactListResult.ok) {
        return {
            ...baseReport,
            latestRun,
            ok: false,
            artifact: {
                name: artifactName,
                status: 'unknown',
                message: artifactListResult.message
            },
            nextActions: uniqueActions([
                `gh run view ${latestRun.databaseId}`,
                ...createReleasePrerequisiteNextActions(releaseRepositoryStatus, releaseTokenSecretStatus, codeSigningSecretsStatus, autoUpdateVariablesStatus),
                'Run npm run release:github-status again'
            ])
        }
    }

    const artifactDetails = parseJson(artifactListResult.stdout, {})
    const artifact = findArtifact(artifactDetails?.artifacts, artifactName)
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
            nextActions: uniqueActions([
                ...createReleasePrerequisiteNextActions(releaseRepositoryStatus, releaseTokenSecretStatus, codeSigningSecretsStatus, autoUpdateVariablesStatus),
                `gh workflow run ${workflowFile}`,
                'Run npm run release:github-status again after the workflow completes'
            ])
        }
    }

    const sourceRevision = await readSourceRevisionStatus(execFileImpl, cwd, latestRun, options.sourceHeadSha)
    const sourceRevisionReady = sourceRevision.status === 'current'

    return {
        ...baseReport,
        ready: sourceRevisionReady
            && isReleaseRepositoryReady(releaseRepositoryStatus)
            && isNamedItemStatusReady(releaseTokenSecretStatus)
            && isNamedItemStatusReady(codeSigningSecretsStatus)
            && isNamedItemStatusReady(autoUpdateVariablesStatus),
        latestRun,
        artifact: {
            name: artifactName,
            status: 'present',
            expired: Boolean(artifact.expired),
            message: 'Installer artifact is available'
        },
        sourceRevision,
        nextActions: uniqueActions([
            ...createReleasePrerequisiteNextActions(releaseRepositoryStatus, releaseTokenSecretStatus, codeSigningSecretsStatus, autoUpdateVariablesStatus),
            ...createArtifactNextActions(sourceRevision, workflowFile, latestRun, artifactName)
        ])
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
        `release token secret: ${formatReleaseTokenSecret(report.releaseTokenSecret)}`,
        `code signing secrets: ${formatNamedItemStatus(report.codeSigningSecrets, DEFAULT_CODE_SIGNING_SECRETS)}`,
        `auto-update variables: ${formatNamedItemStatus(report.autoUpdateVariables, DEFAULT_AUTO_UPDATE_VARIABLES)}`,
        `latest run: ${formatRun(report.latestRun)}`,
        `artifact: ${report.artifact?.status || 'unknown'} (${report.artifact?.name || DEFAULT_ARTIFACT_NAME})`,
        `source revision: ${formatSourceRevision(report.sourceRevision)}`
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

async function readGitHubActionsNames(execFileImpl, kind, cwd) {
    const result = await runGh(execFileImpl, [
        kind,
        'list',
        '--json',
        'name'
    ], cwd)
    if (!result.ok) {
        return {
            status: 'error',
            message: result.message
        }
    }
    const items = parseJson(result.stdout, [])
    return {
        status: 'read',
        names: Array.isArray(items)
            ? items.map(item => item?.name).filter(Boolean)
            : [],
        message: ''
    }
}

function isReleaseRepositoryReady(status) {
    return !status || status.status === 'present'
}

function createNamedItemStatus(namesStatus, requiredNames, label) {
    if (!namesStatus) return null
    if (namesStatus.status === 'error') {
        return {
            names: requiredNames,
            status: 'error',
            missing: requiredNames,
            message: namesStatus.message
        }
    }

    const presentNames = new Set(namesStatus.names || [])
    const missing = requiredNames.filter(name => !presentNames.has(name))
    return {
        names: requiredNames,
        status: missing.length ? 'missing' : 'present',
        missing,
        message: missing.length
            ? `${label} missing: ${missing.join(', ')}`
            : `${label} configured: ${requiredNames.join(', ')}`
    }
}

function isNamedItemStatusReady(status) {
    return !status || status.status === 'present'
}

async function readSourceRevisionStatus(execFileImpl, cwd, latestRun, sourceHeadSha) {
    const runHeadSha = normalizeSha(latestRun?.headSha)
    if (!runHeadSha) {
        return {
            status: 'unknown',
            runHeadSha: null,
            expectedHeadSha: normalizeSha(sourceHeadSha),
            message: 'Latest workflow run did not report a source revision'
        }
    }

    const expectedHeadSha = sourceHeadSha
        ? normalizeSha(sourceHeadSha)
        : await readGitHeadSha(execFileImpl, cwd)

    if (!expectedHeadSha) {
        return {
            status: 'unknown',
            runHeadSha,
            expectedHeadSha: null,
            message: `Current source revision could not be read for workflow run ${shortSha(runHeadSha)}`
        }
    }

    const current = runHeadSha === expectedHeadSha
    return {
        status: current ? 'current' : 'stale',
        runHeadSha,
        expectedHeadSha,
        message: current
            ? `Installer artifact was built from current source ${shortSha(expectedHeadSha)}`
            : `Installer artifact is stale: workflow run ${shortSha(runHeadSha)} != current source ${shortSha(expectedHeadSha)}`
    }
}

async function readGitHeadSha(execFileImpl, cwd) {
    try {
        const result = await execFileImpl('git', ['rev-parse', 'HEAD'], { cwd })
        return normalizeSha(result.stdout)
    } catch {
        return ''
    }
}

function createArtifactNextActions(sourceRevision, workflowFile, latestRun, artifactName) {
    if (sourceRevision?.status === 'current') {
        return [
            `gh run download ${latestRun.databaseId} -n ${artifactName} -D release`,
            'npm run release:check -- --format text'
        ]
    }
    if (sourceRevision?.status === 'stale') {
        return [
            `gh workflow run ${workflowFile}`,
            'Run npm run release:github-status again after the workflow completes'
        ]
    }
    return [
        'Run npm run release:source-status',
        `gh workflow run ${workflowFile}`,
        'Run npm run release:github-status again after the workflow completes'
    ]
}

function createReleasePrerequisiteNextActions(repositoryStatus, tokenSecretStatus, codeSigningSecretsStatus, autoUpdateVariablesStatus) {
    return uniqueActions([
        ...createReleaseRepositoryNextActions(repositoryStatus),
        ...createReleaseTokenSecretNextActions(repositoryStatus, tokenSecretStatus),
        ...createRequiredNamesNextActions('GitHub Actions secrets', codeSigningSecretsStatus),
        ...createRequiredNamesNextActions('GitHub Actions variables', autoUpdateVariablesStatus)
    ])
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

function createReleaseTokenSecretNextActions(repositoryStatus, secretStatus) {
    if (!secretStatus || secretStatus.status === 'present') return []
    if (secretStatus.status === 'missing') {
        const target = repositoryStatus?.nameWithOwner || 'the public release repository'
        return [
            `Configure ${secretStatus.names[0]} with write access to ${target}`
        ]
    }
    return [
        `Check GitHub Actions secret access for ${secretStatus.names[0]}`,
        'Run npm run release:github-status again'
    ]
}

function createRequiredNamesNextActions(label, status) {
    if (!status || status.status === 'present') return []
    if (status.status === 'missing') {
        return [
            `Configure ${label}: ${status.missing.join(', ')}`
        ]
    }
    return [
        `Check ${label} access: ${(status.names || []).join(', ')}`,
        'Run npm run release:github-status again'
    ]
}

function uniqueActions(actions) {
    return [...new Set(actions)]
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
        headSha: normalizeSha(run.headSha),
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
    const revision = run.headSha ? ` ${shortSha(run.headSha)}` : ''
    return `${run.databaseId || 'unknown'} ${status || 'unknown'}${revision}${run.url ? ` ${run.url}` : ''}`
}

function formatReleaseRepository(repository) {
    if (!repository) return 'not configured'
    const visibility = repository.private ? 'private' : 'public'
    return `${repository.status || 'unknown'} (${repository.nameWithOwner || 'unknown'} ${visibility})`
}

function formatReleaseTokenSecret(secret) {
    if (!secret) return 'not configured'
    return `${secret.status || 'unknown'} (${secret.names?.[0] || DEFAULT_RELEASE_TOKEN_SECRET})`
}

function formatNamedItemStatus(status, defaultNames) {
    if (!status) return 'not configured'
    return `${status.status || 'unknown'} (${(status.names?.length ? status.names : defaultNames).join(', ')})`
}

function formatSourceRevision(status) {
    if (!status) return 'not checked'
    const run = status.runHeadSha ? `run ${shortSha(status.runHeadSha)}` : 'run unknown'
    const expected = status.expectedHeadSha ? `source ${shortSha(status.expectedHeadSha)}` : 'source unknown'
    return `${status.status || 'unknown'} (${run}, ${expected})`
}

function normalizeSha(value) {
    const text = String(value || '').trim()
    return /^[a-f0-9]{40}$/i.test(text) ? text.toLowerCase() : ''
}

function shortSha(value) {
    return normalizeSha(value).slice(0, 7) || 'unknown'
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
