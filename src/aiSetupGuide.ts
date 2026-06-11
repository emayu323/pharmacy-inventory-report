import type { AppSettings } from './types'
import type { NativeAiEnvironmentStatus } from './nativeBridge'

export type AiSetupStepStatus = 'done' | 'todo' | 'warning'

export type AiSetupStep = {
    id: string
    title: string
    detail: string
    status: AiSetupStepStatus
    command?: string
}

export type AiSetupGuide = {
    ready: boolean
    steps: AiSetupStep[]
}

export const createAiSetupGuide = (
    settings: AppSettings,
    status: NativeAiEnvironmentStatus | null
): AiSetupGuide => {
    const steps = [
        createAiModeStep(settings),
        createOllamaServerStep(settings, status),
        createOllamaModelStep(settings, status),
        createWhisperConfigStep(settings, status),
        createWhisperServerStep(settings, status),
        createPerformanceStep(status)
    ]

    return {
        ready: steps.every(step => step.status === 'done'),
        steps
    }
}

function createAiModeStep(settings: AppSettings): AiSetupStep {
    return settings.ai_mode_enabled
        ? {
            id: 'ai_mode',
            title: 'AIモード',
            detail: 'AIモードは有効です。',
            status: 'done'
        }
        : {
            id: 'ai_mode',
            title: 'AIモード',
            detail: '設定画面でAIモードを有効にしてください。',
            status: 'todo'
        }
}

function createOllamaServerStep(
    settings: AppSettings,
    status: NativeAiEnvironmentStatus | null
): AiSetupStep {
    if (status?.ollama.status === 'ready' || status?.ollama.status === 'model_missing') {
        return {
            id: 'ollama_server',
            title: 'Ollama起動',
            detail: `Ollamaに接続できます。${status.ollama.url}`,
            status: 'done'
        }
    }

    return {
        id: 'ollama_server',
        title: 'Ollama起動',
        detail: 'Ollamaが起動していません。薬局Wi-Fi環境で初期セットアップ後、ローカルPC内で起動してください。',
        status: status ? 'todo' : 'warning',
        command: settings.ai_ollama_start_command || 'ollama serve'
    }
}

function createOllamaModelStep(
    settings: AppSettings,
    status: NativeAiEnvironmentStatus | null
): AiSetupStep {
    const model = settings.ai_ollama_model.trim()
    if (!model) {
        return {
            id: 'ollama_model',
            title: 'Ollamaモデル',
            detail: '使用するOllamaモデル名を設定してください。',
            status: 'todo'
        }
    }

    if (status?.ollama.status === 'ready') {
        return {
            id: 'ollama_model',
            title: 'Ollamaモデル',
            detail: `${model} は利用できます。`,
            status: 'done'
        }
    }

    if (status?.ollama.status === 'model_missing') {
        return {
            id: 'ollama_model',
            title: 'Ollamaモデル',
            detail: `${model} が未ダウンロードです。初回のみ薬局Wi-Fi環境でモデルを取得してください。`,
            status: 'todo',
            command: `ollama pull ${model}`
        }
    }

    return {
        id: 'ollama_model',
        title: 'Ollamaモデル',
        detail: `${model} の有無は、Ollama起動後に状態確認してください。`,
        status: 'warning',
        command: `ollama pull ${model}`
    }
}

function createWhisperConfigStep(
    settings: AppSettings,
    status: NativeAiEnvironmentStatus | null
): AiSetupStep {
    if (settings.ai_whisper_health_url && settings.ai_whisper_transcribe_url) {
        return {
            id: 'whisper_config',
            title: 'Whisper接続設定',
            detail: 'WhisperヘルスURLと文字起こしURLが設定されています。',
            status: 'done'
        }
    }

    return {
        id: 'whisper_config',
        title: 'Whisper接続設定',
        detail: status?.whisper.status === 'not_configured'
            ? 'Whisper系エンジンのURLが未設定です。使用するローカルWhisperサーバーのURLを入力してください。'
            : 'WhisperヘルスURLと文字起こしURLを入力してください。',
        status: 'todo'
    }
}

function createWhisperServerStep(
    settings: AppSettings,
    status: NativeAiEnvironmentStatus | null
): AiSetupStep {
    if (status?.whisper.status === 'ready') {
        return {
            id: 'whisper_server',
            title: 'Whisper起動',
            detail: 'Whisper系エンジンに接続できます。',
            status: 'done'
        }
    }

    return {
        id: 'whisper_server',
        title: 'Whisper起動',
        detail: 'Whisper系エンジンが起動していないか、接続できません。設定したローカルサーバーを起動してください。',
        status: status ? 'todo' : 'warning',
        command: settings.ai_whisper_start_command || undefined
    }
}

function createPerformanceStep(status: NativeAiEnvironmentStatus | null): AiSetupStep {
    if (!status) {
        return {
            id: 'performance',
            title: '処理時間目安',
            detail: '状態確認を実行すると、PC性能と文字起こし時間の目安を表示できます。',
            status: 'warning'
        }
    }

    return {
        id: 'performance',
        title: '処理時間目安',
        detail: status.estimate.message,
        status: 'done'
    }
}
