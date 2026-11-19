import React, { useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Cloud,
  CloudUpload,
  Download,
  Edit3,
  FolderUp,
  GripVertical,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Search,
  Shuffle,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { GoogleSignInButton } from '../components/GoogleSignInButton';
import { TrackArtwork } from '../components/TrackArtwork';
import { TrackRow } from '../components/TrackRow';
import { useSonora } from '../contexts/SonoraContext';
import { ALL_SONGS_PLAYLIST_ID } from '../types/music';
import { downloadTextFile, exportPlaylistToM3U8, formatDuration } from '../utils/formatters';

export const PlaylistDetailView: React.FC = () => {
  const {
    playlists,
    tracks,
    firebaseTracks,
    trackMap,
    selectedPlaylistId,
    isFirebaseConnected,
    isFirebaseSigningIn,
    isSyncingCloud,
    firebaseUser,
    cloudUploadProgress,
    isDeletingAllFirebase,
    firebaseDeleteProgress,
    hideLegacyFirebaseTracks,
    setHideLegacyFirebaseTracks,
    deleteAllFirebaseTracks,
    importProgress,
    connectFirebaseCloud,
    refreshDriveLibrary,
    uploadFilesToCloud,
    handleImportFiles,
    setActiveView,
    updatePlaylistData,
    removePlaylist,
    playTracksList,
  } = useSonora();

  const isAllSongs = selectedPlaylistId === ALL_SONGS_PLAYLIST_ID;
  const playlist = isAllSongs ? undefined : playlists.find((p) => p.id === selectedPlaylistId);

  const [editingMeta, setEditingMeta] = useState(false);
  const [nameDraft, setNameDraft] = useState(playlist?.name || '');
  const [descDraft, setDescDraft] = useState(playlist?.description || '');
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addSearch, setAddSearch] = useState('');
  const [confirmPurgeFirebase, setConfirmPurgeFirebase] = useState(false);

  const localFileInputRef = useRef<HTMLInputElement | null>(null);
  const cloudFileInputRef = useRef<HTMLInputElement | null>(null);
  const cloudFolderInputRef = useRef<HTMLInputElement | null>(null);

  const playlistTracks = useMemo(() => {
    if (isAllSongs) {
      return [...tracks].sort((a, b) => b.dateAdded - a.dateAdded);
    }
    if (!playlist) return [];
    return playlist.trackIds.map((id) => trackMap.get(id)).filter((t): t is NonNullable<typeof t> => !!t);
  }, [isAllSongs, playlist, trackMap, tracks]);

  if (!isAllSongs && !playlist) {
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

  const displayName = isAllSongs ? 'All Songs' : playlist!.name;
  const displayDesc = isAllSongs
    ? 'All personal songs from Google Drive and local storage'
    : playlist!.description;

  const totalDuration = playlistTracks.reduce((acc, t) => acc + (t.duration || 0), 0);
  const coverTrack = playlistTracks.find((t) => t.hasArtwork) || playlistTracks[0];
  const availableToAdd = !isAllSongs && playlist ? tracks.filter((t) => !playlist.trackIds.includes(t.id)) : [];
  const filteredAvailable = addSearch.trim()
    ? availableToAdd.filter((t) => {
        const q = addSearch.toLowerCase();
        return (
          t.title.toLowerCase().includes(q) ||
          t.artist.toLowerCase().includes(q) ||
          t.album.toLowerCase().includes(q)
        );
      })
    : availableToAdd;

  const saveMeta = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!playlist) return;
    await updatePlaylistData({
      ...playlist,
      name: nameDraft.trim() || playlist.name,
      description: descDraft.trim(),
    });
    setEditingMeta(false);
  };

  const handleDrop = (targetIdx: number) => {
    if (!playlist || dragIndex === null || dragIndex === targetIdx) return;
    const nextIds = [...playlist.trackIds];
    const [moved] = nextIds.splice(dragIndex, 1);
    nextIds.splice(targetIdx, 0, moved);
    setDragIndex(null);
    void updatePlaylistData({ ...playlist, trackIds: nextIds });
  };

  const handleRemoveAt = (index: number) => {
    if (!playlist) return;
    const nextIds = playlist.trackIds.filter((_, idx) => idx !== index);
    void updatePlaylistData({ ...playlist, trackIds: nextIds });
  };

  return (
    <div className="space-y-6 pb-8">
      {isAllSongs && (
        <>
          <input
            ref={localFileInputRef}
            type="file"
            multiple
            accept=".mp3,.wav,.flac,.aac,.m4a,.ogg,.opus,.lrc,audio/*"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) void handleImportFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <input
            ref={cloudFileInputRef}
            type="file"
            multiple
            accept=".mp3,.wav,.flac,.aac,.m4a,.ogg,.opus,.lrc,audio/*"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) void uploadFilesToCloud(e.target.files);
              e.target.value = '';
            }}
          />
          <input
            ref={cloudFolderInputRef}
            type="file"
            // @ts-expect-error webkitdirectory attribute
            webkitdirectory=""
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) void uploadFilesToCloud(e.target.files);
              e.target.value = '';
            }}
          />
        </>
      )}

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
          title={displayName}
          size="lg"
        />
        <div className="flex-1 min-w-0 space-y-2">
          {!isAllSongs && editingMeta && playlist ? (
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
                <h1 className="text-2xl sm:text-3xl font-bold truncate">{displayName}</h1>
                {!isAllSongs && playlist && (
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
                )}
              </div>
              {displayDesc && <p className="text-sm text-[var(--text-secondary)]">{displayDesc}</p>}
              <p className="text-sm text-[var(--text-muted)] font-mono tabular-nums">
                {playlistTracks.length} {playlistTracks.length === 1 ? 'song' : 'songs'} · {formatDuration(totalDuration)}
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
            {!isAllSongs && playlist && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setAddSearch('');
                    setShowAddModal(true);
                  }}
                  title="Add songs"
                  aria-label="Add songs"
                  className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] cursor-pointer transition-colors"
                >
                  <Plus className="w-4 h-4" />
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
              </>
            )}
          </div>
        </div>
      </div>

      {/* Google Drive Music Locker & Upload Controls (inside All Songs) */}
      {isAllSongs && (
        <div className="space-y-4">
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

          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <Cloud className="w-5 h-5 text-[var(--accent)] mt-0.5 shrink-0" />
                <div>
                  <h2 className="text-base font-bold flex items-center gap-2">
                    Google Drive Music Locker
                    {isFirebaseConnected && firebaseUser?.email ? ` · ${firebaseUser.email}` : ''}
                    {isSyncingCloud && <Loader2 className="w-4 h-4 animate-spin text-[var(--accent)]" />}
                  </h2>
                  <p className="text-sm text-[var(--text-secondary)] mt-0.5 leading-relaxed">
                    {isFirebaseConnected
                      ? 'Signed in — bulk-upload songs or folders (MP3, FLAC, M4A, WAV) to your "ISAI Music Locker" folder. Cached songs and lossless covers play offline without logging in again.'
                      : 'Connect Google Drive to bulk-upload hundreds of songs using your own Drive storage (15 GB+), or import locally for offline playback.'}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {!isFirebaseConnected ? (
                  <GoogleSignInButton
                    onClick={() => void connectFirebaseCloud()}
                    loading={isFirebaseSigningIn}
                    label="Connect Google Drive"
                  />
                ) : (
                  <>
                    <button
                      onClick={() => cloudFileInputRef.current?.click()}
                      disabled={!!cloudUploadProgress}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--accent)] text-[var(--accent-contrast)] text-sm font-semibold hover:opacity-90 disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <CloudUpload className="w-4 h-4" /> Upload Songs to Drive
                    </button>
                    <button
                      onClick={() => cloudFolderInputRef.current?.click()}
                      disabled={!!cloudUploadProgress}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-sm font-medium hover:bg-[var(--bg-hover)] disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <FolderUp className="w-4 h-4" /> Upload Folder
                    </button>
                    <button
                      onClick={() => void refreshDriveLibrary()}
                      disabled={isSyncingCloud || !!cloudUploadProgress}
                      title="Sync Google Drive Music Locker"
                      aria-label="Sync Google Drive Music Locker"
                      className="p-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] disabled:opacity-50 cursor-pointer shrink-0"
                    >
                      <RefreshCw className={`w-4 h-4 ${isSyncingCloud ? 'animate-spin' : ''}`} />
                    </button>
                  </>
                )}
                <button
                  onClick={() => localFileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-sm font-medium hover:bg-[var(--bg-hover)] cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Upload className="w-4 h-4" /> Add Local Files
                </button>
              </div>
            </div>

            {cloudUploadProgress && (
              <div className="pt-3 border-t border-[var(--border-subtle)] space-y-2">
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="text-[var(--text-secondary)] truncate">
                    Uploading to Google Drive: <strong className="text-[var(--text-primary)]">{cloudUploadProgress.fileName}</strong>
                  </span>
                  <span className="font-mono tabular-nums text-[var(--accent)] shrink-0">
                    {cloudUploadProgress.done} / {cloudUploadProgress.total}
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-[var(--bg-elevated)] overflow-hidden">
                  <div
                    className="h-full bg-[var(--accent)] transition-all duration-300"
                    style={{
                      width: `${Math.max(4, Math.round((cloudUploadProgress.done / Math.max(1, cloudUploadProgress.total)) * 100))}%`,
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          {firebaseTracks.length > 0 && (
            <div className="rounded-xl border border-rose-500/25 bg-rose-500/[0.06] px-4 py-3.5 space-y-2.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--text-primary)]">
                    {firebaseTracks.length} legacy song{firebaseTracks.length === 1 ? '' : 's'} still stored in Firebase Cloud
                  </p>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">
                    {hideLegacyFirebaseTracks
                      ? 'Currently hidden from your library. You can permanently delete them from Firebase Cloud or show them again.'
                      : 'Permanently delete all legacy songs and audio chunks from Firebase Cloud now that Google Drive is active.'}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {isDeletingAllFirebase ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/20 text-rose-300 text-xs font-semibold">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Removing...
                    </span>
                  ) : !confirmPurgeFirebase ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setConfirmPurgeFirebase(true)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-xs font-semibold cursor-pointer whitespace-nowrap"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Remove All from Firebase Cloud
                      </button>
                      <button
                        type="button"
                        onClick={() => setHideLegacyFirebaseTracks(!hideLegacyFirebaseTracks)}
                        className="px-3 py-1.5 rounded-lg bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] text-xs text-[var(--text-secondary)] cursor-pointer whitespace-nowrap"
                      >
                        {hideLegacyFirebaseTracks ? 'Show in Library' : 'Hide from Library'}
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmPurgeFirebase(false);
                          void deleteAllFirebaseTracks();
                        }}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-rose-500 text-white text-xs font-semibold hover:bg-rose-600 cursor-pointer whitespace-nowrap"
                      >
                        Confirm Delete All ({firebaseTracks.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmPurgeFirebase(false)}
                        className="px-3 py-1.5 rounded-lg bg-[var(--bg-elevated)] text-xs text-[var(--text-secondary)] cursor-pointer whitespace-nowrap"
                      >
                        Cancel
                      </button>
                    </>
                  )}
                </div>
              </div>

              {firebaseDeleteProgress && (
                <div className="pt-2 border-t border-rose-500/20 space-y-1.5">
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="text-[var(--text-secondary)] truncate">
                      Removing from Firebase Cloud: <strong className="text-[var(--text-primary)]">{firebaseDeleteProgress.title}</strong>
                    </span>
                    <span className="font-mono tabular-nums text-rose-300 shrink-0">
                      {firebaseDeleteProgress.done} / {firebaseDeleteProgress.total}
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-[var(--bg-elevated)] overflow-hidden">
                    <div
                      className="h-full bg-rose-400 transition-all duration-300"
                      style={{
                        width: `${Math.max(4, Math.round((firebaseDeleteProgress.done / Math.max(1, firebaseDeleteProgress.total)) * 100))}%`,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Track List */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
        {playlistTracks.length === 0 ? (
          <p className="p-8 text-center text-sm text-[var(--text-muted)]">
            {isAllSongs
              ? 'No personal songs uploaded yet. Connect Google Drive or add local audio files above.'
              : 'This playlist has no songs yet. Click the + icon above to add songs.'}
          </p>
        ) : isAllSongs ? (
          playlistTracks.map((track, idx) => (
            <TrackRow
              key={track.id}
              track={track}
              index={idx}
              contextQueue={playlistTracks}
            />
          ))
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

      {/* Add Songs Modal */}
      {!isAllSongs && playlist && showAddModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setShowAddModal(false)}
        >
          <div
            className="w-full max-w-lg max-h-[78vh] flex flex-col rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2 px-5 py-4 border-b border-[var(--border-subtle)]">
              <div className="min-w-0">
                <h2 className="text-base font-bold truncate">Add songs to {playlist.name}</h2>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  {availableToAdd.length} song{availableToAdd.length === 1 ? '' : 's'} available
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                aria-label="Close"
                className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {availableToAdd.length > 0 && (
              <div className="px-4 py-3 border-b border-[var(--border-subtle)]">
                <div className="relative">
                  <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={addSearch}
                    onChange={(e) => setAddSearch(e.target.value)}
                    placeholder="Search songs by title or artist..."
                    autoFocus
                    className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] pl-9 pr-3 py-2 text-sm"
                  />
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto divide-y divide-[var(--border-subtle)]/60">
              {filteredAvailable.length === 0 ? (
                <p className="p-8 text-center text-sm text-[var(--text-muted)]">
                  {availableToAdd.length === 0
                    ? 'All your songs are already in this playlist.'
                    : 'No matching songs found.'}
                </p>
              ) : (
                filteredAvailable.map((track) => (
                  <div
                    key={track.id}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--bg-hover)]/50 transition-colors"
                  >
                    <TrackArtwork
                      trackId={track.id}
                      hasArtwork={track.hasArtwork}
                      artworkUrl={track.artworkUrl}
                      title={track.title}
                      artist={track.artist}
                      size="xs"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold truncate">{track.title}</p>
                      <p className="text-xs text-[var(--text-muted)] truncate">{track.artist}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        void updatePlaylistData({
                          ...playlist,
                          trackIds: [...playlist.trackIds, track.id],
                        })
                      }
                      aria-label={`Add ${track.title}`}
                      title={`Add ${track.title}`}
                      className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--bg-elevated)] text-[var(--text-primary)] hover:bg-[var(--accent)] hover:text-[var(--accent-contrast)] cursor-pointer transition-colors shrink-0"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
