
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey)

if (!hasSupabaseConfig) {
    console.warn('Supabase URL or Anon Key is missing. Supabase-backed features will fail unless local mode is enabled.')
}

export const supabase = createClient(
    supabaseUrl || 'http://127.0.0.1:54321',
    supabaseAnonKey || 'local-demo-anon-key'
)
