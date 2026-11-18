import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Clock,
  Edit3,
  FileUp,
  Globe,
  Loader2,
  Maximize2,
  Minimize2,
  MicVocal,
  Save,
} from 'lucide-react';
import { TrackArtwork } from '../components/TrackArtwork';
import { useSonora } from '../contexts/SonoraContext';
import {
  formatLrcTimestamp,
  getActiveLrcIndex,
  parseLrcOrPlainLyrics,
  searchPermittedOnlineLyrics,
  type OnlineLyricsCandidate,
} from '../services/lyricsService';

export const LyricsView: React.FC = () => {
  const { currentTrack, currentTime, isOnline, seekTo, saveTrackEdits, notify } = useSonora();

  const [isEditing, setIsEditing] = useState(false);
  const [draftLyrics, setDraftLyrics] = useState('');
  const [isFullscreenLyrics, setIsFullscreenLyrics] = useState(false);
  const [searchingOnline, setSearchingOnline] = useState(false);
  const [candidates, setCandidates] = useState<OnlineLyricsCandidate[]>([]);
  const lrcInputRef = useRef<HTMLInputElement | null>(null);
  const activeLineRef = useRef<HTMLButtonElement | null>(null);

  const rawLyrics = currentTrack?.lrcContent || currentTrack?.embeddedLyrics || '';

  const parsed = useMemo(() => parseLrcOrPlainLyrics(rawLyrics), [rawLyrics]);
  const activeIdx = useMemo(
    () => (parsed.isSynchronized ? getActiveLrcIndex(parsed.synced, currentTime) : -1),
    [parsed, currentTime]
  );

  useEffect(() => {
    setIsEditing(false);
    setCandidates([]);
    setDraftLyrics(rawLyrics);
  }, [currentTrack?.id, rawLyrics]);

  useEffect(() => {
    if (!isEditing && activeLineRef.current) {
      activeLineRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeIdx, isEditing]);

  if (!currentTrack) {
    return (
      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-12 text-center space-y-2">
        <MicVocal className="w-10 h-10 text-[var(--accent)] mx-auto" />
        <h1 className="text-xl font-bold">Synchronized Lyrics Studio</h1>
        <p className="text-sm text-[var(--text-muted)] max-w-md mx-auto leading-relaxed">
          Play any song from your library to view embedded lyrics, import synchronized .lrc files, or edit timestamps.
        </p>
      </div>
    );
  }

  const handleImportLrcFile = async (file: File) => {
    const content = await file.text();
    await saveTrackEdits({ ...currentTrack, lrcContent: content });
    setDraftLyrics(content);
    notify(`Attached "${file.name}" to ${currentTrack.title}.`, 'success');
  };

  const handleSaveManual = async () => {
    await saveTrackEdits({ ...currentTrack, lrcContent: draftLyrics });
    setIsEditing(false);
  };

  const handleOnlineSearch = async () => {
    setSearchingOnline(true);
    setCandidates([]);
    try {
      const found = await searchPermittedOnlineLyrics(currentTrack.title, currentTrack.artist);
      setCandidates(found);
      if (found.length === 0) {
        notify('No matching lyrics found on LRCLIB for this track.', 'info');
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Lyrics search failed.', 'error');
    } finally {
      setSearchingOnline(false);
    }
  };

  const applyCandidate = async (candidate: OnlineLyricsCandidate) => {
    const chosen = candidate.syncedLyrics || candidate.plainLyrics;
    if (!chosen) return;
    await saveTrackEdits({ ...currentTrack, lrcContent: chosen });
    setDraftLyrics(chosen);
    setCandidates([]);
  };

  const insertCurrentTimestamp = () => {
    const stamp = formatLrcTimestamp(currentTime);
    setDraftLyrics((prev) => `${prev ? `${prev}\n` : ''}${stamp} `);
  };

  return (
    <div
      className={
        isFullscreenLyrics
          ? 'fixed inset-0 z-50 bg-[var(--bg-canvas)] p-6 sm:p-10 flex flex-col overflow-hidden'
          : 'space-y-6 pb-8'
      }
    >
      <input
        ref={lrcInputRef}
        type="file"
        accept=".lrc,.txt"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleImportLrcFile(f);
        }}
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[var(--border-subtle)] shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <TrackArtwork
            trackId={currentTrack.id}
            hasArtwork={currentTrack.hasArtwork}
            artworkUrl={currentTrack.artworkUrl}
            title={currentTrack.title}
            artist={currentTrack.artist}
            size="md"
          />
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold truncate">{currentTrack.title}</h1>
            <p className="text-sm text-[var(--text-secondary)] truncate">
              {currentTrack.artist} · {parsed.isSynchronized ? 'Synchronized LRC' : rawLyrics ? 'Static Lyrics' : 'No Lyrics Attached'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => lrcInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-sm font-medium hover:bg-[var(--bg-hover)] cursor-pointer"
          >
            <FileUp className="w-4 h-4" /> Import .LRC
          </button>

          <button
            onClick={() => setIsEditing((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-sm font-medium hover:bg-[var(--bg-hover)] cursor-pointer"
          >
            <Edit3 className="w-4 h-4" /> {isEditing ? 'Cancel Edit' : 'Edit Lyrics'}
          </button>

          <button
            onClick={() => void handleOnlineSearch()}
            disabled={!isOnline || searchingOnline}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-sm font-medium hover:bg-[var(--bg-hover)] disabled:opacity-45 cursor-pointer"
          >
            {searchingOnline ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
            Lookup LRCLIB
          </button>

          <button
            onClick={() => setIsFullscreenLyrics((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[var(--accent)] text-[var(--accent-contrast)] text-sm font-semibold cursor-pointer"
          >
            {isFullscreenLyrics ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            {isFullscreenLyrics ? 'Exit Fullscreen' : 'Fullscreen'}
          </button>
        </div>
      </div>

      {/* LRCLIB Permitted Lookup Candidates */}
      {candidates.length > 0 && (
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-2 shrink-0">
          <p className="text-sm font-semibold text-[var(--text-secondary)]">
            Select matching lyrics from LRCLIB (open-source lyrics database):
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {candidates.map((c) => (
              <button
                key={c.id}
                onClick={() => void applyCandidate(c)}
                className="flex items-center justify-between p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-hover)] text-left cursor-pointer"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{c.trackName}</p>
                  <p className="text-[13px] text-[var(--text-muted)] truncate">
                    {c.artistName} · {c.syncedLyrics ? 'Synced LRC' : 'Plain Text'}
                  </p>
                </div>
                <Check className="w-4 h-4 text-[var(--accent)] shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Editor or Synchronized Display */}
      {isEditing ? (
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-[var(--text-secondary)]">
              Paste plain lyrics or synchronized LRC lines (<code className="font-mono">[mm:ss.xx] Line text</code>).
            </p>
            <button
              type="button"
              onClick={insertCurrentTimestamp}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[var(--bg-elevated)] text-sm font-mono hover:bg-[var(--bg-hover)] cursor-pointer"
            >
              <Clock className="w-4 h-4" /> Insert {formatLrcTimestamp(currentTime)}
            </button>
          </div>

          <textarea
            value={draftLyrics}
            onChange={(e) => setDraftLyrics(e.target.value)}
            rows={14}
            placeholder="[00:12.40] Paste or type lyrics here..."
            className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-4 text-[15px] font-mono leading-relaxed focus:outline-none focus:border-[var(--accent)]"
          />

          <div className="flex justify-end gap-2">
            <button
              onClick={() => setIsEditing(false)}
              className="px-4 py-2 rounded-lg text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={() => void handleSaveManual()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--accent)] text-[var(--accent-contrast)] text-sm font-semibold cursor-pointer"
            >
              <Save className="w-4 h-4" /> Save Locally
            </button>
          </div>
        </div>
      ) : (
        <div
          className={`rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 sm:p-10 overflow-y-auto ${
            isFullscreenLyrics ? 'flex-1' : 'min-h-[420px] max-h-[65vh]'
          }`}
        >
          {parsed.isSynchronized ? (
            <div className="max-w-3xl mx-auto space-y-4">
              {parsed.synced.map((line, i) => {
                const isActive = i === activeIdx;
                return (
                  <button
                    key={`${line.time}-${i}`}
                    ref={isActive ? activeLineRef : undefined}
                    onClick={() => seekTo(line.time)}
                    className={`w-full text-left flex items-baseline gap-4 transition-all cursor-pointer ${
                      isActive
                        ? 'text-xl sm:text-2xl font-bold text-[var(--text-primary)]'
                        : i < activeIdx
                        ? 'text-base sm:text-lg text-[var(--text-muted)]'
                        : 'text-base sm:text-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <span className="text-[13px] font-mono tabular-nums text-[var(--text-muted)] shrink-0">
                      {formatLrcTimestamp(line.time).replace(/[\[\]]/g, '')}
                    </span>
                    <span className="leading-relaxed">{line.text}</span>
                  </button>
                );
              })}
            </div>
          ) : parsed.plain.length > 0 ? (
            <div className="max-w-2xl mx-auto space-y-3">
              {parsed.plain.map((line, i) => (
                <p key={i} className="text-base sm:text-lg leading-relaxed text-[var(--text-secondary)]">
                  {line}
                </p>
              ))}
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center py-12 space-y-3">
              <MicVocal className="w-9 h-9 text-[var(--text-muted)]" />
              <div className="max-w-md space-y-1.5">
                <p className="text-base font-semibold">Lyrics are currently unavailable for this track</p>
                <p className="text-sm text-[var(--text-muted)] leading-relaxed">
                  ISAI only displays authentic embedded, imported, or user-verified lyrics—never fabricated text. Import an .lrc file, paste lyrics, or search LRCLIB above.
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
