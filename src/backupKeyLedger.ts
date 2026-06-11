import type { AppSettings } from './types'

const LEDGER_HEADERS = [
    '控え日時',
    '薬局名',
    '所在地',
    'TEL',
    'FAX',
    '薬局キー'
]

export const createBackupKeyLedgerTsv = (
    settings: AppSettings,
    createdAt = new Date()
) => {
    const row = [
        createdAt.toISOString(),
        settings.pharmacy_name,
        settings.pharmacy_address,
        settings.pharmacy_tel,
        settings.pharmacy_fax,
        settings.backup_key ?? ''
    ]

    return [
        LEDGER_HEADERS.map(escapeTsvCell).join('\t'),
        row.map(escapeTsvCell).join('\t')
    ].join('\n')
}

function escapeTsvCell(value: unknown) {
    const text = String(value ?? '').replace(/\r?\n/g, ' ').trim()
    if (!text.includes('\t') && !text.includes('"')) return text
    return `"${text.replace(/"/g, '""')}"`
}
