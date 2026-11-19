import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { GripVertical, ListMusic, Music2, Play, X } from 'lucide-react';
import { useSonora } from '../contexts/SonoraContext';
import type { Playlist, Track } from '../types/music';
import { formatDuration } from '../utils/formatters';
import { AnimatedList } from './AnimatedList';
import { TrackArtwork } from './TrackArtwork';

type DrawerTab = 'queue' | 'playlists';

interface PlaylistRowEntry {
  id: string;
  name: string;
  tracks: Track[];
  totalDuration: number;
  coverTrack?: Track;
  isAllSongs?: boolean;
  playlist?: Playlist;
}

interface UpcomingEntry {
  track: Track;
  actualIndex: number;
}

export const QueueDrawer: React.FC = () => {
  const {
    isQueueOpen,
    setIsQueueOpen,
    queue,
    queueIndex,
    tracks,
    playlists,
    trackMap,
    playTrack,
    playTracksList,
    removeFromQueue,
    reorderUpcomingQueue,
  } = useSonora();

  const [tab, setTab] = useState<DrawerTab>('queue');

  useEffect(() => {
    if (!isQueueOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsQueueOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isQueueOpen, setIsQueueOpen]);

  const totalDuration = useMemo(() => queue.reduce((acc, t) => acc + (t.duration || 0), 0), [queue]);

  const activeTrack = queueIndex >= 0 && queueIndex < queue.length ? queue[queueIndex] : null;

  // Ordered strictly in upcoming playback order so dragging a song to the top queues it next
  const upcomingEntries = useMemo<UpcomingEntry[]>(() => {
    if (queue.length === 0) return [];
    if (queueIndex >= 0 && queueIndex < queue.length) {
      const after = queue.slice(queueIndex + 1).map((track, i) => ({
        track,
        actualIndex: queueIndex + 1 + i,
      }));
      const before = queue.slice(0, queueIndex).map((track, i) => ({
        track,
        actualIndex: i,
      }));
      return [...after, ...before];
    }
    return queue.map((track, i) => ({ track, actualIndex: i }));
  }, [queue, queueIndex]);

  const playlistEntries = useMemo<PlaylistRowEntry[]>(() => {
    const entries: PlaylistRowEntry[] = [];
    if (tracks.length > 0) {
      entries.push({
        id: '__all_songs__',
        name: 'All Songs',
        tracks,
        totalDuration: tracks.reduce((acc, t) => acc + (t.duration || 0), 0),
        coverTrack: tracks.find((t) => t.hasArtwork) || tracks[0],
        isAllSongs: true,
      });
    }
    for (const pl of playlists) {
      const plTracks = pl.trackIds
        .map((id) => trackMap.get(id))
        .filter((t): t is Track => Boolean(t));
      entries.push({
        id: pl.id,
        name: pl.name,
        tracks: plTracks,
        totalDuration: plTracks.reduce((acc, t) => acc + (t.duration || 0), 0),
        coverTrack: plTracks.find((t) => t.hasArtwork) || plTracks[0],
        playlist: pl,
      });
    }
    return entries;
  }, [playlists, trackMap, tracks]);

  return (
    <AnimatePresence>
      {isQueueOpen && (
        <div className="fixed inset-0 z-[60] flex justify-end">
          {/* Frosted blurred backdrop overlaying the active screen (including FullScreenPlayer) */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            onClick={() => setIsQueueOpen(false)}
            className="fixed inset-0 bg-black/55 backdrop-blur-md"
            aria-hidden="true"
          />

          {/* Right-side floating glass drawer */}
          <motion.aside
            initial={{ x: 48, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 48, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            className="relative z-10 w-full max-w-[440px] h-full p-3 sm:p-4 flex flex-col pointer-events-none"
          >
            <div className="pointer-events-auto flex-1 min-h-0 flex flex-col rounded-[26px] border border-white/10 bg-[#121319]/82 backdrop-blur-2xl shadow-[0_24px_64px_-16px_rgba(0,0,0,0.85)] overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between gap-2 px-5 pt-4 pb-3 border-b border-white/[0.08] shrink-0">
                <div className="min-w-0">
                  <h2 className="text-base font-bold tracking-tight text-[var(--text-primary)]">
                    {tab === 'queue' ? 'Up Next' : 'Playlists'}
                  </h2>
                  <p className="text-xs text-[var(--text-muted)] font-mono tabular-nums mt-0.5">
                    {tab === 'queue'
                      ? `${queue.length} track${queue.length === 1 ? '' : 's'} · ${formatDuration(totalDuration)}`
                      : `${playlistEntries.length} playlist${playlistEntries.length === 1 ? '' : 's'} · ${tracks.length} songs`}
                  </p>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsQueueOpen(false)}
                    aria-label="Close playlist panel"
                    className="p-2 rounded-full bg-white/[0.05] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/[0.1] cursor-pointer transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Tab Switcher */}
              <div className="px-4 pt-3 pb-2 shrink-0">
                <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-white/[0.04] border border-white/[0.07]">
                  <button
                    type="button"
                    onClick={() => setTab('queue')}
                    className={`inline-flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      tab === 'queue'
                        ? 'bg-[var(--accent)] text-[var(--accent-contrast)] shadow-sm'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <Music2 className="w-3.5 h-3.5" />
                    Up Next ({queue.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setTab('playlists')}
                    className={`inline-flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      tab === 'playlists'
                        ? 'bg-[var(--accent)] text-[var(--accent-contrast)] shadow-sm'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <ListMusic className="w-3.5 h-3.5" />
                    Playlists ({playlistEntries.length})
                  </button>
                </div>
              </div>

              {/* AnimatedList Content */}
              <div className="flex-1 min-h-0 px-3 pb-3 flex flex-col">
                {tab === 'queue' ? (
                  queue.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-center px-6 text-sm text-[var(--text-muted)]">
                      <Music2 className="w-8 h-8 mb-2 opacity-40" />
                      Queue is empty. Play any song or pick a playlist.
                    </div>
                  ) : (
                    <div className="flex-1 min-h-0 flex flex-col gap-2">
                      {/* Pinned Now Playing Card */}
                      {activeTrack && (
                        <div className="px-1 pt-1 shrink-0">
                          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] px-1 mb-1.5">
                            Now Playing
                          </p>
                          <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-[14px] border border-[var(--accent)]/40 bg-[var(--accent-soft)]/50">
                            <TrackArtwork
                              trackId={activeTrack.id}
                              hasArtwork={activeTrack.hasArtwork}
                              artworkUrl={activeTrack.artworkUrl}
                              title={activeTrack.title}
                              artist={activeTrack.artist}
                              size="xs"
                              className="ring-1 ring-[var(--accent)]"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold truncate leading-tight text-[var(--accent)]">
                                {activeTrack.title}
                              </p>
                              <p className="text-xs text-[var(--text-muted)] truncate mt-0.5">
                                {activeTrack.artist}
                              </p>
                            </div>
                            <span className="text-[11px] font-mono tabular-nums text-[var(--text-muted)] shrink-0">
                              {formatDuration(activeTrack.duration)}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Draggable Up Next List */}
                      {upcomingEntries.length > 0 ? (
                        <div className="flex-1 min-h-0 flex flex-col">
                          <div className="flex items-center justify-between px-2 pt-1 pb-0.5 shrink-0">
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                              Next Up
                            </p>
                            <span className="text-[11px] text-[var(--text-muted)]/75">
                              Drag to reorder
                            </span>
                          </div>
                          <AnimatedList<UpcomingEntry>
                            key="queue-animated-list"
                            items={upcomingEntries}
                            getItemKey={(entry) => `${entry.track.id}-${entry.actualIndex}`}
                            initialSelectedIndex={0}
                            onItemSelect={(entry) => void playTrack(entry.track, queue)}
                            reorderable
                            onReorder={reorderUpcomingQueue}
                            animation="pop"
                            theme="dark"
                            accentColor="var(--accent)"
                            frame={false}
                            width="100%"
                            maxHeight={activeTrack ? 'calc(100dvh - 300px)' : 'calc(100dvh - 196px)'}
                            fadeSize={44}
                            radius={14}
                            gap={8}
                            stagger={0.02}
                            className="flex-1 min-h-0"
                            renderItem={(entry) => {
                              const { track, actualIndex } = entry;
                              return (
                                <div className="flex items-center gap-2.5 w-full min-w-0">
                                  <span
                                    className="text-[var(--text-muted)]/60 hover:text-[var(--text-primary)] shrink-0 cursor-grab active:cursor-grabbing"
                                    title="Drag to reorder"
                                    aria-hidden="true"
                                  >
                                    <GripVertical className="w-3.5 h-3.5" />
                                  </span>
                                  <TrackArtwork
                                    trackId={track.id}
                                    hasArtwork={track.hasArtwork}
                                    artworkUrl={track.artworkUrl}
                                    title={track.title}
                                    artist={track.artist}
                                    size="xs"
                                  />
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-semibold truncate leading-tight text-[var(--text-primary)]">
                                      {track.title}
                                    </p>
                                    <p className="text-xs text-[var(--text-muted)] truncate mt-0.5">
                                      {track.artist}
                                    </p>
                                  </div>
                                  <span className="text-[11px] font-mono tabular-nums text-[var(--text-muted)] shrink-0">
                                    {formatDuration(track.duration)}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      removeFromQueue(actualIndex);
                                    }}
                                    aria-label="Remove from queue"
                                    title="Remove from queue"
                                    className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-rose-400 hover:bg-white/[0.06] cursor-pointer shrink-0 transition-colors"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              );
                            }}
                          />
                        </div>
                      ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-center px-6 text-xs text-[var(--text-muted)]">
                          No more upcoming tracks in this queue.
                        </div>
                      )}
                    </div>
                  )
                ) : playlistEntries.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center px-6 text-sm text-[var(--text-muted)]">
                    <ListMusic className="w-8 h-8 mb-2 opacity-40" />
                    No playlists yet. Create one from Playlists &amp; Music.
                  </div>
                ) : (
                  <AnimatedList<PlaylistRowEntry>
                    key="playlists-animated-list"
                    items={playlistEntries}
                    getItemKey={(entry) => entry.id}
                    onItemSelect={(entry) => {
                      if (entry.tracks.length > 0) {
                        void playTracksList(entry.tracks, 0, false);
                        setTab('queue');
                      }
                    }}
                    animation="pop"
                    theme="dark"
                    accentColor="var(--accent)"
                    frame={false}
                    width="100%"
                    maxHeight="calc(100dvh - 188px)"
                    fadeSize={52}
                    radius={14}
                    gap={8}
                    stagger={0.02}
                    className="flex-1 min-h-0"
                    renderItem={(entry) => (
                      <div className="flex items-center gap-3 w-full min-w-0">
                        <TrackArtwork
                          trackId={entry.coverTrack?.id}
                          hasArtwork={entry.coverTrack?.hasArtwork}
                          artworkUrl={entry.coverTrack?.artworkUrl}
                          title={entry.name}
                          artist={entry.coverTrack?.artist}
                          size="xs"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold truncate text-[var(--text-primary)] leading-tight">
                            {entry.name}
                          </p>
                          <p className="text-xs text-[var(--text-muted)] truncate mt-0.5">
                            {entry.tracks.length} song{entry.tracks.length === 1 ? '' : 's'}
                            {entry.totalDuration > 0 ? ` · ${formatDuration(entry.totalDuration)}` : ''}
                          </p>
                        </div>
                        <span className="w-7 h-7 rounded-full bg-white/[0.08] flex items-center justify-center text-[var(--accent)] shrink-0">
                          <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                        </span>
                      </div>
                    )}
                  />
                )}
              </div>
            </div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
};
