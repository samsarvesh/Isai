import React, { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import {
  animate,
  motion,
  type MotionStyle,
  useMotionTemplate,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useTransform,
} from 'motion/react';

const SPRING_UI = { type: 'spring' as const, duration: 0.3, bounce: 0 };
const LEAN = 4;

const SIZES = {
  sm: { height: 28, font: 12, radius: 6, width: 104, vWidth: 44, vHeight: 214, vRadius: 22 },
  md: { height: 34, font: 13, radius: 8, width: 128, vWidth: 50, vHeight: 246, vRadius: 25 },
  lg: { height: 44, font: 16, radius: 10, width: 160, vWidth: 56, vHeight: 276, vRadius: 28 },
} as const;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const decimalsOf = (n: number) => {
  const s = String(n);
  const i = s.indexOf('.');
  return i < 0 ? 0 : s.length - i - 1;
};

const onColor = (hex: string) => {
  const raw = hex.replace('#', '');
  const full = raw.length === 3 ? [...raw].map((ch) => ch + ch).join('') : raw.slice(0, 6);
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return '#111111';
  const yiq = (((n >> 16) & 255) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000;
  return yiq >= 128 ? '#111111' : '#ffffff';
};

export interface ScrubFieldProps {
  label?: string;
  suffix?: string;
  value?: number;
  defaultValue?: number;
  min?: number;
  max?: number;
  step?: number;
  size?: 'sm' | 'md' | 'lg';
  orientation?: 'horizontal' | 'vertical';
  sensitivity?: number;
  rubberReach?: number;
  returnDuration?: number;
  coarseMultiplier?: number;
  fineMultiplier?: number;
  showDelta?: boolean;
  showDirty?: boolean;
  showFill?: boolean;
  active?: boolean;
  accent?: string;
  chipColor?: string;
  disabled?: boolean;
  icon?: React.ReactNode;
  iconAriaLabel?: string;
  onIconClick?: () => void;
  onChange?: (value: number) => void;
  onCommit?: (value: number) => void;
  className?: string;
}

interface DragState {
  id: number;
  axisStart: number;
  startClientY: number;
  inMeter: boolean;
  raw: number;
  mult: number;
  moved: boolean;
  before: number;
  slack: number;
  rectOrigin: number;
  rectSize: number;
}

export const ScrubField: React.FC<ScrubFieldProps> = ({
  label = 'Radius',
  suffix = 'px',
  value: valueProp,
  defaultValue = 24,
  min = 0,
  max = 100,
  step = 1,
  size = 'md',
  orientation = 'horizontal',
  sensitivity = 2,
  rubberReach = 8,
  returnDuration = 300,
  coarseMultiplier = 10,
  fineMultiplier = 0.1,
  showDelta = true,
  showDirty = false,
  showFill = true,
  active = false,
  accent = '#f5f5f5',
  chipColor = '#27272a',
  disabled = false,
  icon,
  iconAriaLabel,
  onIconClick,
  onChange,
  onCommit,
  className = '',
}) => {
  const id = useId();
  const isVertical = orientation === 'vertical';
  const reduce = useReducedMotion();
  const controlled = valueProp !== undefined;

  const [value, setValue] = useState<number>(controlled ? valueProp : defaultValue);
  const [dragging, setDragging] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);

  const display = useMotionValue(value);
  const chipRef = useRef<HTMLDivElement | null>(null);
  const meterRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const ghostRef = useRef<HTMLSpanElement | null>(null);
  const drag = useRef<DragState | null>(null);
  const valueRef = useRef<number>(value);
  const targetValueRef = useRef<number>(value);
  const animatingRef = useRef(false);
  const glideAnimRef = useRef<ReturnType<typeof animate> | null>(null);
  const typingRef = useRef(false);
  const movedRef = useRef(false);
  const endRef = useRef<(cancel?: boolean) => void>(() => {});
  const escRef = useRef<((ev: KeyboardEvent) => void) | null>(null);
  const mounted = useRef(false);

  const baseDecimals = decimalsOf(step);
  const fineDecimals = Math.min(6, baseDecimals + decimalsOf(fineMultiplier));
  const preset = SIZES[size] || SIZES.md;

  const fmt = (v: number) => {
    const scaled = v * 10 ** baseDecimals;
    return v.toFixed(Math.abs(scaled - Math.round(scaled)) < 1e-6 ? baseDecimals : fineDecimals);
  };
  const signed = (d: number) => (d < 0 ? '−' : '+') + fmt(Math.abs(d));

  const reach = (rubberReach / 100) * Math.max(max - min, Number.EPSILON);
  const bend = (raw: number) => (reach ? Math.sign(raw) * reach * Math.log1p(Math.abs(raw) / reach) : 0);
  const unbend = (over: number) => (reach ? Math.sign(over) * reach * Math.expm1(Math.abs(over) / reach) : 0);
  const toShown = (raw: number) => {
    const c = clamp(raw, min, max);
    return c + bend(raw - c);
  };
  const toRaw = (shown: number) => {
    const c = clamp(shown, min, max);
    return c + unbend(shown - c);
  };
  const multiplierOf = (e: { shiftKey: boolean; altKey: boolean }) =>
    e.shiftKey ? coarseMultiplier : e.altKey ? fineMultiplier : 1;

  const commit = (next: number) => {
    const rounded = clamp(Number(next.toFixed(fineDecimals)), min, max);
    if (rounded === valueRef.current) return;
    valueRef.current = rounded;
    setValue(rounded);
    onChange?.(rounded);
  };

  useMotionValueEvent(display, 'change', (d) => {
    if (!typingRef.current && inputRef.current) inputRef.current.value = fmt(d);
    if (chipRef.current) chipRef.current.dataset.over = d < min || d > max ? 'true' : 'false';
  });

  const lean = useTransform(display, (d) => {
    if (reduce || !reach) return 0;
    const ratio = clamp((d - clamp(d, min, max)) / reach, -1, 1);
    return isVertical ? -ratio * LEAN : ratio * LEAN;
  });

  const chipTransform = useMotionTemplate`${isVertical ? 'translateY' : 'translateX'}(${lean}px)`;
  const fill = useTransform(display, (d) => (clamp(d, min, max) - min) / Math.max(max - min, Number.EPSILON));
  const fillTransform = useMotionTemplate`${isVertical ? 'scaleY' : 'scaleX'}(${fill})`;
  const crestBottom = useTransform(fill, (f) => `${(f * 100).toFixed(2)}%`);
  const crestOpacity = useTransform(fill, (f) => (f <= 0.01 ? 0 : 1));
  const auraOpacity = useTransform(fill, (f) => (f <= 0.01 ? 0 : 0.08 + f * 0.28));

  const adopt = (next: number, smooth = false) => {
    glideAnimRef.current?.stop();
    glideAnimRef.current = null;
    animatingRef.current = false;
    valueRef.current = next;
    targetValueRef.current = next;
    setValue(next);
    if (smooth && !reduce) {
      glideAnimRef.current = animate(display, next, {
        duration: 0.16,
        ease: [0.22, 1, 0.36, 1],
        onComplete: () => {
          glideAnimRef.current = null;
        },
      });
    } else {
      display.jump(next);
    }
    if (!typingRef.current && inputRef.current) inputRef.current.value = fmt(next);
  };

  const animateToValue = (rawTarget: number) => {
    const snapped = clamp(Math.round(rawTarget / step) * step, min, max);
    const rounded = clamp(Number(snapped.toFixed(fineDecimals)), min, max);
    targetValueRef.current = rounded;
    glideAnimRef.current?.stop();

    if (reduce || Math.abs(display.get() - rounded) < 0.01) {
      animatingRef.current = false;
      display.jump(rounded);
      commit(rounded);
      onCommit?.(rounded);
      return;
    }

    animatingRef.current = true;
    glideAnimRef.current = animate(display, rounded, {
      duration: 0.24,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (latest) => {
        commit(Math.round(latest / step) * step);
      },
      onComplete: () => {
        animatingRef.current = false;
        glideAnimRef.current = null;
        commit(rounded);
        onCommit?.(rounded);
      },
    });
  };

  const handleStepButton = (direction: 1 | -1, e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (disabled) return;
    const baseStep = Math.max(step, Math.round((max - min) / 20));
    const delta = direction * (e.shiftKey ? baseStep * 2 : baseStep);
    const origin = animatingRef.current ? targetValueRef.current : valueRef.current;
    animateToValue(origin + delta);
  };

  useEffect(() => {
    if (controlled && !drag.current && !animatingRef.current && valueProp !== valueRef.current) {
      adopt(clamp(valueProp, min, max), true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valueProp]);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (!controlled && !drag.current && !animatingRef.current) {
      adopt(clamp(defaultValue, min, max));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultValue]);

  useEffect(() => {
    if (!typingRef.current && inputRef.current) {
      inputRef.current.value = fmt(valueRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseDecimals, fineDecimals]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || drag.current || e.button !== 0 || typingRef.current) return;
    const targetEl = e.target as HTMLElement | null;
    if (targetEl?.closest('[data-scrub-ignore="true"]')) return;

    if (e.pointerType !== 'touch') e.preventDefault();
    glideAnimRef.current?.stop();
    glideAnimRef.current = null;
    animatingRef.current = false;
    display.stop();
    movedRef.current = false;
    const rect = chipRef.current?.getBoundingClientRect();
    const meterRect = meterRef.current?.getBoundingClientRect();
    const inMeter = Boolean(
      isVertical &&
        meterRect &&
        e.clientX >= meterRect.left - 4 &&
        e.clientX <= meterRect.right + 4 &&
        e.clientY >= meterRect.top - 2 &&
        e.clientY <= meterRect.bottom + 2
    );
    drag.current = {
      id: e.pointerId,
      axisStart: isVertical ? e.clientY : e.clientX,
      startClientY: e.clientY,
      inMeter,
      raw: toRaw(display.get()),
      mult: multiplierOf(e),
      moved: false,
      before: valueRef.current,
      slack: e.pointerType === 'touch' ? 6 : 4,
      rectOrigin: rect ? (isVertical ? rect.top : rect.left) : 0,
      rectSize: rect ? (isVertical ? rect.height : rect.width) : 0,
    };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore pointer capture failures
    }
    escRef.current = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') endRef.current(true);
    };
    window.addEventListener('keydown', escRef.current);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = drag.current;
    if (!g || e.pointerId !== g.id) return;

    const currentAxis = isVertical ? e.clientY : e.clientX;
    const deltaPx = isVertical ? g.axisStart - currentAxis : currentAxis - g.axisStart;

    if (!g.moved) {
      if (Math.abs(deltaPx) < g.slack) return;
      g.moved = true;
      movedRef.current = true;
      g.axisStart = currentAxis;
      setDragging(true);
      document.documentElement.style.cursor = isVertical ? 'ns-resize' : 'ew-resize';
      return;
    }

    const m = multiplierOf(e);
    if (m !== g.mult) {
      g.mult = m;
      g.raw = toRaw(display.get());
      g.axisStart = currentAxis;
    }

    const activeDeltaPx = isVertical ? g.axisStart - currentAxis : currentAxis - g.axisStart;
    const raw = g.raw + Math.round(activeDeltaPx / sensitivity) * step * m;
    const shown = toShown(raw);
    display.set(shown);
    commit(clamp(raw, min, max));

    if (ghostRef.current) {
      if (isVertical) {
        const clampedY = clamp(e.clientY - g.rectOrigin, 16, Math.max(16, g.rectSize - 16));
        ghostRef.current.style.translate = `-100% calc(${clampedY}px - 50%)`;
      } else {
        ghostRef.current.style.translate = `calc(${e.clientX - g.rectOrigin}px - 50%) -100%`;
      }
      ghostRef.current.textContent = signed(shown - g.before);
    }
  };

  const end = (cancel = false) => {
    const g = drag.current;
    if (!g) return;
    drag.current = null;
    setDragging(false);
    document.documentElement.style.cursor = '';
    if (escRef.current) {
      window.removeEventListener('keydown', escRef.current);
      escRef.current = null;
    }
    if (cancel) {
      commit(g.before);
      display.jump(g.before);
      return;
    }
    if (!g.moved) {
      if (g.inMeter && meterRef.current) {
        const meterRect = meterRef.current.getBoundingClientRect();
        const ratio = clamp(1 - (g.startClientY - meterRect.top) / Math.max(meterRect.height, 1), 0, 1);
        const clickedValue = min + ratio * (max - min);
        animateToValue(clickedValue);
        return;
      }
      inputRef.current?.focus();
      return;
    }
    const bound = clamp(display.get(), min, max);
    if (display.get() !== bound) {
      if (reduce) display.jump(bound);
      else animate(display, bound, { ...SPRING_UI, duration: returnDuration / 1000 });
    }
    if (g.moved && valueRef.current !== g.before) onCommit?.(valueRef.current);
  };
  endRef.current = end;

  const leaveTyping = () => {
    typingRef.current = false;
    setDraft(null);
    if (inputRef.current) inputRef.current.value = fmt(valueRef.current);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const typedNumber = draft !== null && draft.trim() !== '' ? Number(draft) : NaN;
    const from = Number.isNaN(typedNumber) ? valueRef.current : typedNumber;
    const deltas: Record<string, number> = {
      ArrowUp: step * multiplierOf(e),
      ArrowDown: -step * multiplierOf(e),
      PageUp: step * coarseMultiplier,
      PageDown: -step * coarseMultiplier,
    };
    const delta = deltas[e.key];
    if (delta !== undefined || e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      leaveTyping();
      commit(delta !== undefined ? from + delta : e.key === 'Home' ? min : max);
      display.jump(valueRef.current);
      if (inputRef.current) inputRef.current.value = fmt(valueRef.current);
      onCommit?.(valueRef.current);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      leaveTyping();
      e.currentTarget.blur();
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (disabled || typingRef.current) return;
    e.preventDefault();
    glideAnimRef.current?.stop();
    glideAnimRef.current = null;
    animatingRef.current = false;
    const dir = e.deltaY < 0 ? 1 : -1;
    const delta = dir * step * (e.shiftKey ? coarseMultiplier : 2);
    commit(valueRef.current + delta);
    targetValueRef.current = valueRef.current;
    display.jump(valueRef.current);
    onCommit?.(valueRef.current);
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    typingRef.current = true;
    setDraft(e.target.value);
    e.target.select();
  };

  const handleBlur = () => {
    const n = draft === null ? NaN : parseFloat(draft.replace(/[^\d.-]/g, ''));
    if (!Number.isNaN(n)) {
      commit(n);
      onCommit?.(valueRef.current);
    }
    leaveTyping();
    display.jump(valueRef.current);
  };

  useEffect(
    () => () => {
      glideAnimRef.current?.stop();
      document.documentElement.style.cursor = '';
      if (escRef.current) window.removeEventListener('keydown', escRef.current);
    },
    []
  );

  const dirty = showDirty && value !== defaultValue;
  const normalizedRatio = (clamp(value, min, max) - min) / Math.max(max - min, Number.EPSILON);

  const chipStyle: MotionStyle & Record<`--${string}`, string> = {
    '--sf-accent': accent,
    '--sf-chip': chipColor,
    '--sf-ghost-ink': onColor(accent),
    '--sf-h': `${preset.height}px`,
    '--sf-fs': `${preset.font}px`,
    '--sf-r': `${preset.radius}px`,
    '--sf-w': `${preset.width}px`,
    '--sf-vw': `${preset.vWidth}px`,
    '--sf-vh': `${preset.vHeight}px`,
    '--sf-vr': `${preset.vRadius}px`,
    transform: chipTransform,
  };

  return (
    <motion.div
      ref={chipRef}
      className={`scrub-field${isVertical ? ' scrub-field--vertical' : ''}${className ? ` ${className}` : ''}`}
      data-dirty={dirty ? 'true' : 'false'}
      data-dragging={dragging ? 'true' : 'false'}
      data-typing={draft !== null ? 'true' : 'false'}
      data-disabled={disabled ? 'true' : 'false'}
      data-active={active ? 'true' : 'false'}
      data-muted={normalizedRatio <= 0.001 ? 'true' : 'false'}
      data-orientation={orientation}
      aria-disabled={disabled || undefined}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={() => end()}
      onPointerCancel={() => end(true)}
      onLostPointerCapture={() => end()}
      onWheel={handleWheel}
      style={chipStyle}
      title={isVertical ? `${label}: drag up/down or scroll to adjust, click number to type` : undefined}
    >
      {/* Dynamic luminous ambient aura behind the vertical glass fader */}
      {isVertical ? (
        <motion.span
          className="scrub-field__aura"
          style={{ opacity: auraOpacity }}
          aria-hidden="true"
        />
      ) : null}

      {!isVertical && showFill ? (
        <span className="scrub-field__track" aria-hidden="true">
          <motion.span className="scrub-field__fill" style={{ transform: fillTransform }} />
        </span>
      ) : null}

      {isVertical ? (
        <>
          {/* Top numeric readout */}
          <div className="scrub-field__readout">
            <input
              ref={inputRef}
              id={id}
              className="scrub-field__input"
              type="text"
              inputMode="decimal"
              role="spinbutton"
              aria-label={label}
              aria-valuenow={value}
              aria-valuemin={min}
              aria-valuemax={max}
              aria-valuetext={`${fmt(value)}${suffix ? ` ${suffix}` : ''}`}
              defaultValue={fmt(value)}
              disabled={disabled}
              onFocus={handleFocus}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={handleBlur}
            />
            {suffix ? (
              <span className="scrub-field__suffix" aria-hidden="true">
                {suffix}
              </span>
            ) : null}
          </div>

          {/* Volume Up Step Button */}
          <button
            type="button"
            data-scrub-ignore="true"
            disabled={disabled || value >= max}
            onClick={(e) => handleStepButton(1, e)}
            aria-label={`Increase ${label}`}
            title="Increase volume"
            className="scrub-field__step-btn"
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </button>

          {/* Recessed Frosted Glass Meter Well — click anywhere to glide smoothly or drag to scrub */}
          <div ref={meterRef} className="scrub-field__meter" aria-hidden="true">
            {showFill ? (
              <span className="scrub-field__meter-track">
                <motion.span className="scrub-field__fill" style={{ transform: fillTransform }}>
                  <span className="scrub-field__sheen" />
                </motion.span>
                <motion.span
                  className="scrub-field__crest"
                  style={{ bottom: crestBottom, opacity: crestOpacity }}
                />
              </span>
            ) : null}
          </div>

          {/* Volume Down Step Button */}
          <button
            type="button"
            data-scrub-ignore="true"
            disabled={disabled || value <= min}
            onClick={(e) => handleStepButton(-1, e)}
            aria-label={`Decrease ${label}`}
            title="Decrease volume"
            className="scrub-field__step-btn"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>

          {/* Bottom Mute Toggle Icon */}
          {icon ? (
            <button
              type="button"
              data-scrub-ignore="true"
              onClick={(e) => {
                e.stopPropagation();
                onIconClick?.();
              }}
              aria-label={iconAriaLabel || `Toggle ${label}`}
              className="scrub-field__icon-btn"
            >
              {icon}
            </button>
          ) : (
            <label
              htmlFor={id}
              className="scrub-field__handle"
              onClick={(e) => {
                if (movedRef.current) e.preventDefault();
              }}
            >
              {label}
            </label>
          )}
        </>
      ) : (
        <>
          <label
            htmlFor={id}
            className="scrub-field__handle"
            onClick={(e) => {
              if (movedRef.current) e.preventDefault();
            }}
          >
            {label}
          </label>
          <input
            ref={inputRef}
            id={id}
            className="scrub-field__input"
            type="text"
            inputMode="decimal"
            role="spinbutton"
            aria-valuenow={value}
            aria-valuemin={min}
            aria-valuemax={max}
            aria-valuetext={`${fmt(value)}${suffix ? ` ${suffix}` : ''}`}
            defaultValue={fmt(value)}
            disabled={disabled}
            onFocus={handleFocus}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
          />
          {suffix ? (
            <span className="scrub-field__suffix" aria-hidden="true">
              {suffix}
            </span>
          ) : null}
        </>
      )}

      {showDelta ? <span ref={ghostRef} className="scrub-field__ghost" aria-hidden="true" /> : null}
    </motion.div>
  );
};

export default ScrubField;
