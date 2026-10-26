/** Windows and Linux system tray: window activation and explicit application actions. */

import { Menu, nativeImage, Tray } from 'electron'
import type { DesktopLocale } from './locale.ts'

/** Main-process actions exposed through the tray. */
export interface DesktopTrayOptions {
  /** Multi-size ICO on Windows, application PNG on Linux. */
  readonly iconPath: string
  readonly locale: () => DesktopLocale
  /** Handle primary activation: show on Windows, toggle restore/minimize on Linux. */
  readonly activate: () => void
  /** Show and focus the primary window. */
  readonly open: () => void
  /** Request a confirmed application restart when the platform exposes it. */
  readonly restart?: () => void
  /** Request quit through the same confirmation as every other quit entry. */
  readonly quit: () => void
}

/** Tray icon present for the whole run, not only while the window is hidden. */
export class DesktopTray {
  private tray: Tray | undefined

  /** @param options - Icon path, locale reader, and window and application actions. */
  constructor(private readonly options: DesktopTrayOptions) {
    const tray = new Tray(nativeImage.createFromPath(options.iconPath))
    this.tray = tray
    tray.on('click', () => { options.activate() })
    try { this.relabel() }
    catch (error) { this.dispose(); throw error }
  }

  /** Rebuild the tooltip and context menu in the current locale. */
  relabel(): void {
    const tray = this.tray
    if (tray === undefined) return
    const { messages } = this.options.locale()
    tray.setToolTip(messages.aboutProduct)
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: messages.openApplication, click: () => { this.options.open() } },
      ...this.options.restart === undefined ? [] : [
        { label: messages.restartApplication, click: () => { this.options.restart?.() } },
      ],
      { type: 'separator' },
      { label: messages.quitApplication, click: () => { this.options.quit() } },
    ]))
  }

  /** Remove the icon; called once the quit is confirmed so no dead icon outlives the process. */
  dispose(): void {
    const tray = this.tray
    this.tray = undefined
    tray?.destroy()
  }
}
