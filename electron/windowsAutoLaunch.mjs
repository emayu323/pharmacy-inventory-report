export function configureWindowsAutoLaunch({ app, platform = process.platform, env = process.env, execPath = process.execPath } = {}) {
    if (platform !== 'win32') {
        return {
            configured: false,
            reason: 'not_windows'
        }
    }
    if (env.LOCAL_DISABLE_WINDOWS_AUTO_LAUNCH === '1') {
        return {
            configured: false,
            reason: 'disabled_by_env'
        }
    }
    if (!app?.isPackaged) {
        return {
            configured: false,
            reason: 'not_packaged'
        }
    }
    if (typeof app.setLoginItemSettings !== 'function') {
        return {
            configured: false,
            reason: 'api_unavailable'
        }
    }

    app.setLoginItemSettings({
        openAtLogin: true,
        enabled: true,
        path: execPath,
        args: []
    })

    return {
        configured: true,
        reason: 'enabled'
    }
}
