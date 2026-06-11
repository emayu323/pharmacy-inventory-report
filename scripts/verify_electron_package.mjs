import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const asar = require('@electron/asar')

const packageRoot = process.cwd()
const appBundlePath = process.env.ELECTRON_PACKAGE_APP || findAppBundle(path.join(packageRoot, 'release'))
if (!appBundlePath) {
    throw new Error('Electron app bundle was not found under release/')
}

const resourcesPath = path.join(appBundlePath, 'Contents', 'Resources')
const asarPath = path.join(resourcesPath, 'app.asar')
const plistPath = path.join(appBundlePath, 'Contents', 'Info.plist')

assertFile(asarPath)
assertFile(plistPath)

const files = new Set(asar.listPackage(asarPath))
const requiredAsarEntries = [
    '/electron/main.mjs',
    '/electron/preload.cjs',
    '/electron/preUpdateBackupCommand.mjs',
    '/electron/localSecurityStatus.mjs',
    '/electron/windowsAutoLaunch.mjs',
    '/scripts/local_health_service.js',
    '/dist/index.html',
    '/dist/manual.html',
    '/src/data/drug-master.generated.json',
    '/node_modules/csv-parse/package.json',
    '/node_modules/iconv-lite/package.json'
]

for (const entry of requiredAsarEntries) {
    if (!files.has(entry)) {
        throw new Error(`Missing packaged file: ${entry}`)
    }
}

const plist = fs.readFileSync(plistPath, 'utf8')
if (!plist.includes('jp.empharmacy.pharmacy-report')) {
    throw new Error('Info.plist does not include the expected app id')
}
if (!plist.includes('pharmacy-report')) {
    throw new Error('Info.plist does not include the custom URI scheme')
}

console.log(JSON.stringify({
    ok: true,
    appBundlePath,
    asarPath,
    checkedEntries: requiredAsarEntries.length
}, null, 2))

function findAppBundle(releaseDir) {
    const platformDirs = safeReadDir(releaseDir)
    for (const platformDir of platformDirs) {
        const platformPath = path.join(releaseDir, platformDir)
        for (const item of safeReadDir(platformPath)) {
            if (item.endsWith('.app')) {
                return path.join(platformPath, item)
            }
        }
    }
    return ''
}

function safeReadDir(dir) {
    try {
        return fs.readdirSync(dir)
    } catch {
        return []
    }
}

function assertFile(filePath) {
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        throw new Error(`Required file was not found: ${filePath}`)
    }
}
