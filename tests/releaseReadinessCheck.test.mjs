import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createReleaseReadinessReport, formatReleaseReadinessReportText } from '../scripts/release_readiness_check.mjs'

const REQUIRED_FILES = [
    '.github/workflows/windows-installer.yml',
    'docs/local-first-requirements.md',
    'docs/local-first-implementation-plan.md',
    'docs/backup-key-operations.md',
    'docs/install-code-registry.example.json',
    'docs/install-code-usage-store.md',
    'docs/windows-installer-build.md',
    'docs/vercel-production-env.md',
    'docs/local-ai-integration-check.md',
    'electron/main.mjs',
    'electron/autoUpdateService.mjs',
    'electron/localSecurityStatus.mjs',
    'electron/preUpdateBackupCommand.mjs',
    'electron/windowsAutoLaunch.mjs',
    'public/manual.html',
    'scripts/windows_pre_update_backup.ps1',
    'scripts/verify_electron_package.mjs',
    'scripts/verify_vercel_production_env.mjs',
    'scripts/create_install_code_registry.mjs',
    'scripts/local_ai_integration_check.mjs',
    'scripts/mac_demo_readiness.mjs',
    'scripts/mac_demo_smoke.mjs',
    'scripts/github_release_status.mjs',
    'scripts/vercel_cloud_env_status.mjs',
    'scripts/vercel_production_smoke.mjs',
    'scripts/source_release_status.mjs',
    'scripts/source_publication_checklist.mjs',
    'scripts/release_handoff.mjs',
    'src/data/drug-master.generated.json',
    'src/main.tsx',
    'src/App.tsx',
    'src/components/LocalPinLock.tsx',
    'src/pages/EntryPortal.tsx',
    'src/pages/ReportEdit.tsx',
    'src/pages/Settings.tsx',
    'src/localAppConnection.ts',
    'src/patientRepository.ts',
    'src/reportRepository.ts',
    'src/reportPrintModel.ts',
    'src/reportSelection.ts',
    'src/institutionRepository.ts',
    'src/contexts/AuthProvider.tsx',
    '.node-version',
    'tsconfig.json',
    'vercel.ts'
]

const REQUIRED_SCRIPTS = [
    'test:local-app',
    'lint',
    'build',
    'build:electron',
    'dist:win',
    'dist:win:publish',
    'verify:electron-package',
    'verify:vercel-env',
    'release:check',
    'release:check:full',
    'release:handoff',
    'release:handoff:full',
    'release:github-status',
    'release:vercel-status',
    'release:vercel-smoke',
    'release:source-status',
    'release:source-checklist',
    'create:install-codes',
    'demo:mac-readiness',
    'demo:mac-smoke',
    'test:local-ai-integration',
    'test:local-ai-text'
]

test('release readiness check reports external pending items without failing normal mode', () => {
    const tmpDir = createFixture()

    try {
        const report = createReleaseReadinessReport({
            rootDir: tmpDir,
            env: {}
        })

        assert.equal(report.ok, true)
        assert.equal(report.ready, false)
        assert.equal(report.summary.fail, 0)
        assert.equal(report.checks.find(check => check.id === 'required_files')?.status, 'pass')
        assert.equal(report.checks.find(check => check.id === 'package_scripts')?.status, 'pass')
        assert.equal(report.checks.find(check => check.id === 'windows_installer_workflow')?.status, 'pass')
        assert.equal(report.checks.find(check => check.id === 'mac_electron_package')?.status, 'pending')
        assert.equal(report.checks.find(check => check.id === 'windows_installer_artifact')?.status, 'pending')
        assert.equal(report.checks.find(check => check.id === 'vercel_production_env')?.status, 'pending')
        assert.equal(report.checks.find(check => check.id === 'local_ai_integration')?.status, 'pending')

        const strictReport = createReleaseReadinessReport({
            rootDir: tmpDir,
            env: {},
            strict: true
        })
        assert.equal(strictReport.ok, false)
        assert.equal(strictReport.ready, false)
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true })
    }
})

test('release readiness check includes concrete next actions for external pending items', () => {
    const tmpDir = createFixture({
        macPackage: true
    })

    try {
        const report = createReleaseReadinessReport({
            rootDir: tmpDir,
            env: {}
        })

        assert.equal(report.ok, true)
        assert.equal(report.ready, false)
        assert.deepEqual(report.nextActions.map(action => action.id), [
            'windows_installer_artifact',
            'vercel_production_env',
            'local_ai_integration'
        ])

        const windowsAction = report.nextActions.find(action => action.id === 'windows_installer_artifact')
        assert.equal(windowsAction?.docs, 'docs/windows-installer-build.md')
        assert.equal(windowsAction?.status, 'pending')
        assert.deepEqual(windowsAction?.commands, [
            'npm run release:github-status',
            'npm run dist:win'
        ])
        assert.match(windowsAction?.description || '', /GitHub Actions/)

        const vercelAction = report.nextActions.find(action => action.id === 'vercel_production_env')
        assert.equal(vercelAction?.docs, 'docs/vercel-production-env.md')
        assert.deepEqual(vercelAction?.commands, [
            'npm run verify:vercel-env -- --env-file .env.production.local',
            'npm run release:vercel-status',
            'npm run release:check -- --env-file .env.production.local'
        ])

        const aiAction = report.nextActions.find(action => action.id === 'local_ai_integration')
        assert.equal(aiAction?.docs, 'docs/local-ai-integration-check.md')
        assert.deepEqual(aiAction?.commands, [
            'npm run test:local-ai-text -- --ollama-model <model>',
            'npm run release:check -- --ai-receipt output/local-ai-integration-result.json'
        ])
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true })
    }
})

test('release readiness check can include local source publication state as an optional pending gate', () => {
    const tmpDir = createFixture({
        macPackage: true
    })

    try {
        const report = createReleaseReadinessReport({
            rootDir: tmpDir,
            env: {},
            sourceStatus: sourceStatusFixture({
                ready: false,
                clean: false,
                publishState: 'local_changes',
                changedCount: 3,
                untrackedCount: 2,
                trackedSensitiveCount: 1,
                message: '3 local file(s) differ from Git, including 2 untracked file(s)'
            })
        })
        const sourceCheck = report.checks.find(check => check.id === 'source_publication')
        const sourceAction = report.nextActions.find(action => action.id === 'source_publication')

        assert.equal(report.ok, true)
        assert.equal(report.ready, false)
        assert.equal(sourceCheck?.status, 'pending')
        assert.match(sourceCheck?.message || '', /local_changes/)
        assert.match(sourceCheck?.message || '', /3 changed/)
        assert.match(sourceCheck?.message || '', /1 tracked sensitive/)
        assert.match(sourceAction?.description || '', /3 changed file/)
        assert.equal(sourceAction?.docs, 'docs/windows-installer-build.md')
        assert.deepEqual(sourceAction?.commands, [
            'npm run release:source-checklist',
            'npm run release:source-status',
            'npm run release:github-status'
        ])

        const strictReport = createReleaseReadinessReport({
            rootDir: tmpDir,
            env: {},
            strict: true,
            sourceStatus: sourceStatusFixture({
                ready: false,
                clean: false,
                publishState: 'local_changes'
            })
        })
        assert.equal(strictReport.ok, false)
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true })
    }
})

test('release readiness check passes source publication when local source is synchronized', () => {
    const tmpDir = createFixture({
        macPackage: true,
        windowsInstaller: true
    })
    const receiptPath = path.join(tmpDir, 'ai-receipt.json')
    writeFixtureFile(tmpDir, '.env.production.local', [
        'INSTALL_CODE_REGISTRY=\'{"codes":[{"code":"READY-1234","maxDevices":2}]}\'',
        'WINDOWS_INSTALLER_URL=https://example.com/pharmacy-report-setup-0.1.0-x64.exe'
    ].join('\n'))
    fs.writeFileSync(receiptPath, JSON.stringify(aiReceiptFixture()))

    try {
        const report = createReleaseReadinessReport({
            rootDir: tmpDir,
            env: {},
            envFile: '.env.production.local',
            aiReceiptPath: receiptPath,
            strict: true,
            sourceStatus: sourceStatusFixture({
                ready: true,
                clean: true,
                publishState: 'synced',
                message: 'Local source is clean and synchronized with upstream'
            })
        })
        const sourceCheck = report.checks.find(check => check.id === 'source_publication')

        assert.equal(report.ok, true)
        assert.equal(report.ready, true)
        assert.equal(sourceCheck?.status, 'pass')
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true })
    }
})

test('release readiness text format summarizes release state and next actions for humans', () => {
    const tmpDir = createFixture({
        macPackage: true
    })

    try {
        const report = createReleaseReadinessReport({
            rootDir: tmpDir,
            env: {}
        })
        const text = formatReleaseReadinessReportText(report)

        assert.match(text, /リリース判定: 未完了/)
        assert.match(text, /ok: true/)
        assert.match(text, /ready: false/)
        assert.match(text, /pass 10, warn 0, pending 3, fail 0/)
        assert.match(text, /次の作業/)
        assert.match(text, /Windows installer artifact/)
        assert.match(text, /docs\/windows-installer-build\.md/)
        assert.match(text, /npm run dist:win/)
        assert.match(text, /Vercel production environment/)
        assert.match(text, /docs\/vercel-production-env\.md/)
        assert.match(text, /Local AI integration receipt/)
        assert.match(text, /docs\/local-ai-integration-check\.md/)
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true })
    }
})

test('release readiness check becomes ready when artifacts env and AI receipt are present', () => {
    const tmpDir = createFixture({
        macPackage: true,
        windowsInstaller: true
    })
    const receiptPath = path.join(tmpDir, 'ai-receipt.json')
    writeFixtureFile(tmpDir, '.env.production.local', [
        'INSTALL_CODE_REGISTRY=\'{"codes":[{"code":"READY-1234","maxDevices":2}]}\'',
        'WINDOWS_INSTALLER_URL=https://example.com/pharmacy-report-setup-0.1.0-x64.exe'
    ].join('\n'))
    fs.writeFileSync(receiptPath, JSON.stringify(aiReceiptFixture()))

    try {
        const report = createReleaseReadinessReport({
            rootDir: tmpDir,
            env: {},
            envFile: '.env.production.local',
            aiReceiptPath: receiptPath,
            strict: true
        })

        assert.equal(report.ok, true)
        assert.equal(report.ready, true)
        assert.equal(report.summary.pass, report.summary.total)
        assert.equal(report.checks.find(check => check.id === 'vercel_production_env')?.status, 'pass')
        assert.equal(report.checks.find(check => check.id === 'local_ai_integration')?.status, 'pass')
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true })
    }
})

test('release readiness check can include Vercel cloud env status as an optional pending gate', () => {
    const tmpDir = createFixture({
        macPackage: true,
        windowsInstaller: true
    })
    const receiptPath = path.join(tmpDir, 'ai-receipt.json')
    writeFixtureFile(tmpDir, '.env.production.local', [
        'INSTALL_CODE_REGISTRY=\'{"codes":[{"code":"READY-1234","maxDevices":2}]}\'',
        'WINDOWS_INSTALLER_URL=https://example.com/pharmacy-report-setup-0.1.0-x64.exe'
    ].join('\n'))
    fs.writeFileSync(receiptPath, JSON.stringify(aiReceiptFixture()))

    try {
        const report = createReleaseReadinessReport({
            rootDir: tmpDir,
            env: {},
            envFile: '.env.production.local',
            aiReceiptPath: receiptPath,
            vercelCloudStatus: {
                ok: true,
                ready: false,
                message: 'missing INSTALL_CODE_REGISTRY, WINDOWS_INSTALLER_URL',
                missingRequired: ['INSTALL_CODE_REGISTRY', 'WINDOWS_INSTALLER_URL'],
                staleAppEnv: ['VITE_SUPABASE_URL'],
                presentRequired: [],
                nextActions: []
            }
        })
        const cloudCheck = report.checks.find(check => check.id === 'vercel_cloud_env')
        const cloudAction = report.nextActions.find(action => action.id === 'vercel_cloud_env')

        assert.equal(report.ok, true)
        assert.equal(report.ready, false)
        assert.equal(cloudCheck?.status, 'pending')
        assert.match(cloudCheck?.message || '', /INSTALL_CODE_REGISTRY/)
        assert.equal(cloudAction?.docs, 'docs/vercel-production-env.md')
        assert.deepEqual(cloudAction?.commands, [
            'npm run release:vercel-status',
            'vercel env rm VITE_SUPABASE_URL production',
            'vercel env rm VITE_SUPABASE_ANON_KEY production',
            'vercel env add INSTALL_CODE_REGISTRY production',
            'vercel env add WINDOWS_INSTALLER_URL production'
        ])
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true })
    }
})

test('release readiness check can include Vercel production smoke status as an optional gate', () => {
    const tmpDir = createFixture({
        macPackage: true,
        windowsInstaller: true
    })
    const receiptPath = path.join(tmpDir, 'ai-receipt.json')
    writeFixtureFile(tmpDir, '.env.production.local', [
        'INSTALL_CODE_REGISTRY=\'{"codes":[{"code":"READY-1234","maxDevices":2}]}\'',
        'WINDOWS_INSTALLER_URL=https://example.com/pharmacy-report-setup-0.1.0-x64.exe'
    ].join('\n'))
    fs.writeFileSync(receiptPath, JSON.stringify(aiReceiptFixture()))

    try {
        const passReport = createReleaseReadinessReport({
            rootDir: tmpDir,
            env: {},
            envFile: '.env.production.local',
            aiReceiptPath: receiptPath,
            vercelProductionSmokeStatus: {
                ok: true,
                ready: true,
                message: 'Vercel production entry and install-code API smoke checks passed'
            }
        })
        assert.equal(passReport.ok, true)
        assert.equal(passReport.checks.find(check => check.id === 'vercel_production_smoke')?.status, 'pass')

        const failReport = createReleaseReadinessReport({
            rootDir: tmpDir,
            env: {},
            envFile: '.env.production.local',
            aiReceiptPath: receiptPath,
            vercelProductionSmokeStatus: {
                ok: true,
                ready: false,
                message: 'POST /api/install-code/verify returned 500 unknown'
            }
        })
        const smokeCheck = failReport.checks.find(check => check.id === 'vercel_production_smoke')
        const smokeAction = failReport.nextActions.find(action => action.id === 'vercel_production_smoke')

        assert.equal(failReport.ok, false)
        assert.equal(smokeCheck?.status, 'fail')
        assert.match(smokeCheck?.message || '', /500/)
        assert.equal(smokeAction?.docs, 'docs/vercel-production-env.md')
        assert.deepEqual(smokeAction?.commands, [
            'npm run release:vercel-smoke',
            'vercel logs https://pharmacy-inventory-report.vercel.app --since 10m --expand --level error'
        ])
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true })
    }
})

test('release readiness check can include GitHub Actions artifact status as an optional pending gate', () => {
    const tmpDir = createFixture({
        macPackage: true,
        windowsInstaller: true
    })
    const receiptPath = path.join(tmpDir, 'ai-receipt.json')
    writeFixtureFile(tmpDir, '.env.production.local', [
        'INSTALL_CODE_REGISTRY=\'{"codes":[{"code":"READY-1234","maxDevices":2}]}\'',
        'WINDOWS_INSTALLER_URL=https://example.com/pharmacy-report-setup-0.1.0-x64.exe'
    ].join('\n'))
    fs.writeFileSync(receiptPath, JSON.stringify(aiReceiptFixture()))

    try {
        const report = createReleaseReadinessReport({
            rootDir: tmpDir,
            env: {},
            envFile: '.env.production.local',
            aiReceiptPath: receiptPath,
            githubReleaseStatus: {
                ok: true,
                ready: false,
                workflow: {
                    file: 'windows-installer.yml',
                    status: 'present',
                    message: 'Workflow is available on GitHub'
                },
                releaseRepository: {
                    nameWithOwner: 'emayu323/pharmacy-report-releases',
                    expectedPrivate: false,
                    status: 'missing',
                    message: 'Public release repository emayu323/pharmacy-report-releases is not available'
                },
                latestRun: null,
                artifact: {
                    name: 'pharmacy-report-windows-installer',
                    status: 'none',
                    message: 'No workflow runs were found'
                },
                nextActions: [
                    'gh workflow run windows-installer.yml',
                    'Run npm run release:github-status again after the workflow completes'
                ]
            }
        })
        const githubCheck = report.checks.find(check => check.id === 'github_release_status')
        const githubAction = report.nextActions.find(action => action.id === 'github_release_status')
        const publishCheck = report.checks.find(check => check.id === 'auto_update_publish_prerequisites')
        const publishAction = report.nextActions.find(action => action.id === 'auto_update_publish_prerequisites')

        assert.equal(report.ok, true)
        assert.equal(report.ready, false)
        assert.equal(githubCheck?.status, 'pending')
        assert.match(githubCheck?.message || '', /No workflow runs/)
        assert.equal(githubAction?.docs, 'docs/windows-installer-build.md')
        assert.deepEqual(githubAction?.commands, [
            'npm run release:github-status',
            'gh workflow run windows-installer.yml'
        ])
        assert.equal(publishCheck?.status, 'pending')
        assert.match(publishCheck?.message || '', /pharmacy-report-releases/)
        assert.equal(publishAction?.docs, 'docs/windows-installer-build.md')
        assert.deepEqual(publishAction?.commands, [
            'npm run release:github-status',
            'gh secret set RELEASES_GITHUB_TOKEN',
            'gh secret set WINDOWS_CSC_LINK',
            'gh secret set WINDOWS_CSC_KEY_PASSWORD'
        ])
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true })
    }
})

test('release readiness separates present installer artifact from missing signed publish prerequisites', () => {
    const tmpDir = createFixture({
        macPackage: true,
        windowsInstaller: true
    })
    const receiptPath = path.join(tmpDir, 'ai-receipt.json')
    writeFixtureFile(tmpDir, '.env.production.local', [
        'INSTALL_CODE_REGISTRY=\'{"codes":[{"code":"READY-1234","maxDevices":2}]}\'',
        'WINDOWS_INSTALLER_URL=https://example.com/pharmacy-report-setup-0.1.0-x64.exe'
    ].join('\n'))
    fs.writeFileSync(receiptPath, JSON.stringify(aiReceiptFixture()))

    try {
        const report = createReleaseReadinessReport({
            rootDir: tmpDir,
            env: {},
            envFile: '.env.production.local',
            aiReceiptPath: receiptPath,
            githubReleaseStatus: {
                ok: true,
                ready: false,
                workflow: {
                    file: 'windows-installer.yml',
                    status: 'present',
                    message: 'Workflow is available on GitHub'
                },
                releaseRepository: {
                    nameWithOwner: 'emayu323/pharmacy-report-releases',
                    expectedPrivate: false,
                    status: 'present',
                    message: 'Release repository emayu323/pharmacy-report-releases is accessible'
                },
                releaseTokenSecret: {
                    names: ['RELEASES_GITHUB_TOKEN'],
                    status: 'missing',
                    message: 'release token secret missing: RELEASES_GITHUB_TOKEN'
                },
                codeSigningSecrets: {
                    names: ['WINDOWS_CSC_LINK', 'WINDOWS_CSC_KEY_PASSWORD'],
                    status: 'missing',
                    message: 'code signing secrets missing: WINDOWS_CSC_LINK, WINDOWS_CSC_KEY_PASSWORD'
                },
                autoUpdateVariables: {
                    names: ['AUTO_UPDATE_RELEASE_PUBLISH_ENABLED', 'LOCAL_CODE_SIGNING_ENABLED'],
                    status: 'present',
                    message: 'auto-update variables configured: AUTO_UPDATE_RELEASE_PUBLISH_ENABLED, LOCAL_CODE_SIGNING_ENABLED'
                },
                latestRun: {
                    databaseId: 12345,
                    status: 'completed',
                    conclusion: 'success'
                },
                artifact: {
                    name: 'pharmacy-report-windows-installer',
                    status: 'present',
                    message: 'Installer artifact is available'
                }
            }
        })
        const githubCheck = report.checks.find(check => check.id === 'github_release_status')
        const publishCheck = report.checks.find(check => check.id === 'auto_update_publish_prerequisites')

        assert.equal(report.ok, true)
        assert.equal(report.ready, false)
        assert.equal(githubCheck?.status, 'pass')
        assert.match(githubCheck?.message || '', /Installer artifact is available/)
        assert.equal(publishCheck?.status, 'pending')
        assert.match(publishCheck?.message || '', /RELEASES_GITHUB_TOKEN/)
        assert.match(publishCheck?.message || '', /WINDOWS_CSC_LINK/)
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true })
    }
})

test('release readiness treats present installer artifact with stale source revision as pending', () => {
    const tmpDir = createFixture({
        macPackage: true,
        windowsInstaller: true
    })
    const receiptPath = path.join(tmpDir, 'ai-receipt.json')
    writeFixtureFile(tmpDir, '.env.production.local', [
        'INSTALL_CODE_REGISTRY=\'{"codes":[{"code":"READY-1234","maxDevices":2}]}\'',
        'WINDOWS_INSTALLER_URL=https://example.com/pharmacy-report-setup-0.1.0-x64.exe'
    ].join('\n'))
    fs.writeFileSync(receiptPath, JSON.stringify(aiReceiptFixture()))

    try {
        const report = createReleaseReadinessReport({
            rootDir: tmpDir,
            env: {},
            envFile: '.env.production.local',
            aiReceiptPath: receiptPath,
            githubReleaseStatus: {
                ok: true,
                ready: false,
                workflow: {
                    file: 'windows-installer.yml',
                    status: 'present',
                    message: 'Workflow is available on GitHub'
                },
                releaseRepository: {
                    nameWithOwner: 'emayu323/pharmacy-report-releases',
                    expectedPrivate: false,
                    status: 'present',
                    message: 'Release repository emayu323/pharmacy-report-releases is accessible'
                },
                releaseTokenSecret: {
                    names: ['RELEASES_GITHUB_TOKEN'],
                    status: 'present',
                    message: 'release token secret configured: RELEASES_GITHUB_TOKEN'
                },
                codeSigningSecrets: {
                    names: ['WINDOWS_CSC_LINK', 'WINDOWS_CSC_KEY_PASSWORD'],
                    status: 'present',
                    message: 'code signing secrets configured: WINDOWS_CSC_LINK, WINDOWS_CSC_KEY_PASSWORD'
                },
                autoUpdateVariables: {
                    names: ['AUTO_UPDATE_RELEASE_PUBLISH_ENABLED', 'LOCAL_CODE_SIGNING_ENABLED'],
                    status: 'present',
                    message: 'auto-update variables configured: AUTO_UPDATE_RELEASE_PUBLISH_ENABLED, LOCAL_CODE_SIGNING_ENABLED'
                },
                latestRun: {
                    databaseId: 12345,
                    status: 'completed',
                    conclusion: 'success',
                    headSha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
                },
                artifact: {
                    name: 'pharmacy-report-windows-installer',
                    status: 'present',
                    message: 'Installer artifact is available'
                },
                sourceRevision: {
                    status: 'stale',
                    runHeadSha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
                    expectedHeadSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                    message: 'Installer artifact is stale: workflow run bbbbbbb != current source aaaaaaa'
                }
            }
        })
        const githubCheck = report.checks.find(check => check.id === 'github_release_status')
        const githubAction = report.nextActions.find(action => action.id === 'github_release_status')

        assert.equal(report.ok, true)
        assert.equal(report.ready, false)
        assert.equal(githubCheck?.status, 'pending')
        assert.match(githubCheck?.message || '', /stale/)
        assert.equal(githubAction?.docs, 'docs/windows-installer-build.md')
        assert.deepEqual(githubAction?.commands, [
            'npm run release:github-status',
            'gh workflow run windows-installer.yml'
        ])
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true })
    }
})

test('release readiness check resolves relative AI receipt path from root directory', () => {
    const tmpDir = createFixture({
        macPackage: true,
        windowsInstaller: true
    })
    const receiptRelativePath = 'output/local-ai-integration-result.json'
    writeFixtureFile(tmpDir, '.env.production.local', [
        'INSTALL_CODE_REGISTRY=\'{"codes":[{"code":"READY-1234","maxDevices":2}]}\'',
        'WINDOWS_INSTALLER_URL=https://example.com/pharmacy-report-setup-0.1.0-x64.exe'
    ].join('\n'))
    writeFixtureFile(tmpDir, receiptRelativePath, JSON.stringify(aiReceiptFixture()))

    try {
        const report = createReleaseReadinessReport({
            rootDir: tmpDir,
            env: {},
            envFile: '.env.production.local',
            aiReceiptPath: receiptRelativePath,
            strict: true
        })
        const aiCheck = report.checks.find(check => check.id === 'local_ai_integration')

        assert.equal(report.ok, true)
        assert.equal(aiCheck?.status, 'pass')
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true })
    }
})

test('release readiness check fails when Vercel installer URL does not match artifact file', () => {
    const tmpDir = createFixture({
        macPackage: true,
        windowsInstaller: true
    })
    const receiptPath = path.join(tmpDir, 'ai-receipt.json')
    writeFixtureFile(tmpDir, '.env.production.local', [
        'INSTALL_CODE_REGISTRY=\'{"codes":[{"code":"READY-1234","maxDevices":2}]}\'',
        'WINDOWS_INSTALLER_URL=https://example.com/pharmacy-report-setup-0.2.0-x64.exe'
    ].join('\n'))
    fs.writeFileSync(receiptPath, JSON.stringify(aiReceiptFixture()))

    try {
        const report = createReleaseReadinessReport({
            rootDir: tmpDir,
            env: {},
            envFile: '.env.production.local',
            aiReceiptPath: receiptPath
        })
        const vercelCheck = report.checks.find(check => check.id === 'vercel_production_env')

        assert.equal(report.ok, false)
        assert.equal(vercelCheck?.status, 'fail')
        assert.match(vercelCheck?.message || '', /WINDOWS_INSTALLER_URL/)
        assert.match(vercelCheck?.message || '', /pharmacy-report-setup-0\.1\.0-x64\.exe/)
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true })
    }
})

test('release readiness check fails when registry installer URL does not match artifact file', () => {
    const tmpDir = createFixture({
        macPackage: true,
        windowsInstaller: true
    })
    const receiptPath = path.join(tmpDir, 'ai-receipt.json')
    writeFixtureFile(tmpDir, '.env.production.local', [
        'INSTALL_CODE_REGISTRY=\'{"codes":[{"code":"READY-1234","maxDevices":2,"installerUrl":"https://example.com/pharmacy-report-setup-0.2.0-x64.exe"}]}\'',
        'WINDOWS_INSTALLER_URL=https://example.com/pharmacy-report-setup-0.1.0-x64.exe'
    ].join('\n'))
    fs.writeFileSync(receiptPath, JSON.stringify(aiReceiptFixture()))

    try {
        const report = createReleaseReadinessReport({
            rootDir: tmpDir,
            env: {},
            envFile: '.env.production.local',
            aiReceiptPath: receiptPath
        })
        const vercelCheck = report.checks.find(check => check.id === 'vercel_production_env')

        assert.equal(report.ok, false)
        assert.equal(vercelCheck?.status, 'fail')
        assert.match(vercelCheck?.message || '', /INSTALL_CODE_REGISTRY\.codes\[0\]\.installerUrl/)
        assert.match(vercelCheck?.message || '', /pharmacy-report-setup-0\.1\.0-x64\.exe/)
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true })
    }
})

test('release readiness check ignores disabled registry installer URLs when matching artifact file', () => {
    const tmpDir = createFixture({
        macPackage: true,
        windowsInstaller: true
    })
    const receiptPath = path.join(tmpDir, 'ai-receipt.json')
    writeFixtureFile(tmpDir, '.env.production.local', [
        'INSTALL_CODE_REGISTRY=\'{"codes":[{"code":"READY-1234","maxDevices":2},{"code":"OLD-1234","maxDevices":1,"installerUrl":"https://example.com/pharmacy-report-setup-0.2.0-x64.exe","disabled":true}]}\'',
        'WINDOWS_INSTALLER_URL=https://example.com/pharmacy-report-setup-0.1.0-x64.exe'
    ].join('\n'))
    fs.writeFileSync(receiptPath, JSON.stringify(aiReceiptFixture()))

    try {
        const report = createReleaseReadinessReport({
            rootDir: tmpDir,
            env: {},
            envFile: '.env.production.local',
            aiReceiptPath: receiptPath,
            strict: true
        })
        const vercelCheck = report.checks.find(check => check.id === 'vercel_production_env')

        assert.equal(report.ok, true)
        assert.equal(vercelCheck?.status, 'pass')
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true })
    }
})

test('release readiness check fails invalid env or AI receipt without leaking secrets', () => {
    const tmpDir = createFixture()
    const receiptPath = path.join(tmpDir, 'ai-receipt.json')
    const secretValue = 'super-secret-service-role-key'
    fs.writeFileSync(receiptPath, JSON.stringify({
        ok: false,
        skipped: true
    }))

    try {
        const report = createReleaseReadinessReport({
            rootDir: tmpDir,
            env: {
                INSTALL_CODE_REGISTRY: '{"codes":[]}',
                WINDOWS_INSTALLER_URL: 'http://example.com/setup.exe',
                INSTALL_CODE_USAGE_SUPABASE_SERVICE_ROLE_KEY: secretValue
            },
            aiReceiptPath: receiptPath
        })

        assert.equal(report.ok, false)
        assert.equal(report.checks.find(check => check.id === 'vercel_production_env')?.status, 'fail')
        assert.equal(report.checks.find(check => check.id === 'local_ai_integration')?.status, 'fail')
        assert.equal(JSON.stringify(report).includes(secretValue), false)
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true })
    }
})

test('release readiness check rejects AI receipts containing visit memo or draft details', () => {
    const tmpDir = createFixture()
    const receiptPath = path.join(tmpDir, 'unsafe-ai-receipt.json')
    const visitMemoText = '患者会話の訪問メモ本文'
    fs.writeFileSync(receiptPath, JSON.stringify({
        created_at: '2026-06-11T09:00:00.000Z',
        ok: true,
        skipped: false,
        visitMemo: visitMemoText,
        draft: {
            source: 'local_llm',
            chief_complaint: '朝薬服用後の眠気あり'
        }
    }))

    try {
        const report = createReleaseReadinessReport({
            rootDir: tmpDir,
            env: {},
            aiReceiptPath: receiptPath
        })

        const check = report.checks.find(item => item.id === 'local_ai_integration')
        assert.equal(report.ok, false)
        assert.equal(check?.status, 'fail')
        assert.match(check?.message || '', /privacy/i)
        assert.equal(JSON.stringify(report).includes(visitMemoText), false)
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true })
    }
})

test('release readiness check rejects AI receipts from another app version', () => {
    const tmpDir = createFixture()
    const receiptPath = path.join(tmpDir, 'old-ai-receipt.json')
    fs.writeFileSync(receiptPath, JSON.stringify({
        created_at: '2026-06-11T09:00:00.000Z',
        app_version: '0.0.9',
        ok: true,
        skipped: false
    }))

    try {
        const report = createReleaseReadinessReport({
            rootDir: tmpDir,
            env: {},
            aiReceiptPath: receiptPath
        })
        const check = report.checks.find(item => item.id === 'local_ai_integration')

        assert.equal(report.ok, false)
        assert.equal(check?.status, 'fail')
        assert.match(check?.message || '', /app version/i)
        assert.match(check?.message || '', /0\.1\.0/)
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true })
    }
})

test('release readiness check rejects incomplete AI receipts even when ok is true', () => {
    const tmpDir = createFixture()
    const receiptPath = path.join(tmpDir, 'incomplete-ai-receipt.json')
    fs.writeFileSync(receiptPath, JSON.stringify({
        created_at: '2026-06-11T09:00:00.000Z',
        app_version: '0.1.0',
        ok: true,
        skipped: false,
        ready: false,
        draft: {
            source: 'rule_based',
            chiefComplaintPresent: true,
            medicationInstructionPresent: false
        }
    }))

    try {
        const report = createReleaseReadinessReport({
            rootDir: tmpDir,
            env: {},
            aiReceiptPath: receiptPath
        })
        const check = report.checks.find(item => item.id === 'local_ai_integration')

        assert.equal(report.ok, false)
        assert.equal(check?.status, 'fail')
        assert.match(check?.message || '', /AI integration receipt is incomplete/)
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true })
    }
})

test('release readiness check treats non-ready local AI receipt as pending instead of failed', () => {
    const tmpDir = createFixture()
    const receiptPath = path.join(tmpDir, 'pending-ai-receipt.json')
    fs.writeFileSync(receiptPath, JSON.stringify(aiReceiptFixture({
        ready: false
    })))

    try {
        const report = createReleaseReadinessReport({
            rootDir: tmpDir,
            env: {},
            aiReceiptPath: receiptPath
        })
        const check = report.checks.find(item => item.id === 'local_ai_integration')

        assert.equal(report.ok, true)
        assert.equal(report.ready, false)
        assert.equal(check?.status, 'pending')
        assert.match(check?.message || '', /訪問メモ/)
        assert.match(report.nextActions.find(item => item.id === 'local_ai_integration')?.description || '', /ローカルAI結合テスト/)
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true })
    }
})

test('release readiness check requires operational handoff docs', () => {
    const tmpDir = createFixture()
    const operationalDocs = [
        'docs/local-first-requirements.md',
        'docs/backup-key-operations.md',
        'docs/install-code-registry.example.json',
        'docs/install-code-usage-store.md'
    ]
    for (const file of operationalDocs) {
        fs.rmSync(path.join(tmpDir, file), { force: true })
    }

    try {
        const report = createReleaseReadinessReport({
            rootDir: tmpDir,
            env: {}
        })
        const requiredFiles = report.checks.find(item => item.id === 'required_files')

        assert.equal(requiredFiles?.status, 'fail')
        for (const file of operationalDocs) {
            assert.equal((requiredFiles?.message || '').includes(file), true)
        }
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true })
    }
})

test('release readiness check requires Node 24 and Vercel TS runtime configuration', () => {
    const tmpDir = createFixture()
    writeFixtureFile(tmpDir, 'package.json', JSON.stringify({
        engines: {
            node: '>=22 <23'
        },
        devDependencies: {},
        scripts: packageScriptsFixture()
    }))
    writeFixtureFile(tmpDir, 'vercel.ts', [
        'export const config = {',
        '  framework: "vite",',
        '  rewrites: []',
        '}'
    ].join('\n'))
    writeFixtureFile(tmpDir, 'tsconfig.json', JSON.stringify({
        compilerOptions: {}
    }))
    writeFixtureFile(tmpDir, '.node-version', '22\n')

    try {
        const report = createReleaseReadinessReport({
            rootDir: tmpDir,
            env: {}
        })
        const runtimeCheck = report.checks.find(item => item.id === 'runtime_configuration')

        assert.equal(report.ok, false)
        assert.equal(runtimeCheck?.status, 'fail')
        assert.match(runtimeCheck?.message || '', /Node 24/)
        assert.match(runtimeCheck?.message || '', /@vercel\/config/)
        assert.match(runtimeCheck?.message || '', /tsconfig\.json/)
        assert.match(runtimeCheck?.message || '', /API rewrite/)
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true })
    }
})

test('release readiness check requires a checked-in Node version pin', () => {
    const tmpDir = createFixture()
    fs.rmSync(path.join(tmpDir, '.node-version'), { force: true })

    try {
        const report = createReleaseReadinessReport({
            rootDir: tmpDir,
            env: {}
        })
        const requiredFiles = report.checks.find(item => item.id === 'required_files')

        assert.equal(requiredFiles?.status, 'fail')
        assert.match(requiredFiles?.message || '', /\.node-version/)
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true })
    }
})

test('release readiness check requires GitHub release status helper', () => {
    const tmpDir = createFixture()
    fs.rmSync(path.join(tmpDir, 'scripts/github_release_status.mjs'), { force: true })

    try {
        const report = createReleaseReadinessReport({
            rootDir: tmpDir,
            env: {}
        })
        const requiredFiles = report.checks.find(item => item.id === 'required_files')

        assert.equal(requiredFiles?.status, 'fail')
        assert.match(requiredFiles?.message || '', /scripts\/github_release_status\.mjs/)
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true })
    }
})

test('release readiness check requires local source status helper', () => {
    const tmpDir = createFixture()
    fs.rmSync(path.join(tmpDir, 'scripts/source_release_status.mjs'), { force: true })

    try {
        const report = createReleaseReadinessReport({
            rootDir: tmpDir,
            env: {}
        })
        const requiredFiles = report.checks.find(item => item.id === 'required_files')

        assert.equal(requiredFiles?.status, 'fail')
        assert.match(requiredFiles?.message || '', /scripts\/source_release_status\.mjs/)
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true })
    }
})

test('release readiness check requires pre-update backup command in local app test gate', () => {
    const tmpDir = createFixture()
    const scripts = Object.fromEntries(REQUIRED_SCRIPTS.map(script => [script, `echo ${script}`]))
    scripts['test:local-app'] = 'node --test tests/localSqliteBackupRepository.test.mjs tests/packageBuildConfig.test.mjs'
    writeFixtureFile(tmpDir, 'package.json', JSON.stringify({
        version: '0.1.0',
        engines: {
            node: '>=24 <25'
        },
        devDependencies: {
            '@vercel/config': '^0.5.2'
        },
        scripts
    }))

    try {
        const report = createReleaseReadinessReport({
            rootDir: tmpDir,
            env: {}
        })
        const packageCheck = report.checks.find(item => item.id === 'package_scripts')

        assert.equal(report.ok, false)
        assert.equal(packageCheck?.status, 'fail')
        assert.match(packageCheck?.message || '', /preUpdateBackupCommand\.test\.mjs/)
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true })
    }
})

test('release readiness check requires the Vercel entry portal flow', () => {
    const tmpDir = createFixture()
    writeFixtureFile(tmpDir, 'src/main.tsx', [
        "import EntryPortal from './pages/EntryPortal'",
        '<Route path="/home" element={<EntryPortal />} />'
    ].join('\n'))
    writeFixtureFile(tmpDir, 'src/pages/EntryPortal.tsx', [
        'export default function EntryPortal() {',
        '  return <div>入口だけ</div>',
        '}'
    ].join('\n'))
    writeFixtureFile(tmpDir, 'src/localAppConnection.ts', [
        "export const LOCAL_APP_URI = 'wrong://open'"
    ].join('\n'))

    try {
        const report = createReleaseReadinessReport({
            rootDir: tmpDir,
            env: {}
        })
        const entryCheck = report.checks.find(item => item.id === 'entry_portal')

        assert.equal(report.ok, false)
        assert.equal(entryCheck?.status, 'fail')
        assert.match(entryCheck?.message || '', /\/entry/)
        assert.match(entryCheck?.message || '', /manual\.html/)
        assert.match(entryCheck?.message || '', /pharmacy-report:\/\/open/)
        assert.match(entryCheck?.message || '', /導入コード/)
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true })
    }
})

test('release readiness check keeps the entry portal outside app authentication', () => {
    const tmpDir = createFixture()
    writeFixtureFile(tmpDir, 'src/main.tsx', [
        "import EntryPortal from './pages/EntryPortal'",
        '<BrowserRouter>',
        '  <AuthProvider>',
        '    <Routes>',
        '      <Route path="/entry" element={<EntryPortal />} />',
        '    </Routes>',
        '  </AuthProvider>',
        '</BrowserRouter>'
    ].join('\n'))

    try {
        const report = createReleaseReadinessReport({
            rootDir: tmpDir,
            env: {}
        })
        const entryCheck = report.checks.find(item => item.id === 'entry_portal')

        assert.equal(report.ok, false)
        assert.equal(entryCheck?.status, 'fail')
        assert.match(entryCheck?.message || '', /AuthProvider/)
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true })
    }
})

test('release readiness check keeps app routes inside authentication', () => {
    const tmpDir = createFixture()
    writeFixtureFile(tmpDir, 'src/main.tsx', [
        "import EntryPortal from './pages/EntryPortal'",
        '<BrowserRouter>',
        '  <Routes>',
        '    <Route path="/entry" element={<EntryPortal />} />',
        '    <Route path="/reports" element={<ReportList />} />',
        '    <Route path="/settings" element={<Settings />} />',
        '  </Routes>',
        '</BrowserRouter>'
    ].join('\n'))

    try {
        const report = createReleaseReadinessReport({
            rootDir: tmpDir,
            env: {}
        })
        const entryCheck = report.checks.find(item => item.id === 'entry_portal')

        assert.equal(report.ok, false)
        assert.equal(entryCheck?.status, 'fail')
        assert.match(entryCheck?.message || '', /app routes/i)
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true })
    }
})

test('release readiness check requires local-only app repositories', () => {
    const tmpDir = createFixture()
    writeFixtureFile(tmpDir, 'src/patientRepository.ts', [
        "import { getNativeBridge } from './nativeBridge'",
        "export const isLocalPatientStorage = () => getPatientStorageMode() === 'local'"
    ].join('\n'))

    try {
        const report = createReleaseReadinessReport({
            rootDir: tmpDir,
            env: {}
        })
        const storageCheck = report.checks.find(item => item.id === 'native_local_storage_priority')

        assert.equal(report.ok, false)
        assert.equal(storageCheck?.status, 'fail')
        assert.match(storageCheck?.message || '', /patientRepository/)
        assert.match(storageCheck?.message || '', /local storage only/)
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true })
    }
})

test('release readiness check requires backup and save operational workflows', () => {
    const tmpDir = createFixture()
    writeFixtureFile(tmpDir, 'src/pages/ReportEdit.tsx', [
        'export default function ReportEdit() {',
        '  return <button>保存する</button>',
        '}'
    ].join('\n'))

    try {
        const report = createReleaseReadinessReport({
            rootDir: tmpDir,
            env: {}
        })
        const workflowCheck = report.checks.find(item => item.id === 'operational_workflows')

        assert.equal(report.ok, false)
        assert.equal(workflowCheck?.status, 'fail')
        assert.match(workflowCheck?.message || '', /auto save/)
        assert.match(workflowCheck?.message || '', /保存状態/)
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true })
    }
})

test('release readiness check requires PIN idle lock and care manager temporary recipient workflows', () => {
    const tmpDir = createFixture()
    writeFixtureFile(tmpDir, 'src/components/LocalPinLock.tsx', [
        'export default function LocalPinLock({ children }) {',
        '  return children',
        '}'
    ].join('\n'))
    writeFixtureFile(tmpDir, 'src/pages/ReportEdit.tsx', [
        "import { canAutoSaveReportDraft, createReportAutoSaveFingerprint } from '../reportAutoSave'",
        "const saveStatusLabel = { dirty: '未保存あり', saving: '保存中', saved: '保存済み', error: '保存失敗' }[saveStatus]",
        'setTimeout(() => runAutoSave(), 2000)',
        'async function persistReport() { return saveReport() }',
        'export default function ReportEdit() { return <button>保存する</button> }'
    ].join('\n'))

    try {
        const report = createReleaseReadinessReport({
            rootDir: tmpDir,
            env: {}
        })
        const workflowCheck = report.checks.find(item => item.id === 'operational_workflows')

        assert.equal(report.ok, false)
        assert.equal(workflowCheck?.status, 'fail')
        assert.match(workflowCheck?.message || '', /LocalPinLock/)
        assert.match(workflowCheck?.message || '', /care manager/i)
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true })
    }
})

test('release readiness check requires previous report lookup to prefer visit date', () => {
    const tmpDir = createFixture()
    writeFixtureFile(tmpDir, 'src/reportRepository.ts', [
        "import { getNativeBridge } from './nativeBridge'",
        "export const isLocalReportStorage = () => Boolean(getNativeBridge()) || getReportStorageMode() === 'local'",
        'const latest = reports.sort(compareReportsByNewestCreatedAt)[0]'
    ].join('\n'))

    try {
        const report = createReleaseReadinessReport({
            rootDir: tmpDir,
            env: {}
        })
        const selectionCheck = report.checks.find(item => item.id === 'latest_report_selection')

        assert.equal(report.ok, false)
        assert.equal(selectionCheck?.status, 'fail')
        assert.match(selectionCheck?.message || '', /selectLatestReportByVisitDate/)
        assert.match(selectionCheck?.message || '', /created_at/)
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true })
    }
})

test('release readiness check rejects Supabase references in app source', () => {
    const tmpDir = createFixture()
    writeFixtureFile(tmpDir, 'src/reportRepository.ts', [
        "import { supabase } from './supabase'",
        "import { getNativeBridge } from './nativeBridge'",
        "import { selectLatestReportByVisitDate } from './reportSelection'",
        "export const isLocalReportStorage = () => true",
        'const latest = selectLatestReportByVisitDate(reports)',
        "const leaked = supabase.from('reports').select('*')"
    ].join('\n'))

    try {
        const report = createReleaseReadinessReport({
            rootDir: tmpDir,
            env: {}
        })
        const storageCheck = report.checks.find(item => item.id === 'native_local_storage_priority')

        assert.equal(report.ok, false)
        assert.equal(storageCheck?.status, 'fail')
        assert.match(storageCheck?.message || '', /Supabase/)
        assert.match(storageCheck?.message || '', /src\/reportRepository\.ts/)
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true })
    }
})

test('release readiness check rejects recording and Whisper app paths', () => {
    const tmpDir = createFixture()
    writeFixtureFile(tmpDir, 'src/pages/ReportEdit.tsx', [
        "import { canAutoSaveReportDraft, createReportAutoSaveFingerprint } from '../reportAutoSave'",
        "const saveStatusLabel = { dirty: '未保存あり', saving: '保存中', saved: '保存済み', error: '保存失敗' }[saveStatus]",
        'setTimeout(() => runAutoSave(), 2000)',
        'async function persistReport() { return saveReport() }',
        'async function startRecording() {',
        '  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })',
        '  return new MediaRecorder(stream)',
        '}',
        'export default function ReportEdit() { return <button>保存する</button> }'
    ].join('\n'))
    writeFixtureFile(tmpDir, 'electron/localAiEnvironment.mjs', [
        'export async function probeWhisper() {',
        "  return { status: 'ready', whisperHealthUrl: 'http://127.0.0.1:9000/health' }",
        '}'
    ].join('\n'))

    try {
        const report = createReleaseReadinessReport({
            rootDir: tmpDir,
            env: {}
        })
        const aiCheck = report.checks.find(item => item.id === 'ai_text_only_workflow')

        assert.equal(report.ok, false)
        assert.equal(aiCheck?.status, 'fail')
        assert.match(aiCheck?.message || '', /MediaRecorder/)
        assert.match(aiCheck?.message || '', /probeWhisper/)
        assert.match(aiCheck?.message || '', /訪問メモ/)
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true })
    }
})

test('release readiness check requires Windows workflow to save release check receipt', () => {
    const tmpDir = createFixture()
    writeFixtureFile(tmpDir, '.github/workflows/windows-installer.yml', [
        'runs-on: windows-latest',
        'node-version: 24',
        'npm run dist:win',
        'tests/preUpdateBackupCommand.test.mjs',
        'actions/upload-artifact@v4'
    ].join('\n'))

    try {
        const report = createReleaseReadinessReport({
            rootDir: tmpDir,
            env: {}
        })
        const workflowCheck = report.checks.find(item => item.id === 'windows_installer_workflow')

        assert.equal(report.ok, false)
        assert.equal(workflowCheck?.status, 'fail')
        assert.match(workflowCheck?.message || '', /release-readiness\.txt/)
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true })
    }
})

test('release readiness check fails incomplete Windows installer artifacts', () => {
    const tmpDir = createFixture()
    writeFixtureFile(tmpDir, 'release/pharmacy-report-setup-0.1.0-x64.exe', '')

    try {
        const report = createReleaseReadinessReport({
            rootDir: tmpDir,
            env: {}
        })
        const installerCheck = report.checks.find(item => item.id === 'windows_installer_artifact')

        assert.equal(report.ok, false)
        assert.equal(installerCheck?.status, 'fail')
        assert.match(installerCheck?.message || '', /\.blockmap/)
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true })
    }
})

test('release readiness check requires Windows blockmap to match installer file name', () => {
    const tmpDir = createFixture()
    writeFixtureFile(tmpDir, 'release/pharmacy-report-setup-0.1.0-x64.exe', '')
    writeFixtureFile(tmpDir, 'release/pharmacy-report-setup-0.1.0-ia32.exe.blockmap', '')

    try {
        const report = createReleaseReadinessReport({
            rootDir: tmpDir,
            env: {}
        })
        const installerCheck = report.checks.find(item => item.id === 'windows_installer_artifact')

        assert.equal(report.ok, false)
        assert.equal(installerCheck?.status, 'fail')
        assert.match(installerCheck?.message || '', /matching \.blockmap/)
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true })
    }
})

test('release readiness check fails when multiple Windows installer versions are present', () => {
    const tmpDir = createFixture()
    writeFixtureFile(tmpDir, 'release/pharmacy-report-setup-0.1.0-x64.exe', '')
    writeFixtureFile(tmpDir, 'release/pharmacy-report-setup-0.1.0-x64.exe.blockmap', '')
    writeFixtureFile(tmpDir, 'release/pharmacy-report-setup-0.2.0-x64.exe', '')
    writeFixtureFile(tmpDir, 'release/pharmacy-report-setup-0.2.0-x64.exe.blockmap', '')

    try {
        const report = createReleaseReadinessReport({
            rootDir: tmpDir,
            env: {}
        })
        const installerCheck = report.checks.find(item => item.id === 'windows_installer_artifact')

        assert.equal(report.ok, false)
        assert.equal(installerCheck?.status, 'fail')
        assert.match(installerCheck?.message || '', /multiple/i)
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true })
    }
})

test('release readiness check ignores unpacked Windows app executable', () => {
    const tmpDir = createFixture({
        windowsInstaller: true
    })
    writeFixtureFile(tmpDir, 'release/win-unpacked/在宅報告アプリ.exe', '')

    try {
        const report = createReleaseReadinessReport({
            rootDir: tmpDir,
            env: {}
        })
        const installerCheck = report.checks.find(item => item.id === 'windows_installer_artifact')

        assert.equal(installerCheck?.status, 'pass')
        assert.match(installerCheck?.message || '', /pharmacy-report-setup-0\.1\.0-x64\.exe/)
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true })
    }
})

test('release readiness check requires Windows installer version to match package version', () => {
    const tmpDir = createFixture()
    writeFixtureFile(tmpDir, 'package.json', JSON.stringify({
        version: '0.2.0',
        scripts: Object.fromEntries(REQUIRED_SCRIPTS.map(script => [script, `echo ${script}`]))
    }))
    writeFixtureFile(tmpDir, 'release/pharmacy-report-setup-0.1.0-x64.exe', '')
    writeFixtureFile(tmpDir, 'release/pharmacy-report-setup-0.1.0-x64.exe.blockmap', '')

    try {
        const report = createReleaseReadinessReport({
            rootDir: tmpDir,
            env: {}
        })
        const installerCheck = report.checks.find(item => item.id === 'windows_installer_artifact')

        assert.equal(report.ok, false)
        assert.equal(installerCheck?.status, 'fail')
        assert.match(installerCheck?.message || '', /0\.2\.0/)
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true })
    }
})

function createFixture(options = {}) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'report-release-readiness-'))

    for (const file of REQUIRED_FILES) {
        writeFixtureFile(tmpDir, file, fileContentFixture(file))
    }
    writeFixtureFile(tmpDir, 'package.json', JSON.stringify({
        version: '0.1.0',
        engines: {
            node: '>=24 <25'
        },
        devDependencies: {
            '@vercel/config': '^0.5.2'
        },
        dependencies: {
            'electron-updater': '^6.8.9'
        },
        scripts: packageScriptsFixture()
    }))

    if (options.macPackage) {
        writeFixtureFile(tmpDir, 'release/mac-arm64/在宅報告アプリ.app/Contents/Resources/app.asar', '')
    }
    if (options.windowsInstaller) {
        writeFixtureFile(tmpDir, 'release/pharmacy-report-setup-0.1.0-x64.exe', '')
        writeFixtureFile(tmpDir, 'release/pharmacy-report-setup-0.1.0-x64.exe.blockmap', '')
    }

    return tmpDir
}

function writeFixtureFile(rootDir, relativePath, content) {
    const filePath = path.join(rootDir, relativePath)
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, content)
}

function aiReceiptFixture(overrides = {}) {
    return {
        created_at: '2026-06-11T09:00:00.000Z',
        app_version: '0.1.0',
        ok: true,
        skipped: false,
        ready: true,
        ollama: {
            status: 'ready',
            url: 'http://127.0.0.1:11434',
            requiredModel: 'llama3.1:8b',
            installedModelCount: 1
        },
        draft: {
            source: 'local_llm',
            chiefComplaintPresent: true,
            medicationInstructionPresent: true
        },
        ...overrides
    }
}

function sourceStatusFixture(overrides = {}) {
    return {
        ok: true,
        ready: true,
        clean: true,
        branch: 'main',
        upstream: 'origin/main',
        remoteUrl: 'https://github.com/example/pharmacy-report.git',
        ahead: 0,
        behind: 0,
        changedCount: 0,
        modifiedCount: 0,
        untrackedCount: 0,
        publishState: 'synced',
        message: 'Local source is clean and synchronized with upstream',
        nextActions: [
            'Run npm run release:github-status to compare the GitHub Actions artifact state'
        ],
        ...overrides
    }
}

function workflowFixture() {
    return `
runs-on: windows-latest
FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true
actions/checkout@v6
actions/setup-node@v6
node-version: 24
npm run dist:win
npm run dist:win:publish
AUTO_UPDATE_RELEASE_PUBLISH_ENABLED
LOCAL_CODE_SIGNING_ENABLED
tests/preUpdateBackupCommand.test.mjs
npm run release:check -- --format text
release-readiness.txt
actions/upload-artifact@v7
`
}

function electronMainFixture() {
    return [
        "ipcMain.handle('backups:create', () => createEncryptedSqliteBackup())",
        "ipcMain.handle('backups:create-pre-update', () => createPreUpdateEncryptedSqliteBackup())",
        "ipcMain.handle('backups:restore', () => restoreEncryptedSqliteBackup())"
    ].join('\n')
}

function packageScriptsFixture() {
    const scripts = Object.fromEntries(REQUIRED_SCRIPTS.map(script => [script, `echo ${script}`]))
    scripts['test:local-app'] = [
        'node --test --experimental-strip-types',
        'tests/autoUpdateService.test.mjs',
        'tests/localSqliteBackupRepository.test.mjs',
        'tests/preUpdateBackupCommand.test.mjs',
        'tests/packageBuildConfig.test.mjs',
        'tests/createInstallCodeRegistry.test.mjs',
        'tests/githubReleaseStatus.test.mjs',
        'tests/vercelCloudEnvStatus.test.mjs',
        'tests/vercelProductionSmoke.test.mjs',
        'tests/sourceReleaseStatus.test.mjs',
        'tests/sourcePublicationChecklist.test.mjs',
        'tests/macDemoReadiness.test.mjs',
        'tests/macDemoSmoke.test.mjs',
        'tests/releaseHandoff.test.mjs',
        'tests/reportEditUiV3.test.mjs'
    ].join(' ')
    return scripts
}

function fileContentFixture(file) {
    if (file.endsWith('windows-installer.yml')) return workflowFixture()
    if (file === 'electron/main.mjs') return electronMainFixture()
    if (file === 'vercel.ts') {
        return [
            "import { routes, type VercelConfig } from '@vercel/config/v1'",
            '',
            'export const config: VercelConfig = {',
            "  framework: 'vite',",
            "  buildCommand: 'npm run build',",
            "  outputDirectory: 'dist',",
            '  rewrites: [',
            "    routes.rewrite('/api/(.*)', '/api/$1'),",
            "    routes.rewrite('/(.*)', '/index.html')",
            '  ]',
            '}'
        ].join('\n')
    }
    if (file === '.node-version') return '24\n'
    if (file === 'tsconfig.json') {
        return JSON.stringify({
            compilerOptions: {
                module: 'ESNext',
                moduleResolution: 'bundler',
                allowImportingTsExtensions: true,
                noEmit: true
            }
        })
    }
    if (file === 'src/App.tsx') {
        return [
            "import LocalPinLock from './components/LocalPinLock'",
            'export default function ProtectedLayout() {',
            '  return <LocalPinLock><Outlet /></LocalPinLock>',
            '}'
        ].join('\n')
    }
    if (file === 'src/components/LocalPinLock.tsx') {
        return [
            'const ACTIVITY_EVENTS = [\'mousedown\', \'mousemove\', \'keydown\', \'touchstart\', \'scroll\']',
            'export default function LocalPinLock({ children }) {',
            '  setLocked(data.pin_enabled)',
            '  setTimeout(lock, settings.lock_timeout_minutes * 60 * 1000)',
            '  verifyLocalPin(pin)',
            '  return children',
            '}'
        ].join('\n')
    }
    if (file === 'src/main.tsx') {
        return [
            "import EntryPortal from './pages/EntryPortal'",
            '<BrowserRouter>',
            '  <Routes>',
            '    <Route path="/entry" element={<EntryPortal />} />',
            '    <Route path="/*" element=(',
            '      <AuthProvider>',
            '        <Routes>',
            '          <Route path="/" element={<App />}>',
            '            <Route path="reports" element={<ReportList />} />',
            '            <Route path="settings" element={<Settings />} />',
            '          </Route>',
            '        </Routes>',
            '      </AuthProvider>',
            '    ) />',
            '  </Routes>',
            '</BrowserRouter>'
        ].join('\n')
    }
    if (file === 'src/pages/EntryPortal.tsx') {
        return [
            "const INSTALLER_URL = import.meta.env.VITE_WINDOWS_INSTALLER_URL || ''",
            "const DEMO_INSTALL_CODES = import.meta.env.VITE_DEMO_INSTALL_CODES || ''",
            'export default function EntryPortal() {',
            '  return <main>',
            '    <h1>在宅報告アプリ 導入入口</h1>',
            '    <input placeholder="導入コード" />',
            '    <a href="/manual.html">マニュアル</a>',
            '    <button>ローカルアプリを起動</button>',
            '    <button>Windows版をインストール</button>',
            '    <button>更新版をインストール</button>',
            '    <button>接続を再確認</button>',
            '  </main>',
            '}'
        ].join('\n')
    }
    if (file === 'src/pages/ReportEdit.tsx') {
        return [
            "import { canAutoSaveReportDraft, createReportAutoSaveFingerprint } from '../reportAutoSave'",
            "import { hasMissingCareManagerRecipient } from '../reportPrintModel'",
            "const saveStatusLabel = { dirty: '未保存あり', saving: '保存中', saved: '保存済み', error: '保存失敗' }[saveStatus]",
            'setTimeout(() => runAutoSave(), 2000)',
            'async function persistReport() { return saveReport() }',
            'const isCareManagerRecipientMissing = hasMissingCareManagerRecipient(reportForPrint, printTarget)',
            'if (isCareManagerRecipientMissing) setIsBasicInfoOpen(true)',
            "document.getElementById('section-basic')",
            'const careMessage = "ケアマネ向け印刷には居宅介護支援事業所と事業所FAXが必要です。ここで入力した内容は今回報告書に保存され、保存時に患者マスタへ反映するか選べます。"',
            'export default function ReportEdit() { return <section id="section-basic"><button>保存する</button>{careMessage}</section> }'
        ].join('\n')
    }
    if (file === 'src/reportPrintModel.ts') {
        return [
            'export function hasMissingCareManagerRecipient(report, target) { return target === "care_manager" }',
            'export function getReportPrintWarnings() {',
            '  return ["ケアマネ向けの報告先またはFAX番号が未入力です。今回報告書だけの一時入力を確認してください。"]',
            '}'
        ].join('\n')
    }
    if (file === 'src/pages/Settings.tsx') {
        return [
            "import { createEncryptedLocalBackup, restoreEncryptedLocalBackup } from '../localBackupRepository'",
            'async function handleBackupExport() {',
            '  const result = await bridge.backups.create(backupPassword)',
            '  return createEncryptedLocalBackup(backupPassword)',
            '}',
            'async function handleBackupRestore() {',
            '  const result = await bridge.backups.restore(restorePassword)',
            '  return restoreEncryptedLocalBackup(file, restorePassword)',
            '}',
            'async function handlePreUpdateBackup() {',
            '  return bridge.backups.createPreUpdate()',
            '}'
        ].join('\n')
    }
    if (file === 'src/localAppConnection.ts') {
        return [
            "export const LOCAL_APP_URI = 'pharmacy-report://open'",
            'export const DEFAULT_LOCAL_APP_PORT_CANDIDATES = [47831, 47832, 47833]'
        ].join('\n')
    }
    if (file === 'src/patientRepository.ts') {
        return [
            "import { getNativeBridge } from './nativeBridge'",
            "export const isLocalPatientStorage = () => true",
            'const bridge = getNativeBridge()'
        ].join('\n')
    }
    if (file === 'src/reportRepository.ts') {
        return [
            "import { getNativeBridge } from './nativeBridge'",
            "import { selectLatestReportByVisitDate } from './reportSelection'",
            "export const isLocalReportStorage = () => true",
            'const bridge = getNativeBridge()',
            'const latest = selectLatestReportByVisitDate(reports)'
        ].join('\n')
    }
    if (file === 'src/reportSelection.ts') {
        return [
            'export function selectLatestReportByVisitDate(reports) {',
            '  return reports.sort((a, b) => Date.parse(b.visit_date) - Date.parse(a.visit_date) || Date.parse(b.created_at) - Date.parse(a.created_at))[0]',
            '}'
        ].join('\n')
    }
    if (file === 'src/institutionRepository.ts') {
        return [
            "import { getNativeBridge } from './nativeBridge'",
            "export const isLocalInstitutionStorage = () => true",
            'const bridge = getNativeBridge()'
        ].join('\n')
    }
    if (file === 'src/contexts/AuthProvider.tsx') {
        return [
            'const LOCAL_USER = { id: "local-user", user_metadata: { display_name: "ローカル利用者" } }',
            '<AuthContext.Provider value={{ user: LOCAL_USER, loading: false }} />'
        ].join('\n')
    }
    if (file === 'public/manual.html') {
        return [
            '<h1>在宅報告アプリ かんたんマニュアル</h1>',
            '<h2>初回インストール</h2>',
            '<h2>更新が必要と表示されたら</h2>',
            '<h2>バックアップと復元</h2>',
            '<h2>AIモード</h2>',
            '<h2>困ったとき</h2>'
        ].join('\n')
    }
    return `${file}\n`
}
