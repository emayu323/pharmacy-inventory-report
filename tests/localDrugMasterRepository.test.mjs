import assert from 'node:assert/strict'
import fs from 'node:fs'
import iconv from 'iconv-lite'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { initializeLocalDatabase } from '../electron/localDatabase.mjs'
import {
    ensureDrugMasterSeeded,
    getDrugMasterCount,
    getDrugMasterStatus,
    importDrugMasterCsv,
    normalizeDrugSearchText,
    searchDrugMaster
} from '../electron/localDrugMasterRepository.mjs'

const entries = [
    { name: 'アムロジピン錠５ｍｇ', kana: 'ｱﾑﾛｼﾞﾋﾟﾝｼﾞｮｳ5mg', unit: '錠' },
    { name: 'ガスター散２％', kana: 'ｶﾞｽﾀｰｻﾝ2%', unit: 'ｇ' },
    { name: 'ロキソプロフェンＮａテープ１００ｍｇ', kana: 'ﾛｷｿﾌﾟﾛﾌｪﾝNaﾃｰﾌﾟ100mg', unit: '枚' }
]

test('normalizes drug search text using the same rules as the renderer', () => {
    assert.equal(
        normalizeDrugSearchText('ろきそぷろふぇん'),
        normalizeDrugSearchText('ロキソプロフエン')
    )
    assert.equal(
        normalizeDrugSearchText('ｶﾞｽﾀｰ ｻﾝ'),
        normalizeDrugSearchText('ガスターサン')
    )
})

test('seeds and searches drug master entries in SQLite', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'report-drug-db-'))
    const dbPath = path.join(tmpDir, 'drug.sqlite')
    const jsonPath = path.join(tmpDir, 'drug-master.generated.json')
    fs.writeFileSync(jsonPath, JSON.stringify({ source: 'test.csv', entries }))

    const initialized = await initializeLocalDatabase({ dbPath })
    try {
        const seeded = ensureDrugMasterSeeded(initialized.db, { jsonPath })
        assert.equal(seeded.imported, true)
        assert.equal(seeded.count, entries.length)
        assert.equal(getDrugMasterCount(initialized.db), entries.length)
        assert.equal(getDrugMasterStatus(initialized.db).source, 'test.csv')

        const secondSeed = ensureDrugMasterSeeded(initialized.db, { jsonPath })
        assert.equal(secondSeed.imported, false)
        assert.equal(secondSeed.count, entries.length)
        assert.equal(getDrugMasterCount(initialized.db), entries.length)

        const nameResults = searchDrugMaster(initialized.db, 'アムロジピン')
        assert.equal(nameResults[0].name, 'アムロジピン錠５ｍｇ')
        assert.equal(nameResults[0].unit, '錠')

        const kanaResults = searchDrugMaster(initialized.db, 'ﾛｷｿ')
        assert.equal(kanaResults[0].name, 'ロキソプロフェンＮａテープ１００ｍｇ')
        assert.equal(kanaResults[0].unit, '枚')

        const percentResults = searchDrugMaster(initialized.db, '2%')
        assert.equal(percentResults[0].name, 'ガスター散２％')
        assert.equal(percentResults[0].unit, 'ｇ')
    } finally {
        initialized.db.close()
        fs.rmSync(tmpDir, { recursive: true, force: true })
    }
})

test('imports CP932 CSV and keeps previous master when replacement input is invalid', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'report-drug-db-'))
    const dbPath = path.join(tmpDir, 'drug.sqlite')
    const csvPath = path.join(tmpDir, 'y_TEST.csv')
    const invalidCsvPath = path.join(tmpDir, 'empty.csv')

    fs.writeFileSync(csvPath, createCp932Csv([
        createCsvRow({ name: 'アムロジピン錠５ｍｇ', kana: 'ｱﾑﾛｼﾞﾋﾟﾝｼﾞｮｳ5mg', unit: '錠' }),
        createCsvRow({ name: 'アムロジピン錠５ｍｇ', kana: 'ｱﾑﾛｼﾞﾋﾟﾝｼﾞｮｳ5mg', unit: '錠' }),
        createCsvRow({ name: 'ガスター散２％', kana: 'ｶﾞｽﾀｰｻﾝ2%', unit: 'ｇ' })
    ]))
    fs.writeFileSync(invalidCsvPath, createCp932Csv([
        createCsvRow({ name: '', kana: '', unit: '' })
    ]))

    const initialized = await initializeLocalDatabase({ dbPath })
    try {
        const imported = importDrugMasterCsv(initialized.db, csvPath)
        assert.equal(imported.imported, true)
        assert.equal(imported.previousCount, 0)
        assert.equal(imported.count, 2)
        assert.equal(getDrugMasterCount(initialized.db), 2)

        const status = getDrugMasterStatus(initialized.db)
        assert.equal(status.count, 2)
        assert.equal(status.source, csvPath)

        const searchResults = searchDrugMaster(initialized.db, 'ガスター')
        assert.equal(searchResults[0].name, 'ガスター散２％')

        assert.throws(() => importDrugMasterCsv(initialized.db, invalidCsvPath), /取り込み可能/)
        assert.equal(getDrugMasterCount(initialized.db), 2)
        assert.equal(searchDrugMaster(initialized.db, 'アムロジピン')[0].name, 'アムロジピン錠５ｍｇ')
    } finally {
        initialized.db.close()
        fs.rmSync(tmpDir, { recursive: true, force: true })
    }
})

test('returns no drug master matches for empty queries', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'report-drug-db-'))
    const initialized = await initializeLocalDatabase({ dbPath: path.join(tmpDir, 'drug.sqlite') })

    try {
        assert.deepEqual(searchDrugMaster(initialized.db, ''), [])
    } finally {
        initialized.db.close()
        fs.rmSync(tmpDir, { recursive: true, force: true })
    }
})

function createCsvRow({ name, kana, unit }) {
    const row = Array.from({ length: 35 }, () => '')
    row[6] = kana
    row[9] = unit
    row[34] = name
    return row.join(',')
}

function createCp932Csv(rows) {
    return iconv.encode(`${rows.join('\n')}\n`, 'Shift_JIS')
}
