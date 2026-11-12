/** Startup policy for optional Electron shell preferences, independent of the Host. */
import { DesktopSettingsFile, type DesktopUpdatePreferences } from './settings-file.ts'
import { DEFAULT_DESKTOP_SIDEBAR_FONT_SIZE, type DesktopSidebarFontSize } from './sidebar-font-size.ts'

/** Resolved popup preference; channel failures do not disable a valid popup preference. */
export interface DesktopSettings {
  readonly sidebarFontSize: DesktopSidebarFontSize
  readonly updates: Pick<DesktopUpdatePreferences, 'allowTestAuthPopupWindow'>
}

/**
 * Initialize the shared document explicitly at startup, then resolve the popup preference.
 * @param userData - Electron userData, independent of DSH_HOME.
 * @returns Independent popup and sidebar preferences, using defaults with diagnostics on failure.
 */
export async function readDesktopSettings(userData: string): Promise<DesktopSettings> {
  const file = new DesktopSettingsFile(userData)
  const result = await file.initialize()
  const font = result.kind === 'ready' ? result.sidebarFontSize : undefined
  const sidebarFontSize = font?.kind === 'valid' ? font.value : DEFAULT_DESKTOP_SIDEBAR_FONT_SIZE
  if (font?.kind === 'invalid') {
    try { console.warn(`desktop settings: ${file.path}: using the default sidebar size`, font.error) } catch (_logError) {
      // An unavailable diagnostic sink must not block startup.
    }
  }
  const preference = result.kind === 'ready' ? result.fields.allowTestAuthPopupWindow : undefined
  if (preference?.kind === 'valid') return { sidebarFontSize, updates: { allowTestAuthPopupWindow: preference.value } }
  const error = result.kind === 'error' ? result.error : preference?.kind === 'invalid' ? preference.error : undefined
  if (error) {
    try { console.warn(`desktop settings: ${file.path}: using defaults because settings could not be loaded`, error) } catch (_logError) {
      // Optional popup settings remain disabled even when diagnostic output is unavailable.
    }
  }
  return { sidebarFontSize, updates: { allowTestAuthPopupWindow: false } }
}

/** Tray save result; failed storage operations retain the currently displayed size. */
export type DesktopSidebarFontSizeSaveResult = { readonly status: 'saved' }
  | { readonly status: 'failed'; readonly error: unknown }

/**
 * Save the tray preference through shared settings storage, preserving update preferences.
 * @param userData - Electron userData, independent of DSH_HOME.
 * @param size - Supported sidebar text size in pixels.
 * @returns A completed save or its storage failure; malformed documents are never replaced.
 */
export async function saveDesktopSidebarFontSize(
  userData: string, size: DesktopSidebarFontSize,
): Promise<DesktopSidebarFontSizeSaveResult> {
  try {
    await new DesktopSettingsFile(userData).saveSidebarFontSize(size)
    return { status: 'saved' }
  } catch (error) {
    return { status: 'failed', error }
  }
}
