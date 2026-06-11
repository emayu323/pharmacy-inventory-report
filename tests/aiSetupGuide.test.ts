import assert from 'node:assert/strict'
import test from 'node:test'
import { createAiSetupGuide } from '../src/aiSetupGuide.ts'
import type { AppSettings } from '../src/types.ts'
import type { NativeAiEnvironmentStatus } from '../src/nativeBridge.ts'

test('setup guide marks local AI ready when Ollama model and Whisper are ready', () => {
    const guide = createAiSetupGuide(createSettings(), createStatus({
        ollamaStatus: 'ready',
        whisperStatus: 'ready'
    }))

    assert.equal(guide.ready, true)
    assert.equal(guide.steps.every(step => step.status === 'done'), true)
})

test('setup guide asks to pull missing Ollama model', () => {
    const guide = createAiSetupGuide(createSettings(), createStatus({
        ollamaStatus: 'model_missing',
        whisperStatus: 'ready'
    }))
    const modelStep = guide.steps.find(step => step.id === 'ollama_model')

    assert.equal(guide.ready, false)
    assert.equal(modelStep?.status, 'todo')
    assert.equal(modelStep?.command, 'ollama pull llama3.1:8b')
})

test('setup guide asks to configure Whisper before recording setup is considered ready', () => {
    const guide = createAiSetupGuide({
        ...createSettings(),
        ai_whisper_health_url: '',
        ai_whisper_transcribe_url: ''
    }, createStatus({
        ollamaStatus: 'ready',
        whisperStatus: 'not_configured'
    }))
    const whisperStep = guide.steps.find(step => step.id === 'whisper_config')

    assert.equal(guide.ready, false)
    assert.equal(whisperStep?.status, 'todo')
    assert.equal(whisperStep?.command, undefined)
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
        ai_consent_mode_enabled: true,
        ai_save_audio_enabled: false,
        ai_save_transcript_enabled: false,
        ai_ollama_url: 'http://127.0.0.1:11434',
        ai_ollama_model: 'llama3.1:8b',
        ai_whisper_health_url: 'http://127.0.0.1:8178/health',
        ai_whisper_transcribe_url: 'http://127.0.0.1:8178/transcribe',
        ai_whisper_file_field: 'audio',
        ai_auto_start_enabled: false,
        ai_ollama_start_command: 'ollama serve',
        ai_whisper_start_command: 'whisper-server --port 8178',
        pin_enabled: false,
        lock_timeout_minutes: 15,
        ...overrides
    }
}

function createStatus({
    ollamaStatus,
    whisperStatus
}: {
    ollamaStatus: NativeAiEnvironmentStatus['ollama']['status']
    whisperStatus: NativeAiEnvironmentStatus['whisper']['status']
}): NativeAiEnvironmentStatus {
    return {
        ready: ollamaStatus === 'ready' && whisperStatus === 'ready',
        ollama: {
            status: ollamaStatus,
            url: 'http://127.0.0.1:11434',
            requiredModel: 'llama3.1:8b',
            installedModels: ollamaStatus === 'ready' ? ['llama3.1:8b'] : [],
            message: 'Ollama status'
        },
        whisper: {
            status: whisperStatus,
            url: whisperStatus === 'not_configured' ? '' : 'http://127.0.0.1:8178/health',
            message: 'Whisper status'
        },
        disk: {
            status: 'not_checked',
            message: '未確認'
        },
        performance: {
            cpuCount: 8,
            gpu: 'unknown',
            message: 'CPU処理は中程度以上の見込みです'
        },
        estimate: {
            basis: 'cpu_only_default',
            transcriptionTimeRatio: '1x-3x',
            message: '文字起こしに時間がかかる可能性があります'
        }
    }
}
