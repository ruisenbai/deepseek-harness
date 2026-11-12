/** Supported sizes for the Linux tray's device-local sidebar text preference. */

export const DESKTOP_SIDEBAR_FONT_SIZES = [14, 15, 16, 17, 18, 19, 20] as const

/** Pixel size accepted by the Linux tray and its persisted preference. */
export type DesktopSidebarFontSize = typeof DESKTOP_SIDEBAR_FONT_SIZES[number]

/** Initial sidebar size when no device preference has been saved. */
export const DEFAULT_DESKTOP_SIDEBAR_FONT_SIZE: DesktopSidebarFontSize = 16

/**
 * Validate a size read from settings or renderer IPC.
 * @param value - Untrusted persisted or process-crossing value.
 * @returns Whether the value is one of the supported pixel sizes.
 */
export function isDesktopSidebarFontSize(value: unknown): value is DesktopSidebarFontSize {
  return DESKTOP_SIDEBAR_FONT_SIZES.some(size => size === value)
}
