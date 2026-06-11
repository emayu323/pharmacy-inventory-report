import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { initializeLocalDatabase } from '../electron/localDatabase.mjs'
import { createPatient } from '../electron/localPatientRepository.mjs'
import {
    deleteReport,
    getLatestReportByPatientId,
    getReportById,
    listDeletedReports,
    listReportsByNextVisitDateRange,
    listReportsByPatientId,
    restoreReport,
    saveReport
} from '../electron/localReportRepository.mjs'

test('saves, reads, updates, and indexes report snapshots in SQLite', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'report-report-db-'))
    const initialized = await initializeLocalDatabase({ dbPath: path.join(tmpDir, 'reports.sqlite') })

    try {
        const patient = createPatient(initialized.db, {
            name: '鈴木 一郎',
            kana: 'スズキ イチロウ',
            dob: '1938-04-05',
            gender: 'male',
            medical_institution_name: '検証医院',
            primary_doctor: '検証医師',
            is_active: true
        })

        const saved = saveReport(initialized.db, undefined, createReportInput({
            patient_id: patient.id,
            patient_name: patient.name,
            patient_dob: patient.dob,
            patient_gender: patient.gender,
            visit_date: '2026-06-10',
            next_visit_date: '2026-06-24',
            medication_instruction: '朝薬服用後の眠気について主治医へ共有。',
            regular_medication_supply_until: '2026-07-07',
            ai_transcript: '主訴等: 眠気の訴えあり。',
            ai_transcript_saved_at: '2026-06-10T12:00:00.000Z',
            ai_audio_file_path: '/tmp/audio/local-report.webm',
            ai_audio_file_name: 'local-report.webm',
            ai_audio_mime_type: 'audio/webm',
            ai_audio_saved_at: '2026-06-10T12:01:00.000Z'
        }))

        assert.match(saved.id, /^local-report-/)
        assert.equal(saved.patient_id, patient.id)
        assert.equal(saved.medications_check_list?.length, 1)
        assert.equal(saved.medications_check_list_prn?.length, 1)

        const fetched = getReportById(initialized.db, saved.id)
        assert.equal(fetched?.patient_name, '鈴木 一郎')
        assert.equal(fetched?.medication_instruction, '朝薬服用後の眠気について主治医へ共有。')
        assert.equal(fetched?.ai_transcript, '主訴等: 眠気の訴えあり。')
        assert.equal(fetched?.ai_audio_file_path, '/tmp/audio/local-report.webm')

        const medicationRows = initialized.db.prepare(`
            SELECT category, name
            FROM report_medications
            WHERE report_id = ?
            ORDER BY category, position
        `).all(saved.id).map(row => ({ ...row }))
        assert.deepEqual(medicationRows, [
            { category: 'other', name: '保管薬B' },
            { category: 'regular', name: '定期薬A' }
        ])

        const latest = getLatestReportByPatientId(initialized.db, patient.id)
        assert.equal(latest?.id, saved.id)

        const patientReports = listReportsByPatientId(initialized.db, patient.id)
        assert.equal(patientReports.length, 1)

        const scheduled = listReportsByNextVisitDateRange(initialized.db, '2026-06-01', '2026-06-30')
        assert.equal(scheduled.length, 1)
        assert.equal(scheduled[0].id, saved.id)

        const updated = saveReport(initialized.db, saved.id, createReportInput({
            patient_id: patient.id,
            patient_name: patient.name,
            patient_dob: patient.dob,
            patient_gender: patient.gender,
            visit_date: '2026-06-11',
            next_visit_date: '2026-07-01',
            medication_instruction: '眠気の程度を継続確認。',
            medications_check_list_prn: []
        }))

        assert.equal(updated.id, saved.id)
        assert.equal(updated.created_at, saved.created_at)
        assert.equal(updated.visit_date, '2026-06-11')
        assert.equal(updated.medication_instruction, '眠気の程度を継続確認。')

        const replacedMedicationCount = initialized.db.prepare(`
            SELECT COUNT(*) AS count
            FROM report_medications
            WHERE report_id = ?
        `).get(saved.id)
        assert.equal(replacedMedicationCount.count, 1)

        const oldSchedule = listReportsByNextVisitDateRange(initialized.db, '2026-06-01', '2026-06-30')
        assert.equal(oldSchedule.length, 0)
        const newSchedule = listReportsByNextVisitDateRange(initialized.db, '2026-07-01', '2026-07-31')
        assert.equal(newSchedule.length, 1)
    } finally {
        initialized.db.close()
        fs.rmSync(tmpDir, { recursive: true, force: true })
    }
})

test('rejects invalid report rows before writing to SQLite', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'report-report-db-'))
    const initialized = await initializeLocalDatabase({ dbPath: path.join(tmpDir, 'reports.sqlite') })

    try {
        assert.throws(() => saveReport(initialized.db, undefined, createReportInput({
            patient_gender: 'unknown'
        })), /性別/)
        const row = initialized.db.prepare('SELECT COUNT(*) AS count FROM reports').get()
        assert.equal(row.count, 0)
    } finally {
        initialized.db.close()
        fs.rmSync(tmpDir, { recursive: true, force: true })
    }
})

test('selects the latest patient report by visit date instead of creation date', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'report-report-db-latest-'))
    const initialized = await initializeLocalDatabase({ dbPath: path.join(tmpDir, 'reports.sqlite') })

    try {
        const patient = createPatient(initialized.db, {
            name: '前回 判定',
            dob: '1942-03-01',
            gender: 'male',
            is_active: true
        })
        const newerVisit = saveReport(initialized.db, undefined, createReportInput({
            patient_id: patient.id,
            patient_name: patient.name,
            patient_dob: patient.dob,
            patient_gender: patient.gender,
            visit_date: '2026-06-10',
            medication_instruction: '新しい訪問日の報告書'
        }))
        const olderVisitCreatedLater = saveReport(initialized.db, undefined, createReportInput({
            patient_id: patient.id,
            patient_name: patient.name,
            patient_dob: patient.dob,
            patient_gender: patient.gender,
            visit_date: '2026-05-01',
            medication_instruction: '後から作成した古い訪問日の報告書'
        }))

        initialized.db.prepare('UPDATE reports SET created_at = ? WHERE id = ?')
            .run('2026-06-10T00:00:00.000Z', newerVisit.id)
        initialized.db.prepare('UPDATE reports SET created_at = ? WHERE id = ?')
            .run('2026-06-11T00:00:00.000Z', olderVisitCreatedLater.id)

        const latest = getLatestReportByPatientId(initialized.db, patient.id)
        assert.equal(latest?.id, newerVisit.id)
        assert.equal(latest?.visit_date, '2026-06-10')
    } finally {
        initialized.db.close()
        fs.rmSync(tmpDir, { recursive: true, force: true })
    }
})

test('logically deletes and restores reports in SQLite', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'report-report-db-delete-'))
    const initialized = await initializeLocalDatabase({ dbPath: path.join(tmpDir, 'reports.sqlite') })

    try {
        const patient = createPatient(initialized.db, {
            name: '削除 復元',
            dob: '1940-06-11',
            gender: 'female',
            is_active: true
        })
        const saved = saveReport(initialized.db, undefined, createReportInput({
            patient_id: patient.id,
            patient_name: patient.name,
            patient_dob: patient.dob,
            patient_gender: patient.gender
        }))

        const deleted = deleteReport(initialized.db, saved.id)
        assert.equal(deleted.deleted, true)
        assert.equal(getReportById(initialized.db, saved.id), null)
        assert.equal(listReportsByPatientId(initialized.db, patient.id).length, 0)
        assert.equal(getLatestReportByPatientId(initialized.db, patient.id), null)

        const deletedReports = listDeletedReports(initialized.db)
        assert.equal(deletedReports.length, 1)
        assert.equal(deletedReports[0].id, saved.id)
        assert.equal(typeof deletedReports[0].deleted_at, 'string')

        const restored = restoreReport(initialized.db, saved.id)
        assert.equal(restored?.id, saved.id)
        assert.equal(restored?.deleted_at, undefined)
        assert.equal(getReportById(initialized.db, saved.id)?.id, saved.id)
        assert.equal(listDeletedReports(initialized.db).length, 0)
    } finally {
        initialized.db.close()
        fs.rmSync(tmpDir, { recursive: true, force: true })
    }
})

function createReportInput(overrides = {}) {
    return {
        patient_name: '鈴木 一郎',
        patient_dob: '1938-04-05',
        patient_gender: 'male',
        doctor_name: '検証医師',
        medical_institution_name: '検証医院',
        pharmacist_name: '検証薬剤師',
        pharmacy_name: '検証薬局',
        prescription_date: '2026-06-10',
        dispensing_date: '2026-06-10',
        visit_date: '2026-06-10',
        default_prescription_days: '28',
        regular_medication_supply_until: '2026-07-07',
        medications_check_list: [{
            id: 'regular-1',
            name: '定期薬A',
            current_amount: '',
            next_required_amount: '',
            unit: '日',
            notes: '',
            checked: true,
            calculated_total_days: '28',
            calculated_supply_until: '2026-07-07'
        }],
        medications_check_list_prn: [{
            id: 'other-1',
            name: '保管薬B',
            current_amount: '5',
            next_required_amount: '',
            unit: '錠',
            notes: '期限確認',
            checked: true
        }],
        chief_complaint: '朝薬服用後の眠気あり。',
        medication_instruction: '服薬状況を確認。',
        side_effects: '',
        next_visit_date: '2026-06-24',
        ...overrides
    }
}
