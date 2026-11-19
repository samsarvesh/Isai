import React, { useMemo, useState } from 'react';
import {
  Play,
  Plus,
  Shuffle,
} from 'lucide-react';
import { TrackArtwork } from '../components/TrackArtwork';
import { useSonora } from '../contexts/SonoraContext';
import { ALL_SONGS_PLAYLIST_ID } from '../types/music';
import { formatDuration } from '../utils/formatters';

export const PlaylistsView: React.FC = () => {
  const {
    tracks,
    localTracks,
    firebaseTracks,
    driveTracks,
    trackMap,
    playlists,
    hideLegacyFirebaseTracks,
    importProgress,
    createPlaylist,
    openPlaylistDetail,
    playTracksList,
  } = useSonora();

  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const sortedTracks = useMemo(() => [...tracks].sort((a, b) => b.dateAdded - a.dateAdded), [tracks]);
  const allSongsDuration = useMemo(
    () => sortedTracks.reduce((acc, t) => acc + (t.duration || 0), 0),
    [sortedTracks]
  );
  const allSongsCover = useMemo(
    () => sortedTracks.find((t) => t.hasArtwork) || sortedTracks[0],
    [sortedTracks]
  );

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    const created = await createPlaylist({
      name: newName.trim(),
      description: newDesc.trim(),
      trackIds: [],
    });
    setNewName('');
    setNewDesc('');
    setShowCreate(false);
    openPlaylistDetail(created.id);
  };

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-[var(--border-subtle)]">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Playlists &amp; Music</h1>
          <p className="text-sm text-[var(--text-muted)] font-mono tabular-nums mt-1">
            {playlists.length + 1} playlists · {tracks.length} personal songs ({driveTracks.length} Google Drive
            {!hideLegacyFirebaseTracks && firebaseTracks.length > 0 ? ` · ${firebaseTracks.length} Firebase` : ''} · {localTracks.length} local)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowCreate((v) => !v)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--accent)] text-[var(--accent-contrast)] text-sm font-semibold cursor-pointer whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" /> New Playlist
          </button>
        </div>
      </div>

      {/* Create Local Playlist Form */}
      {showCreate && (
        <form
          onSubmit={(e) => void handleCreate(e)}
          className="w-full rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] items-center gap-3"
        >
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Playlist name"
            required
            className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 text-sm"
          />
          <input
            type="text"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            placeholder="Description (optional)"
            className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 text-sm"
          />
          <div className="flex justify-end gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="px-3.5 py-2 rounded-lg text-sm text-[var(--text-secondary)] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-[var(--accent)] text-[var(--accent-contrast)] text-sm font-semibold cursor-pointer"
            >
              Create
            </button>
          </div>
        </form>
      )}

      {/* Local Import Progress */}
      {importProgress && (
        <div className="rounded-xl border border-[var(--accent)]/40 bg-[var(--accent-soft)] p-3.5">
          <div className="flex items-center justify-between text-sm font-medium">
            <span className="truncate pr-3">Importing audio: {importProgress.fileName}</span>
            <span className="font-mono tabular-nums shrink-0">
              {importProgress.processed} / {importProgress.total}
            </span>
          </div>
        </div>
      )}

      {/* Playlists Grid (All Songs + User Playlists) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-5">
        {/* Built-in All Songs Playlist Card */}
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 flex flex-col justify-between gap-4">
          <button
            onClick={() => openPlaylistDetail(ALL_SONGS_PLAYLIST_ID)}
            className="flex items-start gap-3.5 text-left cursor-pointer"
          >
            <TrackArtwork
              trackId={allSongsCover?.id}
              hasArtwork={allSongsCover?.hasArtwork}
              artworkUrl={allSongsCover?.artworkUrl}
              title="All Songs"
              size="md"
            />
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-bold truncate">All Songs</h3>
              <p className="text-[13px] text-[var(--text-muted)] font-mono tabular-nums mt-0.5">
                {sortedTracks.length} {sortedTracks.length === 1 ? 'song' : 'songs'} · {formatDuration(allSongsDuration)}
              </p>
              <p className="text-[13px] text-[var(--text-secondary)] line-clamp-2 mt-1">
                All personal songs from Google Drive and local storage
              </p>
            </div>
          </button>

          <div className="flex items-center justify-between pt-3 border-t border-[var(--border-subtle)]">
            <button
              onClick={() => sortedTracks.length > 0 && void playTracksList(sortedTracks)}
              disabled={sortedTracks.length === 0}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[var(--accent)] text-[var(--accent-contrast)] text-sm font-semibold disabled:opacity-40 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-current" /> Play
            </button>

            <button
              onClick={() => sortedTracks.length > 0 && void playTracksList(sortedTracks, undefined, true)}
              disabled={sortedTracks.length === 0}
              title="Shuffle All Songs"
              aria-label="Shuffle All Songs"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] text-xs font-medium disabled:opacity-40 cursor-pointer"
            >
              <Shuffle className="w-3.5 h-3.5" /> Shuffle
            </button>
          </div>
        </div>

        {/* User Playlists */}
        {playlists.map((pl) => {
          const plTracks = pl.trackIds.map((id) => trackMap.get(id)).filter((t): t is NonNullable<typeof t> => !!t);
          const totalDuration = plTracks.reduce((acc, t) => acc + (t.duration || 0), 0);
          const coverTrack = plTracks.find((t) => t.hasArtwork) || plTracks[0];

          return (
            <div
              key={pl.id}
              className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 flex flex-col justify-between gap-4"
            >
              <button
                onClick={() => openPlaylistDetail(pl.id)}
                className="flex items-start gap-3.5 text-left cursor-pointer"
              >
                <TrackArtwork
                  trackId={coverTrack?.id}
                  hasArtwork={coverTrack?.hasArtwork}
                  artworkUrl={coverTrack?.artworkUrl}
                  title={pl.name}
                  size="md"
                />
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-bold truncate">{pl.name}</h3>
                  <p className="text-[13px] text-[var(--text-muted)] font-mono tabular-nums mt-0.5">
                    {plTracks.length} {plTracks.length === 1 ? 'song' : 'songs'} · {formatDuration(totalDuration)}
                  </p>
                  {pl.description && (
                    <p className="text-[13px] text-[var(--text-secondary)] line-clamp-2 mt-1">{pl.description}</p>
                  )}
                </div>
              </button>

              <div className="flex items-center justify-between pt-3 border-t border-[var(--border-subtle)]">
                <button
                  onClick={() => plTracks.length > 0 && void playTracksList(plTracks)}
                  disabled={plTracks.length === 0}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[var(--accent)] text-[var(--accent-contrast)] text-sm font-semibold disabled:opacity-40 cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-current" /> Play
                </button>

                <button
                  onClick={() => plTracks.length > 0 && void playTracksList(plTracks, undefined, true)}
                  disabled={plTracks.length === 0}
                  title={`Shuffle ${pl.name}`}
                  aria-label={`Shuffle ${pl.name}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] text-xs font-medium disabled:opacity-40 cursor-pointer"
                >
                  <Shuffle className="w-3.5 h-3.5" /> Shuffle
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
