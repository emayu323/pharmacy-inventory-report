import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
    createReleaseHandoffMarkdown,
    writeReleaseHandoffMarkdown
} from '../scripts/release_handoff.mjs'

test('release handoff markdown summarizes pending external work without secrets', () => {
    const markdown = createReleaseHandoffMarkdown({
        generatedAt: '2026-06-11T09:00:00.000Z',
        packageVersion: '0.1.0',
        report: releaseReportFixture()
    })

    assert.match(markdown, /^# リリース引き継ぎ/m)
    assert.match(markdown, /生成日時: 2026-06-11T09:00:00\.000Z/)
    assert.match(markdown, /アプリバージョン: 0\.1\.0/)
    assert.match(markdown, /リリース判定: 未完了/)
    assert.match(markdown, /ok: true/)
    assert.match(markdown, /ready: false/)
    assert.match(markdown, /Windows installer artifact/)
    assert.match(markdown, /Vercel production environment/)
    assert.match(markdown, /Local AI integration receipt/)
    assert.match(markdown, /npm run release:github-status/)
    assert.match(markdown, /npm run dist:win/)
    assert.match(markdown, /npm run verify:vercel-env -- --env-file \.env\.production\.local/)
    assert.match(markdown, /npm run release:check -- --ai-receipt output\/local-ai-integration-result\.json/)
    assert.match(markdown, /秘密情報、Service Role Key、導入コード実値、患者情報はこの文書に書かない/)
    assert.doesNotMatch(markdown, /SUPER_SECRET/)
})

test('release handoff can include human-readable GitHub Actions status', () => {
    const markdown = createReleaseHandoffMarkdown({
        generatedAt: '2026-06-11T09:00:00.000Z',
        packageVersion: '0.1.0',
        report: releaseReportFixture(),
        githubStatus: {
            ok: true,
            ready: false,
            workflow: {
                file: 'windows-installer.yml',
                status: 'missing',
                message: 'windows-installer.yml is not available on the default branch'
            },
            latestRun: null,
            artifact: null,
            nextActions: [
                'Commit and push .github/workflows/windows-installer.yml to the default branch',
                'Run npm run release:github-status again'
            ]
        }
    })

    assert.match(markdown, /## GitHub Actions状態/)
    assert.match(markdown, /GitHub Actions判定: 未完了/)
    assert.match(markdown, /workflow: missing \(windows-installer\.yml\)/)
    assert.match(markdown, /Commit and push \.github\/workflows\/windows-installer\.yml/)
    assert.doesNotMatch(markdown, /"workflow"/)
})

test('release handoff can include local source status without raw filenames', () => {
    const markdown = createReleaseHandoffMarkdown({
        generatedAt: '2026-06-11T09:00:00.000Z',
        packageVersion: '0.1.0',
        report: releaseReportFixture(),
        sourceStatus: {
            ok: true,
            ready: false,
            clean: false,
            branch: 'main',
            upstream: 'origin/main',
            remoteUrl: 'https://github.com/example/pharmacy-report.git',
            ahead: 0,
            behind: 0,
            changedCount: 3,
            modifiedCount: 1,
            untrackedCount: 2,
            publishState: 'local_changes',
            message: '3 local file(s) differ from Git, including 2 untracked file(s)',
            nextActions: [
                'Review local changes with git status --short',
                'Commit release files or intentionally leave them out before push/PR'
            ]
        }
    })

    assert.match(markdown, /## ローカルGit状態/)
    assert.match(markdown, /ローカルGit判定: 未反映あり/)
    assert.match(markdown, /changed files: 3/)
    assert.match(markdown, /untracked files: 2/)
    assert.match(markdown, /Review local changes with git status --short/)
    assert.doesNotMatch(markdown, /"publishState"/)
    assert.doesNotMatch(markdown, /source_release_status\.mjs/)
})

test('release handoff can include Vercel cloud env status without values', () => {
    const markdown = createReleaseHandoffMarkdown({
        generatedAt: '2026-06-11T09:00:00.000Z',
        packageVersion: '0.1.0',
        report: releaseReportFixture(),
        vercelCloudStatus: {
            ok: true,
            ready: false,
            environment: 'production',
            envCount: 2,
            presentRequired: [],
            missingRequired: ['INSTALL_CODE_REGISTRY', 'WINDOWS_INSTALLER_URL'],
            staleAppEnv: ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'],
            nextActions: [
                'vercel env rm VITE_SUPABASE_URL production',
                'vercel env add INSTALL_CODE_REGISTRY production'
            ],
            message: 'Vercel production env is not ready: missing INSTALL_CODE_REGISTRY, WINDOWS_INSTALLER_URL'
        }
    })

    assert.match(markdown, /## Vercel本番env状態/)
    assert.match(markdown, /Vercel cloud env判定: 未完了/)
    assert.match(markdown, /missing required: INSTALL_CODE_REGISTRY, WINDOWS_INSTALLER_URL/)
    assert.match(markdown, /stale app env: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY/)
    assert.match(markdown, /vercel env rm VITE_SUPABASE_URL production/)
    assert.doesNotMatch(markdown, /Encrypted/)
    assert.doesNotMatch(markdown, /secret-anon-key/)
})

test('release handoff writer creates parent directory and writes markdown', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'release-handoff-'))
    const outputPath = path.join(tmpDir, 'nested', 'handoff.md')

    try {
        const writtenPath = writeReleaseHandoffMarkdown(outputPath, {
            generatedAt: '2026-06-11T09:00:00.000Z',
            packageVersion: '0.1.0',
            report: releaseReportFixture()
        })

        assert.equal(writtenPath, outputPath)
        assert.match(fs.readFileSync(outputPath, 'utf8'), /# リリース引き継ぎ/)
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true })
    }
})

function releaseReportFixture() {
    return {
        ok: true,
        ready: false,
        strict: false,
        summary: {
            pass: 8,
            warn: 0,
            pending: 3,
            fail: 0,
            total: 11
        },
        checks: [
            { id: 'required_files', label: 'Required implementation files', status: 'pass', message: 'found' },
            { id: 'windows_installer_artifact', label: 'Windows installer artifact', status: 'pending', message: 'Run workflow' },
            { id: 'vercel_production_env', label: 'Vercel production environment', status: 'pending', message: 'Set env SUPER_SECRET' },
            { id: 'local_ai_integration', label: 'Local AI integration receipt', status: 'pending', message: 'Run target PC check' }
        ],
        nextActions: [
            {
                id: 'windows_installer_artifact',
                status: 'pending',
                label: 'Windows installer artifact',
                description: 'GitHub ActionsのWindowsインストーラーworkflowを実行する。',
                docs: 'docs/windows-installer-build.md',
                commands: [
                    'npm run release:github-status',
                    'npm run dist:win'
                ]
            },
            {
                id: 'vercel_production_env',
                status: 'pending',
                label: 'Vercel production environment',
                description: '本番envの実値を検査する。',
                docs: 'docs/vercel-production-env.md',
                commands: [
                    'npm run verify:vercel-env -- --env-file .env.production.local',
                    'npm run release:check -- --env-file .env.production.local'
                ]
            },
            {
                id: 'local_ai_integration',
                status: 'pending',
                label: 'Local AI integration receipt',
                description: '現地PCでAI結合テストを実行する。',
                docs: 'docs/local-ai-integration-check.md',
                commands: [
                    'npm run test:local-ai-text -- --ollama-model <model>',
                    'npm run release:check -- --ai-receipt output/local-ai-integration-result.json'
                ]
            }
        ]
    }
}
