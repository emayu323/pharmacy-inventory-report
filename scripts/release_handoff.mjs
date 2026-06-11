import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import {
    createReleaseReadinessReport,
    formatReleaseReadinessReportText
} from './release_readiness_check.mjs'
import {
    createGitHubReleaseStatus,
    formatGitHubReleaseStatusText
} from './github_release_status.mjs'
import {
    createSourceReleaseStatus,
    formatSourceReleaseStatusText
} from './source_release_status.mjs'
import {
    createVercelCloudEnvStatus,
    formatVercelCloudEnvStatusText,
    readVercelCloudEnvStatus
} from './vercel_cloud_env_status.mjs'

const require = createRequire(import.meta.url)
const packageJson = require('../package.json')
const DEFAULT_OUTPUT_PATH = 'output/release-handoff.md'

export function createReleaseHandoffMarkdown(options = {}) {
    const generatedAt = options.generatedAt || new Date().toISOString()
    const packageVersion = options.packageVersion || packageJson.version
    const report = options.report || createReleaseReadinessReport({
        rootDir: options.rootDir || process.cwd(),
        env: options.env || process.env,
        envFile: options.envFile,
        aiReceiptPath: options.aiReceiptPath,
        strict: options.strict,
        sourceStatus: options.sourceStatus
    })
    const releaseState = report.ready ? '完了' : report.ok ? '未完了' : '要修正'
    const lines = [
        '# リリース引き継ぎ',
        '',
        `生成日時: ${generatedAt}`,
        `アプリバージョン: ${packageVersion}`,
        '',
        '## 判定',
        '',
        `リリース判定: ${releaseState}`,
        `ok: ${report.ok}`,
        `ready: ${report.ready}`,
        `strict: ${report.strict}`,
        `summary: pass ${report.summary.pass}, warn ${report.summary.warn}, pending ${report.summary.pending}, fail ${report.summary.fail}, total ${report.summary.total}`,
        '',
        '## 次の作業',
        ''
    ]

    if (report.nextActions.length === 0) {
        lines.push('- なし')
    } else {
        report.nextActions.forEach((action, index) => {
            lines.push(`${index + 1}. [${action.status}] ${sanitizeText(action.label)}`)
            lines.push(`   - 内容: ${sanitizeText(action.description)}`)
            if (action.docs) lines.push(`   - docs: ${sanitizeText(action.docs)}`)
            if (action.commands?.length) {
                lines.push('   - commands:')
                action.commands.forEach(command => {
                    lines.push(`     - \`${sanitizeText(command)}\``)
                })
            }
        })
    }

    if (options.githubStatus) {
        lines.push(
            '',
            '## GitHub Actions状態',
            '',
            '```text',
            sanitizeText(formatGitHubReleaseStatusText(options.githubStatus)),
            '```'
        )
    }

    if (options.sourceStatus) {
        lines.push(
            '',
            '## ローカルGit状態',
            '',
            '```text',
            sanitizeText(formatSourceReleaseStatusText(options.sourceStatus)),
            '```'
        )
    }

    if (options.vercelCloudStatus) {
        lines.push(
            '',
            '## Vercel本番env状態',
            '',
            '```text',
            sanitizeText(formatVercelCloudEnvStatusText(options.vercelCloudStatus)),
            '```'
        )
    }

    lines.push(
        '',
        '## チェック詳細',
        '',
        ...report.checks.map(check => `- [${check.status}] ${sanitizeText(check.label)}: ${sanitizeText(check.message)}`),
        '',
        '## 注意',
        '',
        '- 秘密情報、Service Role Key、導入コード実値、患者情報はこの文書に書かない。',
        '- 本番Vercel環境変数はVercel側へ直接設定し、`.env.production.local` はローカル検査用にだけ使う。',
        '- 現地AI結合証跡には訪問メモ本文とAI下書き本文を含めない。',
        '',
        '## release:check 出力',
        '',
        '```text',
        formatReleaseReadinessReportText(report),
        '```',
        ''
    )

    return `${lines.join('\n')}\n`
}

export function writeReleaseHandoffMarkdown(outputPath = DEFAULT_OUTPUT_PATH, options = {}) {
    const markdown = createReleaseHandoffMarkdown(options)
    fs.mkdirSync(path.dirname(outputPath), { recursive: true })
    fs.writeFileSync(outputPath, markdown)
    return outputPath
}

function sanitizeText(value) {
    return String(value ?? '')
        .replace(/SUPER_SECRET/g, '[redacted]')
        .replace(/SERVICE_ROLE_KEY[^\s`]*/gi, 'SERVICE_ROLE_KEY[redacted]')
        .replace(/eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, '[jwt-redacted]')
}

function parseArgs(argv) {
    const options = {}
    let outputPath = DEFAULT_OUTPUT_PATH
    let includeGithubStatus = false
    let includeSourceStatus = false
    let includeVercelCloudStatus = false
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index]
        if (arg === '--output') {
            outputPath = argv[index + 1]
            index += 1
        } else if (arg === '--env-file') {
            options.envFile = argv[index + 1]
            index += 1
        } else if (arg === '--ai-receipt') {
            options.aiReceiptPath = argv[index + 1]
            index += 1
        } else if (arg === '--strict') {
            options.strict = true
        } else if (arg === '--github-status') {
            includeGithubStatus = true
        } else if (arg === '--source-status') {
            includeSourceStatus = true
        } else if (arg === '--vercel-status') {
            includeVercelCloudStatus = true
        }
    }
    return { outputPath, options, includeGithubStatus, includeSourceStatus, includeVercelCloudStatus }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    const { outputPath, options, includeGithubStatus, includeSourceStatus, includeVercelCloudStatus } = parseArgs(process.argv.slice(2))
    if (includeGithubStatus) {
        options.githubStatus = await createGitHubReleaseStatus()
    }
    if (includeSourceStatus) {
        options.sourceStatus = await createSourceReleaseStatus()
    }
    if (includeVercelCloudStatus) {
        options.vercelCloudStatus = readVercelCloudEnvStatus()
    }
    const writtenPath = writeReleaseHandoffMarkdown(outputPath, options)
    console.log(`Release handoff written: ${writtenPath}`)
}
