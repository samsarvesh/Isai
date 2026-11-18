import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  Download,
  Edit3,
  GripVertical,
  Play,
  Plus,
  Shuffle,
  Trash2,
} from 'lucide-react';
import { TrackArtwork } from '../components/TrackArtwork';
import { TrackRow } from '../components/TrackRow';
import { useSonora } from '../contexts/SonoraContext';
import { downloadTextFile, exportPlaylistToM3U8, formatDuration } from '../utils/formatters';

export const PlaylistDetailView: React.FC = () => {
  const {
    playlists,
    tracks,
    trackMap,
    selectedPlaylistId,
    setActiveView,
    updatePlaylistData,
    removePlaylist,
    playTracksList,
  } = useSonora();

  const playlist = playlists.find((p) => p.id === selectedPlaylistId);
  const [editingMeta, setEditingMeta] = useState(false);
  const [nameDraft, setNameDraft] = useState(playlist?.name || '');
  const [descDraft, setDescDraft] = useState(playlist?.description || '');
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [addTrackId, setAddTrackId] = useState('');

  const playlistTracks = useMemo(() => {
    if (!playlist) return [];
    return playlist.trackIds.map((id) => trackMap.get(id)).filter((t): t is NonNullable<typeof t> => !!t);
  }, [playlist, trackMap]);

  if (!playlist) {
    return (
      <div className="p-8 text-center">
        <p className="text-base text-[var(--text-muted)] mb-3">Playlist not found.</p>
        <button
          onClick={() => setActiveView('playlists')}
          className="px-4 py-2 rounded-lg bg-[var(--accent)] text-[var(--accent-contrast)] text-sm font-semibold cursor-pointer"
        >
          Back to Playlists
        </button>
      </div>
    );
  }

  const totalDuration = playlistTracks.reduce((acc, t) => acc + (t.duration || 0), 0);
  const coverTrack = playlistTracks.find((t) => t.hasArtwork) || playlistTracks[0];
  const availableToAdd = tracks.filter((t) => !playlist.trackIds.includes(t.id));

  const saveMeta = async (e: React.FormEvent) => {
    e.preventDefault();
    await updatePlaylistData({
      ...playlist,
      name: nameDraft.trim() || playlist.name,
      description: descDraft.trim(),
    });
    setEditingMeta(false);
  };

  const handleDrop = (targetIdx: number) => {
    if (dragIndex === null || dragIndex === targetIdx) return;
    const nextIds = [...playlist.trackIds];
    const [moved] = nextIds.splice(dragIndex, 1);
    nextIds.splice(targetIdx, 0, moved);
    setDragIndex(null);
    void updatePlaylistData({ ...playlist, trackIds: nextIds });
  };

  const handleRemoveAt = (index: number) => {
    const nextIds = playlist.trackIds.filter((_, idx) => idx !== index);
    void updatePlaylistData({ ...playlist, trackIds: nextIds });
  };

  return (
    <div className="space-y-6 pb-8">
      <button
        onClick={() => setActiveView('playlists')}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" /> All Playlists
      </button>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end gap-5 p-6 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
        <TrackArtwork
          trackId={coverTrack?.id}
          hasArtwork={coverTrack?.hasArtwork}
          artworkUrl={coverTrack?.artworkUrl}
          title={playlist.name}
          size="lg"
        />
        <div className="flex-1 min-w-0 space-y-2">
          {editingMeta ? (
            <form onSubmit={(e) => void saveMeta(e)} className="space-y-2 max-w-md">
              <input
                type="text"
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-1.5 text-base font-bold"
              />
              <input
                type="text"
                value={descDraft}
                onChange={(e) => setDescDraft(e.target.value)}
                placeholder="Playlist description"
                className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 text-sm"
              />
              <div className="flex gap-2">
                <button type="submit" className="px-3.5 py-1.5 rounded-lg bg-[var(--accent)] text-[var(--accent-contrast)] text-sm font-semibold cursor-pointer">
                  Save
                </button>
                <button type="button" onClick={() => setEditingMeta(false)} className="px-3.5 py-1.5 text-sm text-[var(--text-muted)] cursor-pointer">
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl sm:text-3xl font-bold truncate">{playlist.name}</h1>
                <button
                  onClick={() => {
                    setNameDraft(playlist.name);
                    setDescDraft(playlist.description);
                    setEditingMeta(true);
                  }}
                  aria-label="Edit playlist details"
                  className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                >
                  <Edit3 className="w-4 h-4" />
                </button>
              </div>
              {playlist.description && <p className="text-sm text-[var(--text-secondary)]">{playlist.description}</p>}
              <p className="text-sm text-[var(--text-muted)] font-mono tabular-nums">
                {playlistTracks.length} songs · {formatDuration(totalDuration)}
              </p>
            </>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-2">
            <button
              onClick={() => playlistTracks.length > 0 && void playTracksList(playlistTracks)}
              disabled={playlistTracks.length === 0}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--accent)] text-[var(--accent-contrast)] text-sm font-semibold disabled:opacity-40 cursor-pointer"
            >
              <Play className="w-4 h-4 fill-current" /> Play
            </button>
            <button
              onClick={() => playlistTracks.length > 0 && void playTracksList(playlistTracks, undefined, true)}
              disabled={playlistTracks.length === 0}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--bg-elevated)] text-sm font-medium hover:bg-[var(--bg-hover)] disabled:opacity-40 cursor-pointer"
            >
              <Shuffle className="w-4 h-4" /> Shuffle
            </button>
            <button
              onClick={() => {
                const m3u = exportPlaylistToM3U8(playlist, trackMap);
                downloadTextFile(`${playlist.name.replace(/[^a-z0-9-_]+/gi, '_')}.m3u8`, m3u);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-[var(--border-subtle)] text-sm font-medium hover:bg-[var(--bg-hover)] cursor-pointer"
            >
              <Download className="w-4 h-4" /> Export M3U8
            </button>
            <button
              onClick={() => void removePlaylist(playlist.id)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm text-rose-400 hover:bg-[var(--bg-hover)] cursor-pointer"
            >
              <Trash2 className="w-4 h-4" /> Delete
            </button>
          </div>
        </div>
      </div>

      {/* Add Song Picker */}
      {availableToAdd.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-2">
          <select
            value={addTrackId || availableToAdd[0].id}
            onChange={(e) => setAddTrackId(e.target.value)}
            className="flex-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3.5 py-2.5 text-sm"
          >
            {availableToAdd.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title} — {t.artist}
              </option>
            ))}
          </select>
          <button
            onClick={() => {
              const idToAdd = addTrackId || availableToAdd[0]?.id;
              if (!idToAdd) return;
              void updatePlaylistData({
                ...playlist,
                trackIds: [...playlist.trackIds, idToAdd],
              });
              setAddTrackId('');
            }}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-[var(--bg-elevated)] text-sm font-medium hover:bg-[var(--bg-hover)] cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4" /> Add Song
          </button>
        </div>
      )}

      {/* Drag-and-Drop Track List */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
        {playlistTracks.length === 0 ? (
          <p className="p-8 text-center text-sm text-[var(--text-muted)]">
            This playlist has no songs yet. Add uploaded songs above.
          </p>
        ) : (
          playlistTracks.map((track, idx) => (
            <div
              key={`${track.id}-${idx}`}
              draggable
              onDragStart={() => setDragIndex(idx)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(idx)}
              className="flex items-center"
            >
              <div
                className="pl-2.5 text-[var(--text-muted)] cursor-grab active:cursor-grabbing hidden sm:flex items-center"
                title="Drag to reorder"
              >
                <GripVertical className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <TrackRow
                  track={track}
                  index={idx}
                  contextQueue={playlistTracks}
                  onRemoveFromPlaylist={() => handleRemoveAt(idx)}
                />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
