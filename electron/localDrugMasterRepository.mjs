import fs from 'node:fs'
import iconv from 'iconv-lite'
import { parse } from 'csv-parse/sync'

const NAME_COL_INDEX = 34
const KANA_COL_INDEX = 6
const UNIT_COL_INDEX = 9

const smallKanaMap = {
    ァ: 'ア',
    ィ: 'イ',
    ゥ: 'ウ',
    ェ: 'エ',
    ォ: 'オ',
    ャ: 'ヤ',
    ュ: 'ユ',
    ョ: 'ヨ',
    ッ: 'ツ',
    ヮ: 'ワ',
    ヵ: 'カ',
    ヶ: 'ケ'
}

export function getDrugMasterCount(db) {
    const row = db.prepare('SELECT COUNT(*) AS count FROM drug_master').get()
    return Number(row?.count ?? 0)
}

export function getDrugMasterStatus(db) {
    const row = db.prepare(`
        SELECT
            COUNT(*) AS count,
            MAX(updated_at) AS updated_at
        FROM drug_master
    `).get()
    const sourceRow = db.prepare(`
        SELECT source_code
        FROM drug_master
        WHERE source_code IS NOT NULL
          AND source_code != ''
        ORDER BY updated_at DESC
        LIMIT 1
    `).get()

    return {
        count: Number(row?.count ?? 0),
        source: sourceRow?.source_code ?? '',
        updated_at: row?.updated_at ?? ''
    }
}

export function ensureDrugMasterSeeded(db, { jsonPath, force = false } = {}) {
    if (!jsonPath) {
        throw new Error('jsonPath is required')
    }

    const currentCount = getDrugMasterCount(db)
    if (currentCount > 0 && !force) {
        return {
            imported: false,
            count: currentCount
        }
    }

    const payload = readDrugMasterPayload(jsonPath)
    const result = replaceDrugMasterEntries(db, payload.entries, payload.source)

    return {
        imported: true,
        source: payload.source,
        count: result.count,
        updated_at: result.updated_at
    }
}

export function replaceDrugMasterEntries(db, entries, sourceCode = '') {
    if (!Array.isArray(entries)) {
        throw new Error('薬剤マスタが不正です')
    }

    const normalizedEntries = normalizeUniqueDrugEntries(entries)
    if (normalizedEntries.length === 0) {
        throw new Error('取り込み可能な薬剤マスタ行がありません')
    }

    const now = new Date().toISOString()
    const statement = db.prepare(`
        INSERT INTO drug_master (
            source_code,
            name,
            kana,
            unit,
            search_text,
            updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)
    `)

    db.exec('BEGIN IMMEDIATE')
    try {
        db.prepare('DELETE FROM drug_master').run()
        for (const normalizedEntry of normalizedEntries) {
            statement.run(
                sourceCode,
                normalizedEntry.name,
                normalizedEntry.kana,
                normalizedEntry.unit,
                normalizeDrugSearchText(`${normalizedEntry.name} ${normalizedEntry.kana}`),
                now
            )
        }
        db.exec('COMMIT')
    } catch (error) {
        db.exec('ROLLBACK')
        throw error
    }

    return {
        count: normalizedEntries.length,
        updated_at: now
    }
}

export function importDrugMasterCsv(db, csvPath) {
    if (!csvPath) {
        throw new Error('CSVファイルを選択してください')
    }

    const previousCount = getDrugMasterCount(db)
    const entries = readDrugMasterCsv(csvPath)
    const result = replaceDrugMasterEntries(db, entries, csvPath)

    return {
        imported: true,
        source: csvPath,
        previousCount,
        count: result.count,
        updated_at: result.updated_at
    }
}

export function searchDrugMaster(db, query, limit = 20) {
    const normalizedQuery = normalizeDrugSearchText(String(query || ''))
    const normalizedLimit = normalizeLimit(limit)
    if (!normalizedQuery) return []

    const startsWithRows = db.prepare(`
        SELECT name, kana, unit
        FROM drug_master
        WHERE search_text LIKE ? ESCAPE '\\'
        ORDER BY name ASC, unit ASC
        LIMIT ?
    `).all(`${escapeLike(normalizedQuery)}%`, normalizedLimit)

    if (startsWithRows.length >= normalizedLimit) {
        return startsWithRows.map(rowToDrugEntry)
    }

    const includesRows = db.prepare(`
        SELECT name, kana, unit
        FROM drug_master
        WHERE search_text LIKE ? ESCAPE '\\'
          AND search_text NOT LIKE ? ESCAPE '\\'
        ORDER BY name ASC, unit ASC
        LIMIT ?
    `).all(
        `%${escapeLike(normalizedQuery)}%`,
        `${escapeLike(normalizedQuery)}%`,
        normalizedLimit - startsWithRows.length
    )

    return [...startsWithRows, ...includesRows].map(rowToDrugEntry)
}

export function normalizeDrugSearchText(value) {
    const normalized = toKatakana(String(value || ''))
        .normalize('NFKC')
        .toLowerCase()
        .replace(/[‐‑‒–—―ーｰ-]/g, '')
        .replace(/[\s\u3000]/g, '')

    return Array.from(normalized)
        .map(char => smallKanaMap[char] || char)
        .join('')
}

function readDrugMasterPayload(jsonPath) {
    const payload = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
    if (!payload || !Array.isArray(payload.entries)) {
        throw new Error('薬剤マスタJSONが不正です')
    }
    return {
        source: typeof payload.source === 'string' ? payload.source : '',
        entries: payload.entries
    }
}

function readDrugMasterCsv(csvPath) {
    const decoded = iconv.decode(fs.readFileSync(csvPath), 'Shift_JIS')
    const records = parse(decoded, {
        columns: false,
        relax_column_count: true,
        skip_empty_lines: true
    })

    return records.map(row => ({
        name: String(row[NAME_COL_INDEX] || '').trim(),
        kana: String(row[KANA_COL_INDEX] || '').trim(),
        unit: String(row[UNIT_COL_INDEX] || '').trim()
    }))
}

function normalizeUniqueDrugEntries(entries) {
    const byKey = new Map()
    for (const entry of entries) {
        const normalizedEntry = normalizeDrugEntry(entry)
        if (!normalizedEntry) continue
        const key = `${normalizedEntry.name}\u0000${normalizedEntry.unit}`
        if (!byKey.has(key)) {
            byKey.set(key, normalizedEntry)
        }
    }
    return Array.from(byKey.values()).sort((a, b) =>
        a.name.localeCompare(b.name, 'ja') || a.unit.localeCompare(b.unit, 'ja')
    )
}

function normalizeDrugEntry(entry) {
    if (!entry || typeof entry !== 'object') return null
    const name = typeof entry.name === 'string' ? entry.name.trim() : ''
    if (!name) return null
    return {
        name,
        kana: typeof entry.kana === 'string' ? entry.kana.trim() : '',
        unit: typeof entry.unit === 'string' ? entry.unit.trim() : ''
    }
}

function rowToDrugEntry(row) {
    return {
        name: row.name,
        kana: row.kana ?? '',
        unit: row.unit ?? ''
    }
}

function toKatakana(value) {
    return value.replace(/[ぁ-ゖ]/g, char =>
        String.fromCharCode(char.charCodeAt(0) + 0x60)
    )
}

function normalizeLimit(limit) {
    const parsed = Number(limit)
    if (!Number.isFinite(parsed)) return 20
    return Math.min(Math.max(Math.floor(parsed), 1), 100)
}

function escapeLike(value) {
    return value.replace(/[\\%_]/g, char => `\\${char}`)
}
