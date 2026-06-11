import assert from 'node:assert/strict'
import test from 'node:test'
import { createAiSetupGuide } from '../src/aiSetupGuide.ts'
import type { AppSettings } from '../src/types.ts'
import type { NativeAiEnvironmentStatus } from '../src/nativeBridge.ts'

test('setup guide marks local AI ready when Ollama model is ready', () => {
    const guide = createAiSetupGuide(createSettings(), createStatus({
        ollamaStatus: 'ready'
    }))

    assert.equal(guide.ready, true)
    assert.equal(guide.steps.every(step => step.status === 'done'), true)
    assert.equal(guide.steps.some(step => step.id.includes('whisper')), false)
})

test('setup guide asks to pull missing Ollama model', () => {
    const guide = createAiSetupGuide(createSettings(), createStatus({
        ollamaStatus: 'model_missing'
    }))
    const modelStep = guide.steps.find(step => step.id === 'ollama_model')

    assert.equal(guide.ready, false)
    assert.equal(modelStep?.status, 'todo')
    assert.equal(modelStep?.command, 'ollama pull llama3.1:8b')
})

function createSettings(overrides: Partial<AppSettings> = {}): AppSettings {
    return {
        pharmacy_name: '',
        pharmacy_address: '',
        pharmacy_tel: '',
        pharmacy_fax: '',
        google_drive_folder: '',
        backup_key: undefined,
        last_app_version: '',
        ai_mode_enabled: true,
        ai_ollama_url: 'http://127.0.0.1:11434',
        ai_ollama_model: 'llama3.1:8b',
        ai_auto_start_enabled: false,
        ai_ollama_start_command: 'ollama serve',
        pin_enabled: false,
        lock_timeout_minutes: 15,
        ...overrides
    }
}

function createStatus({
    ollamaStatus
}: {
    ollamaStatus: NativeAiEnvironmentStatus['ollama']['status']
}): NativeAiEnvironmentStatus {
    return {
        ready: ollamaStatus === 'ready',
        ollama: {
            status: ollamaStatus,
            url: 'http://127.0.0.1:11434',
            requiredModel: 'llama3.1:8b',
            installedModels: ollamaStatus === 'ready' ? ['llama3.1:8b'] : [],
            message: 'Ollama status'
        },
        disk: {
            status: 'ready',
            message: '未確認'
        },
        performance: {
            cpuCount: 8,
            gpu: 'unknown',
            message: 'CPU処理は中程度以上の見込みです'
        },
        estimate: {
            basis: 'ollama_text_only',
            message: '訪問メモから下書きを作成します'
        }
    }
}
