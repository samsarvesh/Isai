import React, { useState } from 'react';
import {
  Heart,
  ListPlus,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Radio,
  SkipForward,
  Trash2,
  WifiOff,
} from 'lucide-react';
import { useSonora } from '../contexts/SonoraContext';
import type { Track } from '../types/music';
import { formatDuration, getTrackAvailability } from '../utils/formatters';
import { TrackArtwork } from './TrackArtwork';

interface TrackRowProps {
  track: Track;
  index?: number;
  contextQueue?: Track[];
  showAlbum?: boolean;
  onRemoveFromPlaylist?: () => void;
}

export const TrackRow: React.FC<TrackRowProps> = ({
  track,
  index,
  contextQueue,
  showAlbum = true,
  onRemoveFromPlaylist,
}) => {
  const {
    currentTrack,
    isPlaying,
    isOnline,
    playlists,
    playTrack,
    togglePlayPause,
    toggleFavorite,
    playTrackNext,
    addToQueue,
    startSmartRadio,
    addTrackToPlaylist,
    setEditingTrack,
    deleteTrackFromLibrary,
  } = useSonora();

  const [menuOpen, setMenuOpen] = useState(false);
  const isCurrent = currentTrack?.id === track.id;
  const availability = getTrackAvailability(track, isOnline);
  const isUnavailable = availability === 'unavailable-offline';

  const handleRowPlay = () => {
    if (isUnavailable) return;
    if (isCurrent) {
      void togglePlayPause();
    } else {
      void playTrack(track, contextQueue);
    }
  };

  return (
    <div
      className={`group relative flex items-center gap-3 px-3 py-2 rounded-lg transition-colors border-b border-[var(--border-subtle)] last:border-b-0 ${
        isCurrent ? 'bg-[var(--accent-soft)]' : 'hover:bg-[var(--bg-hover)]/70'
      } ${isUnavailable ? 'opacity-55' : ''}`}
    >
      {/* Index / Play toggle */}
      <button
        onClick={handleRowPlay}
        disabled={isUnavailable}
        aria-label={isCurrent && isPlaying ? `Pause ${track.title}` : `Play ${track.title}`}
        className="w-8 h-10 flex items-center justify-center shrink-0 text-[13px] font-mono tabular-nums text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer disabled:cursor-not-allowed"
      >
        {isCurrent && isPlaying ? (
          <Pause className="w-4 h-4 text-[var(--accent)]" />
        ) : (
          <>
            <span className="group-hover:hidden">{index !== undefined ? index + 1 : '♪'}</span>
            <Play className="w-4 h-4 hidden group-hover:block text-[var(--text-primary)]" />
          </>
        )}
      </button>

      {/* Artwork */}
      <button
        onClick={handleRowPlay}
        disabled={isUnavailable}
        className="shrink-0 cursor-pointer disabled:cursor-not-allowed"
        tabIndex={-1}
      >
        <TrackArtwork
          trackId={track.id}
          hasArtwork={track.hasArtwork}
          artworkUrl={track.artworkUrl}
          title={track.title}
          artist={track.artist}
          size="sm"
        />
      </button>

      {/* Title & unboxed metadata */}
      <div className="min-w-0 flex-1 cursor-pointer" onClick={handleRowPlay}>
        <div className="flex items-center gap-2 min-w-0">
          <p className={`text-[15px] font-medium truncate ${isCurrent ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]'}`}>
            {track.title}
          </p>
          {isUnavailable && <WifiOff className="w-3.5 h-3.5 shrink-0 text-amber-400" />}
        </div>
        <div className="flex items-center gap-1.5 text-[13px] text-[var(--text-secondary)] truncate">
          <span className="truncate">{track.artist}</span>
          {showAlbum && (
            <>
              <span aria-hidden="true">·</span>
              <span className="truncate hidden sm:inline">{track.album}</span>
            </>
          )}
          <span aria-hidden="true">·</span>
          <span className="shrink-0">{track.language}</span>
          <span aria-hidden="true">·</span>
          <span className="shrink-0 uppercase font-mono text-[13px]">
            {track.sourceType === 'local'
              ? track.format
              : track.sourceType === 'gdrive'
              ? 'Google Drive'
              : 'Firebase Cloud'}
          </span>
        </div>
      </div>

      {/* Format / Lyrics indicator */}
      <div className="hidden md:flex items-center gap-3 text-[13px] text-[var(--text-muted)] shrink-0">
        {(track.lrcContent || track.embeddedLyrics) && (
          <span className="font-mono text-[13px]">LRC</span>
        )}
      </div>

      {/* Favorite toggle */}
      <button
        onClick={() => void toggleFavorite(track.id)}
        aria-label={track.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer shrink-0"
      >
        <Heart className={`w-4 h-4 ${track.isFavorite ? 'fill-[var(--accent)] text-[var(--accent)]' : ''}`} />
      </button>

      {/* Duration */}
      <span className="w-14 text-right text-[13px] font-mono tabular-nums text-[var(--text-muted)] shrink-0">
        {formatDuration(track.duration)}
      </span>

      {/* Actions menu */}
      <div className="relative shrink-0">
        <button
          onClick={() => setMenuOpen((o) => !o)}
          aria-label={`More options for ${track.title}`}
          className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] cursor-pointer"
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>

        {menuOpen && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
            <div className="absolute right-0 top-10 z-40 w-60 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] py-1.5 shadow-xl">
              <button
                onClick={() => {
                  playTrackNext(track);
                  setMenuOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-left text-[var(--text-primary)] hover:bg-[var(--bg-hover)] cursor-pointer"
              >
                <SkipForward className="w-4 h-4" /> Play Next
              </button>
              <button
                onClick={() => {
                  addToQueue(track);
                  setMenuOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-left text-[var(--text-primary)] hover:bg-[var(--bg-hover)] cursor-pointer"
              >
                <ListPlus className="w-4 h-4" /> Add to Queue
              </button>
              <button
                onClick={() => {
                  void startSmartRadio(track);
                  setMenuOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-left text-[var(--text-primary)] hover:bg-[var(--bg-hover)] cursor-pointer"
              >
                <Radio className="w-4 h-4" /> Start Smart Radio
              </button>
              {playlists.length > 0 && (
                <div className="my-1 border-t border-[var(--border-subtle)] pt-1">
                  <p className="px-3.5 py-1 text-[13px] font-medium text-[var(--text-muted)]">Add to Playlist</p>
                  <div className="max-h-28 overflow-y-auto">
                    {playlists.map((pl) => (
                      <button
                        key={pl.id}
                        onClick={() => {
                          void addTrackToPlaylist(pl.id, track.id);
                          setMenuOpen(false);
                        }}
                        className="w-full px-3.5 py-1.5 text-sm text-left text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] truncate cursor-pointer"
                      >
                        {pl.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="my-1 border-t border-[var(--border-subtle)] pt-1">
                <button
                  onClick={() => {
                    setEditingTrack(track);
                    setMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-left text-[var(--text-primary)] hover:bg-[var(--bg-hover)] cursor-pointer"
                >
                  <Pencil className="w-4 h-4" /> Edit Song Info
                </button>
                {onRemoveFromPlaylist && (
                  <button
                    onClick={() => {
                      onRemoveFromPlaylist();
                      setMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-left text-amber-400 hover:bg-[var(--bg-hover)] cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" /> Remove from Playlist
                  </button>
                )}
                <button
                  onClick={() => {
                    void deleteTrackFromLibrary(track.id);
                    setMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-left text-rose-400 hover:bg-[var(--bg-hover)] cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />{' '}
                  {track.sourceType === 'gdrive'
                    ? 'Delete from Google Drive'
                    : track.sourceType === 'firebase'
                    ? 'Delete from Firebase Cloud'
                    : 'Remove from Player'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
