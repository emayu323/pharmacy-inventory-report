import { randomUUID } from 'node:crypto'

export function getReportById(db, reportId) {
    const row = db.prepare(`
        SELECT *
        FROM reports
        WHERE id = ?
          AND deleted_at IS NULL
    `).get(reportId)

    return row ? rowToReport(row) : null
}

export function listDeletedReports(db) {
    return db.prepare(`
        SELECT *
        FROM reports
        WHERE deleted_at IS NOT NULL
        ORDER BY deleted_at DESC, visit_date DESC, created_at DESC
    `).all().map(rowToReport)
}

export function saveReport(db, reportId, input) {
    validateReportInput(input)

    const existing = reportId ? getReportById(db, reportId) : null
    if (reportId && !existing) {
        throw new Error('報告書が見つかりません')
    }

    const now = new Date().toISOString()
    const report = {
        ...input,
        id: reportId || createLocalReportId(),
        created_at: existing?.created_at || now,
        updated_at: now
    }

    db.exec('BEGIN IMMEDIATE')
    try {
        if (existing) {
            updateReportRow(db, report)
        } else {
            insertReportRow(db, report)
        }

        replaceReportMedications(db, report)
        db.exec('COMMIT')
    } catch (error) {
        db.exec('ROLLBACK')
        throw error
    }

    return getReportById(db, report.id) ?? report
}

export function getLatestReportByPatientId(db, patientId) {
    const row = db.prepare(`
        SELECT *
        FROM reports
        WHERE patient_id = ?
          AND deleted_at IS NULL
        ORDER BY visit_date DESC, created_at DESC
        LIMIT 1
    `).get(patientId)

    return row ? rowToReport(row) : null
}

export function listReportsByPatientId(db, patientId) {
    return db.prepare(`
        SELECT *
        FROM reports
        WHERE patient_id = ?
          AND deleted_at IS NULL
        ORDER BY visit_date DESC, created_at DESC
    `).all(patientId).map(rowToReport)
}

export function listReportsByNextVisitDateRange(db, startDate, endDate) {
    return db.prepare(`
        SELECT *
        FROM reports
        WHERE next_visit_date IS NOT NULL
          AND next_visit_date >= ?
          AND next_visit_date <= ?
          AND deleted_at IS NULL
        ORDER BY visit_date DESC, created_at DESC
    `).all(startDate, endDate).map(rowToReport)
}

export function deleteReport(db, reportId) {
    const now = new Date().toISOString()
    const result = db.prepare(`
        UPDATE reports
        SET deleted_at = ?,
            updated_at = ?
        WHERE id = ?
          AND deleted_at IS NULL
    `).run(now, now, reportId)

    return {
        deleted: result.changes > 0,
        deleted_at: result.changes > 0 ? now : undefined
    }
}

export function restoreReport(db, reportId) {
    const now = new Date().toISOString()
    db.prepare(`
        UPDATE reports
        SET deleted_at = NULL,
            updated_at = ?
        WHERE id = ?
          AND deleted_at IS NOT NULL
    `).run(now, reportId)

    return getReportById(db, reportId)
}

function insertReportRow(db, report) {
    db.prepare(`
        INSERT INTO reports (
            id,
            patient_id,
            created_at,
            updated_at,
            visit_date,
            patient_name,
            patient_dob,
            patient_gender,
            pharmacy_name,
            regular_medication_supply_until,
            next_visit_date,
            payload_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        report.id,
        report.patient_id ?? null,
        report.created_at,
        report.updated_at,
        report.visit_date,
        report.patient_name,
        report.patient_dob,
        report.patient_gender,
        report.pharmacy_name ?? null,
        report.regular_medication_supply_until ?? null,
        report.next_visit_date || null,
        JSON.stringify(report)
    )
}

function updateReportRow(db, report) {
    db.prepare(`
        UPDATE reports
        SET
            patient_id = ?,
            updated_at = ?,
            visit_date = ?,
            patient_name = ?,
            patient_dob = ?,
            patient_gender = ?,
            pharmacy_name = ?,
            regular_medication_supply_until = ?,
            next_visit_date = ?,
            payload_json = ?
        WHERE id = ?
          AND deleted_at IS NULL
    `).run(
        report.patient_id ?? null,
        report.updated_at,
        report.visit_date,
        report.patient_name,
        report.patient_dob,
        report.patient_gender,
        report.pharmacy_name ?? null,
        report.regular_medication_supply_until ?? null,
        report.next_visit_date || null,
        JSON.stringify(report),
        report.id
    )
}

function replaceReportMedications(db, report) {
    db.prepare('DELETE FROM report_medications WHERE report_id = ?').run(report.id)

    const regularItems = Array.isArray(report.medications_check_list)
        ? report.medications_check_list
        : []
    const otherItems = Array.isArray(report.medications_check_list_prn)
        ? report.medications_check_list_prn
        : []

    regularItems.forEach((item, index) => {
        insertMedicationRow(db, report.id, 'regular', item, index)
    })
    otherItems.forEach((item, index) => {
        insertMedicationRow(db, report.id, 'other', item, index)
    })
}

function insertMedicationRow(db, reportId, category, item, position) {
    const name = typeof item?.name === 'string' ? item.name.trim() : ''
    if (!name) return

    db.prepare(`
        INSERT INTO report_medications (
            id,
            report_id,
            category,
            position,
            name,
            unit,
            quantity,
            previous_supply_until,
            prescription_days,
            actual_remaining_days,
            calculated_total_days,
            calculated_supply_until,
            notes,
            payload_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        createMedicationRowId(reportId, category, position),
        reportId,
        category,
        position,
        name,
        item.unit ?? null,
        item.current_amount || item.leftover_amount || null,
        item.previous_supply_until || null,
        item.prescription_days || null,
        item.actual_remaining_days || null,
        item.calculated_total_days || null,
        item.calculated_supply_until || null,
        item.notes || null,
        JSON.stringify(item)
    )
}

function rowToReport(row) {
    const payload = parsePayload(row.payload_json)
    return {
        ...payload,
        id: row.id,
        patient_id: row.patient_id ?? undefined,
        created_at: row.created_at,
        updated_at: row.updated_at,
        visit_date: row.visit_date,
        patient_name: row.patient_name,
        patient_dob: row.patient_dob,
        patient_gender: row.patient_gender,
        pharmacy_name: row.pharmacy_name ?? undefined,
        regular_medication_supply_until: row.regular_medication_supply_until ?? undefined,
        next_visit_date: row.next_visit_date ?? undefined,
        deleted_at: row.deleted_at ?? undefined
    }
}

function validateReportInput(report) {
    if (!report || typeof report !== 'object') throw new Error('報告書情報が不正です')
    if (typeof report.patient_name !== 'string') throw new Error('患者氏名は必須です')
    if (typeof report.patient_dob !== 'string') throw new Error('患者生年月日は必須です')
    if (!['male', 'female', 'other'].includes(report.patient_gender)) throw new Error('性別が不正です')
    if (typeof report.visit_date !== 'string' || !report.visit_date) throw new Error('訪問日は必須です')
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

function createLocalReportId() {
    return `local-report-${randomUUID()}`
}

function createMedicationRowId(reportId, category, position) {
    return `${reportId}-${category}-${position}-${randomUUID()}`
}
