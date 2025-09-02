// Web Worker for masked reconstruction from k-space spectrum
import { create, all } from 'mathjs'

const math = create(all, {})

let ROWS = 0
let COLS = 0
let SPEC_RE: Float32Array | null = null
let SPEC_IM: Float32Array | null = null

type LoadMsg = {
  type: 'loadSpectrum'
  rows: number
  cols: number
  re: Float32Array
  im: Float32Array
}

type CircleReconMsg = {
  type: 'circleRecon'
  cx: number
  cy: number
  radius: number
}

type InMsg = LoadMsg | CircleReconMsg

function idx(x: number, y: number, width: number) {
  return y * width + x
}

function complexAt(x: number, y: number) {
  const i = idx(x, y, COLS)
  return math.complex(SPEC_RE![i], SPEC_IM![i])
}

function reconFromCircle(cx: number, cy: number, radius: number): Uint8ClampedArray {
  const r2 = radius * radius
  // Column-wise IFFT into temp
  const temp: any[][] = new Array(ROWS)
  for (let y = 0; y < ROWS; y++) temp[y] = new Array(COLS)
  for (let x = 0; x < COLS; x++) {
    const col: any[] = new Array(ROWS)
    for (let y = 0; y < ROWS; y++) {
      const dx = x - cx
      const dy = y - cy
      const inside = dx * dx + dy * dy <= r2
      col[y] = inside ? complexAt(x, y) : math.complex(0, 0)
    }
    const colIfft = math.ifft(col) as unknown as any[]
    for (let y = 0; y < ROWS; y++) temp[y][x] = colIfft[y]
  }

  // Row-wise IFFT and normalize
  const recon: number[][] = new Array(ROWS)
  let minV = Infinity
  let maxV = -Infinity
  for (let y = 0; y < ROWS; y++) {
    recon[y] = new Array(COLS)
    const row: any[] = temp[y]
    const rowIfft = math.ifft(row) as unknown as any[]
    for (let x = 0; x < COLS; x++) {
      const val = rowIfft[x]
      const sign = (x + y) % 2 === 0 ? 1 : -1
      const realVal = (typeof val === 'number' ? val : val.re ?? 0) * sign
      recon[y][x] = realVal
      if (realVal < minV) minV = realVal
      if (realVal > maxV) maxV = realVal
    }
  }

  const px = new Uint8ClampedArray(ROWS * COLS * 4)
  const scale = maxV > minV ? 255 / (maxV - minV) : 1
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const v = Math.max(0, Math.min(255, Math.round((recon[y][x] - minV) * scale)))
      const i = (y * COLS + x) * 4
      px[i] = v
      px[i + 1] = v
      px[i + 2] = v
      px[i + 3] = 255
    }
  }
  return px
}

self.onmessage = (ev: MessageEvent<InMsg>) => {
  const data = ev.data
  if (data.type === 'loadSpectrum') {
    ROWS = data.rows
    COLS = data.cols
    SPEC_RE = data.re
    SPEC_IM = data.im
    self.postMessage({ type: 'loaded' })
    return
  }
  if (data.type === 'circleRecon') {
    if (!SPEC_RE || !SPEC_IM || ROWS === 0 || COLS === 0) {
      self.postMessage({ type: 'error', error: 'Spectrum not loaded' })
      return
    }
    try {
      const px = reconFromCircle(data.cx, data.cy, data.radius)
      // Transfer pixel buffer (cast to any for TS in worker context)
      ;(self as any).postMessage({ type: 'recon', rows: ROWS, cols: COLS, pixels: px }, [px.buffer])
    } catch (err) {
      self.postMessage({ type: 'error', error: String(err) })
    }
  }
}
