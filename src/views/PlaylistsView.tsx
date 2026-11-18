import React, { useMemo, useRef, useState } from 'react';
import {
  Cloud,
  CloudUpload,
  Copy,
  Download,
  ExternalLink,
  FileUp,
  FolderUp,
  Link2,
  ListMusic,
  Loader2,
  Play,
  Plus,
  Shuffle,
  Trash2,
  Upload,
} from 'lucide-react';
import { GoogleSignInButton } from '../components/GoogleSignInButton';
import { TrackArtwork } from '../components/TrackArtwork';
import { TrackRow } from '../components/TrackRow';
import { useSonora } from '../contexts/SonoraContext';
import type { ExternalPlaylist } from '../types/music';
import { downloadTextFile, exportPlaylistToM3U8, formatDuration, parseM3U8Matches } from '../utils/formatters';

type PlaylistsTab = 'playlists' | 'songs' | 'linked';

const EXTERNAL_PLAYLISTS_KEY = 'isai-external-playlists';

function loadExternalPlaylists(): ExternalPlaylist[] {
  try {
    const raw = localStorage.getItem(EXTERNAL_PLAYLISTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseExternalPlaylistUrl(rawUrl: string): { provider: 'spotify' | 'youtube'; embedUrl: string; cleanUrl: string } | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  // Spotify playlist or album
  const spotifyPlaylistMatch = trimmed.match(/open\.spotify\.com\/(playlist|album)\/([a-zA-Z0-9]+)/i);
  if (spotifyPlaylistMatch) {
    const kind = spotifyPlaylistMatch[1].toLowerCase();
    const id = spotifyPlaylistMatch[2];
    return {
      provider: 'spotify',
      cleanUrl: `https://open.spotify.com/${kind}/${id}`,
      embedUrl: `https://open.spotify.com/embed/${kind}/${id}?utm_source=generator&theme=0`,
    };
  }
  const spotifyUriMatch = trimmed.match(/^spotify:(playlist|album):([a-zA-Z0-9]+)$/i);
  if (spotifyUriMatch) {
    const kind = spotifyUriMatch[1].toLowerCase();
    const id = spotifyUriMatch[2];
    return {
      provider: 'spotify',
      cleanUrl: `https://open.spotify.com/${kind}/${id}`,
      embedUrl: `https://open.spotify.com/embed/${kind}/${id}?utm_source=generator&theme=0`,
    };
  }

  // YouTube Music or YouTube playlist
  try {
    const url = new URL(trimmed);
    const host = url.hostname.toLowerCase();
    if (host.includes('youtube.com') || host.includes('youtu.be')) {
      const listId = url.searchParams.get('list');
      if (listId && /^[a-zA-Z0-9_-]+$/.test(listId)) {
        return {
          provider: 'youtube',
          cleanUrl: `https://music.youtube.com/playlist?list=${encodeURIComponent(listId)}`,
          embedUrl: `https://www.youtube.com/embed/videoseries?list=${encodeURIComponent(listId)}`,
        };
      }
    }
  } catch {
    // invalid URL
  }

  return null;
}

export const PlaylistsView: React.FC = () => {
  const {
    tracks,
    localTracks,
    firebaseTracks,
    trackMap,
    playlists,
    isOnline,
    isFirebaseConnected,
    isFirebaseSigningIn,
    isSyncingCloud,
    firebaseUser,
    cloudUploadProgress,
    importProgress,
    connectFirebaseCloud,
    uploadFilesToCloud,
    handleImportFiles,
    createPlaylist,
    removePlaylist,
    duplicatePlaylist,
    openPlaylistDetail,
    playTracksList,
    notify,
  } = useSonora();

  const [tab, setTab] = useState<PlaylistsTab>('playlists');
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [externalPlaylists, setExternalPlaylists] = useState<ExternalPlaylist[]>(loadExternalPlaylists);
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [linkTitle, setLinkTitle] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [activeExternalId, setActiveExternalId] = useState<string | null>(null);

  const m3uInputRef = useRef<HTMLInputElement | null>(null);
  const localFileInputRef = useRef<HTMLInputElement | null>(null);
  const cloudFileInputRef = useRef<HTMLInputElement | null>(null);
  const cloudFolderInputRef = useRef<HTMLInputElement | null>(null);

  const sortedTracks = useMemo(() => [...tracks].sort((a, b) => b.dateAdded - a.dateAdded), [tracks]);
  const activeExternal = externalPlaylists.find((p) => p.id === activeExternalId) || externalPlaylists[0] || null;

  const saveExternalList = (next: ExternalPlaylist[]) => {
    setExternalPlaylists(next);
    try {
      localStorage.setItem(EXTERNAL_PLAYLISTS_KEY, JSON.stringify(next));
    } catch {
      // ignore storage errors
    }
  };

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

  const handleImportM3U = async (file: File) => {
    const content = await file.text();
    const { matchedIds, unmatchedCount, playlistName } = parseM3U8Matches(content, tracks);
    if (matchedIds.length === 0) {
      notify('No songs in the M3U/M3U8 file matched tracks currently in your player.', 'error');
      return;
    }
    const name = playlistName || file.name.replace(/\.(m3u8?|txt)$/i, '');
    await createPlaylist({
      name,
      description: `Imported from ${file.name}${unmatchedCount > 0 ? ` (${unmatchedCount} unmatched entries skipped)` : ''}`,
      trackIds: matchedIds,
    });
  };

  const handleLinkExternal = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseExternalPlaylistUrl(linkUrl);
    if (!parsed) {
      notify('Paste a valid Spotify playlist/album URL or YouTube Music playlist URL (?list=...).', 'error');
      return;
    }
    const entry: ExternalPlaylist = {
      id: crypto.randomUUID(),
      provider: parsed.provider,
      name: linkTitle.trim() || (parsed.provider === 'spotify' ? 'Spotify Playlist' : 'YouTube Music Playlist'),
      url: parsed.cleanUrl,
      embedUrl: parsed.embedUrl,
      addedAt: Date.now(),
    };
    const next = [entry, ...externalPlaylists];
    saveExternalList(next);
    setActiveExternalId(entry.id);
    setLinkTitle('');
    setLinkUrl('');
    setShowLinkForm(false);
    setTab('linked');
    notify(`Linked ${entry.name}.`, 'success');
  };

  const removeExternalPlaylist = (id: string) => {
    const next = externalPlaylists.filter((p) => p.id !== id);
    saveExternalList(next);
    if (activeExternalId === id) setActiveExternalId(next[0]?.id || null);
    notify('Removed linked playlist.', 'info');
  };

  return (
    <div className="space-y-6 pb-8">
      <input
        ref={m3uInputRef}
        type="file"
        accept=".m3u,.m3u8"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleImportM3U(f);
        }}
      />
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

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-[var(--border-subtle)]">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Playlists &amp; Music</h1>
          <p className="text-sm text-[var(--text-muted)] font-mono tabular-nums mt-1">
            {playlists.length} playlists · {tracks.length} personal songs ({firebaseTracks.length} Firebase Cloud · {localTracks.length} local)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowCreate((v) => !v)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--accent)] text-[var(--accent-contrast)] text-sm font-semibold cursor-pointer whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" /> New Playlist
          </button>
          <button
            onClick={() => {
              setTab('linked');
              setShowLinkForm((v) => !v);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] text-sm font-medium hover:bg-[var(--bg-hover)] cursor-pointer whitespace-nowrap shrink-0"
          >
            <Link2 className="w-4 h-4" /> Link Spotify / YouTube
          </button>
          <button
            onClick={() => m3uInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-sm font-medium hover:bg-[var(--bg-hover)] cursor-pointer whitespace-nowrap shrink-0"
          >
            <FileUp className="w-4 h-4" /> Import M3U8
          </button>
        </div>
      </div>

      {/* Segmented Navigation */}
      <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-[var(--bg-elevated)]">
        {(
          [
            ['playlists', `Playlists (${playlists.length})`],
            ['songs', `My Songs (${tracks.length})`],
            ['linked', `Spotify & YouTube (${externalPlaylists.length})`],
          ] as [PlaylistsTab, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              tab === id
                ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xs'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            {label}
          </button>
        ))}
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

      {/* Upload / Import Progress */}
      {(cloudUploadProgress || importProgress) && (
        <div className="rounded-xl border border-[var(--accent)]/40 bg-[var(--accent-soft)] p-3.5">
          {cloudUploadProgress && (
            <div className="flex items-center justify-between text-sm font-medium">
              <span className="truncate pr-3">Uploading to Firebase Cloud: {cloudUploadProgress.fileName}</span>
              <span className="font-mono tabular-nums shrink-0">
                {cloudUploadProgress.done} / {cloudUploadProgress.total}
              </span>
            </div>
          )}
          {importProgress && (
            <div className="flex items-center justify-between text-sm font-medium">
              <span className="truncate pr-3">Importing audio: {importProgress.fileName}</span>
              <span className="font-mono tabular-nums shrink-0">
                {importProgress.processed} / {importProgress.total}
              </span>
            </div>
          )}
        </div>
      )}

      {/* TAB 1: Personal Playlists */}
      {tab === 'playlists' && (
        <>
          {playlists.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--bg-surface)] p-12 text-center space-y-3">
              <ListMusic className="w-10 h-10 text-[var(--accent)] mx-auto" />
              <h2 className="text-lg font-semibold">No playlists created yet</h2>
              <p className="text-sm text-[var(--text-muted)] max-w-md mx-auto leading-relaxed">
                Create playlists from your uploaded Firebase Cloud or local songs, or switch to Spotify &amp; YouTube to play an authenticated playlist link.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-5">
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
                          {plTracks.length} songs · {formatDuration(totalDuration)}
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

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => {
                            const m3u = exportPlaylistToM3U8(pl, trackMap);
                            downloadTextFile(`${pl.name.replace(/[^a-z0-9-_]+/gi, '_')}.m3u8`, m3u);
                          }}
                          title="Export M3U8"
                          aria-label={`Export ${pl.name} as M3U8`}
                          className="p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => void duplicatePlaylist(pl.id)}
                          title="Duplicate playlist"
                          aria-label={`Duplicate ${pl.name}`}
                          className="p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] cursor-pointer"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => void removePlaylist(pl.id)}
                          title="Delete playlist"
                          aria-label={`Delete ${pl.name}`}
                          className="p-2 rounded-lg text-[var(--text-muted)] hover:text-rose-400 hover:bg-[var(--bg-hover)] cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* TAB 2: User's Genuine Songs (Firebase Cloud + Local Upload) */}
      {tab === 'songs' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <Cloud className="w-5 h-5 text-[var(--accent)] mt-0.5 shrink-0" />
              <div>
                <h2 className="text-base font-bold flex items-center gap-2">
                  Your Personal Audio Locker
                  {isFirebaseConnected && firebaseUser?.email ? ` · ${firebaseUser.email}` : ''}
                  {isSyncingCloud && <Loader2 className="w-4 h-4 animate-spin text-[var(--accent)]" />}
                </h2>
                <p className="text-sm text-[var(--text-secondary)] mt-0.5 leading-relaxed">
                  Upload your downloaded MP3, FLAC, M4A, or WAV songs to Firebase Cloud to save laptop disk space, or import locally for offline playback.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {!isFirebaseConnected ? (
                <GoogleSignInButton
                  onClick={() => void connectFirebaseCloud()}
                  loading={isFirebaseSigningIn}
                  label="Sign in for Firebase Cloud"
                />
              ) : (
                <>
                  <button
                    onClick={() => cloudFileInputRef.current?.click()}
                    disabled={!!cloudUploadProgress}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--accent)] text-[var(--accent-contrast)] text-sm font-semibold hover:opacity-90 disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <CloudUpload className="w-4 h-4" /> Upload Songs to Cloud
                  </button>
                  <button
                    onClick={() => cloudFolderInputRef.current?.click()}
                    disabled={!!cloudUploadProgress}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-sm font-medium hover:bg-[var(--bg-hover)] disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <FolderUp className="w-4 h-4" /> Upload Folder
                  </button>
                </>
              )}
              <button
                onClick={() => localFileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-sm font-medium hover:bg-[var(--bg-hover)] cursor-pointer whitespace-nowrap shrink-0"
              >
                <Upload className="w-4 h-4" /> Add Local Files
              </button>
              {sortedTracks.length > 0 && (
                <button
                  onClick={() => void playTracksList(sortedTracks, undefined, true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--bg-elevated)] text-sm font-medium hover:bg-[var(--bg-hover)] cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Shuffle className="w-4 h-4" /> Shuffle All
                </button>
              )}
            </div>
          </div>

          {sortedTracks.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--bg-surface)] p-10 text-center space-y-2">
              <p className="text-base font-semibold">No personal songs uploaded yet</p>
              <p className="text-sm text-[var(--text-muted)] max-w-md mx-auto">
                Use the upload buttons above to add your own audio files to Firebase Cloud or your device.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
              {sortedTracks.map((track, idx) => (
                <TrackRow key={track.id} track={track} index={idx} contextQueue={sortedTracks} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: Authenticated Spotify & YouTube Music Playlists */}
      {tab === 'linked' && (
        <div className="space-y-5">
          {showLinkForm && (
            <form
              onSubmit={handleLinkExternal}
              className="w-full rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-3"
            >
              <div>
                <h2 className="text-base font-bold">Link Authenticated Spotify or YouTube Music Playlist</h2>
                <p className="text-sm text-[var(--text-muted)] mt-0.5 leading-relaxed">
                  Paste any official Spotify playlist/album URL or YouTube Music playlist URL. Playback uses the official player signed in with your own browser session.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-[240px_1fr_auto] items-center gap-3">
                <input
                  type="text"
                  value={linkTitle}
                  onChange={(e) => setLinkTitle(e.target.value)}
                  placeholder="Playlist label (e.g. My Tamil Favorites)"
                  className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 text-sm"
                />
                <input
                  type="url"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  placeholder="https://open.spotify.com/playlist/... or https://music.youtube.com/playlist?list=..."
                  required
                  className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 text-sm"
                />
                <div className="flex justify-end gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowLinkForm(false)}
                    className="px-3.5 py-2 rounded-lg text-sm text-[var(--text-secondary)] cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-lg bg-[var(--accent)] text-[var(--accent-contrast)] text-sm font-semibold cursor-pointer"
                  >
                    Save Playlist
                  </button>
                </div>
              </div>
            </form>
          )}

          {externalPlaylists.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--bg-surface)] p-10 text-center space-y-3">
              <Link2 className="w-8 h-8 text-[var(--accent)] mx-auto" />
              <h2 className="text-lg font-semibold">No Spotify or YouTube Music playlists linked</h2>
              <p className="text-sm text-[var(--text-muted)] max-w-md mx-auto leading-relaxed">
                Click &ldquo;Link Spotify / YouTube&rdquo; above to add your own genuine Spotify or YouTube Music playlist URL and play it directly here using your authenticated session.
              </p>
              {!showLinkForm && (
                <button
                  onClick={() => setShowLinkForm(true)}
                  className="px-4 py-2 rounded-lg bg-[var(--accent)] text-[var(--accent-contrast)] text-sm font-semibold cursor-pointer"
                >
                  Add Playlist URL
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-5 items-start">
              <div className="space-y-2">
                {externalPlaylists.map((pl) => {
                  const isActive = activeExternal?.id === pl.id;
                  return (
                    <div
                      key={pl.id}
                      className={`flex items-center justify-between gap-2 p-3 rounded-xl border transition-colors ${
                        isActive
                          ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                          : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)]/60'
                      }`}
                    >
                      <button
                        onClick={() => setActiveExternalId(pl.id)}
                        className="min-w-0 flex-1 text-left cursor-pointer"
                      >
                        <p className="text-sm font-bold truncate">{pl.name}</p>
                        <p className="text-[13px] text-[var(--text-muted)] mt-0.5 capitalize">{pl.provider}</p>
                      </button>
                      <a
                        href={pl.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Open ${pl.name} in ${pl.provider}`}
                        className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                      <button
                        onClick={() => removeExternalPlaylist(pl.id)}
                        aria-label={`Remove ${pl.name}`}
                        className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-rose-400 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>

              {activeExternal && (
                <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden">
                  {!isOnline ? (
                    <div className="p-8 text-center text-sm text-amber-400">
                      Internet connection required to play linked Spotify or YouTube Music playlists.
                    </div>
                  ) : (
                    <iframe
                      key={activeExternal.id}
                      src={activeExternal.embedUrl}
                      title={activeExternal.name}
                      width="100%"
                      height={activeExternal.provider === 'spotify' ? 420 : 400}
                      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                      loading="lazy"
                      className="border-0 w-full block"
                    />
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
