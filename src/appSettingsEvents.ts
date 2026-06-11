import type { AppSettings } from './types'

export const APP_SETTINGS_UPDATED_EVENT = 'pharmacy-report:app-settings-updated'

export type AppSettingsUpdatedEvent = Event & {
    detail: AppSettings
}

export const dispatchAppSettingsUpdated = (
    target: EventTarget,
    settings: AppSettings
) => {
    const event = new Event(APP_SETTINGS_UPDATED_EVENT) as AppSettingsUpdatedEvent
    Object.defineProperty(event, 'detail', {
        configurable: false,
        enumerable: true,
        value: settings
    })
    target.dispatchEvent(event)
}

export const isAppSettingsUpdatedEvent = (
    event: Event
): event is AppSettingsUpdatedEvent => {
    return event.type === APP_SETTINGS_UPDATED_EVENT && 'detail' in event
}
