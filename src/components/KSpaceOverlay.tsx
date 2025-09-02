import { useCallback, useEffect, useRef, useState } from "react";

type Props = {
  show: boolean;
  naturalWidth: number;
  naturalHeight: number;
  radiusPx: number;
  center: { x: number; y: number } | null;
  onMove: (center: { x: number; y: number }, radiusNatural: number) => void;
  debounceMs?: number;
  disabled?: boolean;
  onResize?: (radiusPx: number) => void;
};

export default function KSpaceOverlay({
  show,
  naturalWidth,
  naturalHeight,
  radiusPx,
  center,
  onMove,
  debounceMs = 120,
  disabled = false,
  onResize,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);
  const [localCenter, setLocalCenter] = useState<{ x: number; y: number } | null>(null);
  const [localRadiusPx, setLocalRadiusPx] = useState<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const lastNatRef = useRef<{ x: number; y: number } | null>(null);

  const getRect = () => containerRef.current?.getBoundingClientRect();

  const toDisplay = useCallback(
    (nat: { x: number; y: number }) => {
      const rect = getRect();
      if (!rect) return { x: 0, y: 0 };
      const sx = rect.width / naturalWidth;
      const sy = rect.height / naturalHeight;
      return { x: nat.x * sx, y: nat.y * sy };
    },
    [naturalWidth, naturalHeight]
  );

  const toNatural = useCallback(
    (disp: { x: number; y: number }) => {
      const rect = getRect();
      if (!rect) return { x: 0, y: 0 };
      const sx = naturalWidth / rect.width;
      const sy = naturalHeight / rect.height;
      return { x: Math.round(disp.x * sx), y: Math.round(disp.y * sy) };
    },
    [naturalWidth, naturalHeight]
  );

  const clampDisplay = (p: { x: number; y: number }, r: number) => {
    const rect = getRect();
    if (!rect) return p;
    return {
      x: Math.max(r, Math.min(rect.width - r, p.x)),
      y: Math.max(r, Math.min(rect.height - r, p.y)),
    };
  };

  const radiusNatural = (() => {
    const rect = getRect();
    if (!rect) return 0;
    const sx = naturalWidth / rect.width;
    const rPx = localRadiusPx ?? radiusPx;
    return Math.max(1, Math.round(rPx * sx));
  })();

  useEffect(() => {
    if (!show || !center) return;
    // When overlay appears with a valid center, reconstruct once (no dragging)
    if (radiusNatural > 0) onMove(center, radiusNatural);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, center]);

  const onPointerDown: React.PointerEventHandler<HTMLDivElement> = (e) => {
    if (!show || disabled) return;
    const rect = getRect();
    if (!rect) return;
    const r = radiusPx;
    const disp = clampDisplay(
      { x: e.clientX - rect.left, y: e.clientY - rect.top },
      r
    );
    const nat = toNatural(disp);
    // Update visual position immediately; debounce reconstruction callback
    setLocalCenter(nat);
    // Do not reconstruct yet; only after selection ends
    lastNatRef.current = nat;
    setDragging(true);
    try { (e.currentTarget as any).setPointerCapture?.(e.pointerId); } catch {}
  };

  const onPointerMove: React.PointerEventHandler<HTMLDivElement> = (e) => {
    if (!show || !dragging || disabled) return;
    const rect = getRect();
    if (!rect) return;
    const r = radiusPx;
    const disp = clampDisplay(
      { x: e.clientX - rect.left, y: e.clientY - rect.top },
      r
    );
    const nat = toNatural(disp);
    // Update visual position immediately; do not reconstruct yet
    setLocalCenter(nat);
    lastNatRef.current = nat;
  };

  const onPointerUp: React.PointerEventHandler<HTMLDivElement> = (e) => {
    if (disabled) return;
    setDragging(false);
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    // Reconstruct once after a short debounce
    const latest = lastNatRef.current ?? center
    if (latest) {
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        onMove(latest, radiusNatural)
      }, debounceMs)
    }
    try { (e.currentTarget as any).releasePointerCapture?.(e.pointerId); } catch {}
  };

  // Resize handle logic
  const onResizeDown: React.PointerEventHandler<HTMLDivElement> = (e) => {
    if (!show || disabled) return;
    setResizing(true);
    try { (e.currentTarget as any).setPointerCapture?.(e.pointerId); } catch {}
  };

  const onResizeMove: React.PointerEventHandler<HTMLDivElement> = (e) => {
    if (!show || !resizing || disabled) return;
    const rect = getRect();
    if (!rect) return;
    const effCenter = localCenter ?? center;
    if (!effCenter) return;
    const dc = toDisplay(effCenter);
    const dx = (e.clientX - rect.left) - dc.x;
    const dy = (e.clientY - rect.top) - dc.y;
    const rawR = Math.sqrt(dx * dx + dy * dy);
    const maxR = Math.min(dc.x, dc.y, rect.width - dc.x, rect.height - dc.y);
    const newR = Math.max(5, Math.min(maxR, rawR));
    setLocalRadiusPx(newR);
    onResize?.(Math.round(newR));
  };

  const onResizeUp: React.PointerEventHandler<HTMLDivElement> = (e) => {
    if (!resizing) return;
    setResizing(false);
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const latestCenter = lastNatRef.current ?? center;
    if (latestCenter) {
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        onMove(latestCenter, radiusNatural);
      }, debounceMs);
    }
    try { (e.currentTarget as any).releasePointerCapture?.(e.pointerId); } catch {}
  };

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
    };
  }, []);

  if (!show) return null;

  const effectiveCenter = (localCenter ?? center);
  const dispCenter = effectiveCenter ? toDisplay(effectiveCenter) : null;
  const r = (localRadiusPx ?? radiusPx);
  const maskCenter = dispCenter
    ? `${Math.round(dispCenter.x)}px ${Math.round(dispCenter.y)}px`
    : "50% 50%";

  return (
    <div ref={containerRef} className="absolute inset-0 z-10 pointer-events-none">
      {/* Darker outside area using a radial mask with a transparent inner circle */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundColor: "rgba(0,0,0,0.6)",
          WebkitMaskImage: `radial-gradient(circle at ${maskCenter}, transparent 0 ${
            r - 0.5
          }px, black ${r}px 100%)`,
          maskImage: `radial-gradient(circle at ${maskCenter}, transparent 0 ${
            r - 0.5
          }px, black ${r}px 100%)`,
        }}
      />

      {/* Slightly dimmed inside region with visible border */}
      {dispCenter && (
        <div
          className={`absolute rounded-full border-2 border-indigo-500 ${disabled ? 'pointer-events-none cursor-wait' : 'pointer-events-auto ' + (dragging ? 'cursor-grabbing' : 'cursor-grab')}`}
          style={{
            left: `${Math.round(dispCenter.x - r)}px`,
            top: `${Math.round(dispCenter.y - r)}px`,
            width: `${r * 2}px`,
            height: `${r * 2}px`,
            backgroundColor: "rgba(0,0,0,0.1)",
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        />
      )}

      {dispCenter && (
        <div
          className={`absolute flex items-center justify-center rounded-full bg-white/80 border border-indigo-500 shadow ${disabled ? 'pointer-events-none cursor-wait opacity-60' : 'pointer-events-auto cursor-nwse-resize'}`}
          style={{
            width: '14px',
            height: '14px',
            left: `${Math.round(dispCenter.x + r / Math.SQRT2 - 7)}px`,
            top: `${Math.round(dispCenter.y + r / Math.SQRT2 - 7)}px`,
          }}
          onPointerDown={onResizeDown}
          onPointerMove={onResizeMove}
          onPointerUp={onResizeUp}
          title="Drag to resize"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 19l6-6m-4 6h4v-4" />
            <path d="M19 5l-6 6m4-6h-4v4" />
          </svg>
        </div>
      )}
    </div>
  );
}
