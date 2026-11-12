/** Windows and Linux system tray: window activation and explicit application actions. */

import { Menu, nativeImage, Tray, type MenuItemConstructorOptions } from 'electron'
import { formatDesktopMessage, type DesktopLocale } from './locale.ts'
import { DEFAULT_DESKTOP_SIDEBAR_FONT_SIZE, DESKTOP_SIDEBAR_FONT_SIZES, type DesktopSidebarFontSize } from './sidebar-font-size.ts'

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
  /** Linux-only device preference; changes are published after successful persistence. */
  readonly sidebarFont?: {
    readonly size: () => DesktopSidebarFontSize
    readonly saving: () => boolean
    readonly change: (size: DesktopSidebarFontSize) => void
  }
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
    const font = this.options.sidebarFont
    const settings: MenuItemConstructorOptions[] = []
    if (font !== undefined) {
      const size = font.size()
      const index = DESKTOP_SIDEBAR_FONT_SIZES.indexOf(size)
      const smaller = DESKTOP_SIDEBAR_FONT_SIZES[index - 1]
      const larger = DESKTOP_SIDEBAR_FONT_SIZES[index + 1]
      const saving = font.saving()
      settings.push({ label: messages.traySettings, submenu: [{
        label: formatDesktopMessage(messages.sidebarTextSize, { size: String(size) }),
        submenu: [
          { label: messages.sidebarTextIncrease, enabled: !saving && larger !== undefined,
            click: () => { if (larger !== undefined) font.change(larger) } },
          { label: messages.sidebarTextDecrease, enabled: !saving && smaller !== undefined,
            click: () => { if (smaller !== undefined) font.change(smaller) } },
          { label: messages.sidebarTextReset, enabled: !saving && size !== DEFAULT_DESKTOP_SIDEBAR_FONT_SIZE,
            click: () => { font.change(DEFAULT_DESKTOP_SIDEBAR_FONT_SIZE) } },
        ],
      }] })
    }
    tray.setToolTip(messages.aboutProduct)
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: messages.openApplication, click: () => { this.options.open() } },
      ...this.options.restart === undefined ? [] : [
        { label: messages.restartApplication, click: () => { this.options.restart?.() } },
      ],
      ...settings,
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
