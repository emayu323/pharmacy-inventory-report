import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { initializeLocalDatabase } from '../electron/localDatabase.mjs'
import {
    createPatient,
    deletePatient,
    getPatientById,
    listDeletedPatients,
    listPatients,
    restorePatient,
    updatePatient
} from '../electron/localPatientRepository.mjs'

test('creates, lists, reads, and updates patients in SQLite', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'report-patient-db-'))
    const initialized = await initializeLocalDatabase({ dbPath: path.join(tmpDir, 'patients.sqlite') })

    try {
        const saved = createPatient(initialized.db, {
            name: '佐藤 花子',
            kana: 'サトウ ハナコ',
            dob: '1945-02-03',
            gender: 'female',
            medical_institution_name: '検証医院',
            primary_doctor: '検証医師',
            is_active: true
        })

        assert.match(saved.id, /^local-patient-/)
        assert.equal(saved.name, '佐藤 花子')
        assert.equal(saved.is_active, true)

        const patients = listPatients(initialized.db)
        assert.equal(patients.length, 1)
        assert.equal(patients[0].kana, 'サトウ ハナコ')

        const fetched = getPatientById(initialized.db, saved.id)
        assert.equal(fetched?.medical_institution_name, '検証医院')

        const updated = updatePatient(initialized.db, saved.id, {
            care_manager: '検証ケアマネ',
            is_active: false
        })
        assert.equal(updated?.care_manager, '検証ケアマネ')
        assert.equal(updated?.is_active, false)
    } finally {
        initialized.db.close()
        fs.rmSync(tmpDir, { recursive: true, force: true })
    }
})

test('rejects invalid patient rows before writing to SQLite', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'report-patient-db-'))
    const initialized = await initializeLocalDatabase({ dbPath: path.join(tmpDir, 'patients.sqlite') })

    try {
        assert.throws(() => createPatient(initialized.db, {
            name: '',
            dob: '1945-02-03',
            gender: 'female'
        }), /患者氏名/)
        assert.equal(listPatients(initialized.db).length, 0)
    } finally {
        initialized.db.close()
        fs.rmSync(tmpDir, { recursive: true, force: true })
    }
})

test('logically deletes and restores patients in SQLite', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'report-patient-db-delete-'))
    const initialized = await initializeLocalDatabase({ dbPath: path.join(tmpDir, 'patients.sqlite') })

    try {
        const saved = createPatient(initialized.db, {
            name: '削除 復元',
            dob: '1945-02-03',
            gender: 'female',
            is_active: true
        })

        const deleted = deletePatient(initialized.db, saved.id)
        assert.equal(deleted.deleted, true)
        assert.equal(getPatientById(initialized.db, saved.id), null)
        assert.deepEqual(listPatients(initialized.db), [])

        const deletedPatients = listDeletedPatients(initialized.db)
        assert.equal(deletedPatients.length, 1)
        assert.equal(deletedPatients[0].id, saved.id)
        assert.equal(typeof deletedPatients[0].deleted_at, 'string')

        const restored = restorePatient(initialized.db, saved.id)
        assert.equal(restored?.id, saved.id)
        assert.equal(restored?.deleted_at, undefined)
        assert.equal(listPatients(initialized.db).length, 1)
        assert.deepEqual(listDeletedPatients(initialized.db), [])
    } finally {
        initialized.db.close()
        fs.rmSync(tmpDir, { recursive: true, force: true })
    }
})
