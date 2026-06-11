import assert from 'node:assert/strict'
import test from 'node:test'
import { shouldUseLocalAuthMode } from '../src/authMode.ts'

test('uses local auth for native local app even when Supabase config exists', () => {
    assert.equal(shouldUseLocalAuthMode({
        hasNativeBridge: true,
        hasSupabaseConfig: true
    }), true)
})

test('uses local auth for explicit local storage demo mode', () => {
    assert.equal(shouldUseLocalAuthMode({
        reportStorageMode: 'local',
        hasSupabaseConfig: true
    }), true)
})

test('uses local auth when Supabase config is missing and storage is not forced to Supabase', () => {
    assert.equal(shouldUseLocalAuthMode({
        hasSupabaseConfig: false
    }), true)
})

test('keeps Supabase auth when Supabase storage is configured', () => {
    assert.equal(shouldUseLocalAuthMode({
        reportStorageMode: 'supabase',
        hasSupabaseConfig: true
    }), false)
})

test('test mode always uses local auth', () => {
    assert.equal(shouldUseLocalAuthMode({
        isTestMode: true,
        reportStorageMode: 'supabase',
        hasSupabaseConfig: true
    }), true)
})
