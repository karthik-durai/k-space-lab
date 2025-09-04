import { useEffect, useRef, useState } from 'react'

type Point = { x: number; y: number }

type Props = {
  kspaceUrl: string
  naturalWidth: number
  naturalHeight: number
  show: boolean
  radiusPx: number
  center: Point | null
  disabled?: boolean
  onMove: (center: Point, radiusNatural: number) => void
  onResize?: (radiusPx: number) => void
  debounceMs?: number
  className?: string
}

export default function KSpaceCanvas({
  kspaceUrl,
  naturalWidth,
  naturalHeight,
  show,
  radiusPx,
  center,
  disabled = false,
  onMove,
  onResize,
  debounceMs = 300,
  className,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)

  const [dragging, setDragging] = useState(false)
  const [resizing, setResizing] = useState(false)
  const [localCenter, setLocalCenter] = useState<Point | null>(null) // natural coords
  const [localRadiusPx, setLocalRadiusPx] = useState<number | null>(null)
  const timerRef = useRef<number | null>(null)
  const lastArgsRef = useRef<{ center: Point; rNat: number } | null>(null)
  const lastNatRef = useRef<Point | null>(null)

  function getRect() {
    return canvasRef.current?.getBoundingClientRect()
  }

  function toDisplay(nat: Point): Point {
    const rect = getRect()
    if (!rect) return { x: 0, y: 0 }
    const sx = rect.width / naturalWidth
    const sy = rect.height / naturalHeight
    return { x: nat.x * sx, y: nat.y * sy }
  }

  function toNatural(disp: Point): Point {
    const rect = getRect()
    if (!rect) return { x: 0, y: 0 }
    const sx = naturalWidth / rect.width
    const sy = naturalHeight / rect.height
    return { x: Math.round(disp.x * sx), y: Math.round(disp.y * sy) }
  }

  function clampDisplay(p: Point, r: number): Point {
    const rect = getRect()
    if (!rect) return p
    return {
      x: Math.max(r, Math.min(rect.width - r, p.x)),
      y: Math.max(r, Math.min(rect.height - r, p.y)),
    }
  }

  function getScaleX(): number {
    const rect = getRect()
    return rect ? naturalWidth / rect.width : 1
  }

  // Load image once kspaceUrl changes
  useEffect(() => {
    const img = new Image()
    img.onload = () => {
      imgRef.current = img
      draw()
    }
    img.src = kspaceUrl
    return () => {
      imgRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kspaceUrl])

  // Do not auto-reconstruct on show; wait for pointer interaction

  // Draw whenever inputs or local interaction state changes
  useEffect(() => {
    draw()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, center, radiusPx, localCenter, localRadiusPx, dragging, resizing, disabled, naturalWidth, naturalHeight])

  function draw() {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    // Ensure intrinsic pixel size matches natural image size
    if (canvas.width !== naturalWidth || canvas.height !== naturalHeight) {
      canvas.width = naturalWidth
      canvas.height = naturalHeight
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const img = imgRef.current
    if (img) ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

    if (!show) return
    const effCenter = localCenter ?? center
    if (!effCenter) return
    const sx = getScaleX()
    const rPx = localRadiusPx ?? radiusPx
    const rNat = Math.max(1, Math.round(rPx * sx))

    // Dim outside circle: fill overlay then punch a hole with destination-out
    ctx.save()
    ctx.fillStyle = 'rgba(0,0,0,0.6)'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.globalCompositeOperation = 'destination-out'
    ctx.beginPath()
    ctx.arc(effCenter.x, effCenter.y, rNat - 0.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()

    // Optional slight dim inside the circle for contrast
    ctx.save()
    ctx.beginPath()
    ctx.arc(effCenter.x, effCenter.y, rNat, 0, Math.PI * 2)
    ctx.clip()
    ctx.fillStyle = 'rgba(0,0,0,0.1)'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.restore()

    // Circle border
    ctx.save()
    ctx.strokeStyle = disabled ? 'rgba(99,102,241,0.6)' : 'rgba(99,102,241,1)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(effCenter.x, effCenter.y, rNat, 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()

    // Resize handle (at 45 degrees from center)
    const hx = effCenter.x + rNat / Math.SQRT2
    const hy = effCenter.y + rNat / Math.SQRT2
    const handleR = 7 // natural pixels; visually scales with canvas scale
    ctx.save()
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    ctx.strokeStyle = 'rgba(99,102,241,1)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(hx, hy, handleR, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    ctx.restore()
  }

  function scheduleDebouncedRecon(centerNat: Point, rNat: number) {
    if (disabled) return
    lastArgsRef.current = { center: centerNat, rNat }
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current)
    }
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null
      const args = lastArgsRef.current
      if (args) onMove(args.center, args.rNat)
    }, debounceMs)
  }

  // Helpers to detect handle hit in display space
  function hitHandle(displayPt: Point, dispCenter: Point, rDisp: number): boolean {
    const hx = dispCenter.x + rDisp / Math.SQRT2
    const hy = dispCenter.y + rDisp / Math.SQRT2
    const dx = displayPt.x - hx
    const dy = displayPt.y - hy
    const dist = Math.sqrt(dx * dx + dy * dy)
    return dist <= 10 // 10px around handle
  }

  const onPointerDown: React.PointerEventHandler<HTMLCanvasElement> = (e) => {
    if (!show || disabled) return
    const rect = getRect()
    if (!rect) return
    const rDisp = localRadiusPx ?? radiusPx
    const disp = clampDisplay({ x: e.clientX - rect.left, y: e.clientY - rect.top }, rDisp)
    const nat = toNatural(disp)
    const effCenter = localCenter ?? center ?? nat
    const dispCenter = toDisplay(effCenter)
    // Decide whether we're dragging or resizing
    const isResizing = hitHandle(disp, dispCenter, rDisp)
    if (isResizing) {
      setResizing(true)
    } else {
      setDragging(true)
      setLocalCenter(nat)
      lastNatRef.current = nat
    }
    // Don't reconstruct on pointer down; wait for movement to stop
    try { (e.currentTarget as any).setPointerCapture?.(e.pointerId) } catch {}
  }

  const onPointerMove: React.PointerEventHandler<HTMLCanvasElement> = (e) => {
    if (!show || disabled) return
    const rect = getRect()
    if (!rect) return
    const disp = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    if (dragging) {
      const rDisp = localRadiusPx ?? radiusPx
      const clamped = clampDisplay(disp, rDisp)
      const nat = toNatural(clamped)
      setLocalCenter(nat)
      lastNatRef.current = nat
      // Debounced recon while dragging
      const sx = getScaleX()
      const rNat = Math.max(1, Math.round((localRadiusPx ?? radiusPx) * sx))
      scheduleDebouncedRecon(nat, rNat)
      return
    }
    if (resizing) {
      const effCenter = localCenter ?? center
      if (!effCenter) return
      const dc = toDisplay(effCenter)
      const dx = disp.x - dc.x
      const dy = disp.y - dc.y
      const rawR = Math.sqrt(dx * dx + dy * dy)
      const maxR = Math.min(dc.x, dc.y, rect.width - dc.x, rect.height - dc.y)
      const newR = Math.max(5, Math.min(maxR, rawR))
      setLocalRadiusPx(newR)
      onResize?.(Math.round(newR))
      // Debounced recon while resizing
      const sx = getScaleX()
      const rNat = Math.max(1, Math.round(newR * sx))
      scheduleDebouncedRecon(effCenter, rNat)
    }
  }

  const onPointerUp: React.PointerEventHandler<HTMLCanvasElement> = (e) => {
    if (disabled) return
    const wasDragging = dragging
    const wasResizing = resizing
    setDragging(false)
    setResizing(false)
    if (!wasDragging && !wasResizing) return
    // Flush any pending debounced recon immediately with latest args
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
    const rect = getRect()
    if (!rect) return
    const sx = getScaleX()
    const rDisp = localRadiusPx ?? radiusPx
    const rNat = Math.max(1, Math.round(rDisp * sx))
    const latest = lastNatRef.current ?? center
    if (latest) onMove(latest, rNat)
    try { (e.currentTarget as any).releasePointerCapture?.(e.pointerId) } catch {}
  }

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className={className}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    />
  )
}
