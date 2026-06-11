import type { Institution, InstitutionType } from './types'
import { getNativeBridge } from './nativeBridge'

export type InstitutionStorageMode = 'local'
export type InstitutionInput = {
    type: InstitutionType
    name: string
    address?: string | null
    doctor_name?: string | null
    tel?: string | null
    fax?: string | null
    user_id?: string
}
export type InstitutionUpdate = Partial<InstitutionInput>

const LOCAL_INSTITUTIONS_KEY = 'pharmacy-report:institutions:v1'

export const getInstitutionStorageMode = (): InstitutionStorageMode => 'local'
export const isLocalInstitutionStorage = () => true

export const listInstitutions = async (): Promise<Institution[]> => {
    const nativeBridge = getNativeBridge()
    if (nativeBridge) {
        return nativeBridge.institutions.list()
    }

    return readLocalInstitutions().sort(compareInstitutionsByName)
}

export const getInstitutionById = async (institutionId: string): Promise<Institution | null> => {
    const nativeBridge = getNativeBridge()
    if (nativeBridge) {
        return nativeBridge.institutions.get(institutionId)
    }

    return readLocalInstitutions().find(institution => institution.id === institutionId) ?? null
}

export const findInstitutionByName = async (
    name: string,
    type?: InstitutionType
): Promise<Institution | null> => {
    if (!name) return null

    const nativeBridge = getNativeBridge()
    if (nativeBridge) {
        return nativeBridge.institutions.findByName(name, type)
    }

    return readLocalInstitutions()
        .find(institution => institution.name === name && (!type || institution.type === type)) ?? null
}

export const saveInstitution = async (
    institutionId: string | undefined,
    institution: InstitutionInput
): Promise<Institution> => {
    const nativeBridge = getNativeBridge()
    if (nativeBridge) {
        return nativeBridge.institutions.save(institutionId, institution)
    }

    return saveLocalInstitution(institutionId, institution)
}

export const deleteInstitution = async (institutionId: string): Promise<void> => {
    const nativeBridge = getNativeBridge()
    if (nativeBridge) {
        await nativeBridge.institutions.delete(institutionId)
        return
    }

    const institutions = readLocalInstitutions()
    writeLocalInstitutions(institutions.filter(institution => institution.id !== institutionId))
}

const saveLocalInstitution = (
    institutionId: string | undefined,
    institution: InstitutionInput
): Institution => {
    const institutions = readLocalInstitutions()
    const index = institutionId ? institutions.findIndex(item => item.id === institutionId) : -1
    const existingInstitution = index >= 0 ? institutions[index] : undefined
    const savedInstitution: Institution = {
        ...normalizeInstitutionInput(institution),
        id: institutionId || createLocalInstitutionId(),
        created_at: existingInstitution?.created_at || new Date().toISOString()
    }

    if (index >= 0) {
        institutions[index] = savedInstitution
    } else {
        institutions.unshift(savedInstitution)
    }

    writeLocalInstitutions(institutions)
    return savedInstitution
}

const normalizeInstitutionInput = (institution: InstitutionInput): Omit<Institution, 'id' | 'created_at'> => ({
    type: institution.type,
    name: institution.name,
    address: institution.address || undefined,
    doctor_name: institution.doctor_name || undefined,
    tel: institution.tel || undefined,
    fax: institution.fax || undefined
})

const readLocalInstitutions = (): Institution[] => {
    const storage = getBrowserStorage()
    if (!storage) return []

    const raw = storage.getItem(LOCAL_INSTITUTIONS_KEY)
    if (!raw) return []

    try {
        const parsed = JSON.parse(raw) as unknown
        if (!Array.isArray(parsed)) return []
        return parsed.filter(isInstitutionLike) as Institution[]
    } catch {
        return []
    }
}

const writeLocalInstitutions = (institutions: Institution[]) => {
    const storage = getBrowserStorage()
    if (!storage) {
        throw new Error('ローカル保存領域にアクセスできません')
    }
    storage.setItem(LOCAL_INSTITUTIONS_KEY, JSON.stringify(institutions))
}

const getBrowserStorage = (): Storage | null => {
    if (typeof window === 'undefined') return null
    try {
        return window.localStorage
    } catch {
        return null
    }
}

const createLocalInstitutionId = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return `local-institution-${crypto.randomUUID()}`
    }
    return `local-institution-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

const compareInstitutionsByName = (a: Institution, b: Institution) => {
    return a.name.localeCompare(b.name, 'ja')
}

const isInstitutionLike = (value: unknown): value is Institution => {
    if (!value || typeof value !== 'object') return false
    const institution = value as Partial<Institution>
    return typeof institution.id === 'string'
        && typeof institution.name === 'string'
        && typeof institution.type === 'string'
}
