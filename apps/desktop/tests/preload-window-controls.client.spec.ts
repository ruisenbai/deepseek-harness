// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { DESKTOP_IPC } from '../src/ipc.ts'
import { createLinuxWindowControls } from '../src/preload-window-controls.ts'

const ipc = vi.hoisted(() => ({ on: vi.fn(), off: vi.fn(), invoke: vi.fn() }))
vi.mock('electron', () => ({ ipcRenderer: ipc }))

afterEach(() => {
  window.dispatchEvent(new Event('pagehide'))
  vi.clearAllMocks()
})

it('publishes native state before notifying, removes listeners, and cleans up at document exit', () => {
  const bridge = createLinuxWindowControls()
  const receive = ipc.on.mock.calls[0]![1] as (event: object, maximized: unknown) => void
  const observed: boolean[] = []
  const off = bridge.subscribe(() => { observed.push(bridge.isMaximized()) })
  expect(bridge.isMaximized()).toBe(false)
  receive({}, true)
  receive({}, true)
  receive({}, 'invalid')
  receive({}, false)
  expect(observed).toEqual([true, false])
  off()
  receive({}, true)
  expect(bridge.isMaximized()).toBe(true)
  expect(observed).toEqual([true, false])
  const late = vi.fn()
  bridge.subscribe(late)
  window.dispatchEvent(new Event('pagehide'))
  expect(ipc.off).toHaveBeenCalledWith(DESKTOP_IPC.windowMaximized, receive)
  receive({}, false)
  expect(late).not.toHaveBeenCalled()
})

it('forwards each window command and preserves rejections for the visible UI', async () => {
  const bridge = createLinuxWindowControls()
  for (const action of ['minimize', 'toggle-maximize', 'close'] as const) await bridge.command(action)
  expect(ipc.invoke.mock.calls).toEqual([
    [DESKTOP_IPC.windowCommand, 'minimize'], [DESKTOP_IPC.windowCommand, 'toggle-maximize'], [DESKTOP_IPC.windowCommand, 'close'],
  ])
  ipc.invoke.mockRejectedValueOnce(new Error('owner unavailable'))
  await expect(bridge.command('minimize')).rejects.toThrow('owner unavailable')
})
