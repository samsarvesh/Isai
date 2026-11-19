import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

const THEMES: Record<'dark' | 'light', Record<string, string>> = {
  dark: {
    '--al-frame': 'rgba(20, 21, 28, 0.72)',
    '--al-frame-edge': 'rgba(255, 255, 255, 0.08)',
    '--al-frame-highlight': 'rgba(255, 255, 255, 0.07)',
    '--al-frame-shadow': '0 22px 44px -20px rgba(0, 0, 0, 0.8), 0 6px 16px -8px rgba(0, 0, 0, 0.5)',
    '--al-tile': 'linear-gradient(180deg, rgba(42, 43, 54, 0.88) 0%, rgba(25, 26, 33, 0.92) 100%)',
    '--al-tile-edge': 'rgba(255, 255, 255, 0.07)',
    '--al-tile-highlight': 'rgba(255, 255, 255, 0.11)',
    '--al-tile-shadow': '0 4px 10px -4px rgba(0, 0, 0, 0.7)',
    '--al-well': 'rgba(255, 255, 255, 0.08)',
    '--al-ink': '#f4f4f5',
    '--al-muted': 'rgba(244, 244, 245, 0.55)',
    '--al-thumb': 'rgba(255, 255, 255, 0.16)',
    '--al-ring': 'rgba(244, 244, 245, 0.3)',
    '--al-ring-fill': 'rgba(244, 244, 245, 0.05)',
    '--al-hover': 'brightness(1.12)',
    '--al-press': 'brightness(0.88)',
    '--al-active': 'brightness(1.14)',
  },
  light: {
    '--al-frame': 'rgba(240, 240, 243, 0.8)',
    '--al-frame-edge': 'rgba(24, 24, 27, 0.07)',
    '--al-frame-highlight': 'rgba(255, 255, 255, 0.95)',
    '--al-frame-shadow': '0 22px 44px -22px rgba(24, 24, 27, 0.3), 0 6px 16px -10px rgba(24, 24, 27, 0.16)',
    '--al-tile': 'linear-gradient(180deg, #ffffff 0%, #f6f6f8 100%)',
    '--al-tile-edge': 'rgba(24, 24, 27, 0.08)',
    '--al-tile-highlight': 'rgba(255, 255, 255, 1)',
    '--al-tile-shadow': '0 4px 10px -5px rgba(24, 24, 27, 0.25)',
    '--al-well': 'rgba(24, 24, 27, 0.05)',
    '--al-ink': '#27272a',
    '--al-muted': 'rgba(39, 39, 42, 0.55)',
    '--al-thumb': 'rgba(24, 24, 27, 0.16)',
    '--al-ring': 'rgba(24, 24, 27, 0.28)',
    '--al-ring-fill': 'transparent',
    '--al-hover': 'brightness(0.97)',
    '--al-press': 'brightness(0.92)',
    '--al-active': 'none',
  },
};

const HIDDEN: Record<'pop' | 'slide' | 'fade', { above: string; below: string }> = {
  pop: { above: 'translate3d(0, -12px, 0) scale(0.8)', below: 'translate3d(0, 12px, 0) scale(0.8)' },
  slide: { above: 'translate3d(0, -28px, 0) scale(0.98)', below: 'translate3d(0, 28px, 0) scale(0.98)' },
  fade: { above: 'translate3d(0, -4px, 0)', below: 'translate3d(0, 4px, 0)' },
};

const SPRING =
  'linear(0, 0.0603, 0.2033, 0.3821, 0.5633, 0.7258, 0.8584, 0.9574, 1.0242, 1.0634, 1.0809, 1.0828, 1.0747, 1.0613, 1.046, 1.0313, 1.0186, 1.0085, 1.0012, 0.9965, 0.994, 0.9931, 0.9933, 0.9941, 0.9953, 0.9966, 0.9978, 0.9988, 1)';

const smootherstep = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

const FADE_MASK = (() => {
  const steps = [0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1];
  const top = steps.map((t) => `rgba(0, 0, 0, ${smootherstep(t).toFixed(3)}) calc(var(--al-fade-top) * ${t})`);
  const bottom = [...steps]
    .reverse()
    .map((t) => `rgba(0, 0, 0, ${smootherstep(t).toFixed(3)}) calc(100% - var(--al-fade-bottom) * ${t})`);
  return `linear-gradient(to bottom, ${[...top, ...bottom].join(', ')})`;
})();

const formatSize = (value: number | string) => (typeof value === 'number' ? `${value}px` : value);

export interface AnimatedListItemObject {
  id?: string | number;
  icon?: React.ReactNode;
  image?: string;
  title: string;
  description?: string;
  meta?: string;
}

export type AnimatedListAnimation = 'pop' | 'slide' | 'fade' | 'none';

export interface AnimatedListProps<T = AnimatedListItemObject | string> {
  items: T[];
  onItemSelect?: (item: T, index: number) => void;
  renderItem?: (item: T, index: number, selected: boolean) => React.ReactNode;
  getItemKey?: (item: T, index: number) => string | number;
  initialSelectedIndex?: number;
  selectOnHover?: boolean;
  enableArrowNavigation?: boolean;
  loop?: boolean;
  animation?: AnimatedListAnimation;
  animateOnce?: boolean;
  stagger?: number;
  showGradients?: boolean;
  fadeSize?: number;
  displayScrollbar?: boolean;
  frame?: boolean;
  theme?: 'dark' | 'light';
  accentColor?: string;
  radius?: number;
  gap?: number;
  width?: number | string;
  maxHeight?: number | string;
  className?: string;
  itemClassName?: string;
  style?: React.CSSProperties;
  reorderable?: boolean;
  onReorder?: (fromIndex: number, toIndex: number) => void;
}

interface EngineHandle {
  place: (snap: boolean, indexOverride?: number) => void;
  syncRing: (indexOverride?: number) => void;
  updateFades: () => void;
  sync: () => void;
}

export function AnimatedList<T = AnimatedListItemObject | string>({
  items,
  onItemSelect,
  renderItem,
  getItemKey,
  initialSelectedIndex = -1,
  selectOnHover = true,
  enableArrowNavigation = true,
  loop = false,
  animation = 'pop',
  animateOnce = false,
  stagger = 0.05,
  showGradients = true,
  fadeSize = 56,
  displayScrollbar = true,
  frame = true,
  theme = 'dark',
  accentColor,
  radius = 14,
  gap = 8,
  width = 420,
  maxHeight = 440,
  className = '',
  itemClassName = '',
  style,
  reorderable = false,
  onReorder,
}: AnimatedListProps<T>) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const indicatorRef = useRef<HTMLSpanElement | null>(null);
  const ringRef = useRef<HTMLSpanElement | null>(null);
  const itemRefs = useRef<Array<HTMLDivElement | null>>([]);
  const engineRef = useRef<EngineHandle | null>(null);
  const keyboardRef = useRef(false);
  const navigatingRef = useRef(false);
  const dragFromRef = useRef<number | null>(null);
  const dropTargetRef = useRef<{ index: number; edge: 'top' | 'bottom' } | null>(null);
  const [selected, setSelected] = useState(initialSelectedIndex);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<{ index: number; edge: 'top' | 'bottom' } | null>(null);
  const baseId = useId();

  useEffect(() => {
    setSelected(initialSelectedIndex);
  }, [initialSelectedIndex]);

  const settings = {
    items,
    onItemSelect,
    selected,
    selectOnHover,
    enableArrowNavigation,
    loop,
    animation,
    animateOnce,
    stagger,
    showGradients,
    fadeSize,
  };
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useIsomorphicLayoutEffect(() => {
    const root = rootRef.current;
    const viewport = viewportRef.current;
    const track = trackRef.current;
    const indicator = indicatorRef.current;
    const ring = ringRef.current;
    if (!root || !viewport || !track || !indicator || !ring) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const springEase = CSS.supports?.('transition-timing-function', 'linear(0, 1)')
      ? SPRING
      : 'cubic-bezier(0.34, 1.4, 0.64, 1)';
    const transition = `transform 360ms ${springEase}, opacity 200ms cubic-bezier(0.22, 1, 0.36, 1), filter 120ms ease`;
    const motion = { y: 0, h: 0, vy: 0, vh: 0, ty: 0, th: 0, ready: false };
    const fades = { top: '', bottom: '' };
    let boxes: Array<[number, number] | null> = [];
    let current: AnimatedListAnimation | null = null;
    let entered = false;
    let engaged = false;
    let pointer: [number, number] = [0, 0];
    let raf = 0;
    let last = 0;

    const mode = (): AnimatedListAnimation => {
      const chosen = settingsRef.current.animation;
      if (chosen === 'none' || !HIDDEN[chosen]) return 'none';
      return reduced ? 'fade' : chosen;
    };

    const apply = (element: HTMLElement, state: 'above' | 'below' | 'in') => {
      element.dataset.state = state;
      const pose = current && current !== 'none' && state !== 'in' ? HIDDEN[current][state] : '';
      element.style.transform = pose;
      element.style.opacity = pose ? '0' : '';
    };

    const syncRing = (indexOverride?: number) => {
      const idx = indexOverride ?? settingsRef.current.selected;
      const item = itemRefs.current[idx];
      if (!item) return;
      const state = (item.dataset.state as 'above' | 'below' | 'in' | undefined) || 'in';
      if (state === ring.dataset.state) return;
      ring.style.transitionDelay = item.style.transitionDelay;
      apply(ring, state);
    };

    const write = () => {
      indicator.style.transform = `translate3d(0, ${motion.y.toFixed(2)}px, 0)`;
      indicator.style.height = `${motion.h.toFixed(2)}px`;
    };

    const stepFrame = (now: number) => {
      raf = 0;
      const dt = Math.min(0.05, (now - last) / 1000 || 0);
      last = now;
      const omega = 54;
      const zeta = 0.86;
      const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
      const h = dt / steps;
      for (let i = 0; i < steps; i++) {
        motion.vy += (omega * omega * (motion.ty - motion.y) - 2 * zeta * omega * motion.vy) * h;
        motion.vh += (omega * omega * (motion.th - motion.h) - 2 * zeta * omega * motion.vh) * h;
        motion.y += motion.vy * h;
        motion.h += motion.vh * h;
      }
      const moving =
        Math.abs(motion.ty - motion.y) > 0.05 ||
        Math.abs(motion.th - motion.h) > 0.05 ||
        Math.abs(motion.vy) + Math.abs(motion.vh) > 0.5;
      if (!moving) {
        motion.y = motion.ty;
        motion.h = motion.th;
        motion.vy = motion.vh = 0;
      }
      write();
      if (moving) raf = requestAnimationFrame(stepFrame);
    };

    const place = (snap: boolean, indexOverride?: number) => {
      const idx = indexOverride ?? settingsRef.current.selected;
      const item = itemRefs.current[idx];
      if (!item) {
        indicator.style.opacity = '0';
        motion.ready = false;
        return;
      }
      indicator.style.opacity = '1';
      motion.ty = item.offsetTop;
      motion.th = item.offsetHeight;
      if (snap || reduced || !motion.ready) {
        motion.y = motion.ty;
        motion.h = motion.th;
        motion.vy = motion.vh = 0;
        motion.ready = true;
        write();
        return;
      }
      if (!raf) {
        last = performance.now();
        raf = requestAnimationFrame(stepFrame);
      }
    };

    const updateFades = () => {
      const s = settingsRef.current;
      const span = Math.max(1, s.fadeSize);
      const { scrollTop, scrollHeight, clientHeight } = viewport;
      const top = s.showGradients ? Math.min(span, Math.max(0, scrollTop)) : 0;
      const bottom = s.showGradients ? Math.min(span, Math.max(0, scrollHeight - clientHeight - scrollTop)) : 0;
      const nextTop = `${top.toFixed(1)}px`;
      const nextBottom = `${bottom.toFixed(1)}px`;
      if (nextTop !== fades.top) {
        fades.top = nextTop;
        viewport.style.setProperty('--al-fade-top', nextTop);
      }
      if (nextBottom !== fades.bottom) {
        fades.bottom = nextBottom;
        viewport.style.setProperty('--al-fade-bottom', nextBottom);
      }
    };

    const measure = () => {
      const offset = track.offsetTop;
      boxes = itemRefs.current.map((item) => (item ? [offset + item.offsetTop, item.offsetHeight] : null));
    };

    const reveal = (entrance: boolean) => {
      if (!entered) return;
      const s = settingsRef.current;
      const top = viewport.scrollTop;
      const view = viewport.clientHeight;
      let order = 0;
      itemRefs.current.forEach((item, index) => {
        const box = boxes[index];
        if (!item || !box) return;
        const start = box[0] - top;
        const overlap = Math.min(view, start + box[1]) - Math.max(0, start);
        const hidden =
          current !== 'none' && overlap < Math.min(box[1], view) * 0.5 && !(s.animateOnce && item.dataset.seen);
        const state: 'above' | 'below' | 'in' = hidden ? (start + box[1] / 2 < view / 2 ? 'above' : 'below') : 'in';
        if (state === item.dataset.state) return;
        const delay = entrance && !hidden ? (order++ * Math.max(0, s.stagger)).toFixed(3) : 0;
        item.style.transitionDelay = delay ? `${delay}s, ${delay}s, 0s` : '';
        if (!hidden) item.dataset.seen = 'true';
        apply(item, state);
      });
      syncRing();
    };

    const sync = () => {
      const s = settingsRef.current;
      itemRefs.current.length = s.items.length;
      const mountedItems = itemRefs.current.filter((el): el is HTMLDivElement => el !== null);
      const next = mode();
      const changed = next !== current;
      const restyle = changed ? mountedItems : mountedItems.filter((item) => !item.dataset.state);
      current = next;
      if (current === 'none') entered = true;
      if (restyle.length) {
        const elements: HTMLElement[] = changed ? [...restyle, ring] : restyle;
        for (const element of elements) element.style.transition = 'none';
        for (const item of restyle) {
          const initialState = (item.dataset.state as 'above' | 'below' | 'in' | undefined) || 'below';
          apply(item, current === 'none' ? 'in' : initialState);
        }
        if (changed) {
          const selectedState =
            (itemRefs.current[s.selected]?.dataset.state as 'above' | 'below' | 'in' | undefined) || 'in';
          apply(ring, selectedState);
        }
        void root.offsetHeight;
        for (const element of elements) element.style.transition = transition;
      }
      measure();
      reveal(restyle.length > 0);
    };

    sync();

    const gate =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver(
            (entries, observer) => {
              if (!entries.some((entry) => entry.isIntersecting)) return;
              observer.disconnect();
              if (entered) return;
              entered = true;
              measure();
              reveal(true);
            },
            { rootMargin: '0px 0px -10% 0px' }
          );
    if (!entered) {
      if (gate) gate.observe(root);
      else {
        entered = true;
        reveal(true);
      }
    }

    const resizeObserver = new ResizeObserver(() => {
      place(true);
      updateFades();
      measure();
      reveal(false);
    });
    resizeObserver.observe(viewport);
    resizeObserver.observe(track);

    const onScroll = () => {
      updateFades();
      reveal(false);
    };

    const onKey = (event: KeyboardEvent) => {
      const s = settingsRef.current;
      if (!s.enableArrowNavigation || event.defaultPrevented) return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const active = document.activeElement;
      const focused = active === viewport;
      const idle = !active || active === document.body || active === document.documentElement;
      if (!focused && !(engaged && idle)) return;
      const count = s.items.length;
      if (!count) return;
      const index = s.selected;
      let next: number | null = null;
      if (event.key === 'ArrowDown') next = index < 0 ? 0 : index + 1;
      else if (event.key === 'ArrowUp') next = index < 0 ? count - 1 : index - 1;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = count - 1;
      else if ((event.key === 'Enter' || (focused && event.key === ' ')) && index >= 0 && index < count) {
        event.preventDefault();
        s.onItemSelect?.(s.items[index], index);
        return;
      }
      if (next === null) return;
      event.preventDefault();
      next = s.loop ? (next + count) % count : Math.min(count - 1, Math.max(0, next));
      keyboardRef.current = true;
      navigatingRef.current = true;
      settingsRef.current.selected = next;
      place(false, next);
      syncRing(next);
      setSelected(next);
    };

    const onPointerMove = (event: PointerEvent) => {
      const moved = event.clientX !== pointer[0] || event.clientY !== pointer[1];
      pointer = [event.clientX, event.clientY];
      if (!navigatingRef.current || !moved) return;
      navigatingRef.current = false;
      const item = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-index]') : null;
      if (item && root.contains(item) && settingsRef.current.selectOnHover) {
        setSelected(Number(item.dataset.index));
      }
    };

    const onEnter = () => {
      engaged = true;
    };
    const onLeave = () => {
      engaged = false;
    };

    viewport.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('keydown', onKey);
    root.addEventListener('pointerenter', onEnter);
    root.addEventListener('pointerleave', onLeave);
    root.addEventListener('pointermove', onPointerMove);

    updateFades();
    place(true);
    syncRing();

    engineRef.current = { place, syncRing, updateFades, sync };

    return () => {
      cancelAnimationFrame(raf);
      gate?.disconnect();
      resizeObserver.disconnect();
      viewport.removeEventListener('scroll', onScroll);
      window.removeEventListener('keydown', onKey);
      root.removeEventListener('pointerenter', onEnter);
      root.removeEventListener('pointerleave', onLeave);
      root.removeEventListener('pointermove', onPointerMove);
      engineRef.current = null;
    };
  }, []);

  useIsomorphicLayoutEffect(() => {
    engineRef.current?.sync();
  }, [items, animation]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.place(false);
    engine.syncRing();
    if (!keyboardRef.current) return;
    keyboardRef.current = false;
    const viewport = viewportRef.current;
    const track = trackRef.current;
    const item = itemRefs.current[selected];
    if (!viewport || !track || !item) return;
    const top = track.offsetTop + item.offsetTop;
    const bottom = top + item.offsetHeight;
    const room = Math.max(0, (viewport.clientHeight - item.offsetHeight) / 2);
    const margin = Math.min(showGradients ? Math.max(12, fadeSize) : 12, room);
    if (top < viewport.scrollTop + margin) {
      viewport.scrollTo({ top: Math.max(0, top - margin), behavior: 'smooth' });
    } else if (bottom > viewport.scrollTop + viewport.clientHeight - margin) {
      viewport.scrollTo({ top: bottom - viewport.clientHeight + margin, behavior: 'smooth' });
    }
  }, [selected, fadeSize, showGradients]);

  useEffect(() => {
    engineRef.current?.updateFades();
  }, [showGradients, fadeSize, maxHeight, gap]);

  const hover = (index: number) => {
    if (navigatingRef.current || dragFromRef.current !== null) return;
    if (settingsRef.current.selected === index) return;
    settingsRef.current.selected = index;
    engineRef.current?.place(false, index);
    engineRef.current?.syncRing(index);
    setSelected(index);
  };

  const choose = (item: T, index: number) => {
    if (dragFromRef.current !== null) return;
    settingsRef.current.selected = index;
    engineRef.current?.place(false, index);
    engineRef.current?.syncRing(index);
    setSelected(index);
    onItemSelect?.(item, index);
  };

  const clearDragState = () => {
    dragFromRef.current = null;
    dropTargetRef.current = null;
    setDraggingIndex(null);
    setDropTarget(null);
  };

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    if (!reorderable) return;
    dragFromRef.current = index;
    setDraggingIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    try {
      e.dataTransfer.setData('text/plain', String(index));
    } catch {
      // ignore restricted dataTransfer environments
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    if (!reorderable || dragFromRef.current === null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    // Gentle edge auto-scroll so songs can be dragged effortlessly to the very top/bottom
    const viewport = viewportRef.current;
    if (viewport) {
      const vpRect = viewport.getBoundingClientRect();
      const edgeZone = 46;
      if (e.clientY < vpRect.top + edgeZone) {
        viewport.scrollTop -= 12;
      } else if (e.clientY > vpRect.bottom - edgeZone) {
        viewport.scrollTop += 12;
      }
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const edge: 'top' | 'bottom' = e.clientY < rect.top + rect.height / 2 ? 'top' : 'bottom';
    const prev = dropTargetRef.current;
    if (!prev || prev.index !== index || prev.edge !== edge) {
      const next = { index, edge };
      dropTargetRef.current = next;
      setDropTarget(next);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    if (!reorderable) return;
    e.preventDefault();
    const from = dragFromRef.current;
    const target = dropTargetRef.current;
    const edge = target && target.index === index ? target.edge : 'top';
    clearDragState();

    if (from === null || !onReorder) return;
    const insertAt = edge === 'bottom' ? index + 1 : index;
    let to = from < insertAt ? insertAt - 1 : insertAt;
    to = Math.max(0, Math.min(items.length - 1, to));
    if (from !== to) {
      onReorder(from, to);
      settingsRef.current.selected = to;
      setSelected(to);
      requestAnimationFrame(() => {
        engineRef.current?.place(true, to);
        engineRef.current?.syncRing(to);
      });
    }
  };

  const cssVars: Record<string, string> = {
    ...(THEMES[theme] ?? THEMES.dark),
    '--al-radius': `${Math.max(0, radius)}px`,
    '--al-gap': `${Math.max(0, gap)}px`,
    '--al-width': formatSize(width),
    '--al-accent': accentColor || 'var(--al-ink)',
    ...(accentColor
      ? {
          '--al-ring': accentColor,
          '--al-ring-fill': `color-mix(in srgb, ${accentColor} 10%, transparent)`,
        }
      : {}),
  };

  return (
    <div
      ref={rootRef}
      className={`animated-list${frame ? ' animated-list--framed' : ''} ${className}`.trim()}
      data-animated={animation !== 'none' ? '' : undefined}
      style={{
        ...(cssVars as React.CSSProperties),
        ...style,
      }}
    >
      <div
        ref={viewportRef}
        className={`animated-list__viewport${displayScrollbar ? '' : ' animated-list__viewport--bare'}`}
        role="listbox"
        tabIndex={0}
        aria-activedescendant={selected >= 0 && selected < items.length ? `${baseId}-${selected}` : undefined}
        style={{
          maxHeight: formatSize(maxHeight),
          maskImage: showGradients ? FADE_MASK : undefined,
          WebkitMaskImage: showGradients ? FADE_MASK : undefined,
        }}
      >
        <div ref={trackRef} className="animated-list__track">
          {items.map((item, index) => {
            const entry: AnimatedListItemObject =
              item !== null && typeof item === 'object'
                ? (item as unknown as AnimatedListItemObject)
                : { title: String(item) };
            const isSelected = index === selected;
            const isDragging = draggingIndex === index;
            const showTopDrop =
              reorderable &&
              draggingIndex !== null &&
              dropTarget?.index === index &&
              dropTarget.edge === 'top' &&
              draggingIndex !== index;
            const showBottomDrop =
              reorderable &&
              draggingIndex !== null &&
              dropTarget?.index === index &&
              dropTarget.edge === 'bottom' &&
              draggingIndex !== index;
            const key = getItemKey ? getItemKey(item, index) : (entry.id ?? index);

            return (
              <div
                key={key}
                ref={(element) => {
                  itemRefs.current[index] = element;
                }}
                id={`${baseId}-${index}`}
                className={`animated-list__item ${reorderable ? 'cursor-grab active:cursor-grabbing' : ''} ${
                  isDragging ? 'opacity-40' : ''
                } ${itemClassName}`.trim()}
                role="option"
                aria-selected={isSelected}
                data-index={index}
                data-selected={isSelected ? '' : undefined}
                draggable={reorderable || undefined}
                onDragStart={reorderable ? (e) => handleDragStart(e, index) : undefined}
                onDragOver={reorderable ? (e) => handleDragOver(e, index) : undefined}
                onDrop={reorderable ? (e) => handleDrop(e, index) : undefined}
                onDragEnd={reorderable ? clearDragState : undefined}
                onPointerEnter={selectOnHover ? () => hover(index) : undefined}
                onClick={() => choose(item, index)}
              >
                {showTopDrop && (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute -top-[5px] left-2 right-2 h-[2px] rounded-full bg-[var(--accent)] shadow-[0_0_10px_var(--accent)] z-20"
                  >
                    <span className="absolute -left-1 -top-[3px] w-2 h-2 rounded-full bg-[var(--accent)]" />
                  </span>
                )}
                {showBottomDrop && (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute -bottom-[5px] left-2 right-2 h-[2px] rounded-full bg-[var(--accent)] shadow-[0_0_10px_var(--accent)] z-20"
                  >
                    <span className="absolute -left-1 -top-[3px] w-2 h-2 rounded-full bg-[var(--accent)]" />
                  </span>
                )}
                {renderItem ? (
                  renderItem(item, index, isSelected)
                ) : (
                  <>
                    {(entry.image || entry.icon) && (
                      <span className="animated-list__lead">
                        {entry.image ? <img src={entry.image} alt="" draggable={false} /> : entry.icon}
                      </span>
                    )}
                    <span className="animated-list__text">
                      <span className="animated-list__title">{entry.title}</span>
                      {entry.description && <span className="animated-list__description">{entry.description}</span>}
                    </span>
                    {entry.meta && <span className="animated-list__meta">{entry.meta}</span>}
                  </>
                )}
                <span className="animated-list__rim" aria-hidden="true" />
              </div>
            );
          })}
          <span
            ref={indicatorRef}
            className="animated-list__indicator"
            style={draggingIndex !== null ? { opacity: 0 } : undefined}
            aria-hidden="true"
          >
            <span ref={ringRef} className="animated-list__ring" />
          </span>
        </div>
      </div>
      {frame && <span className="animated-list__frame-rim" aria-hidden="true" />}
    </div>
  );
}

export default AnimatedList;
