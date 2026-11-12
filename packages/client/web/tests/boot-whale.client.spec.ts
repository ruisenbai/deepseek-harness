// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { attachBootWhale } from '../src/boot-whale.ts'

const releases: (() => void)[] = []
afterEach(() => {
  for (const release of releases.splice(0)) release()
  document.body.replaceChildren()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function scene(reducedMotion = false, invalidAtlas = false) {
  let now = 0
  let nextFrame = 1
  const frames = new Map<number, FrameRequestCallback>()
  const pixels = new Uint8ClampedArray(2304 * 1296 * 4)
  for (let index = 0; index < 137; index++) {
    const offset = ((Math.floor(index / 12) * 108 + 20) * 2304 + (index % 12) * 192 + 20) * 4
    pixels[offset] = 220
    pixels[offset + 1] = 220
  }
  const drawing = () => ({
    clearRect: vi.fn(), beginPath: vi.fn(), arc: vi.fn(), fill: vi.fn(), setTransform: vi.fn(), drawImage: vi.fn(),
    getImageData: vi.fn(() => ({ data: pixels, width: 2304, height: 1296, colorSpace: 'srgb' as const })),
    globalAlpha: 1,
  })
  const contexts: ReturnType<typeof drawing>[] = []
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
    const context = drawing()
    contexts.push(context)
    const partial: Partial<CanvasRenderingContext2D> = context
    return partial as CanvasRenderingContext2D
  })
  const image = document.createElement('img')
  Object.defineProperties(image, {
    naturalWidth: { value: invalidAtlas ? 1 : 2304, configurable: true },
    naturalHeight: { value: 1296, configurable: true },
  })
  vi.stubGlobal('Image', function () { return image })
  const motion = Object.assign(new EventTarget(), { matches: reducedMotion })
  vi.stubGlobal('matchMedia', () => motion)
  vi.stubGlobal('devicePixelRatio', 2)
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    const id = nextFrame++
    frames.set(id, callback)
    return id
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => { frames.delete(id) })
  const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  const resizeDisconnect = vi.fn()
  const themeDisconnect = vi.fn()
  let onResize = () => {}
  let onTheme = () => {}
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { onResize = callback }
    observe() {}
    disconnect = resizeDisconnect
  })
  vi.stubGlobal('MutationObserver', class {
    constructor(callback: () => void) { onTheme = callback }
    observe() {}
    disconnect = themeDisconnect
  })
  const canvas = document.createElement('canvas')
  let width = 240
  Object.defineProperties(canvas, {
    clientWidth: { get: () => width },
    clientHeight: { get: () => 135 },
  })
  document.body.append(canvas)
  const unavailable = vi.fn()
  const handle = attachBootWhale(canvas, '/boot-whale.webp', unavailable)
  releases.push(() => { handle.dispose() })
  return {
    canvas, contexts, image, motion, frames, hidden, unavailable, handle, resizeDisconnect, themeDisconnect,
    load: () => image.dispatchEvent(new Event('load')),
    theme: () => { onTheme() },
    resize: (next: number) => { width = next; onResize() },
    step: (time: number) => {
      now = time
      const pending = [...frames.values()]
      frames.clear()
      for (const callback of pending) callback(time)
    },
  }
}

describe('boot whale playback', () => {
  it('finishes its first breach after a resize, then loops until disposal', async () => {
    const s = scene()
    let firstCycleDone = false
    void s.handle.firstCycle.then(() => { firstCycleDone = true })
    expect(s.image.getAttribute('src')).toBe('/boot-whale.webp')
    expect(s.frames.size).toBe(0)
    s.load()
    expect(s.frames.size).toBe(1)
    s.step(0)
    expect(s.contexts[0]!.arc.mock.calls.length).toBeGreaterThan(0)
    s.step(1500)
    const arcs = s.contexts[0]!.arc.mock.calls.length
    s.resize(160)
    expect(s.canvas.width).toBe(320)
    await Promise.resolve()
    expect(firstCycleDone).toBe(false)
    s.step(4000)
    await s.handle.firstCycle
    expect(firstCycleDone).toBe(true)
    expect(s.contexts[0]!.arc).toHaveBeenCalledTimes(arcs)
    s.step(4500)
    expect(s.contexts[0]!.arc.mock.calls.length).toBeGreaterThan(arcs)
    s.handle.dispose()
    expect(s.frames.size).toBe(0)
    expect(s.resizeDisconnect).toHaveBeenCalledOnce()
    expect(s.themeDisconnect).toHaveBeenCalledOnce()
    expect(s.image.hasAttribute('src')).toBe(false)
    expect(s.unavailable).not.toHaveBeenCalled()
  })

  it('shows a still whale without holding startup under reduced motion and pauses hidden work', async () => {
    const s = scene(true)
    await s.handle.firstCycle
    s.load()
    const arcs = s.contexts[0]!.arc.mock.calls.length
    expect(arcs).toBeGreaterThan(0)
    expect(s.frames.size).toBe(0)
    s.theme()
    expect(s.contexts[0]!.arc.mock.calls.length).toBeGreaterThan(arcs)
    s.motion.matches = false
    s.motion.dispatchEvent(new Event('change'))
    expect(s.frames.size).toBe(1)
    s.hidden.mockReturnValue(true)
    document.dispatchEvent(new Event('visibilitychange'))
    expect(s.frames.size).toBe(0)
  })

  it('releases an invalid atlas and requests the existing progress fallback once', async () => {
    const s = scene(false, true)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    s.load()
    s.load()
    await s.handle.firstCycle
    expect(s.unavailable).toHaveBeenCalledOnce()
    expect(s.frames.size).toBe(0)
    expect(s.resizeDisconnect).toHaveBeenCalledOnce()
    expect(s.image.hasAttribute('src')).toBe(false)
  })

  it('falls back and releases startup when the atlas never loads', async () => {
    vi.useFakeTimers()
    const s = scene()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    await vi.advanceTimersByTimeAsync(2000)
    await s.handle.firstCycle
    expect(s.unavailable).toHaveBeenCalledOnce()
    expect(s.image.hasAttribute('src')).toBe(false)
  })
})
