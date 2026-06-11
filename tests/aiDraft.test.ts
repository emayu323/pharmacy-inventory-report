import assert from 'node:assert/strict'
import test from 'node:test'
import {
    applyAiDraftToFields,
    applyAiDraftFieldPatch,
    createRuleBasedAiDraft,
    createAiDraftFieldPatch,
    getAiDraftFieldStates,
    hasAiDraftChoicesRemaining,
    revertAiDraftFieldPatch,
    type AiDraft
} from '../src/aiDraft.ts'

test('creates draft for chief complaint and instruction from transcript labels', () => {
    const draft = createRuleBasedAiDraft(`
        主訴等: 朝薬服用後の眠気の訴えあり。
        服薬指導内容: 眠気が続く場合は主治医へ相談するよう説明。
    `)

    assert.equal(draft.chief_complaint, '朝薬服用後の眠気の訴えあり。')
    assert.equal(draft.medication_instruction, '眠気が続く場合は主治医へ相談するよう説明。')
    assert.equal(draft.source, 'rule_based')
})

test('applies draft directly to empty fields', () => {
    const fields = {
        chief_complaint: '',
        medication_instruction: ''
    }
    const draft: AiDraft = {
        chief_complaint: '眠気の訴えあり。',
        medication_instruction: '服用タイミングを確認。',
        transcript: 'transcript',
        source: 'rule_based'
    }

    const next = applyAiDraftToFields(fields, draft)

    assert.equal(next.chief_complaint, '眠気の訴えあり。')
    assert.equal(next.medication_instruction, '服用タイミングを確認。')
})

test('requires append or replace choice when existing text is present', () => {
    const fields = {
        chief_complaint: '既存主訴',
        medication_instruction: '既存指導'
    }
    const draft: AiDraft = {
        chief_complaint: '追加主訴',
        medication_instruction: '置換指導',
        transcript: 'transcript',
        source: 'rule_based'
    }

    assert.equal(hasAiDraftChoicesRemaining(fields, draft), true)
    assert.deepEqual(getAiDraftFieldStates(fields, draft).map(state => state.requiresChoice), [true, true])

    const next = applyAiDraftToFields(fields, draft, {
        chief_complaint: 'append',
        medication_instruction: 'replace'
    })

    assert.equal(next.chief_complaint, '既存主訴\n追加主訴')
    assert.equal(next.medication_instruction, '置換指導')
})

test('cancels field when no choice is made for existing text', () => {
    const fields = {
        chief_complaint: '既存主訴',
        medication_instruction: ''
    }
    const draft: AiDraft = {
        chief_complaint: '追加主訴',
        medication_instruction: '新規指導',
        transcript: 'transcript',
        source: 'rule_based'
    }

    const next = applyAiDraftToFields(fields, draft)

    assert.equal(next.chief_complaint, '既存主訴')
    assert.equal(next.medication_instruction, '新規指導')
})

test('creates reversible patch for one applied AI draft field', () => {
    const fields = {
        chief_complaint: '既存主訴',
        medication_instruction: '既存指導'
    }
    const draft: AiDraft = {
        chief_complaint: '追加主訴',
        medication_instruction: '置換指導',
        transcript: 'transcript',
        source: 'rule_based'
    }

    const patch = createAiDraftFieldPatch(fields, draft, 'chief_complaint', 'append')

    assert.deepEqual(patch, {
        target: 'chief_complaint',
        mode: 'append',
        beforeValue: '既存主訴',
        afterValue: '既存主訴\n追加主訴'
    })

    const applied = applyAiDraftFieldPatch(fields, patch)
    assert.equal(applied.chief_complaint, '既存主訴\n追加主訴')
    assert.equal(applied.medication_instruction, '既存指導')

    const reverted = revertAiDraftFieldPatch(applied, patch)
    assert.equal(reverted.chief_complaint, '既存主訴')
    assert.equal(reverted.medication_instruction, '既存指導')
})

test('does not create reversible patch for cancel or empty draft value', () => {
    const fields = {
        chief_complaint: '既存主訴',
        medication_instruction: ''
    }
    const draft: AiDraft = {
        chief_complaint: '',
        medication_instruction: '',
        transcript: 'transcript',
        source: 'rule_based'
    }

    assert.equal(createAiDraftFieldPatch(fields, draft, 'chief_complaint', 'cancel'), null)
    assert.equal(createAiDraftFieldPatch(fields, draft, 'chief_complaint', 'replace'), null)
})
