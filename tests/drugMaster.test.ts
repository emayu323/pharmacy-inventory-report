import test from 'node:test'
import assert from 'node:assert/strict'
import {
    normalizeDrugSearchText,
    searchDrugMasterEntries,
    type DrugMasterEntry
} from '../src/drugMaster.ts'

const entries: DrugMasterEntry[] = [
    { name: 'アムロジピン錠５ｍｇ', kana: 'ｱﾑﾛｼﾞﾋﾟﾝｼﾞｮｳ5mg', unit: '錠' },
    { name: 'ガスター散２％', kana: 'ｶﾞｽﾀｰｻﾝ2%', unit: 'ｇ' },
    { name: 'ロキソプロフェンＮａテープ１００ｍｇ', kana: 'ﾛｷｿﾌﾟﾛﾌｪﾝNaﾃｰﾌﾟ100mg', unit: '枚' },
]

test('normalizes full-width and half-width kana', () => {
    assert.equal(
        normalizeDrugSearchText('ｶﾞｽﾀｰ ｻﾝ'),
        normalizeDrugSearchText('ガスターサン')
    )
})

test('normalizes hiragana and small kana', () => {
    assert.equal(
        normalizeDrugSearchText('ろきそぷろふぇん'),
        normalizeDrugSearchText('ロキソプロフエン')
    )
})

test('normalizes hiragana and long sound marks', () => {
    assert.equal(
        normalizeDrugSearchText('がすたーさん'),
        normalizeDrugSearchText('ガスターサン')
    )
})

test('searches by drug name', () => {
    const result = searchDrugMasterEntries(entries, 'アムロジピン')
    assert.equal(result[0].name, 'アムロジピン錠５ｍｇ')
    assert.equal(result[0].unit, '錠')
})

test('searches by kana', () => {
    const result = searchDrugMasterEntries(entries, 'ﾛｷｿ')
    assert.equal(result[0].name, 'ロキソプロフェンＮａテープ１００ｍｇ')
    assert.equal(result[0].unit, '枚')
})

test('returns no matches for empty query', () => {
    assert.deepEqual(searchDrugMasterEntries(entries, ''), [])
})
