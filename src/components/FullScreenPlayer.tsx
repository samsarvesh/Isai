import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Clock,
  Heart,
  ListMusic,
  MicVocal,
  Minimize2,
  Pause,
  Play,
  Radio,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
} from 'lucide-react';
import { useSonora } from '../contexts/SonoraContext';
import { getActiveLrcIndex, parseLrcOrPlainLyrics } from '../services/lyricsService';
import { formatDuration } from '../utils/formatters';
import { Artwork3D } from './Artwork3D';
import { AudioVisualizer } from './AudioVisualizer';
import { StylishProgressBar } from './StylishProgressBar';

const PLAYBACK_SPEEDS = [0.75, 1, 1.15, 1.25, 1.5, 2];

export const FullScreenPlayer: React.FC = () => {
  const {
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    shuffle,
    repeat,
    settings,
    sleepRemainingSeconds,
    sleepEndOfTrack,
    isFullPlayerOpen,
    setIsFullPlayerOpen,
    togglePlayPause,
    playNext,
    playPrevious,
    seekTo,
    toggleShuffle,
    cycleRepeat,
    setSpeed,
    setSleepTimer,
    toggleFavorite,
    startSmartRadio,
    setIsQueueOpen,
    setIsEqualizerOpen,
    setActiveView,
  } = useSonora();

  const [showLyrics, setShowLyrics] = useState(false);
  const [sleepMenuOpen, setSleepMenuOpen] = useState(false);
  const [speedMenuOpen, setSpeedMenuOpen] = useState(false);
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false);
  const activeLineRef = useRef<HTMLButtonElement | null>(null);

  const parsedLyrics = useMemo(() => {
    if (!currentTrack) return null;
    return parseLrcOrPlainLyrics(currentTrack.lrcContent || currentTrack.embeddedLyrics);
  }, [currentTrack]);

  const activeLrcIndex = useMemo(() => {
    if (!parsedLyrics?.isSynchronized) return -1;
    return getActiveLrcIndex(parsedLyrics.synced, currentTime);
  }, [parsedLyrics, currentTime]);

  useEffect(() => {
    if (isFullPlayerOpen && showLyrics && activeLineRef.current) {
      activeLineRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeLrcIndex, isFullPlayerOpen, showLyrics]);

  if (!isFullPlayerOpen || !currentTrack) return null;

  const closeMenus = () => {
    setSleepMenuOpen(false);
    setSpeedMenuOpen(false);
    setMobileToolsOpen(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[var(--bg-canvas)] text-[var(--text-primary)] overflow-hidden">
      {/* Subtle studio ambient glow centered behind player */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 50% 50%, color-mix(in srgb, var(--accent) 16%, transparent) 0%, transparent 62%)',
        }}
        aria-hidden="true"
      />

      {/* Backdrop click catcher for open header menus */}
      {(sleepMenuOpen || speedMenuOpen || mobileToolsOpen) && (
        <div className="fixed inset-0 z-20" onClick={closeMenus} />
      )}

      {/* Header with Relocated Audio Utilities */}
      <header className="relative z-30 flex items-center justify-between gap-3 px-4 sm:px-8 h-16 border-b border-[var(--border-subtle)] bg-[var(--bg-canvas)]/75 backdrop-blur-md shrink-0">
        <button
          type="button"
          onClick={() => {
            closeMenus();
            setIsFullPlayerOpen(false);
          }}
          aria-label="Back to player bar"
          className="inline-flex items-center gap-2 min-h-[40px] px-3.5 py-1.5 rounded-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          <Minimize2 className="w-4 h-4" />
          <span className="hidden sm:inline">Minimize</span>
        </button>

        <div className="hidden xl:block text-center min-w-0 px-3">
          <p className="text-sm font-medium text-[var(--text-secondary)] truncate">
            Now Playing · {currentTrack.album}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Desktop / Tablet Audio & Timer Controls (Relocated from bottom) */}
          <div className="hidden md:inline-flex items-center gap-1 rounded-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-1">
            {/* Speed Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setSleepMenuOpen(false);
                  setSpeedMenuOpen((v) => !v);
                }}
                className={`min-h-[32px] px-2.5 rounded-full text-[13px] font-mono tabular-nums transition-colors cursor-pointer whitespace-nowrap ${
                  settings.playbackSpeed !== 1
                    ? 'bg-[var(--accent-soft)] text-[var(--accent)] font-semibold'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
                }`}
                title="Playback speed"
              >
                {settings.playbackSpeed}x
              </button>
              {speedMenuOpen && (
                <div className="absolute right-0 top-full mt-2 z-40 w-32 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] py-1 shadow-xl">
                  {PLAYBACK_SPEEDS.map((sp) => (
                    <button
                      key={sp}
                      type="button"
                      onClick={() => {
                        setSpeed(sp);
                        setSpeedMenuOpen(false);
                      }}
                      className={`w-full px-3.5 py-2 text-left text-[13px] font-mono hover:bg-[var(--bg-hover)] cursor-pointer ${
                        settings.playbackSpeed === sp ? 'text-[var(--accent)] font-semibold' : 'text-[var(--text-primary)]'
                      }`}
                    >
                      {sp}x
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Sleep Timer Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setSpeedMenuOpen(false);
                  setSleepMenuOpen((v) => !v);
                }}
                className={`inline-flex items-center gap-1.5 min-h-[32px] px-2.5 rounded-full text-[13px] transition-colors cursor-pointer whitespace-nowrap ${
                  sleepRemainingSeconds !== null || sleepEndOfTrack
                    ? 'bg-[var(--accent-soft)] text-[var(--accent)] font-medium'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
                }`}
                title="Sleep timer"
              >
                <Clock className="w-3.5 h-3.5" />
                <span className="font-mono tabular-nums">
                  {sleepRemainingSeconds !== null
                    ? formatDuration(sleepRemainingSeconds)
                    : sleepEndOfTrack
                    ? 'End'
                    : 'Sleep'}
                </span>
              </button>
              {sleepMenuOpen && (
                <div className="absolute right-0 top-full mt-2 z-40 w-48 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] py-1 shadow-xl">
                  {[15, 30, 45, 60].map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => {
                        setSleepTimer(m);
                        setSleepMenuOpen(false);
                      }}
                      className="w-full px-3.5 py-2 text-left text-[13px] hover:bg-[var(--bg-hover)] cursor-pointer"
                    >
                      {m} minutes
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      setSleepTimer(null, true);
                      setSleepMenuOpen(false);
                    }}
                    className="w-full px-3.5 py-2 text-left text-[13px] hover:bg-[var(--bg-hover)] cursor-pointer"
                  >
                    End of current track
                  </button>
                  {(sleepRemainingSeconds !== null || sleepEndOfTrack) && (
                    <button
                      type="button"
                      onClick={() => {
                        setSleepTimer(null, false);
                        setSleepMenuOpen(false);
                      }}
                      className="w-full px-3.5 py-2 text-left text-[13px] text-rose-400 hover:bg-[var(--bg-hover)] cursor-pointer"
                    >
                      Cancel timer
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Smart Radio */}
            <button
              type="button"
              onClick={() => void startSmartRadio(currentTrack)}
              className="inline-flex items-center gap-1.5 min-h-[32px] px-2.5 rounded-full text-[13px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer whitespace-nowrap"
              title="Start Smart Radio from this song"
            >
              <Radio className="w-3.5 h-3.5" />
              <span>Radio</span>
            </button>

            {/* Equalizer */}
            <button
              type="button"
              onClick={() => setIsEqualizerOpen(true)}
              className="inline-flex items-center gap-1.5 min-h-[32px] px-2.5 rounded-full text-[13px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer whitespace-nowrap"
              title="Open 10-Band Equalizer"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>EQ</span>
            </button>
          </div>

          {/* Mobile Compact Tools Menu (< md) */}
          <div className="relative md:hidden">
            <button
              type="button"
              onClick={() => setMobileToolsOpen((v) => !v)}
              aria-label="Audio speed, sleep timer, radio, and equalizer"
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              <SlidersHorizontal className="w-4 h-4" />
            </button>
            {mobileToolsOpen && (
              <div className="absolute right-0 top-full mt-2 z-40 w-60 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 shadow-2xl space-y-3">
                <div>
                  <p className="text-[12px] font-medium text-[var(--text-muted)] mb-1.5">Playback Speed</p>
                  <div className="grid grid-cols-3 gap-1">
                    {PLAYBACK_SPEEDS.map((sp) => (
                      <button
                        key={sp}
                        type="button"
                        onClick={() => {
                          setSpeed(sp);
                          setMobileToolsOpen(false);
                        }}
                        className={`py-1.5 rounded-lg text-[13px] font-mono cursor-pointer ${
                          settings.playbackSpeed === sp
                            ? 'bg-[var(--accent)] text-[var(--accent-contrast)] font-semibold'
                            : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)]'
                        }`}
                      >
                        {sp}x
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-[12px] font-medium text-[var(--text-muted)] mb-1.5">Sleep Timer</p>
                  <div className="grid grid-cols-3 gap-1">
                    {[15, 30, 60].map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => {
                          setSleepTimer(m);
                          setMobileToolsOpen(false);
                        }}
                        className="py-1.5 rounded-lg bg-[var(--bg-elevated)] text-[13px] text-[var(--text-secondary)] cursor-pointer"
                      >
                        {m}m
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2 pt-1 border-t border-[var(--border-subtle)]">
                  <button
                    type="button"
                    onClick={() => {
                      setMobileToolsOpen(false);
                      void startSmartRadio(currentTrack);
                    }}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-[var(--bg-elevated)] text-[13px] cursor-pointer"
                  >
                    <Radio className="w-3.5 h-3.5" /> Radio
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMobileToolsOpen(false);
                      setIsEqualizerOpen(true);
                    }}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-[var(--bg-elevated)] text-[13px] cursor-pointer"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5" /> EQ
                  </button>
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              closeMenus();
              setShowLyrics((v) => !v);
            }}
            aria-pressed={showLyrics}
            className={`inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
              showLyrics
                ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                : 'bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
            }`}
          >
            <MicVocal className="w-4 h-4" />
            <span>Lyrics</span>
          </button>

          <button
            type="button"
            onClick={() => {
              closeMenus();
              setIsFullPlayerOpen(false);
              setIsQueueOpen(true);
            }}
            aria-label="Open queue"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
          >
            <ListMusic className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Content: Centered in the middle of the viewport */}
      <div className="relative z-10 flex-1 min-h-0 w-full flex items-center justify-center px-5 sm:px-8 lg:px-14 py-4 sm:py-6 overflow-hidden">
        <div
          className={
            showLyrics
              ? 'w-full max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-12 gap-6 lg:gap-10 items-center h-full'
              : 'w-full max-w-[980px] mx-auto flex flex-col md:flex-row items-center justify-center gap-6 sm:gap-8 lg:gap-14'
          }
        >
          {/* Artwork (with 3D effect) + Mobile / Lyrics compact deck */}
          <div
            className={`flex flex-col items-center justify-center ${
              showLyrics ? 'hidden md:flex md:col-span-5 w-full' : 'w-full md:w-auto shrink-0'
            }`}
          >
            <div
              className={`shrink-0 ${
                showLyrics
                  ? 'w-[min(300px,32dvh)] mb-4'
                  : 'w-[min(280px,34dvh,74vw)] md:w-[min(420px,54dvh,38vw)] mb-2 md:mb-0'
              }`}
            >
              <Artwork3D
                trackId={currentTrack.id}
                hasArtwork={currentTrack.hasArtwork}
                artworkUrl={currentTrack.artworkUrl}
                title={currentTrack.title}
                artist={currentTrack.artist}
                isPlaying={isPlaying}
              />
            </div>

            {/* Mobile + Desktop-with-Lyrics inline controls */}
            <div className={`w-full max-w-[420px] flex flex-col ${showLyrics ? 'flex' : 'md:hidden'}`}>
            <div className="w-full flex items-start justify-between gap-3 mb-2.5">
              <div className="min-w-0">
                <h2 className="text-xl sm:text-2xl font-bold truncate leading-tight">{currentTrack.title}</h2>
                <p className="text-sm text-[var(--text-secondary)] truncate mt-0.5">
                  {currentTrack.artist} · {currentTrack.language} ·{' '}
                  {currentTrack.sourceType === 'firebase' ? 'Firebase Cloud' : currentTrack.format.toUpperCase()}
                </p>
              </div>
              <button
                onClick={() => void toggleFavorite(currentTrack.id)}
                aria-label="Toggle favorite"
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg hover:bg-[var(--bg-hover)] shrink-0 cursor-pointer"
              >
                <Heart className={`w-5 h-5 ${currentTrack.isFavorite ? 'fill-[var(--accent)] text-[var(--accent)]' : ''}`} />
              </button>
            </div>

            <div className="w-full rounded-xl bg-[var(--bg-surface)]/80 border border-[var(--border-subtle)] px-3 py-1 mb-3">
              <AudioVisualizer isPlaying={isPlaying} height={32} barCount={56} />
            </div>

            <div className="w-full mb-3">
              <StylishProgressBar
                currentTime={currentTime}
                duration={duration}
                onSeek={seekTo}
                size="md"
              />
              <div className="flex justify-between text-[13px] font-mono tabular-nums text-[var(--text-muted)] mt-0.5">
                <span>{formatDuration(currentTime)}</span>
                <span>{formatDuration(duration)}</span>
              </div>
            </div>

            <div className="w-full flex items-center justify-between">
              <button
                onClick={toggleShuffle}
                aria-label="Toggle shuffle"
                className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg cursor-pointer ${
                  shuffle ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'
                }`}
              >
                <Shuffle className="w-5 h-5" />
              </button>
              <button
                onClick={() => void playPrevious()}
                aria-label="Previous"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg cursor-pointer"
              >
                <SkipBack className="w-6 h-6 fill-current" />
              </button>
              <button
                onClick={() => void togglePlayPause()}
                aria-label={isPlaying ? 'Pause' : 'Play'}
                className="w-14 h-14 rounded-full bg-[var(--accent)] text-[var(--accent-contrast)] flex items-center justify-center shadow-lg hover:opacity-90 cursor-pointer"
              >
                {isPlaying ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current ml-0.5" />}
              </button>
              <button
                onClick={() => void playNext(true)}
                aria-label="Next"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg cursor-pointer"
              >
                <SkipForward className="w-6 h-6 fill-current" />
              </button>
              <button
                onClick={cycleRepeat}
                aria-label="Repeat"
                className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg cursor-pointer ${
                  repeat !== 'off' ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'
                }`}
              >
                {repeat === 'one' ? <Repeat1 className="w-5 h-5" /> : <Repeat className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Right: Desktop Widescreen Controls OR Synchronized Lyrics */}
        {!showLyrics ? (
          <div className="hidden md:flex flex-col justify-center w-full max-w-[460px] min-w-0">
            <div className="w-full flex items-start justify-between gap-4 mb-5">
              <div className="min-w-0">
                <h2 className="text-3xl lg:text-[40px] font-bold truncate leading-tight tracking-tight">
                  {currentTrack.title}
                </h2>
                <p className="text-base lg:text-lg text-[var(--text-secondary)] truncate mt-1.5">
                  {currentTrack.artist} · {currentTrack.album} · {currentTrack.language} ·{' '}
                  {currentTrack.sourceType === 'firebase' ? 'Firebase Cloud' : currentTrack.format.toUpperCase()}
                </p>
              </div>
              <button
                onClick={() => void toggleFavorite(currentTrack.id)}
                aria-label="Toggle favorite"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:bg-[var(--bg-hover)] shrink-0 cursor-pointer"
              >
                <Heart className={`w-5 h-5 ${currentTrack.isFavorite ? 'fill-[var(--accent)] text-[var(--accent)]' : ''}`} />
              </button>
            </div>

            {/* Wide Acoustic Waveform Visualizer Strip */}
            <div className="w-full rounded-2xl bg-[var(--bg-surface)]/80 border border-[var(--border-subtle)] px-4 py-2 mb-6">
              <AudioVisualizer isPlaying={isPlaying} height={48} barCount={72} />
            </div>

            {/* Wide Stylish Playback Progress Bar */}
            <div className="w-full mb-6">
              <StylishProgressBar
                currentTime={currentTime}
                duration={duration}
                onSeek={seekTo}
                size="md"
              />
              <div className="flex justify-between text-sm font-mono tabular-nums text-[var(--text-muted)] mt-1.5">
                <span>{formatDuration(currentTime)}</span>
                <span>{formatDuration(duration)}</span>
              </div>
            </div>

            {/* Spacious Desktop Transport Controls */}
            <div className="w-full flex items-center justify-between max-w-lg mx-auto">
              <button
                onClick={toggleShuffle}
                aria-label="Toggle shuffle"
                className={`min-h-[48px] min-w-[48px] flex items-center justify-center rounded-xl hover:bg-[var(--bg-hover)] cursor-pointer transition-colors ${
                  shuffle ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'
                }`}
              >
                <Shuffle className="w-5 h-5" />
              </button>
              <button
                onClick={() => void playPrevious()}
                aria-label="Previous"
                className="min-h-[48px] min-w-[48px] flex items-center justify-center rounded-xl hover:bg-[var(--bg-hover)] cursor-pointer transition-colors"
              >
                <SkipBack className="w-7 h-7 fill-current" />
              </button>
              <button
                onClick={() => void togglePlayPause()}
                aria-label={isPlaying ? 'Pause' : 'Play'}
                className="w-16 h-16 rounded-full bg-[var(--accent)] text-[var(--accent-contrast)] flex items-center justify-center shadow-[0_12px_32px_color-mix(in_srgb,var(--accent)_40%,transparent)] hover:opacity-90 cursor-pointer transition-opacity"
              >
                {isPlaying ? <Pause className="w-7 h-7 fill-current" /> : <Play className="w-7 h-7 fill-current ml-0.5" />}
              </button>
              <button
                onClick={() => void playNext(true)}
                aria-label="Next"
                className="min-h-[48px] min-w-[48px] flex items-center justify-center rounded-xl hover:bg-[var(--bg-hover)] cursor-pointer transition-colors"
              >
                <SkipForward className="w-7 h-7 fill-current" />
              </button>
              <button
                onClick={cycleRepeat}
                aria-label="Repeat"
                className={`min-h-[48px] min-w-[48px] flex items-center justify-center rounded-xl hover:bg-[var(--bg-hover)] cursor-pointer transition-colors ${
                  repeat !== 'off' ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'
                }`}
              >
                {repeat === 'one' ? <Repeat1 className="w-5 h-5" /> : <Repeat className="w-5 h-5" />}
              </button>
            </div>
          </div>
        ) : (
          <div className="md:col-span-7 h-full max-h-[calc(100dvh-104px)] flex flex-col rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 overflow-hidden">
            <div className="flex items-center justify-between pb-3.5 mb-4 border-b border-[var(--border-subtle)] shrink-0">
              <div className="flex items-center gap-2.5">
                <MicVocal className="w-5 h-5 text-[var(--accent)]" />
                <span className="text-base font-semibold">
                  {parsedLyrics?.isSynchronized ? 'Synchronized Lyrics' : 'Lyrics'}
                </span>
              </div>
              <button
                onClick={() => {
                  setIsFullPlayerOpen(false);
                  setActiveView('lyrics');
                }}
                className="text-sm font-medium text-[var(--accent)] hover:underline cursor-pointer"
              >
                Edit / Import LRC
              </button>
            </div>

            <div className="flex-1 overflow-y-auto pr-2 space-y-3.5">
              {parsedLyrics?.isSynchronized ? (
                parsedLyrics.synced.map((line, i) => {
                  const isActive = i === activeLrcIndex;
                  return (
                    <button
                      key={`${line.time}-${i}`}
                      ref={isActive ? activeLineRef : undefined}
                      onClick={() => seekTo(line.time)}
                      className={`w-full text-left text-lg sm:text-xl leading-relaxed transition-all cursor-pointer block ${
                        isActive
                          ? 'font-bold text-[var(--text-primary)] scale-[1.01] origin-left'
                          : i < activeLrcIndex
                          ? 'text-[var(--text-muted)]'
                          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      {line.text}
                    </button>
                  );
                })
              ) : parsedLyrics && parsedLyrics.plain.length > 0 ? (
                parsedLyrics.plain.map((line, i) => (
                  <p key={i} className="text-base sm:text-lg leading-relaxed text-[var(--text-secondary)]">
                    {line}
                  </p>
                ))
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center px-4">
                  <p className="text-base font-semibold text-[var(--text-primary)] mb-1.5">No lyrics loaded for this track</p>
                  <p className="text-sm text-[var(--text-muted)] mb-5 max-w-sm leading-relaxed">
                    ISAI never fabricates lyrics. You can import an .lrc file, paste lyrics, or search LRCLIB.
                  </p>
                  <button
                    onClick={() => {
                      setIsFullPlayerOpen(false);
                      setActiveView('lyrics');
                    }}
                    className="px-5 py-2.5 rounded-lg bg-[var(--accent)] text-[var(--accent-contrast)] text-sm font-semibold cursor-pointer"
                  >
                    Open Lyrics Studio
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
};
