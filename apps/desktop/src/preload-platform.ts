/** Marks the document root with the host platform so shared Web UI CSS can scope desktop-only rules. */

import { ipcRenderer } from 'electron'
import { DESKTOP_IPC, SCHEME } from './ipc.ts'
import { WINDOWS_TITLEBAR_HEIGHT } from './windows-layout.ts'

/** Publishes the custom controls' 92px group and 12px right inset. */
function syncLinuxControls(root: HTMLElement): void {
  const sync = (): void => {
    const visible = !root.hasAttribute('data-fullscreen')
    root.style.setProperty('--dsh-linux-controls-start', '0px')
    root.style.setProperty('--dsh-linux-controls-end', visible ? '104px' : '0px')
    root.style.setProperty('--dsh-linux-controls-height', visible ? '40px' : '0px')
  }
  sync()
  const observer = new MutationObserver(sync)
  observer.observe(root, { attributes: true, attributeFilter: ['data-fullscreen'] })
  window.addEventListener('pagehide', () => {
    observer.disconnect()
  }, { once: true })
}

/**
 * Sets `data-platform` (e.g. `darwin`) on `<html>`, deferring to DOMContentLoaded
 * when the preload runs before the document root exists. The Linux application
 * publishes custom-button insets for its existing header rows.
 */
export function markDocumentPlatform(): void {
  const mark = (): void => {
    const root = document.documentElement
    root.dataset.platform = process.platform
    if (process.platform === 'linux' && process.isMainFrame
      && location.protocol === `${SCHEME}:` && location.hostname === 'app') {
      root.dataset.linuxTitlebar = ''
      root.style.setProperty('--dsh-linux-titlebar-height', `${WINDOWS_TITLEBAR_HEIGHT}px`)
      syncLinuxControls(root)
    }
  }
  // lib.dom types documentElement non-null, but a preload runs before the
  // document root exists.
  const root = document.documentElement as HTMLElement | null
  if (root === null) window.addEventListener('DOMContentLoaded', mark, { once: true })
  else mark()
}

/**
 * Mirrors the desktop window's fullscreen state onto `<html data-fullscreen>` so
 * CSS drops the clearance for hidden native window controls. The main
 * process sends the state on every transition and after each load.
 */
export function syncWindowFullscreen(): void {
  if (process.platform !== 'darwin' && process.platform !== 'win32' && process.platform !== 'linux') return
  ipcRenderer.on(DESKTOP_IPC.windowFullscreen, (_event, fullscreen: boolean) => {
    const root = document.documentElement as HTMLElement | null
    if (root === null) return
    if (fullscreen) root.dataset.fullscreen = 'true'
    else delete root.dataset.fullscreen
  })
}
