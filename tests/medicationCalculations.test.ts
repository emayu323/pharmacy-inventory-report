import test from 'node:test'
import assert from 'node:assert/strict'
import {
    calculatePreviousRemainingDays,
    calculateRegularMedicationItem,
    calculateRegularMedications,
    calculateSupplyUntil
} from '../src/medicationCalculations.ts'

test('visit date is counted as day one when calculating supply until', () => {
    assert.equal(calculateSupplyUntil('2026-06-10', 28), '2026-07-07')
})

test('previous remaining days are calculated inclusively from visit date', () => {
    assert.equal(calculatePreviousRemainingDays('2026-06-10', '2026-06-14'), 5)
})

test('previous dates before visit date are treated as zero remaining days', () => {
    assert.equal(calculatePreviousRemainingDays('2026-06-10', '2026-06-05'), 0)
})

test('regular medication calculation uses each medication previous supply date', () => {
    const result = calculateRegularMedications([
        { id: 'a', name: '薬剤A', current_amount: '', next_required_amount: '', previous_supply_until: '2026-06-14', prescription_days: '28', unit: '日分', notes: '', checked: false },
        { id: 'b', name: '薬剤B', current_amount: '', next_required_amount: '', previous_supply_until: '2026-06-20', prescription_days: '28', unit: '日分', notes: '', checked: false }
    ], '2026-06-10')

    assert.equal(result.items[0].calculated_total_days, '33')
    assert.equal(result.items[0].calculated_supply_until, '2026-07-12')
    assert.equal(result.items[1].calculated_total_days, '39')
    assert.equal(result.items[1].calculated_supply_until, '2026-07-18')
    assert.equal(result.earliestSupplyUntil, '2026-07-12')
})

test('new medication starts from zero previous remaining days', () => {
    const item = calculateRegularMedicationItem({
        id: 'a',
        name: '新規薬剤',
        current_amount: '',
        next_required_amount: '',
        prescription_days: '14',
        unit: '日分',
        notes: '',
        checked: false
    }, '2026-06-10')

    assert.equal(item.calculated_previous_remaining_days, '0')
    assert.equal(item.calculated_total_days, '14')
    assert.equal(item.calculated_supply_until, '2026-06-23')
})

test('actual remaining days override calculated previous remaining days', () => {
    const item = calculateRegularMedicationItem({
        id: 'a',
        name: '薬剤A',
        current_amount: '',
        next_required_amount: '',
        previous_supply_until: '2026-06-14',
        actual_remaining_days: '8',
        prescription_days: '28',
        unit: '日分',
        notes: '',
        checked: false
    }, '2026-06-10')

    assert.equal(item.calculated_previous_remaining_days, '5')
    assert.equal(item.calculated_total_days, '36')
    assert.equal(item.calculated_supply_until, '2026-07-15')
})

test('actual remaining reason is preserved with override calculation', () => {
    const item = calculateRegularMedicationItem({
        id: 'a',
        name: '薬剤A',
        current_amount: '',
        next_required_amount: '',
        previous_supply_until: '2026-06-14',
        actual_remaining_days: '8',
        actual_remaining_reason: '飲み忘れ分を確認',
        prescription_days: '28',
        unit: '日分',
        notes: '',
        checked: false
    }, '2026-06-10')

    assert.equal(item.actual_remaining_reason, '飲み忘れ分を確認')
    assert.equal(item.calculated_total_days, '36')
})
