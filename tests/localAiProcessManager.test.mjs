import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'
import {
    buildAiProcessDefinitions,
    createLocalAiProcessManager,
    parseCommandLine
} from '../electron/localAiProcessManager.mjs'

test('parses command lines without using a shell', () => {
    assert.deepEqual(parseCommandLine('ollama serve'), {
        command: 'ollama',
        args: ['serve']
    })
    assert.deepEqual(parseCommandLine('"/Applications/My Tool/bin/server" --port 8178'), {
        command: '/Applications/My Tool/bin/server',
        args: ['--port', '8178']
    })
    assert.equal(parseCommandLine('   '), null)
})

test('builds AI process definitions only when AI auto start is enabled', () => {
    const base = {
        ai_mode_enabled: true,
        ai_auto_start_enabled: true,
        ai_ollama_start_command: 'ollama serve',
        ai_whisper_start_command: 'whisper-server --port 8178'
    }

    assert.deepEqual(buildAiProcessDefinitions(base).map(item => item.id), ['ollama', 'whisper'])
    assert.deepEqual(buildAiProcessDefinitions({ ...base, ai_mode_enabled: false }), [])
    assert.deepEqual(buildAiProcessDefinitions({ ...base, ai_auto_start_enabled: false }), [])
    assert.deepEqual(buildAiProcessDefinitions({ ...base, ai_whisper_start_command: '' }).map(item => item.id), ['ollama'])
})

test('starts configured local AI processes once and stops owned processes', () => {
    const spawned = []
    const fakeSpawn = (command, args, options) => {
        const child = new EventEmitter()
        child.pid = 1200 + spawned.length
        child.killed = false
        child.kill = () => {
            child.killed = true
            child.emit('exit', 0, null)
            return true
        }
        child.unref = () => undefined
        spawned.push({ command, args, options, child })
        return child
    }

    const manager = createLocalAiProcessManager({
        spawnImpl: fakeSpawn,
        logger: silentLogger
    })

    const settings = {
        ai_mode_enabled: true,
        ai_auto_start_enabled: true,
        ai_ollama_start_command: 'ollama serve',
        ai_whisper_start_command: '"whisper server" --host 127.0.0.1'
    }

    const first = manager.startFromSettings(settings)
    const second = manager.startFromSettings(settings)

    assert.equal(spawned.length, 2)
    assert.deepEqual(spawned[0].args, ['serve'])
    assert.deepEqual(spawned[1].command, 'whisper server')
    assert.deepEqual(spawned[1].args, ['--host', '127.0.0.1'])
    assert.equal(spawned[0].options.shell, false)
    assert.equal(first.processes.every(item => item.status === 'running'), true)
    assert.equal(second.processes.every(item => item.status === 'running'), true)

    manager.stopAll()
    assert.equal(spawned.every(item => item.child.killed), true)
})

const silentLogger = {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined
}
