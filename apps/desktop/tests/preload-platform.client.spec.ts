// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { DESKTOP_IPC } from '../src/ipc.ts'
import { markDocumentPlatform, syncWindowFullscreen } from '../src/preload-platform.ts'
import { WINDOWS_TITLEBAR_HEIGHT } from '../src/windows-layout.ts'

const on = vi.hoisted(() => vi.fn())
vi.mock('electron', () => ({ ipcRenderer: { on } }))

function markLinux() {
  vi.stubGlobal('process', { ...process, platform: 'linux', isMainFrame: true })
  vi.stubGlobal('location', new URL('dsh-app://app/'))
  markDocumentPlatform()
}

afterEach(() => {
  window.dispatchEvent(new Event('pagehide'))
  delete document.documentElement.dataset.fullscreen
  delete document.documentElement.dataset.platform
  delete document.documentElement.dataset.linuxTitlebar
  delete document.documentElement.dataset.linuxControlsStart
  document.documentElement.style.removeProperty('--dsh-linux-titlebar-height')
  for (const edge of ['start', 'end', 'height']) document.documentElement.style.removeProperty(`--dsh-linux-controls-${edge}`)
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  on.mockClear()
})

it.each(['freebsd'] as const)('subscribes no fullscreen channel on %s', (platform) => {
  vi.spyOn(process, 'platform', 'get').mockReturnValue(platform)
  syncWindowFullscreen()
  expect(on).not.toHaveBeenCalled()
})

it.each(['darwin', 'win32', 'linux'] as const)('mirrors the sent fullscreen state onto html[data-fullscreen] on %s', (platform) => {
  vi.spyOn(process, 'platform', 'get').mockReturnValue(platform)
  syncWindowFullscreen()
  expect(on).toHaveBeenCalledExactlyOnceWith(DESKTOP_IPC.windowFullscreen, expect.any(Function))
  const handler = on.mock.calls[0]?.[1] as (event: unknown, fullscreen: boolean) => void
  handler({}, true)
  expect(document.documentElement.dataset.fullscreen).toBe('true')
  handler({}, false)
  expect(document.documentElement.dataset.fullscreen).toBeUndefined()
  // A repeated windowed report stays a no-op rather than toggling the flag.
  handler({}, false)
  expect(document.documentElement.dataset.fullscreen).toBeUndefined()
})

it.each(['darwin', 'win32', 'linux'] as const)('marks %s and reserves space for Linux product buttons', (platform) => {
  vi.stubGlobal('process', { ...process, platform, isMainFrame: true })
  vi.stubGlobal('location', new URL('dsh-app://app/'))
  markDocumentPlatform()
  expect(document.documentElement.dataset.platform).toBe(platform)
  expect(document.documentElement.hasAttribute('data-linux-titlebar')).toBe(platform === 'linux')
  expect(document.documentElement.style.getPropertyValue('--dsh-linux-titlebar-height'))
    .toBe(platform === 'linux' ? `${WINDOWS_TITLEBAR_HEIGHT}px` : '')
})

it('reserves only the right-hand control group and releases it in fullscreen', async () => {
  const root = document.documentElement
  markLinux()
  expect(root.style.getPropertyValue('--dsh-linux-controls-start')).toBe('0px')
  expect(root.style.getPropertyValue('--dsh-linux-controls-end')).toBe('104px')
  expect(root.style.getPropertyValue('--dsh-linux-controls-height')).toBe('40px')
  root.dataset.fullscreen = 'true'
  await vi.waitFor(() => { expect(root.style.getPropertyValue('--dsh-linux-controls-end')).toBe('0px') })
  expect(root.style.getPropertyValue('--dsh-linux-controls-height')).toBe('0px')
  delete root.dataset.fullscreen
  await vi.waitFor(() => { expect(root.style.getPropertyValue('--dsh-linux-controls-end')).toBe('104px') })
})

it('stops publishing geometry when the document leaves', async () => {
  markLinux()
  window.dispatchEvent(new Event('pagehide'))
  document.documentElement.dataset.fullscreen = 'true'
  await Promise.resolve()
  expect(document.documentElement.style.getPropertyValue('--dsh-linux-controls-end')).toBe('104px')
})

it.each([
  ['dsh-app://app/', false], ['https://example.test/', true], ['dsh-app://shell/', true],
] as const)('reserves no Linux application caption in %s with mainFrame=%s', (url, isMainFrame) => {
  vi.stubGlobal('process', { ...process, platform: 'linux', isMainFrame })
  vi.stubGlobal('location', new URL(url))
  markDocumentPlatform()
  expect(document.documentElement.hasAttribute('data-linux-titlebar')).toBe(false)
})
