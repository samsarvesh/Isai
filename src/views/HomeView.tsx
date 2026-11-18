import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ListMusic, Maximize2, Pause, Play, Shuffle } from 'lucide-react';
import { TrackArtwork } from '../components/TrackArtwork';
import { useSonora } from '../contexts/SonoraContext';
import type { Track } from '../types/music';
import { WALLPAPER_PRESETS } from '../utils/wallpapers';

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatDateLine(date: Date): string {
  return date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

function formatClockParts(date: Date): { time: string; period: string } {
  const formatted = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const parts = formatted.split(' ');
  return {
    time: parts[0] || formatted,
    period: parts[1] || '',
  };
}

export const HomeView: React.FC = () => {
  const {
    currentTrack,
    tracks,
    playlists,
    trackMap,
    isPlaying,
    togglePlayPause,
    playTracksList,
    setIsFullPlayerOpen,
    setActiveView,
    wallpaperId,
  } = useSonora();

  // Gather unique songs from all playlists; fall back to full library if playlists have no songs yet
  const homePlayPool = useMemo(() => {
    const seen = new Set<string>();
    const fromPlaylists: Track[] = [];
    for (const pl of playlists) {
      for (const id of pl.trackIds) {
        if (seen.has(id)) continue;
        const track = trackMap.get(id);
        if (track) {
          seen.add(id);
          fromPlaylists.push(track);
        }
      }
    }
    return fromPlaylists.length > 0 ? fromPlaylists : tracks;
  }, [playlists, trackMap, tracks]);

  const [now, setNow] = useState(() => new Date());
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;

  const activePreset = WALLPAPER_PRESETS.find((p) => p.id === wallpaperId) || WALLPAPER_PRESETS[0];
  const { time, period } = formatClockParts(now);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 15000);
    return () => window.clearInterval(timer);
  }, []);

  // Soft floating ambient light shimmer layered gently over the scenic photography
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const motes = Array.from({ length: 24 }, (_, i) => ({
      x: ((i * 79) % 100) / 100,
      y: ((i * 47) % 100) / 100,
      radius: 1 + (i % 3) * 0.65,
      speedX: (i % 2 === 0 ? 1 : -1) * (0.003 + (i % 4) * 0.0012),
      speedY: -(0.002 + (i % 3) * 0.001),
      phase: i * 0.85,
    }));

    let rafId = 0;
    let t = 0;
    let lastTs = performance.now();

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const nextW = Math.round(rect.width * dpr);
        const nextH = Math.round(rect.height * dpr);
        if (canvas.width !== nextW || canvas.height !== nextH) {
          canvas.width = nextW;
          canvas.height = nextH;
        }
      }
    };

    const draw = (ts: number) => {
      const dt = Math.min(0.05, (ts - lastTs) / 1000);
      lastTs = ts;
      if (!prefersReduced) {
        t += dt * (isPlayingRef.current ? 1.35 : 1.0);
      }

      resize();
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      if (w > 0 && h > 0) {
        // Gentle drifting atmospheric light veil
        const cx = w * (0.5 + Math.sin(t * 0.18) * 0.16);
        const cy = h * (0.45 + Math.cos(t * 0.14) * 0.1);
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.52);
        grad.addColorStop(0, activePreset.tint);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);

        // Subtle firefly motes
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        for (const m of motes) {
          const mx = (((m.x + t * m.speedX) % 1) + 1) % 1;
          const my = (((m.y + t * m.speedY) % 1) + 1) % 1;
          const alpha = 0.08 + (Math.sin(t * 0.8 + m.phase) * 0.5 + 0.5) * 0.22;
          ctx.beginPath();
          ctx.arc(mx * w, my * h, m.radius * dpr, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255, 255, 255, ${alpha.toFixed(3)})`;
          ctx.fill();
        }
      }

      if (!prefersReduced) {
        rafId = requestAnimationFrame(draw);
      }
    };

    rafId = requestAnimationFrame(draw);
    window.addEventListener('resize', resize);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
    };
  }, [activePreset.tint]);

  return (
    <div className="relative w-full h-full overflow-hidden select-none bg-[#070b14]">
      {/* High-Resolution Scenic Background with Slow Live Drift */}
      {WALLPAPER_PRESETS.map((preset) => {
        const active = preset.id === activePreset.id;
        return (
          <img
            key={preset.id}
            src={preset.imageUrl}
            alt={preset.label}
            referrerPolicy="no-referrer"
            className={`absolute inset-0 w-full h-full object-cover animate-wallpaper-drift transition-opacity duration-1000 ${
              active ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
          />
        );
      })}

      {/* Atmospheric Living Light Layer */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full block pointer-events-none"
        aria-hidden="true"
      />

      {/* Balanced Contrast Scrim for Crisp Readability */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/25 to-black/65 pointer-events-none" />

      {/* Centered, Balanced Focal Composition (Zero Scattered Corners) */}
      <div className="relative z-10 h-full w-full flex flex-col items-center justify-center px-6 pt-14 pb-8 text-center">
        <p className="text-sm sm:text-base font-medium text-white/85 tracking-wide">
          {getGreeting()} · {formatDateLine(now)}
        </p>

        <div className="mt-2 flex items-baseline justify-center gap-2.5 text-white drop-shadow-[0_6px_28px_rgba(0,0,0,0.45)]">
          <span className="text-6xl sm:text-8xl font-display font-bold tracking-tight tabular-nums leading-none">
            {time}
          </span>
          {period && (
            <span className="text-lg sm:text-2xl font-display font-medium text-white/75 tracking-wide">
              {period}
            </span>
          )}
        </div>

        {/* Clean Centered Action / Now Playing Dock */}
        <div className="mt-8 flex flex-col items-center w-full max-w-md">
          {currentTrack ? (
            <div className="w-full flex items-center gap-3.5 p-2.5 pr-3 rounded-2xl bg-black/35 backdrop-blur-2xl border border-white/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_16px_40px_rgba(0,0,0,0.4)] text-left">
              <button
                type="button"
                onClick={() => setIsFullPlayerOpen(true)}
                className="shrink-0 cursor-pointer"
                aria-label="Open full-screen player"
              >
                <TrackArtwork
                  trackId={currentTrack.id}
                  hasArtwork={currentTrack.hasArtwork}
                  artworkUrl={currentTrack.artworkUrl}
                  title={currentTrack.title}
                  artist={currentTrack.artist}
                  size="sm"
                />
              </button>

              <button
                type="button"
                onClick={() => setIsFullPlayerOpen(true)}
                className="min-w-0 flex-1 text-left cursor-pointer group"
              >
                <p className="text-base font-semibold text-white truncate group-hover:underline">
                  {currentTrack.title}
                </p>
                <p className="text-sm text-white/75 truncate">
                  {currentTrack.artist}
                </p>
              </button>

              <button
                type="button"
                onClick={() => void togglePlayPause()}
                aria-label={isPlaying ? 'Pause' : 'Play'}
                className="w-10 h-10 rounded-full bg-white text-slate-950 hover:bg-white/90 flex items-center justify-center shrink-0 transition-colors cursor-pointer"
              >
                {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
              </button>

              {homePlayPool.length > 0 && (
                <button
                  type="button"
                  onClick={() => void playTracksList(homePlayPool, undefined, true)}
                  aria-label="Shuffle all playlists"
                  title="Shuffle all playlists"
                  className="w-9 h-9 rounded-full text-white/75 hover:text-white hover:bg-white/10 flex items-center justify-center shrink-0 transition-colors cursor-pointer"
                >
                  <Shuffle className="w-4 h-4" />
                </button>
              )}

              <button
                type="button"
                onClick={() => setIsFullPlayerOpen(true)}
                aria-label="Expand full player"
                className="w-9 h-9 rounded-full text-white/75 hover:text-white hover:bg-white/10 flex items-center justify-center shrink-0 transition-colors cursor-pointer"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-center gap-3">
              {homePlayPool.length > 0 && (
                <button
                  type="button"
                  onClick={() => void playTracksList(homePlayPool, undefined, true)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 min-h-[44px] rounded-full bg-white text-slate-950 hover:bg-white/90 text-sm font-semibold shadow-[0_10px_28px_rgba(0,0,0,0.35)] transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Play className="w-4 h-4 fill-current" /> Play Music
                </button>
              )}
              <button
                type="button"
                onClick={() => setActiveView('playlists')}
                className="inline-flex items-center gap-2 px-5 py-2.5 min-h-[44px] rounded-full bg-black/30 hover:bg-black/45 backdrop-blur-2xl border border-white/20 text-white text-sm font-medium shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_10px_28px_rgba(0,0,0,0.3)] transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <ListMusic className="w-4 h-4" /> Open Playlists &amp; Songs
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Minimal Creator Attribution */}
      <footer className="pointer-events-none absolute bottom-2.5 inset-x-0 z-10 px-4 text-center">
        <p className="text-[11px] tracking-wide text-white/55">
          Created by <span className="font-medium text-white/75">Sam Sarvesh</span>
          <span className="mx-2 text-white/30">·</span>
          Made with <span className="text-rose-400" aria-label="love">❤</span> in India
        </p>
      </footer>
    </div>
  );
};
