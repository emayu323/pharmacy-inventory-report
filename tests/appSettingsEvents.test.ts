import assert from 'node:assert/strict'
import test from 'node:test'
import {
    APP_SETTINGS_UPDATED_EVENT,
    dispatchAppSettingsUpdated,
    isAppSettingsUpdatedEvent
} from '../src/appSettingsEvents.ts'
import type { AppSettings } from '../src/types.ts'

test('dispatches app settings updates with sanitized settings payload', () => {
    const target = new EventTarget()
    const received: AppSettings[] = []

    target.addEventListener(APP_SETTINGS_UPDATED_EVENT, (event) => {
        assert.equal(isAppSettingsUpdatedEvent(event), true)
        if (isAppSettingsUpdatedEvent(event)) {
            received.push(event.detail)
        }
    })

    dispatchAppSettingsUpdated(target, {
        ...baseSettings,
        pin_enabled: true,
        lock_timeout_minutes: 20
    })

    assert.equal(received.length, 1)
    assert.equal(received[0]?.pin_enabled, true)
    assert.equal(received[0]?.lock_timeout_minutes, 20)
})

const baseSettings: AppSettings = {
    pharmacy_name: '',
    pharmacy_address: '',
    pharmacy_tel: '',
    pharmacy_fax: '',
    google_drive_folder: '',
    last_app_version: '',
    ai_mode_enabled: false,
    ai_ollama_url: 'http://127.0.0.1:11434',
    ai_ollama_model: '',
    ai_auto_start_enabled: false,
    ai_ollama_start_command: 'ollama serve',
    pin_enabled: false,
    lock_timeout_minutes: 15
}
