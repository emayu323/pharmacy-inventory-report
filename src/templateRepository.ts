import type { TextTemplate, TextTemplateTarget } from './types'
import { getNativeBridge } from './nativeBridge'

export type TextTemplateInput = {
    id?: string
    target: TextTemplateTarget
    title: string
    body: string
}

const LOCAL_TEMPLATES_KEY = 'pharmacy-report:text-templates:v1'

export const listTextTemplates = async (): Promise<TextTemplate[]> => {
    const nativeBridge = getNativeBridge()
    if (nativeBridge) {
        return nativeBridge.templates.list()
    }

    return readLocalTemplates().sort(compareTemplates)
}

export const saveTextTemplate = async (input: TextTemplateInput): Promise<TextTemplate> => {
    const nativeBridge = getNativeBridge()
    if (nativeBridge) {
        return nativeBridge.templates.save(input)
    }

    const templates = readLocalTemplates()
    const index = input.id ? templates.findIndex(template => template.id === input.id) : -1
    const now = new Date().toISOString()
    const existingTemplate = index >= 0 ? templates[index] : undefined
    const savedTemplate: TextTemplate = {
        id: input.id || createLocalTemplateId(),
        created_at: existingTemplate?.created_at || now,
        updated_at: now,
        target: input.target,
        title: input.title.trim(),
        body: input.body.trim()
    }

    if (index >= 0) {
        templates[index] = savedTemplate
    } else {
        templates.unshift(savedTemplate)
    }

    writeLocalTemplates(templates)
    return savedTemplate
}

export const deleteTextTemplate = async (templateId: string): Promise<void> => {
    const nativeBridge = getNativeBridge()
    if (nativeBridge) {
        await nativeBridge.templates.delete(templateId)
        return
    }

    writeLocalTemplates(readLocalTemplates().filter(template => template.id !== templateId))
}

const readLocalTemplates = (): TextTemplate[] => {
    const storage = getBrowserStorage()
    if (!storage) return []

    const raw = storage.getItem(LOCAL_TEMPLATES_KEY)
    if (!raw) return []

    try {
        const parsed = JSON.parse(raw) as unknown
        if (!Array.isArray(parsed)) return []
        return parsed.filter(isTextTemplateLike) as TextTemplate[]
    } catch {
        return []
    }
}

const writeLocalTemplates = (templates: TextTemplate[]) => {
    const storage = getBrowserStorage()
    if (!storage) {
        throw new Error('ローカル保存領域にアクセスできません')
    }
    storage.setItem(LOCAL_TEMPLATES_KEY, JSON.stringify(templates))
}

const getBrowserStorage = (): Storage | null => {
    if (typeof window === 'undefined') return null
    try {
        return window.localStorage
    } catch {
        return null
    }
}

const createLocalTemplateId = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return `local-template-${crypto.randomUUID()}`
    }
    return `local-template-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

const compareTemplates = (a: TextTemplate, b: TextTemplate) => {
    if (a.target !== b.target) return a.target.localeCompare(b.target)
    return a.title.localeCompare(b.title, 'ja')
}

const isTextTemplateLike = (value: unknown): value is TextTemplate => {
    if (!value || typeof value !== 'object') return false
    const template = value as Partial<TextTemplate>
    return typeof template.id === 'string'
        && typeof template.target === 'string'
        && typeof template.title === 'string'
        && typeof template.body === 'string'
}
