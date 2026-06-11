import { startLocalHealthServer } from './local_health_service.js'

startLocalHealthServer()
    .then(({ config }) => {
        console.log(`Local health API listening at http://127.0.0.1:${config.port}/api/local/health`)
        console.log(`status=${config.status} db_ready=${config.dbReady} ai_ready=${config.aiReady} app_url=${config.appUrl}`)
    })
    .catch((error) => {
        console.error(error)
        process.exitCode = 1
    })
