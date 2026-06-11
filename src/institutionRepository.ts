import { supabase, hasSupabaseConfig } from './supabase'
import type { Institution, InstitutionType } from './types'
import { getNativeBridge } from './nativeBridge'

export type InstitutionStorageMode = 'supabase' | 'local'
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
const LOCAL_STORAGE_MODE_KEY = 'report_storage_mode'
const SUPPORTED_STORAGE_MODES = new Set<InstitutionStorageMode>(['supabase', 'local'])

export const getInstitutionStorageMode = (): InstitutionStorageMode => {
    const envMode = import.meta.env.VITE_REPORT_STORAGE
    if (SUPPORTED_STORAGE_MODES.has(envMode as InstitutionStorageMode)) {
        return envMode as InstitutionStorageMode
    }

    const browserMode = getBrowserStorage()?.getItem(LOCAL_STORAGE_MODE_KEY)
    if (SUPPORTED_STORAGE_MODES.has(browserMode as InstitutionStorageMode)) {
        return browserMode as InstitutionStorageMode
    }

    return hasSupabaseConfig ? 'supabase' : 'local'
}

export const isLocalInstitutionStorage = () => Boolean(getNativeBridge()) || getInstitutionStorageMode() === 'local'

export const listInstitutions = async (): Promise<Institution[]> => {
    const nativeBridge = getNativeBridge()
    if (nativeBridge) {
        return nativeBridge.institutions.list()
    }

    if (isLocalInstitutionStorage()) {
        return readLocalInstitutions().sort(compareInstitutionsByName)
    }

    assertSupabaseConfigured()
    const { data, error } = await supabase
        .from('institutions')
        .select('*')
        .order('name')

    if (error) throw error
    return (data ?? []) as Institution[]
}

export const getInstitutionById = async (institutionId: string): Promise<Institution | null> => {
    const nativeBridge = getNativeBridge()
    if (nativeBridge) {
        return nativeBridge.institutions.get(institutionId)
    }

    if (isLocalInstitutionStorage()) {
        return readLocalInstitutions().find(institution => institution.id === institutionId) ?? null
    }

    assertSupabaseConfigured()
    const { data, error } = await supabase
        .from('institutions')
        .select('*')
        .eq('id', institutionId)
        .single()

    if (error) throw error
    return data as Institution
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

    if (isLocalInstitutionStorage()) {
        return readLocalInstitutions()
            .find(institution => institution.name === name && (!type || institution.type === type)) ?? null
    }

    assertSupabaseConfigured()
    let query = supabase
        .from('institutions')
        .select('*')
        .eq('name', name)
        .limit(1)

    if (type) {
        query = query.eq('type', type)
    }

    const { data, error } = await query.maybeSingle()

    if (error) throw error
    return data as Institution | null
}

export const saveInstitution = async (
    institutionId: string | undefined,
    institution: InstitutionInput
): Promise<Institution> => {
    const nativeBridge = getNativeBridge()
    if (nativeBridge) {
        return nativeBridge.institutions.save(institutionId, institution)
    }

    if (isLocalInstitutionStorage()) {
        return saveLocalInstitution(institutionId, institution)
    }

    assertSupabaseConfigured()
    if (institutionId) {
        const { data, error } = await supabase
            .from('institutions')
            .update(institution)
            .eq('id', institutionId)
            .select()
            .single()

        if (error) throw error
        return data as Institution
    }

    const { data, error } = await supabase
        .from('institutions')
        .insert([institution])
        .select()
        .single()

    if (error) throw error
    return data as Institution
}

export const deleteInstitution = async (institutionId: string): Promise<void> => {
    const nativeBridge = getNativeBridge()
    if (nativeBridge) {
        await nativeBridge.institutions.delete(institutionId)
        return
    }

    if (isLocalInstitutionStorage()) {
        const institutions = readLocalInstitutions()
        writeLocalInstitutions(institutions.filter(institution => institution.id !== institutionId))
        return
    }

    assertSupabaseConfigured()
    const { error } = await supabase
        .from('institutions')
        .delete()
        .eq('id', institutionId)

    if (error) throw error
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

const assertSupabaseConfigured = () => {
    if (!hasSupabaseConfig) {
        throw new Error('Supabaseの接続情報が未設定です。ローカル保存モードで起動してください。')
    }
}
