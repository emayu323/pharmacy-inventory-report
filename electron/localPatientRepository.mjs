export function listPatients(db) {
    return db.prepare(`
        SELECT *
        FROM patients
        WHERE deleted_at IS NULL
        ORDER BY name ASC
    `).all().map(rowToPatient)
}

export function listDeletedPatients(db) {
    return db.prepare(`
        SELECT *
        FROM patients
        WHERE deleted_at IS NOT NULL
        ORDER BY deleted_at DESC, name ASC
    `).all().map(rowToPatient)
}

export function getPatientById(db, patientId) {
    const row = db.prepare(`
        SELECT *
        FROM patients
        WHERE id = ?
          AND deleted_at IS NULL
    `).get(patientId)

    return row ? rowToPatient(row) : null
}

export function createPatient(db, input) {
    validatePatientInput(input)

    const now = new Date().toISOString()
    const patient = {
        ...input,
        id: createLocalPatientId(),
        created_at: now,
        is_active: input.is_active ?? true
    }

    db.prepare(`
        INSERT INTO patients (
            id,
            created_at,
            updated_at,
            name,
            kana,
            dob,
            gender,
            address,
            contact1,
            contact2,
            contact2_memo,
            memo,
            medical_institution_name,
            primary_doctor,
            home_care_office,
            care_manager,
            visiting_nursing_station_name,
            pharmacy_name,
            is_active,
            payload_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        patient.id,
        patient.created_at,
        now,
        patient.name,
        patient.kana ?? null,
        patient.dob,
        patient.gender,
        patient.address ?? null,
        patient.contact1 ?? null,
        patient.contact2 ?? null,
        patient.contact2_memo ?? null,
        patient.memo ?? null,
        patient.medical_institution_name ?? null,
        patient.primary_doctor ?? null,
        patient.home_care_office ?? null,
        patient.care_manager ?? null,
        patient.visiting_nursing_station_name ?? null,
        patient.pharmacy_name ?? null,
        patient.is_active ? 1 : 0,
        JSON.stringify(patient)
    )

    return patient
}

export function updatePatient(db, patientId, update) {
    const existing = getPatientById(db, patientId)
    if (!existing) {
        throw new Error('患者が見つかりません')
    }

    const next = {
        ...existing,
        ...update,
        id: existing.id,
        created_at: existing.created_at
    }
    validatePatientInput(next)

    db.prepare(`
        UPDATE patients
        SET
            updated_at = ?,
            name = ?,
            kana = ?,
            dob = ?,
            gender = ?,
            address = ?,
            contact1 = ?,
            contact2 = ?,
            contact2_memo = ?,
            memo = ?,
            medical_institution_name = ?,
            primary_doctor = ?,
            home_care_office = ?,
            care_manager = ?,
            visiting_nursing_station_name = ?,
            pharmacy_name = ?,
            is_active = ?,
            payload_json = ?
        WHERE id = ?
          AND deleted_at IS NULL
    `).run(
        new Date().toISOString(),
        next.name,
        next.kana ?? null,
        next.dob,
        next.gender,
        next.address ?? null,
        next.contact1 ?? null,
        next.contact2 ?? null,
        next.contact2_memo ?? null,
        next.memo ?? null,
        next.medical_institution_name ?? null,
        next.primary_doctor ?? null,
        next.home_care_office ?? null,
        next.care_manager ?? null,
        next.visiting_nursing_station_name ?? null,
        next.pharmacy_name ?? null,
        next.is_active === false ? 0 : 1,
        JSON.stringify(next),
        patientId
    )

    return getPatientById(db, patientId)
}

export function deletePatient(db, patientId) {
    const now = new Date().toISOString()
    const result = db.prepare(`
        UPDATE patients
        SET deleted_at = ?,
            updated_at = ?
        WHERE id = ?
          AND deleted_at IS NULL
    `).run(now, now, patientId)

    return {
        deleted: result.changes > 0,
        deleted_at: result.changes > 0 ? now : undefined
    }
}

export function restorePatient(db, patientId) {
    const now = new Date().toISOString()
    db.prepare(`
        UPDATE patients
        SET deleted_at = NULL,
            updated_at = ?
        WHERE id = ?
          AND deleted_at IS NOT NULL
    `).run(now, patientId)

    return getPatientById(db, patientId)
}

function rowToPatient(row) {
    const payload = parsePayload(row.payload_json)
    return {
        ...payload,
        id: row.id,
        created_at: row.created_at,
        name: row.name,
        kana: row.kana ?? undefined,
        dob: row.dob,
        gender: row.gender,
        address: row.address ?? undefined,
        contact1: row.contact1 ?? undefined,
        contact2: row.contact2 ?? undefined,
        contact2_memo: row.contact2_memo ?? undefined,
        memo: row.memo ?? undefined,
        medical_institution_name: row.medical_institution_name ?? undefined,
        primary_doctor: row.primary_doctor ?? undefined,
        home_care_office: row.home_care_office ?? undefined,
        care_manager: row.care_manager ?? undefined,
        visiting_nursing_station_name: row.visiting_nursing_station_name ?? undefined,
        pharmacy_name: row.pharmacy_name ?? undefined,
        is_active: Boolean(row.is_active),
        deleted_at: row.deleted_at ?? undefined
    }
}

function validatePatientInput(patient) {
    if (!patient || typeof patient !== 'object') throw new Error('患者情報が不正です')
    if (!patient.name || typeof patient.name !== 'string') throw new Error('患者氏名は必須です')
    if (!patient.dob || typeof patient.dob !== 'string') throw new Error('生年月日は必須です')
    if (!['male', 'female', 'other'].includes(patient.gender)) throw new Error('性別が不正です')
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

function createLocalPatientId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return `local-patient-${crypto.randomUUID()}`
    }
    return `local-patient-${Date.now()}-${Math.random().toString(36).slice(2)}`
}
