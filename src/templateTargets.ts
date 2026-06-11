import type { TextTemplateTarget } from './types'

export const TEXT_TEMPLATE_TARGETS: { id: TextTemplateTarget; label: string }[] = [
    { id: 'medication_status', label: '服薬状況' },
    { id: 'storage_status', label: '保管状況' },
    { id: 'chief_complaint', label: '主訴等' },
    { id: 'medication_instruction', label: '服薬指導内容' },
    { id: 'side_effects', label: 'その他伝達事項' }
]

export const getTextTemplateTargetLabel = (target: TextTemplateTarget) => {
    return TEXT_TEMPLATE_TARGETS.find(item => item.id === target)?.label || target
}
