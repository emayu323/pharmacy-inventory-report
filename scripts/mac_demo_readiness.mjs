import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createReleaseReadinessReport } from './release_readiness_check.mjs'

const DEFAULT_VITE_PORT = 5174
const DEFAULT_HEALTH_PORT = 47831
const DEFAULT_DEMO_INSTALL_CODE = 'DEMO-1234'
const DEFAULT_INSTALLER_URL = 'https://example.com/pharmacy-report-setup-0.1.0-x64.exe'

const REQUIRED_PACKAGE_SCRIPTS = [
    'dev',
    'dev:local-health',
    'dev:electron',
    'release:check',
    'release:github-status'
]

const ENTRY_PORTAL_SNIPPETS = [
    'VITE_DEMO_INSTALL_CODES',
    'VITE_WINDOWS_INSTALLER_URL'
]

const DEFAULT_EXTERNAL_PENDING = [
    {
        id: 'mac_electron_package',
        label: 'Mac Electron package check',
        status: 'pending',
        docs: 'docs/windows-installer-build.md',
        commands: [
            'npm run build:electron',
            'npm run verify:electron-package'
        ]
    },
    {
        id: 'windows_installer_artifact',
        label: 'Windows installer artifact',
        status: 'pending',
        docs: 'docs/windows-installer-build.md',
        commands: [
            'npm run release:github-status',
            'npm run dist:win'
        ]
    },
    {
        id: 'vercel_production_env',
        label: 'Vercel production environment',
        status: 'pending',
        docs: 'docs/vercel-production-env.md',
        commands: [
            'npm run verify:vercel-env -- --env-file .env.production.local',
            'npm run release:check -- --env-file .env.production.local'
        ]
    },
    {
        id: 'local_ai_integration',
        label: 'Local AI integration receipt',
        status: 'pending',
        docs: 'docs/local-ai-integration-check.md',
        commands: [
            'npm run test:local-ai-text -- --ollama-model <model>',
            'npm run release:check -- --ai-receipt output/local-ai-integration-result.json'
        ]
    }
]

export function createMacDemoReadinessReport(options = {}) {
    const rootDir = options.rootDir || process.cwd()
    const vitePort = normalizePort(options.vitePort, DEFAULT_VITE_PORT)
    const healthPort = normalizePort(options.healthPort, DEFAULT_HEALTH_PORT)
    const demoInstallCode = String(options.demoInstallCode || DEFAULT_DEMO_INSTALL_CODE).trim()
    const installerUrl = String(options.installerUrl || DEFAULT_INSTALLER_URL).trim()
    const entryUrl = `http://127.0.0.1:${vitePort}/entry`
    const checks = [
        checkPackageScripts(rootDir),
        checkEntryPortalDemo(rootDir),
        checkLocalHealthServer(rootDir),
        checkElectronDevEntry(rootDir)
    ]
    const releaseReport = readReleaseReport(rootDir, options)
    const externalPending = createExternalPending(releaseReport)
    const ok = checks.every(check => check.status === 'pass')

    return {
        ok,
        demoReady: ok,
        productionReady: Boolean(releaseReport?.ready),
        releaseOk: releaseReport?.ok ?? null,
        releaseSummary: releaseReport?.summary ?? null,
        entryUrl,
        demoInstallCode,
        installerUrl,
        vitePort,
        healthPort,
        commands: createDemoCommands({
            rootDir,
            vitePort,
            healthPort,
            demoInstallCode,
            installerUrl
        }),
        checks,
        externalPending
    }
}

export function formatMacDemoReadinessText(report) {
    const lines = [
        `macデモ判定: ${report.demoReady ? '実行可能' : '要修正'}`,
        `本番リリース判定: ${report.productionReady ? '完了' : '未完了'}`,
        `入口URL: ${report.entryUrl}`,
        `デモ導入コード: ${report.demoInstallCode}`,
        '',
        'ブラウザのみデモ:',
        ...report.commands.browserOnly.map(command => `- ${command}`),
        '',
        'Electronデモ:',
        ...report.commands.electron.map(command => `- ${command}`)
    ]

    if (report.checks.some(check => check.status !== 'pass')) {
        lines.push('', '要修正:')
        report.checks
            .filter(check => check.status !== 'pass')
            .forEach(check => {
                lines.push(`- ${check.label}: ${check.message}`)
            })
    }

    if (report.externalPending.length > 0) {
        lines.push('', '外部待ち:')
        report.externalPending.forEach(item => {
            lines.push(`- ${item.label}`)
            if (item.docs) lines.push(`  docs: ${item.docs}`)
            item.commands?.forEach(command => {
                lines.push(`  command: ${command}`)
            })
        })
    }

    return lines.join('\n')
}

function checkPackageScripts(rootDir) {
    const pkg = readPackageJson(rootDir)
    if (!pkg) {
        return {
            id: 'package_scripts',
            label: 'Package scripts',
            status: 'fail',
            message: 'package.json is missing or invalid'
        }
    }

    const missing = REQUIRED_PACKAGE_SCRIPTS.filter(script => !pkg.scripts?.[script])
    return {
        id: 'package_scripts',
        label: 'Package scripts',
        status: missing.length ? 'fail' : 'pass',
        message: missing.length
            ? `Missing npm scripts: ${missing.join(', ')}`
            : `${REQUIRED_PACKAGE_SCRIPTS.length} demo scripts found`
    }
}

function checkEntryPortalDemo(rootDir) {
    const source = readTextFile(path.join(rootDir, 'src/pages/EntryPortal.tsx'))
    const missing = ENTRY_PORTAL_SNIPPETS.filter(snippet => !source.includes(snippet))
    return {
        id: 'entry_portal_demo',
        label: 'Entry portal demo configuration',
        status: missing.length ? 'fail' : 'pass',
        message: missing.length
            ? `Entry portal is missing: ${missing.join(', ')}`
            : 'Entry portal supports local demo install codes and installer URL'
    }
}

function checkLocalHealthServer(rootDir) {
    const exists = fs.existsSync(path.join(rootDir, 'scripts/local_health_server.js'))
    return {
        id: 'local_health_demo',
        label: 'Local health demo server',
        status: exists ? 'pass' : 'fail',
        message: exists
            ? 'Local health server can simulate the Windows local app for browser demos'
            : 'scripts/local_health_server.js is missing'
    }
}

function checkElectronDevEntry(rootDir) {
    const exists = fs.existsSync(path.join(rootDir, 'electron/main.mjs'))
    return {
        id: 'electron_demo',
        label: 'Electron dev entry',
        status: exists ? 'pass' : 'fail',
        message: exists
            ? 'Electron dev entry can open the Vite app and start local services'
            : 'electron/main.mjs is missing'
    }
}

function createDemoCommands({ rootDir, vitePort, healthPort, demoInstallCode, installerUrl }) {
    const viteCommand = [
        'VITE_ENABLE_TEST_MODE=true',
        'VITE_REPORT_STORAGE=local',
        `VITE_DEMO_INSTALL_CODES=${shellQuote(demoInstallCode)}`,
        `VITE_WINDOWS_INSTALLER_URL=${shellQuote(installerUrl)}`,
        'npm run dev --',
        '--host 127.0.0.1',
        `--port ${vitePort}`
    ].join(' ')

    return {
        browserOnly: [
            viteCommand,
            [
                'LOCAL_APP_STATUS=ready',
                `LOCAL_APP_PORT=${healthPort}`,
                `LOCAL_APP_VERSION=${shellQuote(readPackageVersion(rootDir))}`,
                'npm run dev:local-health'
            ].join(' ')
        ],
        electron: [
            viteCommand,
            [
                `LOCAL_APP_PORT=${healthPort}`,
                'npm run dev:electron'
            ].join(' ')
        ]
    }
}

function readReleaseReport(rootDir, options) {
    if (options.releaseReport) return options.releaseReport
    if (!fs.existsSync(path.join(rootDir, 'scripts/release_readiness_check.mjs'))) return null
    try {
        return createReleaseReadinessReport({
            rootDir,
            env: options.env || process.env,
            envFile: options.envFile,
            aiReceiptPath: options.aiReceiptPath
        })
    } catch {
        return null
    }
}

function createExternalPending(releaseReport) {
    if (releaseReport?.nextActions?.length) {
        return releaseReport.nextActions
            .filter(action => DEFAULT_EXTERNAL_PENDING.some(item => item.id === action.id))
            .map(action => ({
                id: action.id,
                label: action.label,
                status: action.status,
                docs: action.docs,
                commands: action.commands || []
            }))
    }
    return DEFAULT_EXTERNAL_PENDING
}

function readPackageJson(rootDir) {
    try {
        return JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'))
    } catch {
        return null
    }
}

function readPackageVersion(rootDir) {
    return readPackageJson(rootDir)?.version || '0.1.0-dev'
}

function readTextFile(filePath) {
    try {
        return fs.readFileSync(filePath, 'utf8')
    } catch {
        return ''
    }
}

function normalizePort(value, fallback) {
    const port = Number.parseInt(String(value ?? ''), 10)
    return Number.isInteger(port) && port > 0 && port <= 65535 ? port : fallback
}

function shellQuote(value) {
    const text = String(value)
    if (/^[A-Za-z0-9_./:@-]+$/.test(text)) return text
    return `'${text.replaceAll("'", "'\\''")}'`
}

function parseArgs(argv) {
    const options = {}
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index]
        if (arg === '--format') {
            options.format = argv[index + 1]
            index += 1
        } else if (arg === '--demo-code') {
            options.demoInstallCode = argv[index + 1]
            index += 1
        } else if (arg === '--installer-url') {
            options.installerUrl = argv[index + 1]
            index += 1
        } else if (arg === '--vite-port') {
            options.vitePort = argv[index + 1]
            index += 1
        } else if (arg === '--health-port') {
            options.healthPort = argv[index + 1]
            index += 1
        }
    }
    return options
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    const options = parseArgs(process.argv.slice(2))
    const report = createMacDemoReadinessReport(options)
    if (options.format === 'json') {
        console.log(JSON.stringify(report, null, 2))
    } else {
        console.log(formatMacDemoReadinessText(report))
    }
    if (!report.ok) process.exitCode = 1
}
