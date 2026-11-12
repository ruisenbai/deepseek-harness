/** Applies main-owned sidebar typography without changing document zoom or Web preferences. */

import { ipcRenderer } from 'electron'
import { DESKTOP_IPC } from './ipc.ts'
import { DEFAULT_DESKTOP_SIDEBAR_FONT_SIZE, isDesktopSidebarFontSize } from './sidebar-font-size.ts'

/** Subscribe before load completion; a fresh main-process report restores the preference after every reload. */
export function syncSidebarFontSize(): void {
  if (process.platform !== 'linux') return
  let size = DEFAULT_DESKTOP_SIDEBAR_FONT_SIZE
  const apply = (): void => {
    const root = document.documentElement as HTMLElement | null
    if (root === null) return
    root.style.setProperty('--dsh-sidebar-font-size', `${size}px`)
    root.style.setProperty('--dsh-sidebar-line-height', `${size * 1.5}px`)
  }
  const receive = (_event: Electron.IpcRendererEvent, value: unknown): void => {
    if (!isDesktopSidebarFontSize(value)) return
    size = value
    apply()
  }
  ipcRenderer.on(DESKTOP_IPC.sidebarFontSize, receive)
  window.addEventListener('DOMContentLoaded', apply, { once: true })
  window.addEventListener('pagehide', () => {
    ipcRenderer.off(DESKTOP_IPC.sidebarFontSize, receive)
    window.removeEventListener('DOMContentLoaded', apply)
  }, { once: true })
  apply()
}
