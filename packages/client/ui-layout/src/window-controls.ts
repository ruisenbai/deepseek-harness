/** Linux window operations supplied by the owned Electron application preload. */
export type WindowControlAction = 'minimize' | 'toggle-maximize' | 'close'

/** Optional desktop carrier; ordinary browser documents have no window controls. */
export interface DesktopWindowControls {
  /** @returns the latest native maximized state, including system-initiated changes. */
  isMaximized(): boolean
  /**
   * Observe native maximization changes.
   * @param listener - reads the updated state after notification.
   * @returns a listener disposer.
   */
  subscribe(listener: () => void): () => void
  /**
   * Operate the owning native window; close follows its existing tray policy.
   * @param action - requested window operation.
   * @returns completion, rejecting when the desktop owner refuses the request.
   */
  command(action: WindowControlAction): Promise<void>
}
