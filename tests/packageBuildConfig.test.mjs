import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const electronMain = fs.readFileSync(new URL('../electron/main.mjs', import.meta.url), 'utf8')
const windowsPreUpdateScript = fs.readFileSync(new URL('../scripts/windows_pre_update_backup.ps1', import.meta.url), 'utf8')
const windowsInstallerWorkflow = fs.readFileSync(new URL('../.github/workflows/windows-installer.yml', import.meta.url), 'utf8')
const windowsInstallerDocs = fs.readFileSync(new URL('../docs/windows-installer-build.md', import.meta.url), 'utf8')
const verifyV2PolicyChangeDoc = fs.readFileSync(new URL('../docs/verify-v2-policy-change.md', import.meta.url), 'utf8')
const implementationPlan = fs.readFileSync(new URL('../docs/local-first-implementation-plan.md', import.meta.url), 'utf8')
const gitignore = fs.readFileSync(new URL('../.gitignore', import.meta.url), 'utf8')
const vercelignore = fs.readFileSync(new URL('../.vercelignore', import.meta.url), 'utf8')
const tsConfig = JSON.parse(fs.readFileSync(new URL('../tsconfig.json', import.meta.url), 'utf8'))
const installCodeApi = fs.readFileSync(new URL('../api/install-code/verify.ts', import.meta.url), 'utf8')
const installCodeApiFiles = fs.readdirSync(new URL('../api/install-code/', import.meta.url))

test('package metadata is ready for local app distribution', () => {
    assert.equal(pkg.name, 'pharmacy-report')
    assert.match(pkg.version, /^0\.\d+\.\d+$/)
    assert.equal(pkg.main, 'electron/main.mjs')
    assert.equal(pkg.description.length > 0, true)
    assert.equal(pkg.author.length > 0, true)
    assert.match(pkg.engines.node, /24/)
    assert.equal(pkg.devDependencies['electron-builder'], '^26.15.2')
    assert.equal(pkg.dependencies['electron-updater'], '^6.8.9')
    assert.equal(pkg.dependencies['@supabase/supabase-js'], undefined)
})

test('electron-builder config creates a Windows NSIS installer with local assets', () => {
    assert.equal(pkg.build.appId, 'jp.empharmacy.pharmacy-report')
    assert.equal(pkg.build.productName, '在宅報告アプリ')
    assert.equal(pkg.build.protocols[0].schemes[0], 'pharmacy-report')
    assert.deepEqual(pkg.build.win.target, [
        {
            target: 'nsis',
            arch: ['x64']
        }
    ])
    assert.equal(pkg.build.nsis.oneClick, false)
    assert.equal(pkg.build.nsis.deleteAppDataOnUninstall, false)
    assert.ok(pkg.build.files.includes('dist/**/*'))
    assert.ok(pkg.build.files.includes('electron/**/*'))
    assert.ok(pkg.build.files.includes('scripts/local_health_service.js'))
    assert.ok(pkg.build.files.includes('src/data/drug-master.generated.json'))
    assert.ok(pkg.build.files.includes('node_modules/electron-updater/**/*'))
    assert.ok(pkg.build.files.includes('node_modules/builder-util-runtime/**/*'))
    assert.ok(pkg.build.files.includes('node_modules/csv-parse/**/*'))
    assert.ok(pkg.build.files.includes('node_modules/iconv-lite/**/*'))
    assert.ok(pkg.build.files.includes('!release/**/*'))
    assert.equal(pkg.build.npmRebuild, false)
    assert.equal(pkg.build.mac.identity, null)
    assert.ok(pkg.scripts['dist:win'].includes('--win nsis --x64'))
    assert.ok(pkg.scripts['dist:win'].includes('--publish never'))
    assert.ok(pkg.scripts['dist:win:mac'].includes('ELECTRON_BUILDER_CACHE=/private/tmp/report-electron-builder-cache'))
    assert.ok(pkg.scripts['dist:win:mac'].includes('-c.electronDownload.cache=/private/tmp/report-electron-cache'))
    assert.ok(pkg.scripts['dist:win:mac'].includes('--win nsis --x64'))
    assert.ok(pkg.scripts['dist:win:mac'].includes('--publish never'))
    assert.ok(pkg.scripts['dist:win:publish'].includes('--publish always'))
    assert.equal(pkg.scripts['verify:electron-package'], 'node scripts/verify_electron_package.mjs')
})

test('electron-builder config is prepared for signed GitHub auto updates', () => {
    assert.equal(pkg.build.win.publish[0].provider, 'github')
    assert.equal(pkg.build.win.publish[0].owner, 'emayu323')
    assert.equal(pkg.build.win.publish[0].repo, 'pharmacy-report-releases')
    assert.equal(pkg.build.win.publish[0].private, false)
    assert.match(electronMain, /autoUpdateService\.mjs/)
    assert.match(electronMain, /electron-updater/)
    assert.match(electronMain, /runPreUpdateBackupCommand/)
    assert.match(electronMain, /updates:check-now/)
    assert.ok(pkg.scripts['test:local-app'].includes('autoUpdateService.test.mjs'))
})

test('Electron startup configures Windows login auto launch for packaged app', () => {
    assert.match(electronMain, /windowsAutoLaunch\.mjs/)
    assert.match(electronMain, /configureLoginStartup\(\)/)
    assert.ok(pkg.build.files.includes('electron/**/*'))
})

test('Electron exposes DB protection status for rollout checks', () => {
    assert.match(electronMain, /localSecurityStatus\.mjs/)
    assert.match(electronMain, /security:get-status/)
    assert.match(electronMain, /createStartupSecurityWarning/)
    assert.match(electronMain, /showStartupSecurityWarning/)
    assert.match(electronMain, /dialog\.showMessageBox/)
    assert.ok(pkg.scripts['test:local-app'].includes('localSecurityStatus.test.mjs'))
})

test('local app test gate includes calculation print and drug master coverage', () => {
    assert.ok(pkg.scripts['test:local-app'].includes('appSettingsEvents.test.ts'))
    assert.ok(pkg.scripts['test:local-app'].includes('medicationCalculations.test.ts'))
    assert.ok(pkg.scripts['test:local-app'].includes('reportPrintModel.test.ts'))
    assert.ok(pkg.scripts['test:local-app'].includes('reportSaveModel.test.ts'))
    assert.ok(pkg.scripts['test:local-app'].includes('drugMaster.test.ts'))
    assert.ok(pkg.scripts['test:local-app'].includes('preUpdateBackupCommand.test.mjs'))
})

test('Windows updater helper calls the app pre-update backup CLI', () => {
    assert.match(windowsPreUpdateScript, /--pre-update-backup/)
    assert.match(windowsPreUpdateScript, /--to-version/)
    assert.match(windowsPreUpdateScript, /--db-path/)
    assert.match(windowsPreUpdateScript, /--backup-dir/)
    assert.match(windowsPreUpdateScript, /--kdf-iterations/)
    assert.match(windowsPreUpdateScript, /ProcessStartInfo/)
    assert.match(windowsPreUpdateScript, /WaitForExit/)
    assert.doesNotMatch(windowsPreUpdateScript, /LASTEXITCODE/)
})

test('Windows installer workflow builds and verifies distributable artifact', () => {
    assert.match(windowsInstallerWorkflow, /runs-on: windows-2025-vs2026/)
    assert.match(windowsInstallerWorkflow, /FORCE_JAVASCRIPT_ACTIONS_TO_NODE24:\s*true/)
    assert.match(windowsInstallerWorkflow, /node-version: 24/)
    assert.match(windowsInstallerWorkflow, /actions\/checkout@v6/)
    assert.match(windowsInstallerWorkflow, /actions\/setup-node@v6/)
    assert.match(windowsInstallerWorkflow, /npm ci/)
    assert.match(windowsInstallerWorkflow, /npm run test:local-app/)
    assert.match(windowsInstallerWorkflow, /npm run dist:win/)
    assert.match(windowsInstallerWorkflow, /node --test tests\/preUpdateBackupCommand\.test\.mjs/)
    assert.match(windowsInstallerWorkflow, /npm run release:check -- --format text/)
    assert.match(windowsInstallerWorkflow, /release-readiness\.txt/)
    assert.match(windowsInstallerWorkflow, /actions\/upload-artifact@v7/)
    assert.match(windowsInstallerWorkflow, /release\/\*\.exe/)
    assert.match(windowsInstallerWorkflow, /release\/release-readiness\.txt/)
    assert.match(windowsInstallerWorkflow, /WINDOWS_CSC_LINK/)
    assert.match(windowsInstallerWorkflow, /WINDOWS_CSC_KEY_PASSWORD/)
    assert.match(windowsInstallerWorkflow, /dist:win:publish/)
    assert.match(windowsInstallerWorkflow, /AUTO_UPDATE_RELEASE_PUBLISH_ENABLED/)
    assert.match(windowsInstallerWorkflow, /LOCAL_CODE_SIGNING_ENABLED/)
})

test('Windows installer docs show handoff with GitHub status for external operators', () => {
    assert.match(windowsInstallerDocs, /npm run release:github-status/)
    assert.match(windowsInstallerDocs, /公開リリース用リポジトリ/)
    assert.match(windowsInstallerDocs, /RELEASES_GITHUB_TOKEN/)
    assert.match(windowsInstallerDocs, /npm run dist:win:mac/)
    assert.equal(
        pkg.scripts['release:check:full'],
        'node scripts/release_readiness_check.mjs --source-status --github-status --vercel-status --vercel-smoke --env-file output/.env.production.local.generated --ai-receipt output/local-ai-integration-result.json --format text'
    )
    assert.equal(
        pkg.scripts['release:check:full:strict'],
        'node scripts/release_readiness_check.mjs --source-status --github-status --vercel-status --vercel-smoke --env-file output/.env.production.local.generated --ai-receipt output/local-ai-integration-result.json --format text --strict'
    )
    assert.equal(
        pkg.scripts['release:handoff:full'],
        'node scripts/release_handoff.mjs --source-status --github-status --vercel-status --vercel-smoke --env-file output/.env.production.local.generated --ai-receipt output/local-ai-integration-result.json'
    )
    assert.equal(pkg.scripts['release:vercel-smoke'], 'node scripts/vercel_production_smoke.mjs')
    assert.match(windowsInstallerDocs, /npm run release:check:full/)
    assert.match(windowsInstallerDocs, /npm run release:check:full:strict/)
    assert.equal(
        pkg.scripts['release:source-checklist'],
        'node scripts/source_publication_checklist.mjs'
    )
    assert.match(windowsInstallerDocs, /npm run release:source-checklist/)
    assert.match(windowsInstallerDocs, /npm run release:source-status -- --details/)
    assert.match(windowsInstallerDocs, /npm run release:handoff -- --source-status --github-status --vercel-status/)
    assert.match(windowsInstallerDocs, /npm run release:handoff:full/)
    assert.match(windowsInstallerDocs, /npm run release:vercel-smoke/)
    assert.match(windowsInstallerDocs, /--source-status/)
    assert.match(windowsInstallerDocs, /output\/release-handoff\.md/)
    assert.match(windowsInstallerDocs, /外部操作の明示承認/)
    assert.match(windowsInstallerDocs, /GitHub ActionsのWindowsインストーラーworkflowを実行してよい/)
    assert.match(windowsInstallerDocs, /Vercel Production環境変数を更新してよい/)
    assert.match(windowsInstallerDocs, /署名付き自動更新公開Prerequisiteだけ/)
    assert.doesNotMatch(windowsInstallerDocs, /Windowsインストーラー、GitHub Actions上の配布artifact、実AI結合が `pending`/)
})

test('implementation plan release status only leaves signing prerequisites as pending', () => {
    assert.match(implementationPlan, /GitHub Actions.*release:github-status.*source revision: current/s)
    assert.match(implementationPlan, /source_revision.*release:check:full.*現在ソースとの一致/s)
    assert.match(implementationPlan, /導入先Windows PCごとのローカルAI結合テスト再実行/)
    assert.match(implementationPlan, /Vercel本番env.*設定済み/s)
    assert.match(implementationPlan, /未実装・外部待ち:/)
    assert.match(implementationPlan, /RELEASES_GITHUB_TOKEN/)
    assert.match(implementationPlan, /WINDOWS_CSC_LINK/)
    assert.match(implementationPlan, /WINDOWS_CSC_KEY_PASSWORD/)
    assert.doesNotMatch(implementationPlan, /GitHub ActionsまたはWindows実機でのNSISインストーラー作成実行/)
    assert.doesNotMatch(implementationPlan, /リリース成果物専用の公開GitHubリポジトリ作成/)
    assert.doesNotMatch(implementationPlan, /実値を使ったVercel本番環境変数の設定/)
})

test('v2 verification doc matches the current release gate state', () => {
    assert.match(verifyV2PolicyChangeDoc, /release:check:full.*pass 17, pending 1, fail 0/s)
    assert.match(verifyV2PolicyChangeDoc, /署名付き自動更新公開/)
    assert.match(verifyV2PolicyChangeDoc, /GitHub Actions上のWindowsインストーラーartifact、本番Vercel env、現地AI結合証跡は確認済み/)
    assert.doesNotMatch(verifyV2PolicyChangeDoc, /外部実行待ちだけが `pending`/)
})

test('gitignore keeps local secrets and generated release artifacts out of source publication', () => {
    assert.match(gitignore, /^\.env\*$/m)
    assert.match(gitignore, /^!\.env\.example$/m)
    assert.match(gitignore, /^!\.env\.\*\.example$/m)
    assert.match(gitignore, /^release$/m)
    assert.match(gitignore, /^output$/m)
    assert.match(gitignore, /^\.playwright-cli$/m)
    assert.match(gitignore, /^\.vercel$/m)
    assert.match(gitignore, /^src\/data\/y_ALL\*\.csv$/m)
    assert.match(gitignore, /^src\/data\/y_ALL\*\.zip$/m)
})

test('vercel deployment excludes local release artifacts and generated secrets', () => {
    assert.match(vercelignore, /^release\/$/m)
    assert.match(vercelignore, /^output\/$/m)
    assert.match(vercelignore, /^dist\/$/m)
    assert.match(vercelignore, /^node_modules\/$/m)
    assert.match(vercelignore, /^\.vercel\/$/m)
    assert.match(vercelignore, /^\.env\*$/m)
    assert.match(vercelignore, /^!\.env\.example$/m)
    assert.match(vercelignore, /^!\.env\.\*\.example$/m)
    assert.match(vercelignore, /^\*\.sqlite$/m)
    assert.match(vercelignore, /^\*\.db$/m)
    assert.match(vercelignore, /^src\/data\/y_ALL\*\.csv$/m)
    assert.match(vercelignore, /^src\/data\/y_ALL\*\.zip$/m)
})

test('root TypeScript config supports Vercel function .ts imports', () => {
    assert.equal(tsConfig.compilerOptions.allowImportingTsExtensions, true)
    assert.equal(tsConfig.compilerOptions.moduleResolution, 'bundler')
    assert.equal(tsConfig.compilerOptions.noEmit, true)
})

test('install code Vercel API route is self-contained at runtime', () => {
    assert.deepEqual(installCodeApiFiles.filter(file => file.endsWith('.ts')), ['verify.ts'])
    assert.doesNotMatch(installCodeApi, /^\s*import\s/m)
    assert.doesNotMatch(installCodeApi, /from ['"][^'"]+\.ts['"]/)
})
