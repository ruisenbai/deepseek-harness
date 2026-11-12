import type { MenuItemConstructorOptions } from 'electron'
import { afterEach, expect, it, vi } from 'vitest'
import { resolveDesktopLocale } from '../src/locale.ts'
import { DesktopTray } from '../src/tray.ts'
import type { DesktopSidebarFontSize } from '../src/sidebar-font-size.ts'

const native = await vi.hoisted(async () => {
  const { EventEmitter } = await import('node:events')
  const trays: FakeTray[] = []
  class FakeTray extends EventEmitter {
    readonly setToolTip = vi.fn()
    readonly setContextMenu = vi.fn()
    readonly destroy = vi.fn()
    constructor(readonly image: unknown) { super(); trays.push(this) }
  }
  const menus: MenuItemConstructorOptions[][] = []
  return {
    trays, FakeTray, menus,
    createFromPath: vi.fn((path: string) => ({ path })),
    buildFromTemplate: vi.fn((template: MenuItemConstructorOptions[]) => { menus.push(template); return { template } }),
  }
})
vi.mock('electron', () => ({
  Tray: native.FakeTray,
  nativeImage: { createFromPath: native.createFromPath },
  Menu: { buildFromTemplate: native.buildFromTemplate },
}))

afterEach(() => { native.trays.length = 0; native.menus.length = 0; vi.clearAllMocks() })

function setup(locale = 'en', withRestart = false, withFont = false) {
  let current = resolveDesktopLocale(locale)
  const activate = vi.fn()
  const open = vi.fn()
  const restart = vi.fn()
  const quit = vi.fn()
  let size: DesktopSidebarFontSize = 16
  let saving = false
  const change = vi.fn((next: DesktopSidebarFontSize) => { size = next })
  const tray = new DesktopTray({ iconPath: 'C:/app/resources/tray.ico', locale: () => current,
    activate, open, quit, ...withRestart ? { restart } : {},
    ...withFont ? { sidebarFont: { size: () => size, saving: () => saving, change } } : {} })
  return { tray, activate, open, restart, quit, change, native: native.trays[0]!,
    setSize: (next: DesktopSidebarFontSize) => { size = next },
    setSaving: (next: boolean) => { saving = next },
    setLocale: (next: string) => { current = resolveDesktopLocale(next) } }
}

function labels(menu: MenuItemConstructorOptions[]): (string | undefined)[] {
  return menu.map(item => item.type === 'separator' ? 'separator' : item.label)
}

function fontActions(): MenuItemConstructorOptions[] {
  const settings = native.menus.at(-1)![2]?.submenu
  if (!Array.isArray(settings)) throw new Error('missing settings submenu')
  const actions = settings[0]?.submenu
  if (!Array.isArray(actions)) throw new Error('missing font actions')
  return actions
}

interface MenuSnapshot {
  label: string | undefined
  type: string | undefined
  enabled: boolean | undefined
  submenu?: MenuSnapshot[]
}

function snapshot(menu: MenuItemConstructorOptions[]): MenuSnapshot[] {
  return menu.map(({ label, type, enabled, submenu }) => ({
    label, type, enabled, ...Array.isArray(submenu) ? { submenu: snapshot(submenu) } : {},
  }))
}

it.each(['en', 'zh'])('shows localized sidebar settings and their current size (%s)', async (language) => {
  const f = setup(language, true, true)
  await expect(JSON.stringify(snapshot(native.menus[0]!), null, 2) + '\n')
    .toMatchFileSnapshot(`./expected/tray-sidebar-linux-${language}.json`)
  const actions = fontActions()
  ;(actions[0] as { click: () => void }).click()
  expect(f.change).toHaveBeenLastCalledWith(17)
  ;(actions[1] as { click: () => void }).click()
  expect(f.change).toHaveBeenLastCalledWith(15)
  ;(actions[2] as { click: () => void }).click()
  expect(f.change).toHaveBeenLastCalledWith(16)
  expect(f.quit).not.toHaveBeenCalled()
  expect(f.restart).not.toHaveBeenCalled()
})

it.each([14, 15, 16, 17, 18, 19, 20] as const)('disables unavailable actions at %ipx and all font actions during a save', (size) => {
  const f = setup('en', true, true)
  f.setSize(size)
  f.tray.relabel()
  const actions = fontActions()
  expect(actions.map(item => item.enabled)).toEqual([size < 20, size > 14, size !== 16])
  if (size === 20) {
    ;(actions[0] as { click: () => void }).click()
    expect(f.change).not.toHaveBeenCalled()
  }
  if (size === 14) {
    ;(actions[1] as { click: () => void }).click()
    expect(f.change).not.toHaveBeenCalled()
  }
  f.setSaving(true)
  f.tray.relabel()
  expect(fontActions().map(item => item.enabled)).toEqual([false, false, false])
})

it('shows the application icon with its name as the tooltip and an Open / Quit menu', () => {
  const f = setup()
  expect(native.createFromPath).toHaveBeenCalledWith('C:/app/resources/tray.ico')
  expect(f.native.image).toEqual({ path: 'C:/app/resources/tray.ico' })
  expect(f.native.setToolTip).toHaveBeenCalledWith('DeepSeek Harness')
  expect(labels(native.menus[0]!)).toEqual(['Open DeepSeek Harness', 'separator', 'Quit DeepSeek Harness'])
  expect(f.native.setContextMenu).toHaveBeenCalledWith({ template: native.menus[0] })
})

it('keeps primary activation separate from the explicit Open and Quit menu actions', () => {
  const f = setup()
  f.native.emit('click')
  expect(f.activate).toHaveBeenCalledOnce()
  expect(f.open).not.toHaveBeenCalled()
  const menu = native.menus[0]!
  ;(menu[0] as { click: () => void }).click()
  ;(menu[2] as { click: () => void }).click()
  expect(f.open).toHaveBeenCalledOnce()
  expect(f.quit).toHaveBeenCalledOnce()
})

it.each(['en', 'zh'])('offers a localized Linux restart entry (%s)', async (language) => {
  const f = setup(language, true)
  const menu = native.menus[0]!
  await expect(JSON.stringify(labels(menu), null, 2) + '\n').toMatchFileSnapshot(`./expected/tray-linux-${language}.json`)
  ;(menu[1] as { click: () => void }).click()
  expect(f.restart).toHaveBeenCalledOnce()
  expect(f.quit).not.toHaveBeenCalled()
})

it('removes the icon if its initial menu cannot be created', () => {
  const failure = new Error('tray menu unavailable')
  native.buildFromTemplate.mockImplementationOnce(() => { throw failure })
  expect(() => setup()).toThrow(failure)
  expect(native.trays[0]!.destroy).toHaveBeenCalledOnce()
})

it('relabels the menu in the current locale and ignores relabel after disposal', () => {
  const f = setup()
  f.setLocale('zh')
  f.tray.relabel()
  expect(labels(native.menus[1]!)).toEqual(['打开 DeepSeek Harness', 'separator', '退出 DeepSeek Harness'])
  f.tray.dispose()
  f.tray.dispose()
  expect(f.native.destroy).toHaveBeenCalledOnce()
  f.tray.relabel()
  expect(native.menus).toHaveLength(2)
})
