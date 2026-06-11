import assert from 'node:assert/strict'
import test from 'node:test'
import type { Report } from '../src/types.ts'
import { selectLatestReportByVisitDate } from '../src/reportSelection.ts'

test('selects latest report by visit date before creation date', () => {
    const latestVisit = createReport({
        id: 'newer-visit',
        visit_date: '2026-06-10',
        created_at: '2026-06-10T09:00:00.000Z'
    })
    const olderVisitCreatedLater = createReport({
        id: 'older-visit-created-later',
        visit_date: '2026-05-01',
        created_at: '2026-06-11T09:00:00.000Z'
    })

    const selected = selectLatestReportByVisitDate([
        olderVisitCreatedLater,
        latestVisit
    ])

    assert.equal(selected?.id, latestVisit.id)
})

test('uses creation date as tie breaker for the same visit date', () => {
    const olderCreated = createReport({
        id: 'older-created',
        visit_date: '2026-06-10',
        created_at: '2026-06-10T09:00:00.000Z'
    })
    const newerCreated = createReport({
        id: 'newer-created',
        visit_date: '2026-06-10',
        created_at: '2026-06-10T10:00:00.000Z'
    })

    const selected = selectLatestReportByVisitDate([
        olderCreated,
        newerCreated
    ])

    assert.equal(selected?.id, newerCreated.id)
})

test('ignores logically deleted reports when selecting latest', () => {
    const deletedLatest = createReport({
        id: 'deleted-latest',
        visit_date: '2026-06-20',
        created_at: '2026-06-20T09:00:00.000Z',
        deleted_at: '2026-06-21T00:00:00.000Z'
    })
    const activeOlder = createReport({
        id: 'active-older',
        visit_date: '2026-06-10',
        created_at: '2026-06-10T09:00:00.000Z'
    })

    const selected = selectLatestReportByVisitDate([
        deletedLatest,
        activeOlder
    ])

    assert.equal(selected?.id, activeOlder.id)
})

function createReport(overrides: Partial<Report>): Report {
    return {
        id: 'report-id',
        created_at: '2026-06-10T09:00:00.000Z',
        updated_at: '2026-06-10T09:00:00.000Z',
        patient_id: 'patient-1',
        patient_name: '検証 患者',
        patient_dob: '1940-01-01',
        patient_gender: 'female',
        doctor_name: '検証医師',
        pharmacist_name: '検証薬剤師',
        prescription_date: '2026-06-10',
        dispensing_date: '2026-06-10',
        visit_date: '2026-06-10',
        medication_instruction: '',
        side_effects: '',
        next_visit_date: '',
        ...overrides
    } as Report
}
