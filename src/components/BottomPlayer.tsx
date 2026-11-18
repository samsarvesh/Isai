import React from 'react';
import {
  Expand,
  Heart,
  ListMusic,
  MicVocal,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useSonora } from '../contexts/SonoraContext';
import { formatDuration } from '../utils/formatters';
import { StylishProgressBar } from './StylishProgressBar';
import { TrackArtwork } from './TrackArtwork';

export const BottomPlayer: React.FC = () => {
  const {
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    shuffle,
    repeat,
    settings,
    togglePlayPause,
    playNext,
    playPrevious,
    seekTo,
    toggleShuffle,
    cycleRepeat,
    setVolume,
    toggleFavorite,
    setIsFullPlayerOpen,
    setIsQueueOpen,
    isQueueOpen,
    setIsEqualizerOpen,
    setActiveView,
    activeView,
  } = useSonora();

  if (!currentTrack) return null;

  const progressMax = duration > 0 ? duration : 1;

  return (
    <div className="border-t border-[var(--border-subtle)] bg-[var(--bg-surface)]/95 backdrop-blur-md">
      {/* Desktop full bottom player */}
      <div className="hidden md:grid grid-cols-[minmax(220px,1fr)_minmax(340px,1.4fr)_minmax(220px,1fr)] items-center gap-4 px-5 h-20">
        {/* Track Info */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => setIsFullPlayerOpen(true)}
            className="shrink-0 cursor-pointer group relative"
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
          <div className="min-w-0 flex-1">
            <button
              onClick={() => setIsFullPlayerOpen(true)}
              className="text-[15px] font-semibold text-[var(--text-primary)] hover:underline truncate block max-w-full text-left cursor-pointer"
            >
              {currentTrack.title}
            </button>
            <p className="text-[13px] text-[var(--text-secondary)] truncate">
              {currentTrack.artist} · {currentTrack.album}
            </p>
          </div>
          <button
            onClick={() => void toggleFavorite(currentTrack.id)}
            aria-label={currentTrack.isFavorite ? 'Remove favorite' : 'Add favorite'}
            className="p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer shrink-0"
          >
            <Heart className={`w-4 h-4 ${currentTrack.isFavorite ? 'fill-[var(--accent)] text-[var(--accent)]' : ''}`} />
          </button>
        </div>

        {/* Center Transport & Progress */}
        <div className="flex flex-col items-center gap-1.5">
          <div className="flex items-center gap-3">
            <button
              onClick={toggleShuffle}
              aria-label="Toggle shuffle"
              className={`p-2 rounded-lg transition-colors cursor-pointer ${
                shuffle ? 'text-[var(--accent)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Shuffle className="w-4 h-4" />
            </button>
            <button
              onClick={() => void playPrevious()}
              aria-label="Previous track"
              className="p-2 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              <SkipBack className="w-4 h-4 fill-current" />
            </button>
            <button
              onClick={() => void togglePlayPause()}
              aria-label={isPlaying ? 'Pause' : 'Play'}
              className="w-10 h-10 rounded-full bg-[var(--accent)] text-[var(--accent-contrast)] flex items-center justify-center hover:opacity-90 transition-opacity cursor-pointer"
            >
              {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
            </button>
            <button
              onClick={() => void playNext(true)}
              aria-label="Next track"
              className="p-2 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              <SkipForward className="w-4 h-4 fill-current" />
            </button>
            <button
              onClick={cycleRepeat}
              aria-label="Cycle repeat mode"
              className={`p-2 rounded-lg transition-colors cursor-pointer ${
                repeat !== 'off' ? 'text-[var(--accent)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              {repeat === 'one' ? <Repeat1 className="w-4 h-4" /> : <Repeat className="w-4 h-4" />}
            </button>
          </div>

          <div className="w-full flex items-center gap-2.5">
            <span className="text-[13px] font-mono tabular-nums text-[var(--text-muted)] w-12 text-right">
              {formatDuration(currentTime)}
            </span>
            <div className="flex-1">
              <StylishProgressBar
                currentTime={currentTime}
                duration={duration}
                onSeek={seekTo}
                size="sm"
              />
            </div>
            <span className="text-[13px] font-mono tabular-nums text-[var(--text-muted)] w-12">
              {formatDuration(duration)}
            </span>
          </div>
        </div>

        {/* Right Utilities */}
        <div className="flex items-center justify-end gap-1.5">
          <button
            onClick={() => setActiveView(activeView === 'lyrics' ? 'home' : 'lyrics')}
            aria-label="Toggle lyrics view"
            className={`p-2 rounded-lg transition-colors cursor-pointer ${
              activeView === 'lyrics' ? 'text-[var(--accent)] bg-[var(--accent-soft)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
            title="Lyrics (L)"
          >
            <MicVocal className="w-4 h-4" />
          </button>
          <button
            onClick={() => setIsEqualizerOpen(true)}
            aria-label="Open equalizer"
            className="p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
            title="Equalizer & Crossfade"
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>
          <button
            onClick={() => setIsQueueOpen(!isQueueOpen)}
            aria-label="Toggle playback queue"
            className={`p-2 rounded-lg transition-colors cursor-pointer ${
              isQueueOpen ? 'text-[var(--accent)] bg-[var(--accent-soft)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
            title="Playback Queue"
          >
            <ListMusic className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-1.5 ml-1">
            <button
              onClick={() => setVolume(settings.volume > 0 ? 0 : 0.85)}
              aria-label={settings.volume === 0 ? 'Unmute' : 'Mute'}
              className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              {settings.volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.02}
              value={settings.volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              aria-label="Volume"
              className="w-20 h-1.5 accent-[var(--accent)] cursor-pointer"
            />
          </div>

          <button
            onClick={() => setIsFullPlayerOpen(true)}
            aria-label="Expand full-screen player"
            className="p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
            title="Full-screen Player (F)"
          >
            <Expand className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Mobile compact mini-player */}
      <div className="md:hidden relative px-3 py-2 flex items-center gap-3">
        <div
          className="absolute top-0 left-0 right-0 h-[3px] bg-white/10"
          aria-hidden="true"
        >
          <div
            className="h-full transition-all duration-150"
            style={{
              width: `${Math.min(100, (currentTime / progressMax) * 100)}%`,
              background:
                'linear-gradient(90deg, var(--accent) 0%, color-mix(in srgb, var(--accent) 65%, #ffffff 35%) 100%)',
              boxShadow: '0 0 8px color-mix(in srgb, var(--accent) 60%, transparent)',
            }}
          />
        </div>
        <button
          onClick={() => setIsFullPlayerOpen(true)}
          className="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer"
        >
          <TrackArtwork
            trackId={currentTrack.id}
            hasArtwork={currentTrack.hasArtwork}
            artworkUrl={currentTrack.artworkUrl}
            title={currentTrack.title}
            artist={currentTrack.artist}
            size="xs"
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{currentTrack.title}</p>
            <p className="text-[13px] text-[var(--text-secondary)] truncate">{currentTrack.artist}</p>
          </div>
        </button>

        <button
          onClick={() => void toggleFavorite(currentTrack.id)}
          aria-label="Toggle favorite"
          className="min-w-[40px] min-h-[40px] flex items-center justify-center text-[var(--text-muted)]"
        >
          <Heart className={`w-4 h-4 ${currentTrack.isFavorite ? 'fill-[var(--accent)] text-[var(--accent)]' : ''}`} />
        </button>
        <button
          onClick={() => void togglePlayPause()}
          aria-label={isPlaying ? 'Pause' : 'Play'}
          className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-full bg-[var(--accent)] text-[var(--accent-contrast)]"
        >
          {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
        </button>
        <button
          onClick={() => void playNext(true)}
          aria-label="Next track"
          className="min-w-[40px] min-h-[40px] flex items-center justify-center text-[var(--text-primary)]"
        >
          <SkipForward className="w-4 h-4 fill-current" />
        </button>
      </div>
    </div>
  );
};
