import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { initializeLocalDatabase } from '../electron/localDatabase.mjs'
import {
    deleteTextTemplate,
    listTextTemplates,
    saveTextTemplate
} from '../electron/localTemplateRepository.mjs'

test('creates, updates, lists, and logically deletes text templates in SQLite', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'report-template-db-'))
    const initialized = await initializeLocalDatabase({ dbPath: path.join(tmpDir, 'templates.sqlite') })

    try {
        const saved = saveTextTemplate(initialized.db, {
            target: 'chief_complaint',
            title: '眠気',
            body: '朝薬服用後の眠気の訴えあり。'
        })

        assert.match(saved.id, /^local-template-/)
        assert.equal(saved.title, '眠気')

        const updated = saveTextTemplate(initialized.db, {
            id: saved.id,
            target: 'chief_complaint',
            title: '眠気あり',
            body: '朝薬服用後の眠気あり。'
        })
        assert.equal(updated.id, saved.id)
        assert.equal(updated.created_at, saved.created_at)
        assert.equal(updated.title, '眠気あり')

        const templates = listTextTemplates(initialized.db)
        assert.equal(templates.length, 1)
        assert.equal(templates[0].body, '朝薬服用後の眠気あり。')

        deleteTextTemplate(initialized.db, saved.id)
        assert.equal(listTextTemplates(initialized.db).length, 0)

        const deletedRow = initialized.db.prepare('SELECT deleted_at FROM templates WHERE id = ?').get(saved.id)
        assert.equal(typeof deletedRow.deleted_at, 'string')
    } finally {
        initialized.db.close()
        fs.rmSync(tmpDir, { recursive: true, force: true })
    }
})

test('rejects invalid templates before writing to SQLite', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'report-template-db-'))
    const initialized = await initializeLocalDatabase({ dbPath: path.join(tmpDir, 'templates.sqlite') })

    try {
        assert.throws(() => saveTextTemplate(initialized.db, {
            target: 'unknown',
            title: '不正',
            body: '本文'
        }), /対象項目/)
        assert.equal(listTextTemplates(initialized.db).length, 0)
    } finally {
        initialized.db.close()
        fs.rmSync(tmpDir, { recursive: true, force: true })
    }
})
