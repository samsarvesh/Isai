import React, { useCallback, useRef, useState } from 'react';
import { formatDuration } from '../utils/formatters';

interface StylishProgressBarProps {
  currentTime: number;
  duration: number;
  onSeek: (seconds: number) => void;
  size?: 'sm' | 'md';
  showTooltip?: boolean;
  ariaLabel?: string;
}

export const StylishProgressBar: React.FC<StylishProgressBarProps> = ({
  currentTime,
  duration,
  onSeek,
  size = 'md',
  showTooltip = true,
  ariaLabel = 'Seek playback position',
}) => {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [hoverPercent, setHoverPercent] = useState<number | null>(null);
  const [dragPercent, setDragPercent] = useState<number | null>(null);

  const safeMax = duration > 0 ? duration : 1;
  const activePercent =
    dragPercent !== null
      ? dragPercent
      : Math.max(0, Math.min(100, (currentTime / safeMax) * 100));

  const getPercentFromClientX = useCallback((clientX: number): number => {
    const el = trackRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    return Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const pct = getPercentFromClientX(e.clientX);
    setIsDragging(true);
    setDragPercent(pct);
    onSeek((pct / 100) * safeMax);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const pct = getPercentFromClientX(e.clientX);
    setHoverPercent(pct);
    if (isDragging) {
      setDragPercent(pct);
      onSeek((pct / 100) * safeMax);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDragging) {
      const pct = getPercentFromClientX(e.clientX);
      onSeek((pct / 100) * safeMax);
      setIsDragging(false);
      setDragPercent(null);
    }
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = Math.max(2, safeMax * 0.02);
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      onSeek(Math.min(safeMax, currentTime + step));
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      onSeek(Math.max(0, currentTime - step));
    }
  };

  const isHovering = hoverPercent !== null || isDragging;
  const previewTime = hoverPercent !== null ? (hoverPercent / 100) * safeMax : currentTime;

  return (
    <div
      ref={trackRef}
      role="slider"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={Math.round(safeMax)}
      aria-valuenow={Math.round(currentTime)}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onPointerLeave={() => {
        if (!isDragging) setHoverPercent(null);
      }}
      onKeyDown={handleKeyDown}
      className={`group relative w-full flex items-center select-none touch-none cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)] ${
        size === 'sm' ? 'h-5' : 'h-6'
      }`}
    >
      {/* Hover timestamp preview */}
      {showTooltip && isHovering && duration > 0 && hoverPercent !== null && (
        <div
          className="pointer-events-none absolute -top-7 -translate-x-1/2 px-2 py-0.5 rounded-md bg-[var(--bg-elevated)] border border-[var(--border-strong)] text-[12px] font-mono tabular-nums text-[var(--text-primary)] shadow-lg whitespace-nowrap"
          style={{ left: `${Math.max(6, Math.min(94, hoverPercent))}%` }}
        >
          {formatDuration(previewTime)}
        </div>
      )}

      {/* Recessed track rail */}
      <div
        className={`relative w-full rounded-full overflow-hidden bg-white/12 transition-all duration-150 ${
          isHovering ? (size === 'sm' ? 'h-1.5' : 'h-2') : size === 'sm' ? 'h-1' : 'h-1.5'
        }`}
      >
        {/* Subtle hover ghost preview */}
        {hoverPercent !== null && hoverPercent > activePercent && (
          <div
            className="absolute inset-y-0 left-0 bg-white/15 rounded-full pointer-events-none"
            style={{ width: `${hoverPercent}%` }}
          />
        )}

        {/* Glowing accent gradient progress fill */}
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${activePercent}%`,
            background:
              'linear-gradient(90deg, color-mix(in srgb, var(--accent) 72%, #000000 10%) 0%, var(--accent) 70%, color-mix(in srgb, var(--accent) 65%, #ffffff 35%) 100%)',
            boxShadow: '0 0 12px color-mix(in srgb, var(--accent) 55%, transparent)',
          }}
        />
      </div>

      {/* Luminous playhead knob */}
      <div
        className={`pointer-events-none absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white transition-all duration-150 ${
          isDragging
            ? 'w-4 h-4 scale-110 ring-4 ring-[var(--accent)]/40 shadow-[0_0_16px_var(--accent)]'
            : isHovering
            ? 'w-3.5 h-3.5 opacity-100 ring-3 ring-[var(--accent)]/30 shadow-[0_0_12px_var(--accent)]'
            : size === 'sm'
            ? 'w-2.5 h-2.5 opacity-0 group-hover:opacity-100'
            : 'w-3 h-3 opacity-90 shadow-[0_2px_8px_rgba(0,0,0,0.45)]'
        }`}
        style={{ left: `${activePercent}%` }}
      />
    </div>
  );
};
