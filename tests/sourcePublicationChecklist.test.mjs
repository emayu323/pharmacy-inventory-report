import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
    createSourcePublicationChecklistMarkdown,
    writeSourcePublicationChecklistMarkdown
} from '../scripts/source_publication_checklist.mjs'

test('source publication checklist summarizes local source status and review steps', () => {
    const markdown = createSourcePublicationChecklistMarkdown({
        generatedAt: '2026-06-11T09:00:00.000Z',
        packageVersion: '0.1.0',
        sourceStatus: sourceStatusFixture()
    })

    assert.match(markdown, /^# ソース公開前チェックリスト/m)
    assert.match(markdown, /生成日時: 2026-06-11T09:00:00\.000Z/)
    assert.match(markdown, /アプリバージョン: 0\.1\.0/)
    assert.match(markdown, /branch: main/)
    assert.match(markdown, /changed files: 4/)
    assert.match(markdown, /untracked files: 1/)
    assert.match(markdown, /npm run release:source-status -- --details/)
    assert.match(markdown, /npm run test:local-app/)
    assert.match(markdown, /npm run release:check:full/)
    assert.match(markdown, /npm run release:github-status/)
    assert.match(markdown, /## 変更ファイル/)
    assert.match(markdown, /- \[modified\] package\.json/)
    assert.match(markdown, /- \[added\] docs\/windows-installer-build\.md/)
    assert.match(markdown, /- \[untracked\] scripts\/source_publication_checklist\.mjs/)
    assert.match(markdown, /## 自動安全確認/)
    assert.match(markdown, /警告: なし/)
    assert.doesNotMatch(markdown, /"publishState"/)
})

test('source publication checklist warns for risky publication paths', () => {
    const sourceStatus = sourceStatusFixture()
    sourceStatus.files = [
        { status: '??', kind: 'untracked', path: '.env.production.local' },
        { status: '??', kind: 'untracked', path: 'output/local-ai-integration-result.json' },
        { status: '??', kind: 'untracked', path: 'src/data/y_ALL20260522.csv' }
    ]
    const markdown = createSourcePublicationChecklistMarkdown({
        generatedAt: '2026-06-11T09:00:00.000Z',
        packageVersion: '0.1.0',
        sourceStatus
    })

    assert.match(markdown, /## 自動安全確認/)
    assert.match(markdown, /\.env.production.local/)
    assert.match(markdown, /output\/local-ai-integration-result\.json/)
    assert.match(markdown, /src\/data\/y_ALL20260522\.csv/)
    assert.match(markdown, /公開対象から外す/)
})

test('source publication checklist warns for large publication files', () => {
    const sourceStatus = sourceStatusFixture()
    sourceStatus.files = [
        { status: '??', kind: 'untracked', path: 'src/data/drug-master.generated.json', sizeBytes: 2_840_810 },
        { status: 'M', kind: 'modified', path: 'package.json', sizeBytes: 4_096 }
    ]
    const markdown = createSourcePublicationChecklistMarkdown({
        generatedAt: '2026-06-11T09:00:00.000Z',
        packageVersion: '0.1.0',
        sourceStatus
    })

    assert.match(markdown, /\[large-file\] src\/data\/drug-master\.generated\.json \(2\.7 MB\)/)
    assert.match(markdown, /- \[untracked\] src\/data\/drug-master\.generated\.json \(2\.7 MB\)/)
    assert.doesNotMatch(markdown, /\[large-file\] package\.json/)
})

test('source publication checklist shows tracked sensitive paths separately', () => {
    const sourceStatus = sourceStatusFixture()
    sourceStatus.trackedSensitiveCount = 2
    sourceStatus.trackedSensitivePaths = [
        '.env',
        'src/data/y_ALL20260522.csv'
    ]
    const markdown = createSourcePublicationChecklistMarkdown({
        generatedAt: '2026-06-11T09:00:00.000Z',
        packageVersion: '0.1.0',
        sourceStatus
    })

    assert.match(markdown, /tracked sensitive files: 2/)
    assert.match(markdown, /## Git追跡済みの要確認ファイル/)
    assert.match(markdown, /- \.env/)
    assert.match(markdown, /- src\/data\/y_ALL20260522\.csv/)
    assert.match(markdown, /`git rm --cached <path>`/)
})

test('source publication checklist treats deleted sensitive files as untracking work', () => {
    const sourceStatus = sourceStatusFixture()
    sourceStatus.files = [
        { status: 'D', kind: 'deleted', path: '.env', sizeBytes: 377 },
        { status: 'M', kind: 'modified', path: 'package.json', sizeBytes: 4_096 }
    ]
    const markdown = createSourcePublicationChecklistMarkdown({
        generatedAt: '2026-06-11T09:00:00.000Z',
        packageVersion: '0.1.0',
        sourceStatus
    })

    assert.doesNotMatch(markdown, /\[env-or-local-secret\] \.env/)
    assert.match(markdown, /## Git追跡解除予定の要確認ファイル/)
    assert.match(markdown, /- \.env/)
    assert.match(markdown, /必要ならキーのローテーション/)
    assert.match(markdown, /- \[deleted\] \.env/)
})

test('source publication checklist writer creates parent directory and writes markdown', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'source-publication-'))
    const outputPath = path.join(tmpDir, 'nested', 'checklist.md')

    try {
        const writtenPath = writeSourcePublicationChecklistMarkdown(outputPath, {
            generatedAt: '2026-06-11T09:00:00.000Z',
            packageVersion: '0.1.0',
            sourceStatus: sourceStatusFixture()
        })

        assert.equal(writtenPath, outputPath)
        assert.match(fs.readFileSync(outputPath, 'utf8'), /# ソース公開前チェックリスト/)
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true })
    }
})

function sourceStatusFixture() {
    return {
        ok: true,
        ready: false,
        clean: false,
        branch: 'main',
        upstream: 'origin/main',
        remoteUrl: 'https://github.com/example/pharmacy-report.git',
        ahead: 0,
        behind: 0,
        changedCount: 4,
        modifiedCount: 3,
        untrackedCount: 1,
        publishState: 'local_changes',
        message: '4 local file(s) differ from Git, including 1 untracked file(s)',
        nextActions: [
            'Review local changes with git status --short',
            'Commit release files or intentionally leave them out before push/PR',
            'Run npm run release:github-status again after publishing'
        ],
        files: [
            { status: 'M', kind: 'modified', path: 'package.json' },
            { status: 'A', kind: 'added', path: 'docs/windows-installer-build.md' },
            { status: 'M', kind: 'modified', path: 'scripts/release_readiness_check.mjs' },
            { status: '??', kind: 'untracked', path: 'scripts/source_publication_checklist.mjs' }
        ]
    }
}
