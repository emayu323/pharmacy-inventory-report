import assert from 'node:assert/strict'
import test from 'node:test'
import {
    createAiDraftFromAudio,
    createAiDraftFromTranscript
} from '../electron/localAiDraftService.mjs'

test('creates rule-based draft when local LLM model is not configured', async () => {
    const draft = await createAiDraftFromTranscript(`
        主訴等: 朝薬服用後の眠気の訴えあり。
        服薬指導内容: 眠気が続く場合は主治医へ相談するよう説明。
    `, {
        env: {}
    })

    assert.equal(draft.source, 'rule_based')
    assert.equal(draft.chief_complaint, '朝薬服用後の眠気の訴えあり。')
    assert.equal(draft.medication_instruction, '眠気が続く場合は主治医へ相談するよう説明。')
})

test('creates local LLM draft from Ollama JSON response', async () => {
    const requests = []
    const draft = await createAiDraftFromTranscript('眠気の訴えあり。服薬タイミングを説明。', {
        ollamaModel: 'llama3.1:8b',
        timeoutMs: 20,
        fetchImpl: async (url, init) => {
            requests.push({ url: String(url), body: JSON.parse(String(init.body)) })
            return jsonResponse({
                message: {
                    content: JSON.stringify({
                        chief_complaint: '眠気の訴えあり。',
                        medication_instruction: '服薬タイミングを説明。'
                    })
                }
            })
        }
    })

    assert.equal(draft.source, 'local_llm')
    assert.equal(draft.chief_complaint, '眠気の訴えあり。')
    assert.equal(draft.medication_instruction, '服薬タイミングを説明。')
    assert.equal(requests[0].url, 'http://127.0.0.1:11434/api/chat')
    assert.equal(requests[0].body.model, 'llama3.1:8b')
})

test('transcribes audio before creating draft', async () => {
    const draft = await createAiDraftFromAudio(new Uint8Array([1, 2, 3]), {
        whisperTranscribeUrl: 'http://127.0.0.1:8178/transcribe',
        timeoutMs: 20,
        fetchImpl: async (url) => {
            assert.equal(String(url), 'http://127.0.0.1:8178/transcribe')
            return jsonResponse({
                text: '主訴等: 眠気の訴えあり。\n服薬指導内容: 主治医へ相談するよう説明。'
            })
        }
    })

    assert.equal(draft.chief_complaint, '眠気の訴えあり。')
    assert.equal(draft.medication_instruction, '主治医へ相談するよう説明。')
})

test('requires Whisper transcription URL for audio draft', async () => {
    await assert.rejects(
        () => createAiDraftFromAudio(new Uint8Array([1, 2, 3]), { env: {} }),
        /Whisper/
    )
})

function jsonResponse(body) {
    return new Response(JSON.stringify(body), {
        status: 200,
        headers: {
            'Content-Type': 'application/json'
        }
    })
}
