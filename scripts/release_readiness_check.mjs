import fs from 'node:fs'
import path from 'node:path'
import { verifyVercelProductionEnv, readEnvFile } from './verify_vercel_production_env.mjs'
import { createSourceReleaseStatus } from './source_release_status.mjs'
import { readVercelCloudEnvStatus } from './vercel_cloud_env_status.mjs'
import { createGitHubReleaseStatus } from './github_release_status.mjs'

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
    'scripts/source_release_status.mjs',
    'scripts/source_publication_checklist.mjs',
    'scripts/release_handoff.mjs',
    'src/data/drug-master.generated.json',
    'src/main.tsx',
    'src/pages/EntryPortal.tsx',
    'src/pages/ReportEdit.tsx',
    'src/pages/Settings.tsx',
    'src/localAppConnection.ts',
    'src/patientRepository.ts',
    'src/reportRepository.ts',
    'src/reportSelection.ts',
    'src/institutionRepository.ts',
    'src/contexts/AuthProvider.tsx',
    '.node-version',
    'vercel.ts'
]

const REQUIRED_PACKAGE_SCRIPTS = [
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
    'release:source-status',
    'release:source-checklist',
    'create:install-codes',
    'demo:mac-readiness',
    'demo:mac-smoke',
    'test:local-ai-integration',
    'test:local-ai-text'
]

const REQUIRED_LOCAL_APP_TESTS = [
    'tests/localSqliteBackupRepository.test.mjs',
    'tests/autoUpdateService.test.mjs',
    'tests/preUpdateBackupCommand.test.mjs',
    'tests/packageBuildConfig.test.mjs',
    'tests/createInstallCodeRegistry.test.mjs',
    'tests/githubReleaseStatus.test.mjs',
    'tests/vercelCloudEnvStatus.test.mjs',
    'tests/sourceReleaseStatus.test.mjs',
    'tests/sourcePublicationChecklist.test.mjs',
    'tests/macDemoReadiness.test.mjs',
    'tests/macDemoSmoke.test.mjs',
    'tests/releaseHandoff.test.mjs',
    'tests/reportEditUiV3.test.mjs'
]

const NEXT_ACTION_DETAILS = {
    required_files: {
        description: 'チェックメッセージに出ている実装ファイルまたは運用文書を戻します。',
        docs: 'docs/local-first-implementation-plan.md'
    },
    package_scripts: {
        description: 'リリース確認を1コマンドで実行できるように、package.json の不足スクリプトを戻します。',
        docs: 'package.json'
    },
    runtime_configuration: {
        description: 'デプロイ前に Node 24 と Vercel TS 設定を固定します。',
        docs: 'docs/vercel-production-env.md'
    },
    entry_portal: {
        description: 'インストーラー入口を共有する前に、Vercel入口ページの導線を直します。',
        docs: 'public/manual.html'
    },
    native_local_storage_priority: {
        description: 'アプリ本体はローカルDB専用にし、患者データのSupabase経路を戻さないでください。',
        docs: 'docs/local-first-requirements.md'
    },
    operational_workflows: {
        description: '報告書の自動/手動保存と、手動/復元/更新前バックアップの導線を戻します。',
        docs: 'docs/local-first-implementation-plan.md'
    },
    latest_report_selection: {
        description: '前回報告書は作成日時ではなく訪問日を優先し、同じ訪問日だけ作成日時で判定します。',
        docs: 'docs/local-first-requirements.md'
    },
    windows_installer_workflow: {
        description: 'Windowsインストーラー成果物を作る GitHub Actions workflow を戻します。',
        docs: 'docs/windows-installer-build.md'
    },
    source_publication: {
        description: 'ローカルのリリース変更を確認し、GitHubへpushまたはPR化してからGitHub Actions状態を再確認します。',
        docs: 'docs/windows-installer-build.md',
        commands: [
            'npm run release:source-checklist',
            'npm run release:source-status',
            'npm run release:github-status'
        ]
    },
    mac_electron_package: {
        description: 'mac開発環境でElectronパッケージ同梱物を作成し、検証します。',
        docs: 'docs/windows-installer-build.md',
        commands: [
            'npm run build:electron',
            'npm run verify:electron-package'
        ]
    },
    windows_installer_artifact: {
        description: 'GitHub ActionsのWindowsインストーラーworkflowを実行するか、Windows上でコマンドを実行し、release/ に1つの .exe と対応する .blockmap だけを置きます。',
        docs: 'docs/windows-installer-build.md',
        commands: [
            'npm run release:github-status',
            'npm run dist:win'
        ]
    },
    github_release_status: {
        description: 'GitHub Actions上のWindowsインストーラーartifactを確認します。ローカルrelease/だけでなく、配布元のworkflow結果も揃える必要があります。',
        docs: 'docs/windows-installer-build.md',
        commands: [
            'npm run release:github-status',
            'gh workflow run windows-installer.yml'
        ]
    },
    vercel_production_env: {
        description: '本番デプロイ前に、導入コードとインストーラーURLの実値を検査します。',
        docs: 'docs/vercel-production-env.md',
        commands: [
            'npm run verify:vercel-env -- --env-file .env.production.local',
            'npm run release:vercel-status',
            'npm run release:check -- --env-file .env.production.local'
        ]
    },
    vercel_cloud_env: {
        description: 'Vercel本番に必要な環境変数名が実際に反映済みか確認します。',
        docs: 'docs/vercel-production-env.md',
        commands: [
            'npm run release:vercel-status',
            'vercel env rm VITE_SUPABASE_URL production',
            'vercel env rm VITE_SUPABASE_ANON_KEY production',
            'vercel env add INSTALL_CODE_REGISTRY production',
            'vercel env add WINDOWS_INSTALLER_URL production'
        ]
    },
    local_ai_integration: {
        description: '現地PCでローカルAI結合テストを実行し、保存された証跡を release:check に渡します。',
        docs: 'docs/local-ai-integration-check.md',
        commands: [
            'npm run test:local-ai-text -- --ollama-model <model>',
            'npm run release:check -- --ai-receipt output/local-ai-integration-result.json'
        ]
    }
}

export function createReleaseReadinessReport(options = {}) {
    const rootDir = options.rootDir || process.cwd()
    const env = options.env || process.env
    const checks = [
        checkRequiredFiles(rootDir),
        checkPackageScripts(rootDir),
        checkRuntimeConfiguration(rootDir),
        checkEntryPortal(rootDir),
        checkNativeLocalStoragePriority(rootDir),
        checkOperationalWorkflows(rootDir),
        checkLatestReportSelection(rootDir),
        checkWindowsWorkflow(rootDir),
        ...(options.sourceStatus ? [checkSourcePublication(options.sourceStatus)] : []),
        checkMacElectronPackage(rootDir),
        checkWindowsInstallerArtifact(rootDir),
        ...(options.githubReleaseStatus ? [checkGitHubReleaseStatus(options.githubReleaseStatus)] : []),
        checkVercelEnvironment(env, options.envFile, rootDir),
        ...(options.vercelCloudStatus ? [checkVercelCloudEnvironment(options.vercelCloudStatus)] : []),
        checkLocalAiIntegrationReceipt(env, options.aiReceiptPath, rootDir)
    ]

    const summary = summarizeChecks(checks)
    const hasBlockingStatus = checks.some(check => check.status === 'fail')
        || (options.strict && checks.some(check => check.status === 'pending' || check.status === 'warn'))

    return {
        ok: !hasBlockingStatus,
        ready: checks.every(check => check.status === 'pass'),
        strict: Boolean(options.strict),
        summary,
        counts: summary,
        checks,
        nextActions: createNextActions(checks)
    }
}

function checkGitHubReleaseStatus(status) {
    if (!status.ok) {
        return {
            id: 'github_release_status',
            label: 'GitHub Actions release artifact',
            status: 'fail',
            message: getGitHubReleaseStatusMessage(status)
        }
    }
    return {
        id: 'github_release_status',
        label: 'GitHub Actions release artifact',
        status: status.ready ? 'pass' : 'pending',
        message: getGitHubReleaseStatusMessage(status)
    }
}

function getGitHubReleaseStatusMessage(status) {
    return status.artifact?.message
        || status.latestRun?.message
        || status.workflow?.message
        || 'GitHub Actions release status was read'
}

function checkVercelCloudEnvironment(status) {
    if (!status.ok) {
        return {
            id: 'vercel_cloud_env',
            label: 'Vercel cloud environment',
            status: 'fail',
            message: status.message || 'Vercel cloud env status could not be read'
        }
    }
    return {
        id: 'vercel_cloud_env',
        label: 'Vercel cloud environment',
        status: status.ready ? 'pass' : 'pending',
        message: status.message || 'Vercel cloud env status was read'
    }
}

function checkSourcePublication(sourceStatus) {
    if (!sourceStatus?.ok) {
        return {
            id: 'source_publication',
            label: 'Source publication',
            status: 'fail',
            message: sourceStatus?.message || 'Local Git source status could not be read'
        }
    }
    if (!sourceStatus.ready) {
        return {
            id: 'source_publication',
            label: 'Source publication',
            status: 'pending',
            message: [
                `publish state ${sourceStatus.publishState || 'unknown'}`,
                `${sourceStatus.changedCount || 0} changed file(s)`,
                `${sourceStatus.untrackedCount || 0} untracked file(s)`,
                `${sourceStatus.trackedSensitiveCount || 0} tracked sensitive file(s)`,
                `${sourceStatus.ahead || 0} commit(s) ahead`
            ].join(', ')
        }
    }
    return {
        id: 'source_publication',
        label: 'Source publication',
        status: 'pass',
        message: sourceStatus.message || 'Local source is clean and synchronized with upstream'
    }
}

export function formatReleaseReadinessReportText(report) {
    const releaseState = report.ready ? '完了' : report.ok ? '未完了' : '要修正'
    const lines = [
        `リリース判定: ${releaseState}`,
        `ok: ${report.ok}`,
        `ready: ${report.ready}`,
        `strict: ${report.strict}`,
        `summary: pass ${report.summary.pass}, warn ${report.summary.warn}, pending ${report.summary.pending}, fail ${report.summary.fail}, total ${report.summary.total}`
    ]

    if (report.nextActions.length === 0) {
        lines.push('', '次の作業: なし')
        return lines.join('\n')
    }

    lines.push('', '次の作業:')
    report.nextActions.forEach((action, index) => {
        lines.push(`${index + 1}. [${action.status}] ${action.label}`)
        lines.push(`   ${action.description}`)
        if (action.docs) {
            lines.push(`   docs: ${action.docs}`)
        }
        if (action.commands?.length) {
            lines.push('   commands:')
            action.commands.forEach(command => {
                lines.push(`   - ${command}`)
            })
        }
    })

    return lines.join('\n')
}

function checkRequiredFiles(rootDir) {
    const missing = REQUIRED_FILES.filter(file => !fs.existsSync(path.join(rootDir, file)))
    return {
        id: 'required_files',
        label: 'Required implementation files',
        status: missing.length ? 'fail' : 'pass',
        message: missing.length
            ? `Missing files: ${missing.join(', ')}`
            : `${REQUIRED_FILES.length} files found`
    }
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
    const localAppTestScript = normalizeText(pkg.scripts?.['test:local-app'])
    const missingLocalAppTests = REQUIRED_LOCAL_APP_TESTS.filter(testFile => !localAppTestScript.includes(testFile))
    const errors = [
        ...(missing.length ? [`Missing npm scripts: ${missing.join(', ')}`] : []),
        ...(missingLocalAppTests.length ? [`test:local-app is missing: ${missingLocalAppTests.join(', ')}`] : [])
    ]
    return {
        id: 'package_scripts',
        label: 'Package scripts',
        status: errors.length ? 'fail' : 'pass',
        message: errors.length
            ? errors.join('; ')
            : `${REQUIRED_PACKAGE_SCRIPTS.length} scripts found`
    }
}

function checkEntryPortal(rootDir) {
    const main = readTextFile(path.join(rootDir, 'src', 'main.tsx'))
    const entryPortal = readTextFile(path.join(rootDir, 'src', 'pages', 'EntryPortal.tsx'))
    const localConnection = readTextFile(path.join(rootDir, 'src', 'localAppConnection.ts'))
    const manual = readTextFile(path.join(rootDir, 'public', 'manual.html'))
    const errors = []

    if (!main.includes('EntryPortal') || !main.includes('path="/entry"')) {
        errors.push('/entry route must render EntryPortal')
    }
    if (isEntryPortalInsideAuthProvider(main)) {
        errors.push('Entry portal must be outside AuthProvider so Vercel users do not wait for app authentication')
    }
    if (!areAppRoutesInsideAuthProvider(main)) {
        errors.push('Operational app routes must stay inside AuthProvider')
    }
    if (!localConnection.includes("LOCAL_APP_URI = 'pharmacy-report://open'")) {
        errors.push('pharmacy-report://open local app URI must be configured')
    }

    const requiredEntrySnippets = [
        '/manual.html',
        '導入コード',
        'Windows版をインストール',
        'ローカルアプリを起動',
        '接続を再確認'
    ]
    const missingEntrySnippets = requiredEntrySnippets.filter(snippet => !entryPortal.includes(snippet))
    if (missingEntrySnippets.length > 0) {
        errors.push(`Entry portal is missing: ${missingEntrySnippets.join(', ')}`)
    }

    const requiredManualSnippets = [
        '初回インストール',
        '更新が必要と表示されたら',
        'バックアップと復元',
        'AIモード',
        '困ったとき'
    ]
    const missingManualSnippets = requiredManualSnippets.filter(snippet => !manual.includes(snippet))
    if (missingManualSnippets.length > 0) {
        errors.push(`Manual is missing: ${missingManualSnippets.join(', ')}`)
    }

    return {
        id: 'entry_portal',
        label: 'Vercel entry portal',
        status: errors.length ? 'fail' : 'pass',
        message: errors.length
            ? errors.join('; ')
            : 'Entry portal includes install, update, app launch, connection check, and manual flow'
    }
}

function isEntryPortalInsideAuthProvider(source) {
    const authStart = source.indexOf('<AuthProvider>')
    const authEnd = source.indexOf('</AuthProvider>')
    const entryRoute = source.indexOf('path="/entry"')
    if (authStart < 0 || entryRoute < 0) return false
    return entryRoute > authStart && (authEnd < 0 || entryRoute < authEnd)
}

function areAppRoutesInsideAuthProvider(source) {
    const authStart = source.indexOf('<AuthProvider>')
    const authEnd = source.indexOf('</AuthProvider>')
    if (authStart < 0 || authEnd < authStart) return false

    const authBlock = source.slice(authStart, authEnd)
    return [
        'path="reports"',
        'path="settings"'
    ].every(snippet => authBlock.includes(snippet))
}

function checkRuntimeConfiguration(rootDir) {
    const pkg = readPackageJson(rootDir)
    const vercelConfigPath = path.join(rootDir, 'vercel.ts')
    const nodeVersionPath = path.join(rootDir, '.node-version')
    const errors = []

    if (!pkg) {
        errors.push('package.json is missing or invalid')
    } else {
        const nodeEngine = normalizeText(pkg.engines?.node)
        if (!/>=\s*24/.test(nodeEngine) || !/<\s*25/.test(nodeEngine)) {
            errors.push('Node 24 LTS must be required with package.json engines.node ">=24 <25"')
        }
        if (!pkg.devDependencies?.['@vercel/config']) {
            errors.push('@vercel/config must be installed for vercel.ts configuration')
        }
        if (!pkg.dependencies?.['electron-updater']) {
            errors.push('electron-updater must be installed for signed desktop auto updates')
        }
        if (pkg.dependencies?.['@supabase/supabase-js']) {
            errors.push('@supabase/supabase-js must not remain in app dependencies')
        }
    }

    const nodeVersion = readTextFile(nodeVersionPath).trim()
    if (!/^24(?:\D|$)/.test(nodeVersion)) {
        errors.push('Node 24 must be pinned in .node-version')
    }

    const vercelConfig = readTextFile(vercelConfigPath)
    if (!vercelConfig.includes("@vercel/config/v1")) {
        errors.push('vercel.ts must use @vercel/config/v1')
    }
    if (!vercelConfig.includes("framework: 'vite'") && !vercelConfig.includes('framework: "vite"')) {
        errors.push('vercel.ts must declare the Vite framework')
    }
    if (!vercelConfig.includes("buildCommand: 'npm run build'") && !vercelConfig.includes('buildCommand: "npm run build"')) {
        errors.push('vercel.ts must use npm run build')
    }
    if (!vercelConfig.includes("outputDirectory: 'dist'") && !vercelConfig.includes('outputDirectory: "dist"')) {
        errors.push('vercel.ts must output dist')
    }

    const apiRewriteIndex = vercelConfig.indexOf("routes.rewrite('/api/(.*)', '/api/$1')")
    const spaRewriteIndex = vercelConfig.indexOf("routes.rewrite('/(.*)', '/index.html')")
    if (apiRewriteIndex < 0 || spaRewriteIndex < 0 || apiRewriteIndex > spaRewriteIndex) {
        errors.push('Vercel API rewrite must appear before the SPA fallback rewrite')
    }

    return {
        id: 'runtime_configuration',
        label: 'Runtime configuration',
        status: errors.length ? 'fail' : 'pass',
        message: errors.length
            ? errors.join('; ')
            : 'Node 24 and Vercel TS configuration are pinned'
    }
}

function checkNativeLocalStoragePriority(rootDir) {
    const errors = []
    const repositoryChecks = [
        {
            file: 'src/patientRepository.ts',
            pattern: /isLocalPatientStorage\s*=\s*\(\)\s*=>\s*true/
        },
        {
            file: 'src/reportRepository.ts',
            pattern: /isLocalReportStorage\s*=\s*\(\)\s*=>\s*true/
        },
        {
            file: 'src/institutionRepository.ts',
            pattern: /isLocalInstitutionStorage\s*=\s*\(\)\s*=>\s*true/
        }
    ]

    for (const check of repositoryChecks) {
        const source = readTextFile(path.join(rootDir, check.file))
        if (!source.includes('getNativeBridge') || !check.pattern.test(source)) {
            errors.push(`${check.file} must use local storage only while keeping native SQLite priority`)
        }
    }

    const authProvider = readTextFile(path.join(rootDir, 'src', 'contexts', 'AuthProvider.tsx'))
    if (containsSupabaseReference(authProvider)) {
        errors.push('src/contexts/AuthProvider.tsx must not use Supabase auth')
    }

    const appSupabaseRefs = findAppSupabaseReferences(rootDir)
    if (appSupabaseRefs.length > 0) {
        errors.push(`app source must not reference Supabase: ${appSupabaseRefs.join(', ')}`)
    }

    return {
        id: 'native_local_storage_priority',
        label: 'Native local storage priority',
        status: errors.length ? 'fail' : 'pass',
        message: errors.length
            ? errors.join('; ')
            : 'App source is local-only and native SQLite wins when the desktop bridge is present'
    }
}

function checkOperationalWorkflows(rootDir) {
    const reportEdit = readTextFile(path.join(rootDir, 'src', 'pages', 'ReportEdit.tsx'))
    const settings = readTextFile(path.join(rootDir, 'src', 'pages', 'Settings.tsx'))
    const electronMain = readTextFile(path.join(rootDir, 'electron', 'main.mjs'))
    const errors = []

    const autoSaveSnippets = [
        'canAutoSaveReportDraft',
        'createReportAutoSaveFingerprint',
        'setTimeout(() =>',
        '2000'
    ]
    const missingAutoSave = autoSaveSnippets.filter(snippet => !reportEdit.includes(snippet))
    if (missingAutoSave.length > 0) {
        errors.push(`ReportEdit auto save workflow is missing: ${missingAutoSave.join(', ')}`)
    }

    const saveStatusSnippets = [
        '未保存あり',
        '保存中',
        '保存済み',
        '保存失敗'
    ]
    const missingSaveStatus = saveStatusSnippets.filter(snippet => !reportEdit.includes(snippet))
    if (missingSaveStatus.length > 0) {
        errors.push(`ReportEdit 保存状態 labels are missing: ${missingSaveStatus.join(', ')}`)
    }

    if (!reportEdit.includes('保存する') || !reportEdit.includes('persistReport')) {
        errors.push('ReportEdit manual save workflow is missing')
    }

    const settingsBackupSnippets = [
        'handleBackupExport',
        'bridge.backups.create',
        'createEncryptedLocalBackup',
        'handleBackupRestore',
        'bridge.backups.restore',
        'restoreEncryptedLocalBackup',
        'handlePreUpdateBackup',
        'bridge.backups.createPreUpdate'
    ]
    const missingSettingsBackup = settingsBackupSnippets.filter(snippet => !settings.includes(snippet))
    if (missingSettingsBackup.length > 0) {
        errors.push(`Settings backup workflow is missing: ${missingSettingsBackup.join(', ')}`)
    }

    const electronBackupChannels = [
        "'backups:create'",
        "'backups:restore'",
        "'backups:create-pre-update'"
    ]
    const missingElectronBackup = electronBackupChannels.filter(snippet => !electronMain.includes(snippet))
    if (missingElectronBackup.length > 0) {
        errors.push(`Electron backup IPC is missing: ${missingElectronBackup.join(', ')}`)
    }

    return {
        id: 'operational_workflows',
        label: 'Operational save and backup workflows',
        status: errors.length ? 'fail' : 'pass',
        message: errors.length
            ? errors.join('; ')
            : 'Report auto/manual save and backup/restore/pre-update workflows are present'
    }
}

function checkLatestReportSelection(rootDir) {
    const reportRepository = readTextFile(path.join(rootDir, 'src', 'reportRepository.ts'))
    const reportSelection = readTextFile(path.join(rootDir, 'src', 'reportSelection.ts'))
    const errors = []

    if (!reportRepository.includes('selectLatestReportByVisitDate')) {
        errors.push('src/reportRepository.ts must use selectLatestReportByVisitDate for local previous-report lookup')
    }
    if (reportRepository.includes('sort(compareReportsByNewestCreatedAt)[0]')) {
        errors.push('src/reportRepository.ts must not select previous reports by created_at first')
    }
    if (!reportSelection.includes('selectLatestReportByVisitDate') || !reportSelection.includes('visit_date') || !reportSelection.includes('created_at')) {
        errors.push('src/reportSelection.ts must compare visit_date first and created_at as a tie breaker')
    }

    return {
        id: 'latest_report_selection',
        label: 'Latest report selection',
        status: errors.length ? 'fail' : 'pass',
        message: errors.length
            ? errors.join('; ')
            : 'Previous report lookup prefers visit date and uses creation time only as a tie breaker'
    }
}

function checkWindowsWorkflow(rootDir) {
    const workflowPath = path.join(rootDir, '.github', 'workflows', 'windows-installer.yml')
    if (!fs.existsSync(workflowPath)) {
        return {
            id: 'windows_installer_workflow',
            label: 'Windows installer workflow',
            status: 'fail',
            message: 'Workflow file is missing'
        }
    }

    const workflow = fs.readFileSync(workflowPath, 'utf8')
    const requiredSnippets = [
        'runs-on: windows-latest',
        'node-version: 24',
        'npm run dist:win',
        'npm run dist:win:publish',
        'AUTO_UPDATE_RELEASE_PUBLISH_ENABLED',
        'LOCAL_CODE_SIGNING_ENABLED',
        'windows_pre_update_backup.ps1',
        'npm run release:check -- --format text',
        'release-readiness.txt',
        'actions/upload-artifact@v4'
    ]
    const missing = requiredSnippets.filter(snippet => !workflow.includes(snippet))
    return {
        id: 'windows_installer_workflow',
        label: 'Windows installer workflow',
        status: missing.length ? 'fail' : 'pass',
        message: missing.length
            ? `Workflow is missing: ${missing.join(', ')}`
            : 'Workflow can build, smoke-test, and upload installer artifacts'
    }
}

function checkMacElectronPackage(rootDir) {
    const releaseDir = path.join(rootDir, 'release')
    const appAsar = findFirstFile(releaseDir, filePath => filePath.endsWith(`${path.sep}app.asar`))
    return {
        id: 'mac_electron_package',
        label: 'mac packaged app artifact',
        status: appAsar ? 'pass' : 'pending',
        message: appAsar
            ? `Packaged app found: ${path.relative(rootDir, appAsar)}`
            : 'Run npm run build:electron and npm run verify:electron-package on mac'
    }
}

function checkWindowsInstallerArtifact(rootDir) {
    const { exeFiles, blockmapFiles } = getTopLevelWindowsInstallerArtifact(rootDir)
    if (exeFiles.length === 0 && blockmapFiles.length === 0) {
        return {
            id: 'windows_installer_artifact',
            label: 'Windows installer artifact',
            status: 'pending',
            message: 'Run the Windows GitHub Actions workflow or npm run dist:win on Windows'
        }
    }
    if (exeFiles.length !== 1 || blockmapFiles.length !== 1) {
        return {
            id: 'windows_installer_artifact',
            label: 'Windows installer artifact',
            status: 'fail',
            message: `Incomplete or multiple Windows installer artifacts: found ${exeFiles.length} .exe file(s) and ${blockmapFiles.length} .blockmap file(s)`
        }
    }

    const exe = exeFiles[0]
    const blockmap = blockmapFiles[0]
    const pkg = readPackageJson(rootDir)
    const packageVersion = normalizeText(pkg?.version)
    if (packageVersion && !path.basename(exe).includes(`-${packageVersion}-`)) {
        return {
            id: 'windows_installer_artifact',
            label: 'Windows installer artifact',
            status: 'fail',
            message: `Windows installer artifact version must match package.json version ${packageVersion}: ${path.basename(exe)}`
        }
    }

    const expectedBlockmap = exe ? `${exe}.blockmap` : ''
    if (blockmap !== expectedBlockmap) {
        return {
            id: 'windows_installer_artifact',
            label: 'Windows installer artifact',
            status: 'fail',
            message: `Windows installer artifact is missing matching .blockmap: ${path.relative(rootDir, expectedBlockmap)}`
        }
    }

    return {
        id: 'windows_installer_artifact',
        label: 'Windows installer artifact',
        status: exe ? 'pass' : 'pending',
        message: exe
            ? `Installer found: ${path.relative(rootDir, exe)} and ${path.relative(rootDir, expectedBlockmap)}`
            : 'Run the Windows GitHub Actions workflow or npm run dist:win on Windows'
    }
}

function getTopLevelWindowsInstallerArtifact(rootDir) {
    const releaseDir = path.join(rootDir, 'release')
    const releaseFiles = readTopLevelFiles(releaseDir)
    const exeFiles = releaseFiles.filter(filePath => filePath.endsWith('.exe'))
    const blockmapFiles = releaseFiles.filter(filePath => filePath.endsWith('.blockmap'))
    return {
        exe: exeFiles.length === 1 ? exeFiles[0] : '',
        exeFiles,
        blockmapFiles
    }
}

function checkVercelEnvironment(env, envFile, rootDir) {
    const hasInlineEnv = Boolean(env.INSTALL_CODE_REGISTRY || env.WINDOWS_INSTALLER_URL)
    if (!hasInlineEnv && !envFile) {
        return {
            id: 'vercel_production_env',
            label: 'Vercel production environment',
            status: 'pending',
            message: 'Run npm run verify:vercel-env with production values before deployment'
        }
    }

    let sourceEnv
    try {
        sourceEnv = envFile ? { ...env, ...readEnvFile(resolvePath(envFile, rootDir)) } : env
    } catch {
        return {
            id: 'vercel_production_env',
            label: 'Vercel production environment',
            status: 'fail',
            message: `Vercel env file could not be read: ${envFile}`
        }
    }
    const result = verifyVercelProductionEnv(sourceEnv)
    const installerUrlMismatch = result.ok
        ? getInstallerUrlArtifactMismatch(sourceEnv, rootDir)
        : ''
    return {
        id: 'vercel_production_env',
        label: 'Vercel production environment',
        status: result.ok && !installerUrlMismatch ? 'pass' : 'fail',
        message: result.ok && !installerUrlMismatch
            ? `Vercel env valid for ${result.summary.enabledInstallCodeCount} enabled install code(s)`
            : `Vercel env invalid: ${[...result.errors, installerUrlMismatch].filter(Boolean).join('; ')}`,
        warnings: result.warnings
    }
}

function getInstallerUrlArtifactMismatch(env, rootDir) {
    const artifact = getTopLevelWindowsInstallerArtifact(rootDir)
    if (!artifact.exe) return ''

    const expectedFileName = path.basename(artifact.exe)
    const errors = []
    const installerUrl = normalizeText(env.WINDOWS_INSTALLER_URL)
    const urlFileName = installerUrl ? getUrlPathBasename(installerUrl) : ''
    if (urlFileName && urlFileName !== expectedFileName) {
        errors.push(`WINDOWS_INSTALLER_URL must point to ${expectedFileName}, got ${urlFileName}`)
    }

    errors.push(...getRegistryInstallerUrlArtifactMismatches(env.INSTALL_CODE_REGISTRY, expectedFileName))
    return errors.join('; ')
}

function getRegistryInstallerUrlArtifactMismatches(rawRegistry, expectedFileName) {
    const source = normalizeText(rawRegistry)
    if (!source) return []

    try {
        const parsed = JSON.parse(source)
        const records = Array.isArray(parsed)
            ? parsed
            : parsed && typeof parsed === 'object' && Array.isArray(parsed.codes)
                ? parsed.codes
                : []
        return records.flatMap((record, index) => {
            if (record && typeof record === 'object' && record.disabled === true) return []
            const installerUrl = record && typeof record === 'object'
                ? normalizeText(record.installerUrl)
                : ''
            const urlFileName = installerUrl ? getUrlPathBasename(installerUrl) : ''
            if (!urlFileName || urlFileName === expectedFileName) return []
            return [`INSTALL_CODE_REGISTRY.codes[${index}].installerUrl must point to ${expectedFileName}, got ${urlFileName}`]
        })
    } catch {
        return []
    }
}

function checkLocalAiIntegrationReceipt(env, explicitReceiptPath, rootDir) {
    const rawReceiptPath = explicitReceiptPath || env.LOCAL_AI_INTEGRATION_RESULT_PATH || ''
    if (!rawReceiptPath) {
        return {
            id: 'local_ai_integration',
            label: 'Local AI integration receipt',
            status: 'pending',
            message: 'Run npm run test:local-ai-text on the target PC and pass the saved receipt to release:check'
        }
    }

    const receiptPath = resolvePath(rawReceiptPath, rootDir)
    if (!fs.existsSync(receiptPath)) {
        return {
            id: 'local_ai_integration',
            label: 'Local AI integration receipt',
            status: 'fail',
            message: `AI integration receipt was not found: ${receiptPath}`
        }
    }

    try {
        const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'))
        const unsafeFields = findAiReceiptPrivacyFields(receipt)
        if (unsafeFields.length > 0) {
            return {
                id: 'local_ai_integration',
                label: 'Local AI integration receipt',
                status: 'fail',
                message: `AI integration receipt contains privacy-sensitive fields: ${unsafeFields.join(', ')}`
            }
        }
        const packageVersion = normalizeText(readPackageJson(rootDir)?.version)
        if (packageVersion && normalizeText(receipt.app_version) !== packageVersion) {
            return {
                id: 'local_ai_integration',
                label: 'Local AI integration receipt',
                status: 'fail',
                message: `AI integration receipt app version must match package.json version ${packageVersion}`
            }
        }
        const receiptPendingReason = getAiReceiptPendingReason(receipt)
        if (receiptPendingReason) {
            return {
                id: 'local_ai_integration',
                label: 'Local AI integration receipt',
                status: 'pending',
                message: receiptPendingReason
            }
        }
        const receiptCompletionErrors = getAiReceiptCompletionErrors(receipt)
        if (receiptCompletionErrors.length > 0) {
            return {
                id: 'local_ai_integration',
                label: 'Local AI integration receipt',
                status: 'fail',
                message: `AI integration receipt is incomplete: ${receiptCompletionErrors.join(', ')}`
            }
        }
        if (receipt.ok && !receipt.skipped) {
            return {
                id: 'local_ai_integration',
                label: 'Local AI integration receipt',
                status: 'pass',
                message: `AI integration verified at ${receipt.created_at || receiptPath}`
            }
        }
        return {
            id: 'local_ai_integration',
            label: 'Local AI integration receipt',
            status: 'fail',
            message: 'AI integration receipt is skipped or not ok'
        }
    } catch {
        return {
            id: 'local_ai_integration',
            label: 'Local AI integration receipt',
            status: 'fail',
            message: 'AI integration receipt is not valid JSON'
        }
    }
}

function getAiReceiptPendingReason(receipt) {
    if (!receipt?.ok || receipt.skipped || receipt.ready === true) return ''

    const blockingErrors = []
    if (receipt.ollama?.status !== 'ready') {
        blockingErrors.push('ollama.status must be ready')
    }
    blockingErrors.push(...getAiDraftReceiptErrors(receipt.draft, 'draft'))
    if (blockingErrors.length > 0) return ''

    return '訪問メモからのAI下書きは確認済みですが、ローカルAI全体の ready 確認は未完了です'
}

function getAiReceiptCompletionErrors(receipt) {
    if (!receipt?.ok || receipt.skipped) return []

    const errors = []
    if (receipt.ready !== true) {
        errors.push('ready must be true')
    }
    if (receipt.ollama?.status !== 'ready') {
        errors.push('ollama.status must be ready')
    }
    errors.push(...getAiDraftReceiptErrors(receipt.draft, 'draft'))
    return errors
}

function getAiDraftReceiptErrors(draft, label) {
    const errors = []
    if (draft?.source !== 'local_llm') {
        errors.push(`${label}.source must be local_llm`)
    }
    if (draft?.chiefComplaintPresent !== true) {
        errors.push(`${label}.chiefComplaintPresent must be true`)
    }
    if (draft?.medicationInstructionPresent !== true) {
        errors.push(`${label}.medicationInstructionPresent must be true`)
    }
    return errors
}

function readPackageJson(rootDir) {
    try {
        return JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'))
    } catch {
        return null
    }
}

function readTextFile(filePath) {
    try {
        return fs.readFileSync(filePath, 'utf8')
    } catch {
        return ''
    }
}

function findFirstFile(startDir, predicate) {
    return findFiles(startDir, predicate)[0] || ''
}

function findFiles(startDir, predicate) {
    if (!fs.existsSync(startDir)) return []
    const matches = []
    const stack = [startDir]
    while (stack.length > 0) {
        const current = stack.pop()
        const entries = fs.readdirSync(current, { withFileTypes: true })
        for (const entry of entries) {
            const filePath = path.join(current, entry.name)
            if (entry.isDirectory()) {
                stack.push(filePath)
            } else if (predicate(filePath)) {
                matches.push(filePath)
            }
        }
    }
    return matches.sort()
}

function findAppSupabaseReferences(rootDir) {
    const appDirs = [
        path.join(rootDir, 'src'),
        path.join(rootDir, 'electron')
    ]
    return appDirs.flatMap(appDir => findFiles(appDir, filePath => {
        if (!/\.(?:ts|tsx|js|mjs|cjs)$/.test(filePath)) return false
        return containsSupabaseReference(readTextFile(filePath))
    })).map(filePath => path.relative(rootDir, filePath))
}

function containsSupabaseReference(source) {
    return /(?:\bsupabase\b|\bSupabase\b|@supabase\b|VITE_SUPABASE\b)/.test(source)
}

function readTopLevelFiles(dir) {
    try {
        return fs.readdirSync(dir, { withFileTypes: true })
            .filter(entry => entry.isFile())
            .map(entry => path.join(dir, entry.name))
            .sort()
    } catch {
        return []
    }
}

const AI_RECEIPT_UNSAFE_FIELD_NAMES = new Set([
    'transcript',
    'transcription',
    'visit_memo',
    'visitmemo',
    'chief_complaint',
    'medication_instruction',
    'audio_path',
    'audiopath',
    'audio_file',
    'audiofile',
    'audio_bytes',
    'audiobytes',
    'audio_data',
    'audiodata',
    'audio_base64',
    'audiobase64',
    'blob',
    'raw_audio',
    'rawaudio'
])

function findAiReceiptPrivacyFields(value, pathParts = []) {
    if (!value || typeof value !== 'object') return []

    const fields = []
    for (const [key, child] of Object.entries(value)) {
        const normalizedKey = key.toLowerCase()
        const nextPath = [...pathParts, key]
        if (AI_RECEIPT_UNSAFE_FIELD_NAMES.has(normalizedKey)) {
            fields.push(nextPath.join('.'))
            continue
        }
        fields.push(...findAiReceiptPrivacyFields(child, nextPath))
    }
    return fields
}

function summarizeChecks(checks) {
    const summary = {
        pass: 0,
        warn: 0,
        pending: 0,
        fail: 0,
        total: checks.length
    }
    for (const check of checks) {
        summary[check.status] += 1
    }
    return summary
}

function createNextActions(checks) {
    return checks
        .filter(check => check.status !== 'pass')
        .map(check => {
            const details = NEXT_ACTION_DETAILS[check.id] || {}
            return {
                id: check.id,
                label: check.label,
                status: check.status,
                description: getNextActionDescription(check, details),
                ...(details.docs ? { docs: details.docs } : {}),
                ...(details.commands ? { commands: details.commands } : {})
            }
        })
}

function getNextActionDescription(check, details) {
    if (check.id === 'local_ai_integration' && check.status === 'pending' && check.message.includes('text-only')) {
        return check.message
    }
    if (check.id === 'source_publication' && check.message) {
        const baseDescription = details.description || 'ローカルのソース公開状態を確認します。'
        return `${baseDescription} 現在の判定: ${check.message}`
    }
    return details.description || check.message
}

function resolvePath(filePath, rootDir) {
    return path.isAbsolute(filePath) ? filePath : path.resolve(rootDir || process.cwd(), filePath)
}

function normalizeText(value) {
    return typeof value === 'string' ? value.trim() : ''
}

function getUrlPathBasename(value) {
    try {
        const parsed = new URL(value)
        return path.basename(parsed.pathname)
    } catch {
        return ''
    }
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
    const envFileIndex = process.argv.indexOf('--env-file')
    const aiReceiptIndex = process.argv.indexOf('--ai-receipt')
    const formatIndex = process.argv.indexOf('--format')
    const strict = process.argv.includes('--strict')
    const includeSourceStatus = process.argv.includes('--source-status')
    const includeGitHubStatus = process.argv.includes('--github-status')
    const includeVercelStatus = process.argv.includes('--vercel-status')
    const sourceStatus = includeSourceStatus ? await createSourceReleaseStatus() : undefined
    const githubReleaseStatus = includeGitHubStatus ? await createGitHubReleaseStatus() : undefined
    const vercelCloudStatus = includeVercelStatus ? readVercelCloudEnvStatus() : undefined
    const report = createReleaseReadinessReport({
        envFile: envFileIndex >= 0 ? process.argv[envFileIndex + 1] : undefined,
        aiReceiptPath: aiReceiptIndex >= 0 ? process.argv[aiReceiptIndex + 1] : undefined,
        strict,
        sourceStatus,
        githubReleaseStatus,
        vercelCloudStatus
    })
    const format = formatIndex >= 0 ? process.argv[formatIndex + 1] : 'json'
    console.log(format === 'text' ? formatReleaseReadinessReportText(report) : JSON.stringify(report, null, 2))
    if (!report.ok) {
        process.exitCode = 1
    }
}
