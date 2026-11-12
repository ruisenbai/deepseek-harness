// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BootPage } from '../src/boot-page.ts'
import { attachBootWhale } from '../src/boot-whale.ts'

vi.mock('../src/boot-whale.ts', () => ({ attachBootWhale: vi.fn() }))
const attach = vi.mocked(attachBootWhale)

afterEach(() => {
  document.body.innerHTML = ''
  attach.mockReset()
})

function mount(atlasUrl?: string) {
  const el = document.createElement('div')
  document.body.append(el)
  return { el, page: new BootPage(el, atlasUrl) }
}

describe('BootPage', () => {
  it('draws the loading skeleton before any plugin state arrives', () => {
    const { el } = mount()
    expect(el.firstElementChild?.getAttribute('data-dsh-boot')).toBe('')
    expect(el.textContent).toContain('HARNESS')
    expect(el.textContent).toContain('Loading plugins…')
  })

  it('keeps loading while entries are active or loading', () => {
    const { el, page } = mount()
    page.setTotal(2)
    const spinner = el.querySelector<HTMLElement>('[data-dsh-boot-spinner]')
    expect(spinner?.style.getPropertyValue('--dsh-boot-arc')).toBe('72deg')
    page.setState('a', 'active')
    expect(spinner?.style.getPropertyValue('--dsh-boot-arc')).toBe('180deg')
    page.setState('b', 'loading')
    expect(el.querySelector('[data-dsh-boot-spinner]')).toBe(spinner)
    page.setState('b', 'active')
    expect(spinner?.style.getPropertyValue('--dsh-boot-arc')).toBe('288deg')
    expect(el.textContent).toContain('Loading plugins…')
    expect(el.textContent).not.toContain('Failed to load plugins')
  })

  it('keeps the startup whale through progress updates and releases it on failure', async () => {
    const dispose = vi.fn()
    const firstCycle = Promise.withResolvers<undefined>()
    attach.mockReturnValue({ firstCycle: firstCycle.promise, dispose })
    const { el, page } = mount('/boot-whale.webp')
    const canvas = el.querySelector('[data-dsh-boot-whale]')
    expect(canvas).not.toBeNull()
    expect(canvas?.getAttribute('aria-hidden')).toBe('true')
    expect(el.querySelector('[data-dsh-boot-spinner]')).toBeNull()
    expect(attach).toHaveBeenCalledExactlyOnceWith(canvas, '/boot-whale.webp', expect.any(Function))
    page.setTotal(2)
    page.setState('a', 'active')
    expect(el.querySelector('[data-dsh-boot-whale]')).toBe(canvas)
    const waiting = page.waitForWhale()
    expect(waiting).toBe(firstCycle.promise)
    firstCycle.resolve(undefined)
    await waiting
    page.fail('plugin failed')
    expect(dispose).toHaveBeenCalledOnce()
    expect(el.querySelector('[data-dsh-boot-whale]')).toBeNull()
    expect(el.textContent).toContain('plugin failed')
    page.dispose()
    expect(dispose).toHaveBeenCalledOnce()
  })

  it('restores progress when startup artwork cannot render', async () => {
    const dispose = vi.fn()
    attach.mockImplementation((_canvas, _url, onUnavailable) => {
      onUnavailable()
      return { firstCycle: Promise.resolve(), dispose }
    })
    const { el, page } = mount('/missing.webp')
    expect(el.querySelector('[data-dsh-boot-whale]')).toBeNull()
    const spinner = el.querySelector<HTMLElement>('[data-dsh-boot-spinner]')
    expect(spinner).not.toBeNull()
    expect(dispose).toHaveBeenCalledOnce()
    await page.waitForWhale()
    page.setTotal(2)
    page.setState('a', 'active')
    expect(spinner?.style.getPropertyValue('--dsh-boot-arc')).toBe('180deg')
    page.dispose()
  })

  it('lists failed entries', () => {
    const { el, page } = mount()
    page.setState('@deepseek-ai/dsh-client-ui-layout', 'failed')
    page.setState('ok', 'active')
    page.setState('@deepseek-ai/dsh-client-ui-tool', 'failed')
    expect(el.textContent).toContain('@deepseek-ai/dsh-client-ui-layout')
    expect(el.textContent).toContain('@deepseek-ai/dsh-client-ui-tool')
    expect(el.textContent).not.toContain('ok')
    expect(el.textContent).not.toContain('Loading plugins…')
  })

  it('shows the complete sweep report', () => {
    const { el, page } = mount()
    const report = 'web boot: 1 entry did not activate\nx: pending (waiting for service: y)'
    page.fail(report)
    page.setState('a', 'active')
    expect(el.textContent).toContain(report)
    expect(el.textContent).not.toContain('Loading plugins…')
  })

  it('detaches on disposal', () => {
    const { el, page } = mount()
    page.dispose()
    expect(el.childNodes).toHaveLength(0)
  })
})
