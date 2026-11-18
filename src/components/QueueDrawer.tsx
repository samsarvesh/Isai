import React from 'react';
import { ArrowDown, ArrowUp, ListPlus, Trash2, X } from 'lucide-react';
import { useSonora } from '../contexts/SonoraContext';
import { formatDuration } from '../utils/formatters';
import { TrackArtwork } from './TrackArtwork';

export const QueueDrawer: React.FC = () => {
  const {
    isQueueOpen,
    setIsQueueOpen,
    queue,
    queueIndex,
    playTrack,
    removeFromQueue,
    reorderQueue,
    clearQueue,
    createPlaylist,
  } = useSonora();

  if (!isQueueOpen) return null;

  const totalDuration = queue.reduce((acc, t) => acc + (t.duration || 0), 0);

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-xs" onClick={() => setIsQueueOpen(false)} />
      <aside className="relative z-50 w-full max-w-md h-full bg-[var(--bg-surface)] border-l border-[var(--border-subtle)] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-subtle)]">
          <div>
            <h2 className="text-lg font-bold">Playback Queue</h2>
            <p className="text-[13px] text-[var(--text-muted)] font-mono tabular-nums">
              {queue.length} track{queue.length === 1 ? '' : 's'} · {formatDuration(totalDuration)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {queue.length > 0 && (
              <button
                onClick={() =>
                  void createPlaylist({
                    name: `Queue Mix (${new Date().toLocaleDateString()})`,
                    trackIds: queue.map((t) => t.id),
                  })
                }
                className="px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] text-[13px] font-medium hover:bg-[var(--bg-hover)] flex items-center gap-1.5 cursor-pointer"
              >
                <ListPlus className="w-4 h-4" /> Save
              </button>
            )}
            {queue.length > 1 && (
              <button
                onClick={clearQueue}
                className="px-3 py-1.5 rounded-lg text-[13px] text-rose-400 hover:bg-[var(--bg-hover)] cursor-pointer"
              >
                Clear
              </button>
            )}
            <button
              onClick={() => setIsQueueOpen(false)}
              aria-label="Close queue"
              className="p-2 rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {queue.length === 0 ? (
            <div className="py-16 text-center text-sm text-[var(--text-muted)]">
              Queue is empty. Play any song from your library.
            </div>
          ) : (
            queue.map((track, idx) => {
              const isCurrent = idx === queueIndex;
              return (
                <div
                  key={`${track.id}-${idx}`}
                  className={`flex items-center gap-2.5 p-2 rounded-lg border ${
                    isCurrent
                      ? 'border-[var(--accent)]/40 bg-[var(--accent-soft)]'
                      : 'border-transparent hover:bg-[var(--bg-hover)]'
                  }`}
                >
                  <button
                    onClick={() => void playTrack(track, queue)}
                    className="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer"
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
                      <p className={`text-sm font-medium truncate ${isCurrent ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]'}`}>
                        {track.title}
                      </p>
                      <p className="text-[13px] text-[var(--text-secondary)] truncate">{track.artist}</p>
                    </div>
                  </button>

                  <span className="text-[13px] font-mono tabular-nums text-[var(--text-muted)]">
                    {formatDuration(track.duration)}
                  </span>

                  <div className="flex items-center">
                    <button
                      onClick={() => idx > 0 && reorderQueue(idx, idx - 1)}
                      disabled={idx === 0}
                      aria-label="Move up"
                      className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-30 cursor-pointer"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => idx < queue.length - 1 && reorderQueue(idx, idx + 1)}
                      disabled={idx === queue.length - 1}
                      aria-label="Move down"
                      className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-30 cursor-pointer"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => removeFromQueue(idx)}
                      aria-label="Remove from queue"
                      className="p-1 text-[var(--text-muted)] hover:text-rose-400 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </aside>
    </div>
  );
};
