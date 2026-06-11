import type { Report } from './types'

export type AiDraftTarget = 'chief_complaint' | 'medication_instruction'
export type AiDraftApplyMode = 'append' | 'replace' | 'cancel'

export type AiDraft = {
    chief_complaint: string
    medication_instruction: string
    transcript: string
    source: 'local_llm' | 'rule_based'
}

export type AiDraftFieldState = {
    target: AiDraftTarget
    currentValue: string
    draftValue: string
    requiresChoice: boolean
}

export type AiDraftApplyChoices = Partial<Record<AiDraftTarget, AiDraftApplyMode>>
export type AppliedAiDraftMode = Exclude<AiDraftApplyMode, 'cancel'>

export type AiDraftFieldPatch = {
    target: AiDraftTarget
    mode: AppliedAiDraftMode
    beforeValue: string
    afterValue: string
}

type ReportDraftFields = Pick<Report, 'chief_complaint' | 'medication_instruction'>

export const createRuleBasedAiDraft = (transcript: string): AiDraft => {
    const normalizedTranscript = normalizeText(transcript)
    const lines = normalizedTranscript.split('\n').map(line => line.trim()).filter(Boolean)

    return {
        chief_complaint: pickFieldText(lines, ['主訴', '家族', '訴え', '体調', '副作用']) || normalizedTranscript,
        medication_instruction: pickFieldText(lines, ['指導', '説明', '対応', '確認', '提案']) || '',
        transcript: normalizedTranscript,
        source: 'rule_based'
    }
}

export const getAiDraftFieldStates = (
    fields: ReportDraftFields,
    draft: AiDraft
): AiDraftFieldState[] => {
    return (['chief_complaint', 'medication_instruction'] as AiDraftTarget[])
        .map(target => ({
            target,
            currentValue: normalizeText(fields[target] || ''),
            draftValue: normalizeText(draft[target] || ''),
            requiresChoice: Boolean(normalizeText(fields[target] || '') && normalizeText(draft[target] || ''))
        }))
        .filter(state => Boolean(state.draftValue))
}

export const applyAiDraftToFields = <T extends ReportDraftFields>(
    fields: T,
    draft: AiDraft,
    choices: AiDraftApplyChoices = {}
): T => {
    const next = { ...fields }

    for (const state of getAiDraftFieldStates(fields, draft)) {
        const mode = state.requiresChoice
            ? choices[state.target] || 'cancel'
            : 'replace'

        if (mode === 'cancel') continue

        next[state.target] = mode === 'append'
            ? joinParagraphs(state.currentValue, state.draftValue)
            : state.draftValue
    }

    return next
}

export const createAiDraftFieldPatch = (
    fields: ReportDraftFields,
    draft: AiDraft,
    target: AiDraftTarget,
    mode: AiDraftApplyMode
): AiDraftFieldPatch | null => {
    if (mode === 'cancel') return null

    const draftValue = normalizeText(draft[target] || '')
    if (!draftValue) return null

    const beforeValue = normalizeText(fields[target] || '')
    const afterValue = mode === 'append'
        ? joinParagraphs(beforeValue, draftValue)
        : draftValue

    return {
        target,
        mode,
        beforeValue,
        afterValue
    }
}

export const applyAiDraftFieldPatch = <T extends ReportDraftFields>(
    fields: T,
    patch: AiDraftFieldPatch | null
): T => {
    if (!patch) return fields
    return {
        ...fields,
        [patch.target]: patch.afterValue
    }
}

export const revertAiDraftFieldPatch = <T extends ReportDraftFields>(
    fields: T,
    patch: AiDraftFieldPatch | null
): T => {
    if (!patch) return fields
    return {
        ...fields,
        [patch.target]: patch.beforeValue
    }
}

export const hasAiDraftChoicesRemaining = (
    fields: ReportDraftFields,
    draft: AiDraft,
    choices: AiDraftApplyChoices = {}
) => {
    return getAiDraftFieldStates(fields, draft)
        .some(state => state.requiresChoice && !choices[state.target])
}

const pickFieldText = (lines: string[], keywords: string[]) => {
    const matched = lines.filter(line => keywords.some(keyword => line.includes(keyword)))
    return stripFieldLabels(matched.join('\n'))
}

const stripFieldLabels = (value: string) => {
    return value
        .split('\n')
        .map(line => line.replace(/^(主訴等?|服薬指導内容?|指導内容|家族の訴え|患者の訴え|副作用\/体調変化)\s*[:：]\s*/, '').trim())
        .filter(Boolean)
        .join('\n')
}

const joinParagraphs = (...values: string[]) => {
    return values.map(normalizeText).filter(Boolean).join('\n')
}

const normalizeText = (value: string) => {
    return value.replace(/\r\n/g, '\n').trim()
}
