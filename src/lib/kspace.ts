import { create, all, type Complex } from 'mathjs'

const math = create(all, {})

type GrayImage = { gray: number[][]; rows: number; cols: number }

async function loadAndGrayscale(imageUrl: string, maxDim: number): Promise<GrayImage> {
  const img = new Image()
  img.crossOrigin = 'anonymous'
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = (err) => reject(err)
    img.src = imageUrl
  })

  let { width, height } = img
  if (width > height) {
    if (width > maxDim) {
      height = Math.round((height * maxDim) / width)
      width = maxDim
    }
  } else {
    if (height > maxDim) {
      width = Math.round((width * maxDim) / height)
      height = maxDim
    }
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, 0, 0, width, height)
  const { data } = ctx.getImageData(0, 0, width, height)

  const rows = height
  const cols = width
  const gray: number[][] = new Array(rows)
  for (let y = 0; y < rows; y++) {
    const row: number[] = new Array(cols)
    for (let x = 0; x < cols; x++) {
      const i = (y * cols + x) * 4
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      row[x] = 0.299 * r + 0.587 * g + 0.114 * b
    }
    gray[y] = row
  }
  return { gray, rows, cols }
}

function computeSpectrum(gray: number[][], rows: number, cols: number): Complex[][] {
  let spectrum: Complex[][] = new Array(rows)
  for (let y = 0; y < rows; y++) {
    const row = gray[y]
    const centered = row.map((v, x) => ((x + y) % 2 === 0 ? v : -v))
    spectrum[y] = math.fft(centered) as unknown as Complex[]
  }
  const spectrumCols: Complex[][] = new Array(rows)
  for (let y = 0; y < rows; y++) spectrumCols[y] = new Array(cols)
  for (let x = 0; x < cols; x++) {
    const col: Complex[] = new Array(rows)
    for (let y = 0; y < rows; y++) col[y] = spectrum[y][x]
    const colFft = math.fft(col) as unknown as Complex[]
    for (let y = 0; y < rows; y++) spectrumCols[y][x] = colFft[y]
  }
  return spectrumCols
}

function renderKspace(spectrumCols: Complex[][], rows: number, cols: number): string {
  let minMag = Infinity
  let maxMag = -Infinity
  const mags: number[][] = new Array(rows)
  for (let y = 0; y < rows; y++) {
    mags[y] = new Array(cols)
    for (let x = 0; x < cols; x++) {
      const z = spectrumCols[y][x] as unknown as any
      const mag = Math.log1p(math.abs(z))
      mags[y][x] = mag
      if (mag < minMag) minMag = mag
      if (mag > maxMag) maxMag = mag
    }
  }

  const out = document.createElement('canvas')
  out.width = cols
  out.height = rows
  const octx = out.getContext('2d')!
  const imgData = octx.createImageData(cols, rows)
  const px = imgData.data
  const scale = maxMag > minMag ? 255 / (maxMag - minMag) : 1
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const v = Math.max(0, Math.min(255, Math.round((mags[y][x] - minMag) * scale)))
      const i = (y * cols + x) * 4
      px[i] = v
      px[i + 1] = v
      px[i + 2] = v
      px[i + 3] = 255
    }
  }
  octx.putImageData(imgData, 0, 0)
  return out.toDataURL('image/png')
}

function renderReconFromSpectrum(spectrumCols: Complex[][], rows: number, cols: number): string {
  // Inverse FFT: columns then rows
  const temp: any[][] = new Array(rows)
  for (let y = 0; y < rows; y++) temp[y] = new Array(cols)
  for (let x = 0; x < cols; x++) {
    const col: any[] = new Array(rows)
    for (let y = 0; y < rows; y++) col[y] = spectrumCols[y][x]
    const colIfft = math.ifft(col) as unknown as any[]
    for (let y = 0; y < rows; y++) temp[y][x] = colIfft[y]
  }

  const recon: number[][] = new Array(rows)
  let minV = Infinity
  let maxV = -Infinity
  for (let y = 0; y < rows; y++) {
    recon[y] = new Array(cols)
    const row: any[] = temp[y]
    const rowIfft = math.ifft(row) as unknown as any[]
    for (let x = 0; x < cols; x++) {
      const val = rowIfft[x]
      // Undo centering
      const sign = (x + y) % 2 === 0 ? 1 : -1
      const realVal = (typeof val === 'number' ? val : val.re ?? 0) * sign
      recon[y][x] = realVal
      if (realVal < minV) minV = realVal
      if (realVal > maxV) maxV = realVal
    }
  }

  // Normalize back to 0..255
  const out = document.createElement('canvas')
  out.width = cols
  out.height = rows
  const octx = out.getContext('2d')!
  const imgData = octx.createImageData(cols, rows)
  const px = imgData.data
  const scale = maxV > minV ? 255 / (maxV - minV) : 1
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const v = Math.max(0, Math.min(255, Math.round((recon[y][x] - minV) * scale)))
      const i = (y * cols + x) * 4
      px[i] = v
      px[i + 1] = v
      px[i + 2] = v
      px[i + 3] = 255
    }
  }
  octx.putImageData(imgData, 0, 0)
  return out.toDataURL('image/png')
}

export async function computeKSpaceDataUrl(imageUrl: string, maxDim = 256): Promise<string> {
  const { gray, rows, cols } = await loadAndGrayscale(imageUrl, maxDim)
  const spectrum = computeSpectrum(gray, rows, cols)
  return renderKspace(spectrum, rows, cols)
}

export async function computeKSpaceAndRecon(imageUrl: string, maxDim = 256): Promise<{ kspaceUrl: string; reconUrl: string; rows: number; cols: number; }> {
  const { gray, rows, cols } = await loadAndGrayscale(imageUrl, maxDim)
  const spectrum = computeSpectrum(gray, rows, cols)
  const kspaceUrl = renderKspace(spectrum, rows, cols)
  const reconUrl = renderReconFromSpectrum(spectrum, rows, cols)
  return { kspaceUrl, reconUrl, rows, cols }
}

export async function computeSpectrumAndRecon(imageUrl: string, maxDim = 256): Promise<{ spectrum: Complex[][]; rows: number; cols: number; kspaceUrl: string; reconUrl: string }> {
  const { gray, rows, cols } = await loadAndGrayscale(imageUrl, maxDim)
  const spectrum = computeSpectrum(gray, rows, cols)
  const kspaceUrl = renderKspace(spectrum, rows, cols)
  const reconUrl = renderReconFromSpectrum(spectrum, rows, cols)
  return { spectrum, rows, cols, kspaceUrl, reconUrl }
}

export function renderReconFromCircle(
  spectrum: Complex[][],
  rows: number,
  cols: number,
  cx: number,
  cy: number,
  radius: number
): string {
  const r2 = radius * radius
  const masked: Complex[][] = new Array(rows)
  for (let y = 0; y < rows; y++) {
    masked[y] = new Array(cols)
    const dy = y - cy
    for (let x = 0; x < cols; x++) {
      const dx = x - cx
      const inside = dx * dx + dy * dy <= r2
      masked[y][x] = inside ? (spectrum[y][x] as any) : (math.complex(0, 0) as unknown as Complex)
    }
  }
  return renderReconFromSpectrum(masked, rows, cols)
}
