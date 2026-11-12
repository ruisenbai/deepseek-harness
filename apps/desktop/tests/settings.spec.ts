import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import * as fs from 'node:fs'
import * as fsp from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, onTestFinished, vi } from 'vitest'
import { readDesktopSettings, saveDesktopSidebarFontSize } from '../src/settings.ts'

vi.mock('node:fs/promises', async importOriginal => ({ ...await importOriginal<typeof import('node:fs/promises')>() }))

beforeEach(() => { vi.spyOn(console, 'warn').mockImplementation(() => {}) })
afterEach(() => { vi.restoreAllMocks() })

function fixture() {
  const userData = mkdtempSync(join(tmpdir(), 'dsh-desktop-settings-'))
  onTestFinished(() => { rmSync(userData, { recursive: true, force: true }) })
  const directory = join(userData, 'desktop')
  mkdirSync(directory)
  return { userData, path: join(directory, 'settings.json') }
}

it('creates a discoverable default file on first launch without touching other preferences', async () => {
  const { userData, path } = fixture()
  rmSync(join(userData, 'desktop'), { recursive: true })
  writeFileSync(join(userData, 'keybindings.json'), 'existing shortcuts\n')
  expect(await readDesktopSettings(userData)).toEqual({ sidebarFontSize: 16, updates: { allowTestAuthPopupWindow: false } })
  expect(readFileSync(path, 'utf8')).toBe('{\n  "updates": {\n    "allowTestAuthPopupWindow": false\n  }\n}\n')
  expect(readFileSync(join(userData, 'keybindings.json'), 'utf8')).toBe('existing shortcuts\n')
})

it.each(['{}', '{"updates": {}}', '{"other": 1, "updates": {"other": true}}'])('defaults an older document without rewriting it: %s', async (raw) => {
  const { userData, path } = fixture()
  writeFileSync(path, raw)
  expect((await readDesktopSettings(userData)).updates.allowTestAuthPopupWindow).toBe(false)
  expect(readFileSync(path, 'utf8')).toBe(raw)
})

it('loads explicit opt-in and opt-out on the next read without changing an earlier process snapshot', async () => {
  const { userData, path } = fixture()
  for (const allow of [true, false]) {
    const raw = JSON.stringify({ updates: { allowTestAuthPopupWindow: allow }, custom: 'preserve' })
    writeFileSync(path, raw)
    expect((await readDesktopSettings(userData)).updates.allowTestAuthPopupWindow).toBe(allow)
    expect(readFileSync(path, 'utf8')).toBe(raw)
  }
  const previous = await readDesktopSettings(userData)
  writeFileSync(path, '{"updates":{"allowTestAuthPopupWindow":true}}')
  expect(previous.updates.allowTestAuthPopupWindow).toBe(false)
  expect((await readDesktopSettings(userData)).updates.allowTestAuthPopupWindow).toBe(true)
})

it.each(['', '{', 'null', '[]', '{"updates":null}', '{"updates":[]}',
  '{"updates":{"allowTestAuthPopupWindow":"false"}}', '{"updates":{"allowTestAuthPopupWindow":1}}',
  '{"updates":{"allowTestAuthPopupWindow":null}}'])('reports invalid settings with their path and preserves the original: %s', async (raw) => {
  const { userData, path } = fixture()
  writeFileSync(path, raw)
  expect((await readDesktopSettings(userData)).updates.allowTestAuthPopupWindow).toBe(false)
  expect(console.warn).toHaveBeenCalledWith(expect.stringContaining(path), expect.any(Error))
  expect(readFileSync(path, 'utf8')).toBe(raw)
})

it('reports filesystem errors instead of replacing unreadable settings', async () => {
  const { userData, path } = fixture()
  mkdirSync(path)
  expect((await readDesktopSettings(userData)).updates.allowTestAuthPopupWindow).toBe(false)
  expect(console.warn).toHaveBeenCalledWith(expect.stringContaining(path), expect.any(Error))
  expect(fs.statSync(path).isDirectory()).toBe(true)
})

it.each(['mkdir', 'writeFile'] as const)('continues with disabled popups when %s fails', async (operation) => {
  const { userData, path } = fixture()
  const failure = Object.assign(new Error('settings creation denied'), { code: 'EACCES' })
  vi.spyOn(fsp, operation).mockRejectedValue(failure)
  expect((await readDesktopSettings(userData)).updates.allowTestAuthPopupWindow).toBe(false)
  expect(console.warn).toHaveBeenCalledWith(expect.stringContaining(path), expect.objectContaining({ cause: failure }))
})

it('continues with defaults even when warning output fails', async () => {
  const { userData, path } = fixture()
  writeFileSync(path, '{')
  vi.mocked(console.warn).mockImplementation(() => { throw new Error('output unavailable') })
  expect((await readDesktopSettings(userData)).updates.allowTestAuthPopupWindow).toBe(false)
  expect(readFileSync(path, 'utf8')).toBe('{')
})


it.each([14, 15, 16, 17, 18, 19, 20] as const)('persists and restores the tray sidebar size %ipx without changing update settings', async (size) => {
  const { userData, path } = fixture()
  writeFileSync(path, '{"custom":3,"updates":{"allowTestAuthPopupWindow":true,"channel":"nightly"}}')
  expect(await saveDesktopSidebarFontSize(userData, size)).toEqual({ status: 'saved' })
  expect(await readDesktopSettings(userData)).toEqual({ sidebarFontSize: size, updates: { allowTestAuthPopupWindow: true } })
  expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({
    custom: 3, sidebarFontSize: size, updates: { allowTestAuthPopupWindow: true, channel: 'nightly' },
  })
})

it.each([null, '16', 13, 21, 16.5])('defaults an invalid sidebar size independently from popup settings: %s', async (size) => {
  const { userData, path } = fixture()
  const raw = JSON.stringify({ sidebarFontSize: size, updates: { allowTestAuthPopupWindow: true } })
  writeFileSync(path, raw)
  expect(await readDesktopSettings(userData)).toEqual({ sidebarFontSize: 16, updates: { allowTestAuthPopupWindow: true } })
  expect(console.warn).toHaveBeenCalledWith(expect.stringContaining(path), expect.any(Error))
  expect(readFileSync(path, 'utf8')).toBe(raw)
})

it('reports a failed tray save without replacing malformed user settings', async () => {
  const { userData, path } = fixture()
  writeFileSync(path, '{broken')
  const result = await saveDesktopSidebarFontSize(userData, 17)
  expect(result.status).toBe('failed')
  expect(result).toHaveProperty('error', expect.any(Error))
  expect(readFileSync(path, 'utf8')).toBe('{broken')
})
