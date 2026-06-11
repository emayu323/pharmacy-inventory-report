import type { Patient } from './types'
import { getNativeBridge } from './nativeBridge'

export type PatientStorageMode = 'local'
export type PatientInput = Omit<Patient, 'id' | 'created_at'> & { user_id?: string }
export type PatientUpdate = Partial<Omit<Patient, 'id' | 'created_at'>>
export type LogicalDeleteResult = {
    deleted: boolean
    deleted_at?: string
}

const LOCAL_PATIENTS_KEY = 'pharmacy-report:patients:v1'

export const getPatientStorageMode = (): PatientStorageMode => 'local'
export const isLocalPatientStorage = () => true

export const listPatients = async (): Promise<Patient[]> => {
    const nativeBridge = getNativeBridge()
    if (nativeBridge) {
        return nativeBridge.patients.list()
    }

    return readLocalPatients()
        .filter(patient => !patient.deleted_at)
        .sort(comparePatientsByName)
}

export const listDeletedPatients = async (): Promise<Patient[]> => {
    const nativeBridge = getNativeBridge()
    if (nativeBridge) {
        return nativeBridge.patients.listDeleted()
    }

    return readLocalPatients()
        .filter(patient => Boolean(patient.deleted_at))
        .sort(comparePatientsByNewestDeletedAt)
}

export const getPatientById = async (patientId: string): Promise<Patient | null> => {
    const nativeBridge = getNativeBridge()
    if (nativeBridge) {
        return nativeBridge.patients.get(patientId)
    }

    return readLocalPatients().find(patient => patient.id === patientId && !patient.deleted_at) ?? null
}

export const createPatient = async (patient: PatientInput): Promise<Patient> => {
    const nativeBridge = getNativeBridge()
    if (nativeBridge) {
        return nativeBridge.patients.create(patient)
    }

    const patients = readLocalPatients()
    const savedPatient: Patient = {
        ...patient,
        id: createLocalPatientId(),
        created_at: new Date().toISOString(),
        is_active: patient.is_active ?? true
    } as Patient
    writeLocalPatients([savedPatient, ...patients])
    return savedPatient
}

export const updatePatient = async (patientId: string, update: PatientUpdate): Promise<Patient> => {
    const nativeBridge = getNativeBridge()
    if (nativeBridge) {
        return nativeBridge.patients.update(patientId, update)
    }

    const patients = readLocalPatients()
    const index = patients.findIndex(patient => patient.id === patientId && !patient.deleted_at)
    if (index < 0) {
        throw new Error('患者が見つかりません')
    }
    const updatedPatient = {
        ...patients[index],
        ...update
    } as Patient
    patients[index] = updatedPatient
    writeLocalPatients(patients)
    return updatedPatient
}

export const deletePatient = async (patientId: string): Promise<LogicalDeleteResult> => {
    const nativeBridge = getNativeBridge()
    if (nativeBridge) {
        return nativeBridge.patients.delete(patientId)
    }

    const deletedAt = new Date().toISOString()
    const patients = readLocalPatients()
    const index = patients.findIndex(patient => patient.id === patientId && !patient.deleted_at)
    if (index < 0) return { deleted: false }
    patients[index] = {
        ...patients[index],
        deleted_at: deletedAt
    }
    writeLocalPatients(patients)
    return {
        deleted: true,
        deleted_at: deletedAt
    }
}

export const restorePatient = async (patientId: string): Promise<Patient | null> => {
    const nativeBridge = getNativeBridge()
    if (nativeBridge) {
        return nativeBridge.patients.restore(patientId)
    }

    const patients = readLocalPatients()
    const index = patients.findIndex(patient => patient.id === patientId && patient.deleted_at)
    if (index < 0) return null
    const restoredPatient = { ...patients[index] }
    delete restoredPatient.deleted_at
    patients[index] = restoredPatient
    writeLocalPatients(patients)
    return restoredPatient
}

const readLocalPatients = (): Patient[] => {
    const storage = getBrowserStorage()
    if (!storage) return []

    const raw = storage.getItem(LOCAL_PATIENTS_KEY)
    if (!raw) return []

    try {
        const parsed = JSON.parse(raw) as unknown
        if (!Array.isArray(parsed)) return []
        return parsed.filter(isPatientLike) as Patient[]
    } catch {
        return []
    }
}

const writeLocalPatients = (patients: Patient[]) => {
    const storage = getBrowserStorage()
    if (!storage) {
        throw new Error('ローカル保存領域にアクセスできません')
    }
    storage.setItem(LOCAL_PATIENTS_KEY, JSON.stringify(patients))
}

const getBrowserStorage = (): Storage | null => {
    if (typeof window === 'undefined') return null
    try {
        return window.localStorage
    } catch {
        return null
    }
}

const createLocalPatientId = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return `local-patient-${crypto.randomUUID()}`
    }
    return `local-patient-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

const comparePatientsByName = (a: Patient, b: Patient) => {
    return a.name.localeCompare(b.name, 'ja')
}

const comparePatientsByNewestDeletedAt = (a: Patient, b: Patient) => {
    return getTimeValue(b.deleted_at) - getTimeValue(a.deleted_at)
}

const getTimeValue = (value?: string) => {
    if (!value) return 0
    const time = Date.parse(value)
    return Number.isNaN(time) ? 0 : time
}

const isPatientLike = (value: unknown): value is Patient => {
    if (!value || typeof value !== 'object') return false
    const patient = value as Partial<Patient>
    return typeof patient.id === 'string'
        && typeof patient.name === 'string'
        && typeof patient.dob === 'string'
        && typeof patient.gender === 'string'
}
