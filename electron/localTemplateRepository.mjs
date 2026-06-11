import { randomUUID } from 'node:crypto'

const TEMPLATE_TARGETS = new Set([
    'medication_status',
    'storage_status',
    'chief_complaint',
    'medication_instruction',
    'side_effects'
])

export function listTextTemplates(db) {
    return db.prepare(`
        SELECT *
        FROM templates
        WHERE deleted_at IS NULL
        ORDER BY target ASC, title ASC
    `).all().map(rowToTextTemplate)
}

export function saveTextTemplate(db, input) {
    validateTextTemplateInput(input)

    const existing = input.id ? getTextTemplateById(db, input.id) : null
    if (input.id && !existing) {
        throw new Error('定型文が見つかりません')
    }

    const now = new Date().toISOString()
    const template = {
        id: input.id || createLocalTemplateId(),
        created_at: existing?.created_at || now,
        updated_at: now,
        target: input.target,
        title: input.title.trim(),
        body: input.body.trim()
    }

    if (existing) {
        updateTextTemplateRow(db, template)
    } else {
        insertTextTemplateRow(db, template)
    }

    return getTextTemplateById(db, template.id) ?? template
}

export function deleteTextTemplate(db, templateId) {
    db.prepare(`
        UPDATE templates
        SET deleted_at = ?,
            updated_at = ?
        WHERE id = ?
          AND deleted_at IS NULL
    `).run(new Date().toISOString(), new Date().toISOString(), templateId)
}

function getTextTemplateById(db, templateId) {
    const row = db.prepare(`
        SELECT *
        FROM templates
        WHERE id = ?
          AND deleted_at IS NULL
    `).get(templateId)

    return row ? rowToTextTemplate(row) : null
}

function insertTextTemplateRow(db, template) {
    db.prepare(`
        INSERT INTO templates (
            id,
            created_at,
            updated_at,
            target,
            title,
            body
        ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
        template.id,
        template.created_at,
        template.updated_at,
        template.target,
        template.title,
        template.body
    )
}

function updateTextTemplateRow(db, template) {
    db.prepare(`
        UPDATE templates
        SET
            updated_at = ?,
            target = ?,
            title = ?,
            body = ?
        WHERE id = ?
          AND deleted_at IS NULL
    `).run(
        template.updated_at,
        template.target,
        template.title,
        template.body,
        template.id
    )
}

function rowToTextTemplate(row) {
    return {
        id: row.id,
        created_at: row.created_at,
        updated_at: row.updated_at,
        target: row.target,
        title: row.title,
        body: row.body
    }
}

function validateTextTemplateInput(input) {
    if (!input || typeof input !== 'object') throw new Error('定型文が不正です')
    if (!TEMPLATE_TARGETS.has(input.target)) throw new Error('定型文の対象項目が不正です')
    if (!input.title || typeof input.title !== 'string' || !input.title.trim()) throw new Error('定型文タイトルは必須です')
    if (!input.body || typeof input.body !== 'string' || !input.body.trim()) throw new Error('定型文本文は必須です')
}

function createLocalTemplateId() {
    return `local-template-${randomUUID()}`
}
