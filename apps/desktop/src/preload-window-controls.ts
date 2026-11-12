/** Isolated native window state and commands for the Linux product document. */
import { ipcRenderer } from 'electron'
import type { DesktopWindowControls } from '@deepseek-ai/dsh-client-ui-layout/src/window-controls.ts'
import { DESKTOP_IPC } from './ipc.ts'

/** @returns a Linux window bridge whose subscriptions end with the document. */
export function createLinuxWindowControls(): DesktopWindowControls {
  let maximized = false
  const listeners = new Set<() => void>()
  const receive = (_event: Electron.IpcRendererEvent, value: unknown): void => {
    if (typeof value !== 'boolean' || value === maximized) return
    maximized = value
    for (const listener of listeners) listener()
  }
  ipcRenderer.on(DESKTOP_IPC.windowMaximized, receive)
  window.addEventListener('pagehide', () => {
    ipcRenderer.off(DESKTOP_IPC.windowMaximized, receive)
    listeners.clear()
  }, { once: true })
  return {
    isMaximized: () => maximized,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    command: action => ipcRenderer.invoke(DESKTOP_IPC.windowCommand, action) as Promise<void>,
  }
}
