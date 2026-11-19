import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Clock,
  Heart,
  ListMusic,
  MicVocal,
  Minimize2,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Volume1,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useSonora } from '../contexts/SonoraContext';
import { parseLrcOrPlainLyrics } from '../services/lyricsService';
import { ACCENT_COLORS } from '../types/music';
import { formatDuration } from '../utils/formatters';
import { Artwork3D } from './Artwork3D';
import { AudioVisualizer } from './AudioVisualizer';
import { ScrubField } from './ScrubField';
import { StylishProgressBar } from './StylishProgressBar';
import { SyncedLyricsView } from './SyncedLyricsView';

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
    setVolume,
    setSpeed,
    setSleepTimer,
    toggleFavorite,
    isQueueOpen,
    setIsQueueOpen,
    setIsEqualizerOpen,
    setActiveView,
  } = useSonora();

  const [showLyrics, setShowLyrics] = useState(false);
  const [sleepMenuOpen, setSleepMenuOpen] = useState(false);
  const [speedMenuOpen, setSpeedMenuOpen] = useState(false);
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false);
  const lastNonZeroVolumeRef = useRef<number>(settings.volume > 0 ? settings.volume : 0.85);

  useEffect(() => {
    if (settings.volume > 0) {
      lastNonZeroVolumeRef.current = settings.volume;
    }
  }, [settings.volume]);

  const volumePercent = Math.round(settings.volume * 100);
  const accentHex =
    settings.theme === 'light'
      ? ACCENT_COLORS[settings.accent]?.light ?? '#d97706'
      : ACCENT_COLORS[settings.accent]?.dark ?? '#e5a038';
  const chipSurface = settings.theme === 'light' ? 'rgba(241, 245, 249, 0.92)' : 'rgba(24, 24, 29, 0.78)';

  const handleVolumeChange = (pct: number) => {
    const normalized = Math.max(0, Math.min(1, pct / 100));
    setVolume(normalized);
  };

  const handleToggleMute = () => {
    if (settings.volume > 0) {
      lastNonZeroVolumeRef.current = settings.volume;
      setVolume(0);
    } else {
      setVolume(lastNonZeroVolumeRef.current > 0 ? lastNonZeroVolumeRef.current : 0.85);
    }
  };

  const volumeIcon =
    volumePercent === 0 ? (
      <VolumeX className="w-4 h-4 text-[var(--text-muted)]" />
    ) : volumePercent < 50 ? (
      <Volume1 className="w-4 h-4 text-[var(--accent)]" />
    ) : (
      <Volume2 className="w-4 h-4 text-[var(--accent)]" />
    );

  const parsedLyrics = useMemo(() => {
    if (!currentTrack) return null;
    return parseLrcOrPlainLyrics(
      currentTrack.lrcContent || currentTrack.embeddedLyrics,
      duration || currentTrack.duration
    );
  }, [currentTrack, duration]);

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

        {/* Single Unified Right-Side Frosted Glass Control Bar (1x · Sleep · EQ · Lyrics · Playlist) */}
        <div className="inline-flex items-center gap-0.5 rounded-full bg-[var(--bg-surface)]/90 backdrop-blur-xl border border-[var(--border-subtle)] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_8px_24px_rgba(0,0,0,0.28)] shrink-0">
          {/* Desktop / Tablet Speed, Sleep & EQ */}
          <div className="hidden md:inline-flex items-center gap-0.5">
            {/* Speed Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setSleepMenuOpen(false);
                  setSpeedMenuOpen((v) => !v);
                }}
                className={`min-h-[34px] px-3 rounded-full text-[13px] font-mono tabular-nums transition-colors cursor-pointer whitespace-nowrap ${
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
                className={`inline-flex items-center gap-1.5 min-h-[34px] px-3 rounded-full text-[13px] transition-colors cursor-pointer whitespace-nowrap ${
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

            {/* Equalizer */}
            <button
              type="button"
              onClick={() => {
                closeMenus();
                setIsEqualizerOpen(true);
              }}
              className="inline-flex items-center gap-1.5 min-h-[34px] px-3 rounded-full text-[13px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer whitespace-nowrap"
              title="Open 10-Band Equalizer"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>EQ</span>
            </button>
          </div>

          {/* Mobile Compact Tools Menu (< md) inside the same unified capsule */}
          <div className="relative md:hidden">
            <button
              type="button"
              onClick={() => setMobileToolsOpen((v) => !v)}
              aria-label="Audio speed, sleep timer, and equalizer"
              className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-full text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
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

                <div className="pt-1 border-t border-[var(--border-subtle)]">
                  <button
                    type="button"
                    onClick={() => {
                      setMobileToolsOpen(false);
                      setIsEqualizerOpen(true);
                    }}
                    className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-[var(--bg-elevated)] text-[13px] cursor-pointer"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5" /> 10-Band Equalizer
                  </button>
                </div>
              </div>
            )}
          </div>

          <span className="w-px h-4 bg-white/10 mx-1 shrink-0" aria-hidden="true" />

          {/* Lyrics Toggle */}
          <button
            type="button"
            onClick={() => {
              closeMenus();
              setShowLyrics((v) => !v);
            }}
            aria-pressed={showLyrics}
            className={`inline-flex items-center gap-1.5 min-h-[34px] px-3 rounded-full text-[13px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
              showLyrics
                ? 'bg-[var(--accent)] text-[var(--accent-contrast)] shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
            }`}
          >
            <MicVocal className="w-3.5 h-3.5" />
            <span>Lyrics</span>
          </button>

          <span className="w-px h-4 bg-white/10 mx-1 shrink-0" aria-hidden="true" />

          {/* Playlist & Queue Toggle */}
          <button
            type="button"
            onClick={() => {
              closeMenus();
              setIsQueueOpen(!isQueueOpen);
            }}
            aria-label="Open playlist and queue"
            aria-pressed={isQueueOpen}
            className={`min-h-[34px] min-w-[34px] px-2 flex items-center justify-center rounded-full transition-colors cursor-pointer ${
              isQueueOpen
                ? 'bg-[var(--accent)] text-[var(--accent-contrast)] shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
            }`}
            title="Up Next & Playlists"
          >
            <ListMusic className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Content: Centered in the middle of the viewport */}
      <div className="relative z-10 flex-1 min-h-0 w-full flex items-center justify-center gap-5 lg:gap-8 px-5 sm:px-8 lg:px-12 py-4 sm:py-6 overflow-hidden">
        <div
          className={
            showLyrics
              ? 'flex-1 min-w-0 max-w-6xl grid grid-cols-1 md:grid-cols-12 gap-6 lg:gap-10 items-center h-full'
              : 'w-full max-w-[980px] flex flex-col md:flex-row items-center justify-center gap-6 sm:gap-8 lg:gap-14'
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
                  {currentTrack.sourceType === 'gdrive'
                    ? 'Google Drive'
                    : currentTrack.sourceType === 'firebase'
                    ? 'Firebase Cloud'
                    : currentTrack.format.toUpperCase()}
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
                  {currentTrack.sourceType === 'gdrive'
                    ? 'Google Drive'
                    : currentTrack.sourceType === 'firebase'
                    ? 'Firebase Cloud'
                    : currentTrack.format.toUpperCase()}
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
                  {parsedLyrics?.isSynchronized
                    ? parsedLyrics.isAutoSynced
                      ? 'Auto-Synced Lyrics'
                      : 'Synchronized Lyrics'
                    : 'Lyrics'}
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

            <div className="flex-1 overflow-y-auto pr-2">
              {parsedLyrics && parsedLyrics.synced.length > 0 ? (
                <SyncedLyricsView
                  lines={parsedLyrics.synced}
                  currentTime={currentTime}
                  isPlaying={isPlaying}
                  compact
                  onSeek={seekTo}
                />
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

        {/* Vertical Studio Glass ScrubField Volume Control positioned on the right side near the music playing window */}
        <div className="hidden md:flex flex-col items-center justify-center shrink-0">
          <ScrubField
            orientation="vertical"
            label="VOL"
            suffix="%"
            value={volumePercent}
            defaultValue={85}
            min={0}
            max={100}
            step={1}
            size="lg"
            sensitivity={2}
            rubberReach={8}
            returnDuration={300}
            coarseMultiplier={10}
            fineMultiplier={1}
            showDelta
            showDirty={false}
            showFill
            active={isPlaying && volumePercent > 0}
            accent={accentHex}
            chipColor={chipSurface}
            icon={volumeIcon}
            iconAriaLabel={volumePercent === 0 ? 'Unmute audio' : 'Mute audio'}
            onIconClick={handleToggleMute}
            onChange={handleVolumeChange}
            onCommit={handleVolumeChange}
          />
        </div>

        {/* Compact floating vertical ScrubField on small screens (right side near player) */}
        <div className="md:hidden fixed right-2.5 top-1/2 -translate-y-1/2 z-20">
          <ScrubField
            orientation="vertical"
            label="VOL"
            suffix="%"
            value={volumePercent}
            defaultValue={85}
            min={0}
            max={100}
            step={1}
            size="sm"
            sensitivity={2}
            rubberReach={8}
            returnDuration={300}
            coarseMultiplier={10}
            fineMultiplier={1}
            showDelta
            showDirty={false}
            showFill
            active={isPlaying && volumePercent > 0}
            accent={accentHex}
            chipColor={chipSurface}
            icon={volumeIcon}
            iconAriaLabel={volumePercent === 0 ? 'Unmute audio' : 'Mute audio'}
            onIconClick={handleToggleMute}
            onChange={handleVolumeChange}
            onCommit={handleVolumeChange}
          />
        </div>
      </div>
    </div>
  );
};
