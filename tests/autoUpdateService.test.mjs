import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'
import { createAutoUpdateService, getAutoUpdateEnablement } from '../electron/autoUpdateService.mjs'

test('auto update is disabled until code signing is explicitly enabled', () => {
    const enablement = getAutoUpdateEnablement({
        app: createFakeApp({ packaged: true }),
        env: {
            LOCAL_AUTO_UPDATE_ENABLED: '1'
        }
    })

    assert.equal(enablement.enabled, false)
    assert.match(enablement.message, /コード署名/)
})

test('auto update check prepares a downloaded update with a pre-update backup', async () => {
    const updater = createFakeUpdater()
    const backups = []
    const statuses = []
    const service = createAutoUpdateService({
        app: createFakeApp({ packaged: true }),
        autoUpdater: updater,
        env: {
            LOCAL_AUTO_UPDATE_ENABLED: '1',
            LOCAL_CODE_SIGNING_ENABLED: '1'
        },
        getCurrentVersion: () => '0.1.0',
        runPreUpdateBackup: async input => {
            backups.push(input)
            return {
                filePath: '/tmp/pre-update.json'
            }
        },
        notifyStatus: status => statuses.push(status),
        logger: createSilentLogger()
    })

    service.start()
    await service.checkForUpdates({ manual: true })
    await service.prepareDownloadedUpdate({ version: '0.2.0' })

    assert.equal(updater.autoDownload, true)
    assert.equal(updater.autoInstallOnAppQuit, false)
    assert.deepEqual(backups, [
        {
            fromVersion: '0.1.0',
            toVersion: '0.2.0'
        }
    ])
    assert.equal(service.getStatus().status, 'downloaded')
    assert.equal(service.getStatus().backupCreated, true)
    assert.equal(statuses.at(-1).message, '新しいバージョンを準備しました。アプリ終了時に更新されます')
})

test('auto update installs on quit only after the downloaded update is prepared', async () => {
    const updater = createFakeUpdater()
    const event = {
        prevented: false,
        preventDefault() {
            this.prevented = true
        }
    }
    const service = createAutoUpdateService({
        app: createFakeApp({ packaged: true }),
        autoUpdater: updater,
        env: {
            LOCAL_AUTO_UPDATE_ENABLED: '1',
            LOCAL_CODE_SIGNING_ENABLED: '1'
        },
        getCurrentVersion: () => '0.1.0',
        runPreUpdateBackup: async () => ({
            filePath: '/tmp/pre-update.json'
        }),
        logger: createSilentLogger()
    })

    service.start()
    await service.prepareDownloadedUpdate({ version: '0.2.0' })
    const handled = service.handleBeforeQuit(event)

    await new Promise(resolve => setImmediate(resolve))
    assert.equal(handled, true)
    assert.equal(event.prevented, true)
    assert.deepEqual(updater.quitAndInstallArgs, [true, false])
    assert.equal(service.getStatus().status, 'installing')
})

test('auto update does not install when the pre-update backup fails', async () => {
    const updater = createFakeUpdater()
    const app = createFakeApp({ packaged: true })
    const service = createAutoUpdateService({
        app,
        autoUpdater: updater,
        env: {
            LOCAL_AUTO_UPDATE_ENABLED: '1',
            LOCAL_CODE_SIGNING_ENABLED: '1'
        },
        getCurrentVersion: () => '0.1.0',
        runPreUpdateBackup: async () => {
            throw new Error('backup failed')
        },
        logger: createSilentLogger()
    })

    service.start()
    await service.prepareDownloadedUpdate({ version: '0.2.0' })

    assert.equal(service.getStatus().status, 'error')
    assert.equal(service.getStatus().backupCreated, false)
    assert.equal(updater.quitAndInstallArgs, null)
    assert.equal(app.quitCount, 0)
})

function createFakeUpdater() {
    const updater = new EventEmitter()
    updater.autoDownload = false
    updater.autoInstallOnAppQuit = true
    updater.quitAndInstallArgs = null
    updater.checkForUpdates = async () => ({
        updateInfo: {
            version: '0.2.0'
        }
    })
    updater.quitAndInstall = (...args) => {
        updater.quitAndInstallArgs = args
    }
    return updater
}

function createFakeApp({ packaged }) {
    return {
        isPackaged: packaged,
        quitCount: 0,
        getVersion: () => '0.1.0',
        quit() {
            this.quitCount += 1
        }
    }
}

function createSilentLogger() {
    return {
        error() {},
        warn() {},
        info() {}
    }
}
