/** Framework-free dot whale playback for the Web boot page. */

// The boot atlas copies the official home whale's 137 cells at 192 × 108, in twelve columns.
const ATLAS = { width: 192, height: 108, columns: 12, frames: 137 } as const
const PLAYBACK_MS = 5700
const LOOP_PAUSE_MS = 300
const FRAME_INTERVAL_MS = 1000 / 24
const STILL_FRAME = 47
const ATLAS_LOAD_TIMEOUT_MS = 2000
// Short boots should reveal the whale before the application replaces this page.
const FIRST_PLAYBACK_OFFSET_MS = STILL_FRAME / ATLAS.frames * PLAYBACK_MS

/** Owned resources of one boot whale. */
export interface BootWhaleHandle {
  /** Settle when the first visible breach ends or playback must be skipped. */
  readonly firstCycle: Promise<void>
  /** Stop frame work, image loading, and observers. Safe to call more than once. */
  dispose(): void
}

/**
 * Play the official whale's dot silhouette until the boot page is released.
 * The atlas loads independently of client plugins; failure asks the page to show its progress spinner.
 * @param canvas - Presentation surface with its ink and opacity supplied by CSS.
 * @param atlasUrl - URL emitted with the Web application before plugin loading.
 * @param onUnavailable - Called once when Canvas or the atlas cannot render.
 * @returns The handle that releases every resource owned by this playback.
 */
export function attachBootWhale(
  canvas: HTMLCanvasElement, atlasUrl: string, onUnavailable: () => void,
): BootWhaleHandle {
  const context = canvas.getContext('2d')
  if (context === null) {
    onUnavailable()
    return { firstCycle: Promise.resolve(), dispose() {} }
  }
  const ctx = context
  const image = new Image()
  const motion = matchMedia('(prefers-reduced-motion: reduce)')
  const firstCycle = Promise.withResolvers<undefined>()
  let pixels: Uint8ClampedArray | undefined
  let frame = 0
  let lastPaint = -Infinity
  let started: number | undefined
  let width = 0
  let height = 0
  let disposed = false
  let firstCycleDone = false
  let loadTimeout = 0
  let playbackTimeout = 0

  function finishFirstCycle(): void {
    if (firstCycleDone) return
    firstCycleDone = true
    clearTimeout(playbackTimeout)
    playbackTimeout = 0
    firstCycle.resolve(undefined)
  }

  function clear(): void {
    ctx.clearRect(0, 0, width, height)
  }

  function paint(index: number, fade: number): void {
    clear()
    if (pixels === undefined || width === 0 || height === 0) return
    const offsetX = (index % ATLAS.columns) * ATLAS.width
    const offsetY = Math.floor(index / ATLAS.columns) * ATLAS.height
    const stride = ATLAS.width * ATLAS.columns
    const scale = Math.min(width / ATLAS.width, height / ATLAS.height)
    const left = (width - ATLAS.width * scale) / 2
    const top = (height - ATLAS.height * scale) / 2
    ctx.fillStyle = getComputedStyle(canvas).color
    for (let y = 0; y < ATLAS.height; y++) {
      for (let x = 0; x < ATLAS.width; x++) {
        const offset = ((offsetY + y) * stride + offsetX + x) * 4
        const alpha = (pixels[offset + 1] as number) / 255
        if (alpha < 0.015) continue
        ctx.globalAlpha = Math.min(1, alpha * 1.8) * fade
        ctx.beginPath()
        ctx.arc(left + (x + 0.5) * scale, top + (y + 0.5) * scale, (pixels[offset] as number) / 255 * scale, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    ctx.globalAlpha = 1
  }

  function draw(now: number): void {
    if (started === undefined) return
    if (now - started >= PLAYBACK_MS) finishFirstCycle()
    const elapsed = (now - started) % (PLAYBACK_MS + LOOP_PAUSE_MS)
    if (elapsed >= PLAYBACK_MS) { clear(); return }
    const progress = elapsed / PLAYBACK_MS
    const fade = Math.min(1, progress * 30, (1 - progress) * 10)
    paint(Math.min(ATLAS.frames - 1, Math.floor(progress * ATLAS.frames)), fade)
  }

  function tick(now: number): void {
    frame = 0
    if (disposed) return
    if (!canvas.isConnected) { dispose(); return }
    if (document.hidden || motion.matches || width === 0 || height === 0) { finishFirstCycle(); return }
    if (pixels === undefined) return
    if (now - lastPaint + 0.5 >= FRAME_INTERVAL_MS) {
      draw(now)
      lastPaint = now
    }
    frame = requestAnimationFrame(tick)
  }

  function resume(): void {
    cancelAnimationFrame(frame)
    frame = 0
    if (disposed) return
    if (!canvas.isConnected) { dispose(); return }
    if (document.hidden || width === 0 || height === 0) { finishFirstCycle(); return }
    if (motion.matches) {
      if (pixels !== undefined) paint(STILL_FRAME, 1)
      finishFirstCycle()
      return
    }
    if (pixels === undefined) return
    started ??= performance.now() - FIRST_PLAYBACK_OFFSET_MS
    lastPaint = -Infinity
    frame = requestAnimationFrame(tick)
  }

  function resize(): void {
    if (disposed) return
    width = canvas.clientWidth
    height = canvas.clientHeight
    const density = Math.min(devicePixelRatio, 2)
    canvas.width = Math.round(width * density)
    canvas.height = Math.round(height * density)
    ctx.setTransform(density, 0, 0, density, 0, 0)
    resume()
  }

  const sizeObserver = new ResizeObserver(resize)
  const themeObserver = new MutationObserver(() => {
    if (motion.matches) paint(STILL_FRAME, 1)
  })
  sizeObserver.observe(canvas)
  themeObserver.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme', 'style'] })
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-ds-theme-source', 'style'] })
  document.addEventListener('visibilitychange', resume)
  motion.addEventListener('change', resume)

  function dispose(): void {
    if (disposed) return
    disposed = true
    cancelAnimationFrame(frame)
    frame = 0
    image.onload = image.onerror = null
    clearTimeout(loadTimeout)
    clearTimeout(playbackTimeout)
    loadTimeout = playbackTimeout = 0
    image.removeAttribute('src')
    pixels = undefined
    sizeObserver.disconnect()
    themeObserver.disconnect()
    document.removeEventListener('visibilitychange', resume)
    motion.removeEventListener('change', resume)
    clear()
    finishFirstCycle()
  }

  function unavailable(error: unknown): void {
    if (disposed) return
    console.warn('Boot whale animation is unavailable; using the progress spinner.', error)
    dispose()
    onUnavailable()
  }

  image.onload = () => {
    if (disposed) return
    clearTimeout(loadTimeout)
    loadTimeout = 0
    const source = document.createElement('canvas')
    source.width = image.naturalWidth
    source.height = image.naturalHeight
    try {
      if (source.width !== ATLAS.width * ATLAS.columns
        || source.height !== ATLAS.height * Math.ceil(ATLAS.frames / ATLAS.columns)) {
        throw new Error('Boot whale atlas dimensions do not match its frame geometry')
      }
      const reader = source.getContext('2d')
      if (reader === null) throw new Error('Boot whale atlas Canvas context is unavailable')
      reader.drawImage(image, 0, 0)
      pixels = reader.getImageData(0, 0, source.width, source.height).data
    } catch (error) {
      unavailable(error)
      return
    } finally {
      source.width = source.height = 0
      image.removeAttribute('src')
    }
    if (!firstCycleDone) playbackTimeout = window.setTimeout(finishFirstCycle, PLAYBACK_MS + LOOP_PAUSE_MS)
    resize()
  }
  image.onerror = () => { unavailable(new Error('Boot whale atlas could not be decoded')) }
  loadTimeout = window.setTimeout(() => { unavailable(new Error('Boot whale atlas loading timed out')) }, ATLAS_LOAD_TIMEOUT_MS)
  image.src = atlasUrl
  resize()
  return { firstCycle: firstCycle.promise, dispose }
}
