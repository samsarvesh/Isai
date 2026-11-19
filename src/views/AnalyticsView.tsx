import React from 'react';
import { ListeningAnalyticsPanel } from '../components/ListeningAnalyticsPanel';
import { useSonora } from '../contexts/SonoraContext';

export const AnalyticsView: React.FC = () => {
  const { tracks, playlists } = useSonora();

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 pb-3 border-b border-[var(--border-subtle)]">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Listening &amp; App Analytics</h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            Daily listening habits, time spent in ISAI, streaks, and most-played music
          </p>
        </div>
        <p className="text-sm font-mono tabular-nums text-[var(--text-muted)]">
          {tracks.length} songs · {playlists.length} playlists
        </p>
      </div>

      <ListeningAnalyticsPanel />
    </div>
  );
};
