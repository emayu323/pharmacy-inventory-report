const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('pharmacyReportNative', {
    storage: 'sqlite',
    patients: {
        list: () => ipcRenderer.invoke('patients:list'),
        listDeleted: () => ipcRenderer.invoke('patients:list-deleted'),
        get: patientId => ipcRenderer.invoke('patients:get', patientId),
        create: patient => ipcRenderer.invoke('patients:create', patient),
        update: (patientId, update) => ipcRenderer.invoke('patients:update', patientId, update),
        delete: patientId => ipcRenderer.invoke('patients:delete', patientId),
        restore: patientId => ipcRenderer.invoke('patients:restore', patientId)
    },
    reports: {
        get: reportId => ipcRenderer.invoke('reports:get', reportId),
        save: (reportId, report) => ipcRenderer.invoke('reports:save', reportId, report),
        getLatestByPatient: patientId => ipcRenderer.invoke('reports:get-latest-by-patient', patientId),
        listByPatient: patientId => ipcRenderer.invoke('reports:list-by-patient', patientId),
        listByNextVisitDateRange: (startDate, endDate) => ipcRenderer.invoke('reports:list-by-next-visit-range', startDate, endDate),
        listDeleted: () => ipcRenderer.invoke('reports:list-deleted'),
        delete: reportId => ipcRenderer.invoke('reports:delete', reportId),
        restore: reportId => ipcRenderer.invoke('reports:restore', reportId)
    },
    institutions: {
        list: () => ipcRenderer.invoke('institutions:list'),
        get: institutionId => ipcRenderer.invoke('institutions:get', institutionId),
        findByName: (name, type) => ipcRenderer.invoke('institutions:find-by-name', name, type),
        save: (institutionId, institution) => ipcRenderer.invoke('institutions:save', institutionId, institution),
        delete: institutionId => ipcRenderer.invoke('institutions:delete', institutionId)
    },
    templates: {
        list: () => ipcRenderer.invoke('templates:list'),
        save: template => ipcRenderer.invoke('templates:save', template),
        delete: templateId => ipcRenderer.invoke('templates:delete', templateId)
    },
    settings: {
        get: () => ipcRenderer.invoke('settings:get'),
        save: settings => ipcRenderer.invoke('settings:save', settings),
        setPin: pin => ipcRenderer.invoke('settings:set-pin', pin),
        clearPin: () => ipcRenderer.invoke('settings:clear-pin'),
        verifyPin: pin => ipcRenderer.invoke('settings:verify-pin', pin),
        ensureBackupKey: () => ipcRenderer.invoke('settings:ensure-backup-key'),
        rotateBackupKey: () => ipcRenderer.invoke('settings:rotate-backup-key')
    },
    drugMaster: {
        search: (query, limit) => ipcRenderer.invoke('drug-master:search', query, limit),
        getStatus: () => ipcRenderer.invoke('drug-master:get-status'),
        importCsv: () => ipcRenderer.invoke('drug-master:import-csv')
    },
    ai: {
        getStatus: () => ipcRenderer.invoke('ai:get-status'),
        createDraftFromVisitMemo: visitMemo => ipcRenderer.invoke('ai:create-draft-from-visit-memo', visitMemo)
    },
    backups: {
        create: password => ipcRenderer.invoke('backups:create', password),
        createPreUpdate: toVersion => ipcRenderer.invoke('backups:create-pre-update', toVersion),
        restore: password => ipcRenderer.invoke('backups:restore', password)
    },
    security: {
        getStatus: () => ipcRenderer.invoke('security:get-status')
    },
    updates: {
        getStatus: () => ipcRenderer.invoke('updates:get-status'),
        checkNow: () => ipcRenderer.invoke('updates:check-now'),
        onStatusChanged: callback => {
            const listener = (_event, status) => callback(status)
            ipcRenderer.on('updates:status-changed', listener)
            return () => ipcRenderer.removeListener('updates:status-changed', listener)
        }
    }
})
