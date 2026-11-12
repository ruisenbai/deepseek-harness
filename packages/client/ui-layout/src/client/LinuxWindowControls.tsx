/** Transparent window controls mounted above the application and its body portals. */
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { IconCloseOutlineMedium, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { HostObservable, InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { DesktopWindowControls, WindowControlAction } from '../window-controls.ts'
import css from './LinuxWindowControls.module.css'

/** Native state and operations injected by the layout registration. */
export interface WindowControlsInjected {
  hooks: { maximized: HostObservable<boolean> }
  command: DesktopWindowControls['command']
}

/** The locale and native-state shares supplied by the shell overlay registration. */
export type WindowControlsProps = PropsLocale<'window.controls'> & InjectFace<WindowControlsInjected>

/**
 * Render the existing header's window actions without adding a titlebar row.
 * @param props - localized labels and the framework-bound native state.
 * @returns the body portal, outside column clipping and drawer inertness.
 */
export function LinuxWindowControls({ t, useMaximized, command }: WindowControlsProps) {
  const maximized = useMaximized(value => value)
  const [failed, setFailed] = useState(false)
  const run = async (action: WindowControlAction): Promise<void> => {
    setFailed(false)
    try { await command(action) }
    catch (_error) { setFailed(true) }
  }
  const maximizeLabel = t(maximized ? 'restore' : 'maximize')
  return createPortal(<div className={css.controls} data-linux-window-controls role="group" aria-label={t('label')}>
    <Tooltip label={t('minimize')} side="bottom" portal>
      <button type="button" aria-label={t('minimize')} onClick={() => { void run('minimize') }}>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden="true"><path d="M3 8.5h10" /></svg>
      </button>
    </Tooltip>
    <Tooltip label={maximizeLabel} side="bottom" portal>
      <button type="button" aria-label={maximizeLabel} onClick={() => { void run('toggle-maximize') }}>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {maximized ? <><path d="M6 5.5V3.7c0-.66.54-1.2 1.2-1.2h5.1c.66 0 1.2.54 1.2 1.2v5.1c0 .66-.54 1.2-1.2 1.2h-1.8" /><rect x="2.5" y="5.5" width="8" height="8" rx="1.1" /></>
            : <rect x="3.5" y="3.5" width="9" height="9" rx="1.1" />}
        </svg>
      </button>
    </Tooltip>
    <Tooltip label={t('close')} side="bottom" align="end" portal>
      <button type="button" className={css.close} aria-label={t('close')} onClick={() => { void run('close') }}>
        <IconCloseOutlineMedium size={16} />
      </button>
    </Tooltip>
    {failed && <div className={css.failure} role="alert">{t('failed')}</div>}
  </div>, document.body)
}
