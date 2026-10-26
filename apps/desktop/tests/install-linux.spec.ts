/** User installation copies complete applications before switching the desktop entry. */

import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, onTestFinished } from 'vitest'
import { installLinuxDesktop } from '../scripts/install-linux.ts'

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'desktop-linux-install-'))
  onTestFinished(async () => { await rm(root, { recursive: true, force: true }) })
  const source = join(root, 'source')
  const prefix = join(root, 'User 中文 with spaces')
  mkdirSync(join(source, 'resources'), { recursive: true })
  writeFileSync(join(source, 'deepseek-harness'), 'prepared executable')
  chmodSync(join(source, 'deepseek-harness'), 0o755)
  writeFileSync(join(source, 'resources', 'app.asar'), 'prepared application')
  writeFileSync(join(source, 'resources', 'icon.png'), 'application icon')
  return { source, prefix }
}

it('publishes a launcher using a complete copy at a path containing spaces', () => {
  const f = fixture()
  const installed = installLinuxDesktop(f)
  expect(readFileSync(join(installed.directory, 'resources', 'app.asar'), 'utf8')).toBe('prepared application')
  expect(readFileSync(installed.desktopFile, 'utf8')).toContain(`Exec="${join(installed.directory, 'deepseek-harness')}" %U`)
  expect(readFileSync(installed.desktopFile, 'utf8')).toContain(`Icon=${join(installed.directory, 'resources', 'icon.png')}`)
  expect(readFileSync(installed.desktopFile, 'utf8')).toContain('StartupWMClass=com.deepseek.harness')
  expect(readdirSync(join(f.prefix, 'share', 'applications'))).toEqual(['com.deepseek.harness.desktop'])
})

it('retains the old application when replacing the desktop entry', () => {
  const f = fixture()
  const previous = installLinuxDesktop(f)
  writeFileSync(join(f.source, 'resources', 'app.asar'), 'updated application')
  const installed = installLinuxDesktop(f)
  expect(readFileSync(join(previous.directory, 'resources', 'app.asar'), 'utf8')).toBe('prepared application')
  expect(readFileSync(join(installed.directory, 'resources', 'app.asar'), 'utf8')).toBe('updated application')
  expect(readFileSync(installed.desktopFile, 'utf8')).toContain(installed.directory)
})

it('leaves the installed launcher intact when the next build is incomplete', () => {
  const f = fixture()
  const previous = installLinuxDesktop(f)
  const entry = readFileSync(previous.desktopFile, 'utf8')
  expect(() => installLinuxDesktop({ ...f, source: join(f.source, 'missing') })).toThrow()
  expect(readFileSync(previous.desktopFile, 'utf8')).toBe(entry)
})

it('removes an unpublished copy when desktop entry publication fails', () => {
  const f = fixture()
  const desktopFile = join(f.prefix, 'share', 'applications', 'com.deepseek.harness.desktop')
  mkdirSync(desktopFile, { recursive: true })
  expect(() => installLinuxDesktop(f)).toThrow()
  expect(existsSync(desktopFile)).toBe(true)
  expect(readdirSync(join(f.prefix, 'opt', 'deepseek-harness'))).toEqual([])
})
