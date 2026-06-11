import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
    createMacDemoReadinessReport,
    formatMacDemoReadinessText
} from '../scripts/mac_demo_readiness.mjs'

test('mac demo readiness reports runnable demo commands without marking production ready', () => {
    const tmpDir = createFixture()

    try {
        const report = createMacDemoReadinessReport({
            rootDir: tmpDir,
            demoInstallCode: 'DEMO-1234',
            installerUrl: 'https://example.com/pharmacy-report-setup-0.1.0-x64.exe'
        })

        assert.equal(report.ok, true)
        assert.equal(report.demoReady, true)
        assert.equal(report.productionReady, false)
        assert.equal(report.entryUrl, 'http://127.0.0.1:5174/entry')
        assert.equal(report.demoInstallCode, 'DEMO-1234')
        assert.match(report.commands.browserOnly[0], /VITE_REPORT_STORAGE=local/)
        assert.match(report.commands.browserOnly[0], /VITE_DEMO_INSTALL_CODES=DEMO-1234/)
        assert.match(report.commands.browserOnly[0], /--port 5174/)
        assert.match(report.commands.browserOnly[1], /LOCAL_APP_PORT=47831/)
        assert.match(report.commands.electron[1], /npm run dev:electron/)
        assert.equal(report.checks.find(check => check.id === 'package_scripts')?.status, 'pass')
        assert.deepEqual(report.externalPending.map(item => item.id), [
            'mac_electron_package',
            'windows_installer_artifact',
            'vercel_production_env',
            'local_ai_integration'
        ])
        const windowsPending = report.externalPending.find(item => item.id === 'windows_installer_artifact')
        assert.deepEqual(windowsPending?.commands, [
            'npm run release:github-status',
            'npm run dist:win'
        ])

        const text = formatMacDemoReadinessText(report)
        assert.match(text, /macデモ判定: 実行可能/)
        assert.match(text, /本番リリース判定: 未完了/)
        assert.match(text, /http:\/\/127\.0\.0\.1:5174\/entry/)
        assert.match(text, /ブラウザのみデモ/)
        assert.match(text, /Electronデモ/)
        assert.match(text, /外部待ち/)
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true })
    }
})

test('mac demo readiness fails when the entry portal does not support demo install codes', () => {
    const tmpDir = createFixture()
    fs.writeFileSync(path.join(tmpDir, 'src/pages/EntryPortal.tsx'), 'export default function EntryPortal() { return null }')

    try {
        const report = createMacDemoReadinessReport({ rootDir: tmpDir })
        const entryCheck = report.checks.find(check => check.id === 'entry_portal_demo')

        assert.equal(report.ok, false)
        assert.equal(report.demoReady, false)
        assert.equal(entryCheck?.status, 'fail')
        assert.match(entryCheck?.message || '', /VITE_DEMO_INSTALL_CODES/)
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true })
    }
})

function createFixture() {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mac-demo-readiness-'))
    writeJson(tmpDir, 'package.json', {
        version: '0.1.0',
        scripts: {
            dev: 'vite',
            'dev:local-health': 'node scripts/local_health_server.js',
            'dev:electron': 'ELECTRON_START_URL=http://127.0.0.1:5174 electron electron/main.mjs',
            'release:check': 'node scripts/release_readiness_check.mjs',
            'release:github-status': 'node scripts/github_release_status.mjs'
        }
    })
    writeFile(tmpDir, 'src/pages/EntryPortal.tsx', [
        "const INSTALLER_URL = import.meta.env.VITE_WINDOWS_INSTALLER_URL || ''",
        "const DEMO_INSTALL_CODES = import.meta.env.VITE_DEMO_INSTALL_CODES || ''",
        'export default function EntryPortal() { return null }'
    ].join('\n'))
    writeFile(tmpDir, 'scripts/local_health_server.js', 'console.log("local health")\n')
    writeFile(tmpDir, 'electron/main.mjs', 'console.log("electron")\n')
    return tmpDir
}

function writeFile(rootDir, relativePath, content) {
    const filePath = path.join(rootDir, relativePath)
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, content)
}

function writeJson(rootDir, relativePath, value) {
    writeFile(rootDir, relativePath, `${JSON.stringify(value, null, 2)}\n`)
}
