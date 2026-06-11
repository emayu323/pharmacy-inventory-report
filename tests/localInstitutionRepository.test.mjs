import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { initializeLocalDatabase } from '../electron/localDatabase.mjs'
import {
    deleteInstitution,
    findInstitutionByName,
    getInstitutionById,
    listInstitutions,
    saveInstitution
} from '../electron/localInstitutionRepository.mjs'

test('creates, updates, finds, lists, and logically deletes institutions in SQLite', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'report-institution-db-'))
    const initialized = await initializeLocalDatabase({ dbPath: path.join(tmpDir, 'institutions.sqlite') })

    try {
        const saved = saveInstitution(initialized.db, undefined, {
            type: 'hospital',
            name: '検証医院',
            tel: '03-0000-0000',
            fax: '03-0000-0001',
            doctor_name: '検証医師'
        })

        assert.match(saved.id, /^local-institution-/)
        assert.equal(saved.name, '検証医院')

        const updated = saveInstitution(initialized.db, saved.id, {
            type: 'hospital',
            name: '検証医院',
            tel: '03-0000-0002',
            fax: '03-0000-0001',
            doctor_name: '検証医師'
        })
        assert.equal(updated.id, saved.id)
        assert.equal(updated.tel, '03-0000-0002')
        assert.equal(updated.created_at, saved.created_at)

        const fetched = getInstitutionById(initialized.db, saved.id)
        assert.equal(fetched?.doctor_name, '検証医師')

        const found = findInstitutionByName(initialized.db, '検証医院', 'hospital')
        assert.equal(found?.id, saved.id)

        assert.equal(listInstitutions(initialized.db).length, 1)
        deleteInstitution(initialized.db, saved.id)
        assert.equal(listInstitutions(initialized.db).length, 0)
        assert.equal(getInstitutionById(initialized.db, saved.id), null)

        const deletedRow = initialized.db.prepare('SELECT deleted_at FROM institutions WHERE id = ?').get(saved.id)
        assert.equal(typeof deletedRow.deleted_at, 'string')
    } finally {
        initialized.db.close()
        fs.rmSync(tmpDir, { recursive: true, force: true })
    }
})

test('rejects invalid institutions before writing to SQLite', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'report-institution-db-'))
    const initialized = await initializeLocalDatabase({ dbPath: path.join(tmpDir, 'institutions.sqlite') })

    try {
        assert.throws(() => saveInstitution(initialized.db, undefined, {
            type: 'unknown',
            name: '検証'
        }), /種別/)
        assert.equal(listInstitutions(initialized.db).length, 0)
    } finally {
        initialized.db.close()
        fs.rmSync(tmpDir, { recursive: true, force: true })
    }
})
