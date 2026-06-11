import { randomUUID } from 'node:crypto'

const INSTITUTION_TYPES = new Set(['hospital', 'pharmacy', 'care_office', 'nursing_station'])

export function listInstitutions(db) {
    return db.prepare(`
        SELECT *
        FROM institutions
        WHERE deleted_at IS NULL
        ORDER BY name ASC
    `).all().map(rowToInstitution)
}

export function getInstitutionById(db, institutionId) {
    const row = db.prepare(`
        SELECT *
        FROM institutions
        WHERE id = ?
          AND deleted_at IS NULL
    `).get(institutionId)

    return row ? rowToInstitution(row) : null
}

export function findInstitutionByName(db, name, type) {
    if (!name) return null

    const row = type
        ? db.prepare(`
            SELECT *
            FROM institutions
            WHERE name = ?
              AND type = ?
              AND deleted_at IS NULL
            LIMIT 1
        `).get(name, type)
        : db.prepare(`
            SELECT *
            FROM institutions
            WHERE name = ?
              AND deleted_at IS NULL
            LIMIT 1
        `).get(name)

    return row ? rowToInstitution(row) : null
}

export function saveInstitution(db, institutionId, input) {
    validateInstitutionInput(input)

    const existing = institutionId ? getInstitutionById(db, institutionId) : null
    if (institutionId && !existing) {
        throw new Error('関係機関が見つかりません')
    }

    const now = new Date().toISOString()
    const institution = {
        ...normalizeInstitutionInput(input),
        id: institutionId || createLocalInstitutionId(),
        created_at: existing?.created_at || now
    }

    if (existing) {
        updateInstitutionRow(db, institution, now)
    } else {
        insertInstitutionRow(db, institution, now)
    }

    return getInstitutionById(db, institution.id) ?? institution
}

export function deleteInstitution(db, institutionId) {
    db.prepare(`
        UPDATE institutions
        SET deleted_at = ?,
            updated_at = ?
        WHERE id = ?
          AND deleted_at IS NULL
    `).run(new Date().toISOString(), new Date().toISOString(), institutionId)
}

function insertInstitutionRow(db, institution, now) {
    db.prepare(`
        INSERT INTO institutions (
            id,
            created_at,
            updated_at,
            type,
            name,
            address,
            tel,
            fax,
            doctor_name,
            payload_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        institution.id,
        institution.created_at,
        now,
        institution.type,
        institution.name,
        institution.address ?? null,
        institution.tel ?? null,
        institution.fax ?? null,
        institution.doctor_name ?? null,
        JSON.stringify(institution)
    )
}

function updateInstitutionRow(db, institution, now) {
    db.prepare(`
        UPDATE institutions
        SET
            updated_at = ?,
            type = ?,
            name = ?,
            address = ?,
            tel = ?,
            fax = ?,
            doctor_name = ?,
            payload_json = ?
        WHERE id = ?
          AND deleted_at IS NULL
    `).run(
        now,
        institution.type,
        institution.name,
        institution.address ?? null,
        institution.tel ?? null,
        institution.fax ?? null,
        institution.doctor_name ?? null,
        JSON.stringify(institution),
        institution.id
    )
}

function rowToInstitution(row) {
    const payload = parsePayload(row.payload_json)
    return {
        ...payload,
        id: row.id,
        created_at: row.created_at,
        type: row.type,
        name: row.name,
        address: row.address ?? undefined,
        tel: row.tel ?? undefined,
        fax: row.fax ?? undefined,
        doctor_name: row.doctor_name ?? undefined
    }
}

function normalizeInstitutionInput(input) {
    return {
        type: input.type,
        name: input.name.trim(),
        address: normalizeOptionalString(input.address),
        tel: normalizeOptionalString(input.tel),
        fax: normalizeOptionalString(input.fax),
        doctor_name: normalizeOptionalString(input.doctor_name)
    }
}

function validateInstitutionInput(input) {
    if (!input || typeof input !== 'object') throw new Error('関係機関情報が不正です')
    if (!INSTITUTION_TYPES.has(input.type)) throw new Error('関係機関種別が不正です')
    if (!input.name || typeof input.name !== 'string' || !input.name.trim()) throw new Error('関係機関名は必須です')
}

function normalizeOptionalString(value) {
    if (typeof value !== 'string') return undefined
    const trimmed = value.trim()
    return trimmed || undefined
}

function parsePayload(raw) {
    if (!raw) return {}
    try {
        const parsed = JSON.parse(raw)
        return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
        return {}
    }
}

function createLocalInstitutionId() {
    return `local-institution-${randomUUID()}`
}
