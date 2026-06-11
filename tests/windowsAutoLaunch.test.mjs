import assert from 'node:assert/strict'
import test from 'node:test'
import { configureWindowsAutoLaunch } from '../electron/windowsAutoLaunch.mjs'

test('enables Windows login auto launch for packaged app', () => {
    const calls = []
    const result = configureWindowsAutoLaunch({
        platform: 'win32',
        execPath: 'C:\\Users\\user\\AppData\\Local\\Programs\\pharmacy-report\\在宅報告アプリ.exe',
        env: {},
        app: {
            isPackaged: true,
            setLoginItemSettings: settings => calls.push(settings)
        }
    })

    assert.deepEqual(result, {
        configured: true,
        reason: 'enabled'
    })
    assert.deepEqual(calls, [{
        openAtLogin: true,
        enabled: true,
        path: 'C:\\Users\\user\\AppData\\Local\\Programs\\pharmacy-report\\在宅報告アプリ.exe',
        args: []
    }])
})

test('does not touch login items outside packaged Windows app', () => {
    const calls = []
    const app = {
        isPackaged: true,
        setLoginItemSettings: settings => calls.push(settings)
    }

    assert.equal(configureWindowsAutoLaunch({ platform: 'darwin', env: {}, app }).reason, 'not_windows')
    assert.equal(configureWindowsAutoLaunch({ platform: 'win32', env: {}, app: { ...app, isPackaged: false } }).reason, 'not_packaged')
    assert.equal(configureWindowsAutoLaunch({ platform: 'win32', env: { LOCAL_DISABLE_WINDOWS_AUTO_LAUNCH: '1' }, app }).reason, 'disabled_by_env')
    assert.deepEqual(calls, [])
})
