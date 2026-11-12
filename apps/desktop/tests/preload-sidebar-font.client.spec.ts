// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { DESKTOP_IPC } from '../src/ipc.ts'
import { syncSidebarFontSize } from '../src/preload-sidebar-font.ts'

const ipc = vi.hoisted(() => ({
  on: vi.fn<(channel: string, listener: (event: unknown, size: unknown) => void) => void>(),
  off: vi.fn(),
}))
vi.mock('electron', () => ({ ipcRenderer: ipc }))

afterEach(() => {
  window.dispatchEvent(new Event('pagehide'))
  vi.unstubAllGlobals()
  document.documentElement.style.removeProperty('--dsh-sidebar-font-size')
  document.documentElement.style.removeProperty('--dsh-sidebar-line-height')
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

it.each(['darwin', 'win32'] as const)('leaves typography unchanged on %s', (platform) => {
  vi.spyOn(process, 'platform', 'get').mockReturnValue(platform)
  syncSidebarFontSize()
  expect(ipc.on).not.toHaveBeenCalled()
  expect(document.documentElement.style.getPropertyValue('--dsh-sidebar-font-size')).toBe('')
})

it('applies supported sizes and line heights without changing document zoom', () => {
  vi.spyOn(process, 'platform', 'get').mockReturnValue('linux')
  syncSidebarFontSize()
  expect(ipc.on).toHaveBeenCalledExactlyOnceWith(DESKTOP_IPC.sidebarFontSize, expect.any(Function))
  const receive = ipc.on.mock.calls[0]![1]
  for (const size of [20, 19, 18, 17, 14, 15, 16]) {
    receive({}, size)
    expect(document.documentElement.style.getPropertyValue('--dsh-sidebar-font-size')).toBe(`${size}px`)
    expect(document.documentElement.style.getPropertyValue('--dsh-sidebar-line-height')).toBe(`${size * 1.5}px`)
  }
  expect(document.documentElement.style.getPropertyValue('zoom')).toBe('')
  window.dispatchEvent(new Event('pagehide'))
  expect(ipc.off).toHaveBeenCalledExactlyOnceWith(DESKTOP_IPC.sidebarFontSize, receive)
})

it('retains the current size when IPC contains an unsupported value', () => {
  vi.spyOn(process, 'platform', 'get').mockReturnValue('linux')
  syncSidebarFontSize()
  const receive = ipc.on.mock.calls[0]![1]
  receive({}, 18)
  for (const invalid of [null, '20', 15.5, 0, 200, Number.NaN, {}]) receive({}, invalid)
  expect(document.documentElement.style.getPropertyValue('--dsh-sidebar-font-size')).toBe('18px')
})

it('retains a report received before the parser creates the document root', () => {
  vi.spyOn(process, 'platform', 'get').mockReturnValue('linux')
  const root = document.documentElement
  const earlyDocument: { documentElement: HTMLElement | null } = { documentElement: null }
  vi.stubGlobal('document', earlyDocument)
  syncSidebarFontSize()
  ipc.on.mock.calls[0]![1]({}, 20)
  earlyDocument.documentElement = root
  window.dispatchEvent(new Event('DOMContentLoaded'))
  expect(root.style.getPropertyValue('--dsh-sidebar-font-size')).toBe('20px')
  expect(root.style.getPropertyValue('--dsh-sidebar-line-height')).toBe('30px')
})
