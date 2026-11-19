import React, { useEffect, useMemo, useRef, useState } from 'react';
import { audioEngine } from '../services/audioEngine';
import { formatLrcTimestamp, getActiveLrcIndex } from '../services/lyricsService';
import type { LrcLine } from '../types/music';

interface SyncedLyricsViewProps {
  lines: LrcLine[];
  currentTime: number;
  isPlaying: boolean;
  showTimestamps?: boolean;
  compact?: boolean;
  onSeek: (seconds: number) => void;
}

export const SyncedLyricsView: React.FC<SyncedLyricsViewProps> = ({
  lines,
  currentTime,
  isPlaying,
  showTimestamps = false,
  compact = false,
  onSeek,
}) => {
  const [liveTime, setLiveTime] = useState(currentTime);
  const activeLineRef = useRef<HTMLButtonElement | null>(null);
  const lastScrolledIdxRef = useRef<number>(-1);

  // Keep synced when paused or user seeks manually
  useEffect(() => {
    setLiveTime(currentTime);
  }, [currentTime]);

  // Smooth 60fps clock directly from audioEngine while playing for crisp word-by-word fill
  useEffect(() => {
    if (!isPlaying || lines.length === 0) return;
    let rafId = 0;
    const tick = () => {
      setLiveTime(audioEngine.getCurrentTime());
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, lines.length]);

  const activeIdx = useMemo(() => getActiveLrcIndex(lines, liveTime), [lines, liveTime]);

  useEffect(() => {
    if (activeIdx >= 0 && activeIdx !== lastScrolledIdxRef.current && activeLineRef.current) {
      lastScrolledIdxRef.current = activeIdx;
      activeLineRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeIdx]);

  useEffect(() => {
    lastScrolledIdxRef.current = -1;
  }, [lines]);

  return (
    <div className={compact ? 'space-y-3.5' : 'max-w-3xl mx-auto space-y-4'}>
      {lines.map((line, i) => {
        const isActive = i === activeIdx;
        const isPast = activeIdx >= 0 && i < activeIdx;

        if (line.isSectionHeader) {
          return (
            <div
              key={`${line.time}-${i}`}
              className="pt-2 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]/70"
            >
              {line.text}
            </div>
          );
        }

        return (
          <button
            key={`${line.time}-${i}`}
            ref={isActive ? activeLineRef : undefined}
            type="button"
            onClick={() => onSeek(line.time)}
            className={`w-full text-left flex items-baseline gap-4 transition-all duration-300 cursor-pointer rounded-xl px-2 py-1 -mx-2 hover:bg-white/[0.03] ${
              isActive
                ? compact
                  ? 'text-xl sm:text-2xl font-bold scale-[1.01] origin-left'
                  : 'text-2xl sm:text-[26px] font-bold scale-[1.01] origin-left'
                : isPast
                ? compact
                  ? 'text-base sm:text-lg text-[var(--text-muted)]/60'
                  : 'text-base sm:text-lg text-[var(--text-muted)]/65'
                : compact
                ? 'text-base sm:text-lg text-[var(--text-secondary)]/85 hover:text-[var(--text-primary)]'
                : 'text-base sm:text-lg text-[var(--text-secondary)]/85 hover:text-[var(--text-primary)]'
            }`}
          >
            {showTimestamps && (
              <span
                className={`text-[12px] font-mono tabular-nums shrink-0 transition-colors ${
                  isActive ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]/70'
                }`}
              >
                {formatLrcTimestamp(line.time).replace(/[\[\]]/g, '')}
              </span>
            )}

            <span className="leading-relaxed flex flex-wrap gap-x-[0.3em] gap-y-0.5">
              {isActive && line.words && line.words.length > 0 ? (
                line.words.map((word, wIdx) => {
                  const span = Math.max(0.05, word.end - word.start);
                  const rawProgress = (liveTime - word.start) / span;
                  const progress = Math.max(0, Math.min(1, rawProgress));
                  const isCurrentWord = rawProgress >= 0 && rawProgress < 1;
                  const isSung = rawProgress >= 1;
                  const pct = Math.round(progress * 100);

                  return (
                    <span
                      key={wIdx}
                      className={`inline-block transition-transform duration-150 ${
                        isCurrentWord ? '-translate-y-[1px]' : ''
                      }`}
                      style={
                        isSung
                          ? {
                              color: 'var(--accent)',
                              textShadow: '0 0 18px color-mix(in srgb, var(--accent) 42%, transparent)',
                            }
                          : isCurrentWord
                          ? {
                              backgroundImage: `linear-gradient(90deg, var(--accent) 0%, var(--accent) ${pct}%, var(--text-primary) ${Math.min(100, pct + 14)}%, rgba(255,255,255,0.34) ${Math.min(100, pct + 28)}%)`,
                              WebkitBackgroundClip: 'text',
                              backgroundClip: 'text',
                              color: 'transparent',
                              filter: 'drop-shadow(0 0 10px color-mix(in srgb, var(--accent) 50%, transparent))',
                            }
                          : {
                              color: 'color-mix(in srgb, var(--text-primary) 42%, transparent)',
                            }
                      }
                    >
                      {word.text}
                    </span>
                  );
                })
              ) : (
                <span>{line.text}</span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
};
