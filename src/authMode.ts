export type AuthModeOptions = {
    isTestMode?: boolean
    reportStorageMode?: string
    hasNativeBridge?: boolean
    hasSupabaseConfig?: boolean
}

export function shouldUseLocalAuthMode(options: AuthModeOptions): boolean {
    if (options.isTestMode) return true
    if (options.hasNativeBridge) return true
    if (options.reportStorageMode === 'local') return true
    if (options.reportStorageMode === 'supabase') return false
    return options.hasSupabaseConfig === false
}
