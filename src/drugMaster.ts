export type DrugMasterEntry = {
    name: string;
    kana: string;
    unit: string;
}

type DrugMasterPayload = {
    entries: DrugMasterEntry[];
}

const drugMasterUrl = new URL('./data/drug-master.generated.json', import.meta.url).href
let cachedEntries: DrugMasterEntry[] | null = null

const smallKanaMap: Record<string, string> = {
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
    ヶ: 'ケ',
}

const toKatakana = (value: string): string => {
    return value.replace(/[ぁ-ゖ]/g, char =>
        String.fromCharCode(char.charCodeAt(0) + 0x60)
    )
}

export const normalizeDrugSearchText = (value: string): string => {
    const normalized = toKatakana(value)
        .normalize('NFKC')
        .toLowerCase()
        .replace(/[‐‑‒–—―ーｰ-]/g, '')
        .replace(/[\s\u3000]/g, '')

    return Array.from(normalized)
        .map(char => smallKanaMap[char] || char)
        .join('')
}

export const searchDrugMasterEntries = (
    entries: DrugMasterEntry[],
    query: string,
    limit = 20
): DrugMasterEntry[] => {
    const normalizedQuery = normalizeDrugSearchText(query)
    if (!normalizedQuery) return []

    const seen = new Set<string>()
    const startsWithMatches: DrugMasterEntry[] = []
    const includesMatches: DrugMasterEntry[] = []

    for (const entry of entries) {
        const key = `${entry.name}\u0000${entry.unit}`
        if (seen.has(key)) continue

        const searchable = normalizeDrugSearchText(`${entry.name} ${entry.kana}`)
        if (searchable.startsWith(normalizedQuery)) {
            startsWithMatches.push(entry)
            seen.add(key)
        } else if (searchable.includes(normalizedQuery)) {
            includesMatches.push(entry)
            seen.add(key)
        }

        if (startsWithMatches.length >= limit) break
    }

    return [...startsWithMatches, ...includesMatches].slice(0, limit)
}

export const loadDrugMasterEntries = async (): Promise<DrugMasterEntry[]> => {
    if (cachedEntries) return cachedEntries

    const response = await fetch(drugMasterUrl)
    if (!response.ok) {
        throw new Error(`Failed to load drug master: ${response.status}`)
    }

    const payload = await response.json() as DrugMasterPayload
    cachedEntries = payload.entries
    return cachedEntries
}

export const searchDrugMaster = async (
    query: string,
    limit = 20
): Promise<DrugMasterEntry[]> => {
    const nativeDrugMaster = getNativeDrugMaster()
    if (nativeDrugMaster) {
        return nativeDrugMaster.search(query, limit)
    }

    const entries = await loadDrugMasterEntries()
    return searchDrugMasterEntries(entries, query, limit)
}

const getNativeDrugMaster = () => {
    if (typeof window === 'undefined') return null
    return window.pharmacyReportNative?.drugMaster ?? null
}
