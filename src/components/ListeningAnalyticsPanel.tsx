import React, { useMemo, useState } from 'react';
import {
  Activity,
  BarChart3,
  Clock,
  Flame,
  Headphones,
  Music2,
  Play,
  RotateCcw,
  TrendingUp,
} from 'lucide-react';
import { useSonora } from '../contexts/SonoraContext';
import {
  computeAnalyticsSummary,
  formatAnalyticsDuration,
} from '../services/analyticsService';
import { TrackArtwork } from './TrackArtwork';

type ChartMetric = 'appSeconds' | 'listeningSeconds' | 'songsPlayed';

export const ListeningAnalyticsPanel: React.FC = () => {
  const {
    activityStore,
    history,
    trackMap,
    tracks,
    isPlaying,
    playTrack,
    resetAnalytics,
  } = useSonora();

  const [metric, setMetric] = useState<ChartMetric>('appSeconds');
  const [confirmClear, setConfirmClear] = useState(false);

  const summary = useMemo(
    () => computeAnalyticsSummary(activityStore, history, trackMap),
    [activityStore, history, trackMap]
  );

  const chartMax = useMemo(() => {
    const vals = summary.last7Days.map((d) => d[metric]);
    return Math.max(...vals, metric === 'songsPlayed' ? 4 : 60);
  }, [metric, summary.last7Days]);

  const metricAvg =
    metric === 'appSeconds'
      ? summary.avgDailyAppSeconds
      : metric === 'listeningSeconds'
      ? summary.avgDailyListeningSeconds
      : summary.avgDailySongs;

  const avgLinePercent = Math.min(96, Math.max(4, (metricAvg / chartMax) * 100));

  const formatMetricValue = (val: number) => {
    if (metric === 'songsPlayed') return `${Math.round(val)}`;
    return formatAnalyticsDuration(val, false);
  };

  const maxHourly = Math.max(...summary.hourlyDistribution, 1);

  return (
    <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <BarChart3 className="w-5 h-5 text-[var(--accent)]" />
            <h2 className="text-lg font-bold tracking-tight">Listening &amp; App Analytics</h2>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[var(--accent-soft)] text-[11px] font-medium text-[var(--accent)]">
              <span
                className={`w-1.5 h-1.5 rounded-full bg-[var(--accent)] ${isPlaying ? 'animate-pulse' : ''}`}
              />
              {isPlaying ? 'Tracking playback' : 'Live tracking'}
            </span>
          </div>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            Private on-device insights for songs heard today, daily time spent in ISAI, averages, and listening rhythm
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!confirmClear ? (
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Reset Stats
            </button>
          ) : (
            <div className="inline-flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  resetAnalytics();
                  setConfirmClear(false);
                }}
                className="px-3 py-1.5 rounded-lg bg-rose-500 hover:bg-rose-600 text-white text-xs font-semibold cursor-pointer"
              >
                Confirm Reset
              </button>
              <button
                type="button"
                onClick={() => setConfirmClear(false)}
                className="px-2.5 py-1.5 rounded-lg bg-[var(--bg-elevated)] text-xs text-[var(--text-secondary)] cursor-pointer"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 4 Primary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5">
        {/* Songs Heard Today */}
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/80 p-4 flex flex-col justify-between gap-2">
          <div className="flex items-center justify-between text-xs font-medium text-[var(--text-muted)]">
            <span>Songs Heard Today</span>
            <Music2 className="w-4 h-4 text-[var(--accent)]" />
          </div>
          <div>
            <p className="text-2xl sm:text-3xl font-bold font-mono tabular-nums tracking-tight text-[var(--text-primary)]">
              {summary.todaySongs}
            </p>
            <p className="text-xs text-[var(--text-secondary)] mt-1">
              {summary.todayUniqueSongs > 0
                ? `${summary.todayUniqueSongs} unique · Avg ${summary.avgDailySongs}/day`
                : `Avg ${summary.avgDailySongs} songs / day`}
            </p>
          </div>
        </div>

        {/* Time Spent in App Today */}
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/80 p-4 flex flex-col justify-between gap-2">
          <div className="flex items-center justify-between text-xs font-medium text-[var(--text-muted)]">
            <span>Time in App Today</span>
            <Clock className="w-4 h-4 text-[var(--accent)]" />
          </div>
          <div>
            <p className="text-2xl sm:text-3xl font-bold font-mono tabular-nums tracking-tight text-[var(--text-primary)]">
              {formatAnalyticsDuration(summary.todayAppSeconds, true)}
            </p>
            <p className="text-xs text-[var(--text-secondary)] mt-1">
              Music playing: <span className="font-mono tabular-nums text-[var(--text-primary)]">{formatAnalyticsDuration(summary.todayListeningSeconds, true)}</span>
            </p>
          </div>
        </div>

        {/* Daily Average */}
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/80 p-4 flex flex-col justify-between gap-2">
          <div className="flex items-center justify-between text-xs font-medium text-[var(--text-muted)]">
            <span>Daily Average</span>
            <TrendingUp className="w-4 h-4 text-[var(--accent)]" />
          </div>
          <div>
            <p className="text-2xl sm:text-3xl font-bold font-mono tabular-nums tracking-tight text-[var(--text-primary)]">
              {formatAnalyticsDuration(summary.avgDailyAppSeconds, false)}
              <span className="text-sm font-normal text-[var(--text-muted)]"> / day</span>
            </p>
            <p className="text-xs text-[var(--text-secondary)] mt-1">
              Listening avg: <span className="font-mono tabular-nums text-[var(--text-primary)]">{formatAnalyticsDuration(summary.avgDailyListeningSeconds, false)}</span> · {summary.activeDaysCount || 1} active day{summary.activeDaysCount === 1 ? '' : 's'}
            </p>
          </div>
        </div>

        {/* Total Time & Streak */}
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/80 p-4 flex flex-col justify-between gap-2">
          <div className="flex items-center justify-between text-xs font-medium text-[var(--text-muted)]">
            <span>All-Time &amp; Streak</span>
            <Flame className="w-4 h-4 text-[var(--accent)]" />
          </div>
          <div>
            <p className="text-2xl sm:text-3xl font-bold font-mono tabular-nums tracking-tight text-[var(--text-primary)]">
              {formatAnalyticsDuration(summary.totalAppSeconds, false)}
            </p>
            <p className="text-xs text-[var(--text-secondary)] mt-1">
              {summary.currentStreakDays}-day streak · {summary.totalSongsPlayed} total song{summary.totalSongsPlayed === 1 ? '' : 's'}
            </p>
          </div>
        </div>
      </div>

      {/* Last 7 Days Interactive Bar Chart */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/60 p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Last 7 Days Activity</h3>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Daily average:{' '}
              <span className="font-mono tabular-nums text-[var(--text-secondary)]">
                {metric === 'songsPlayed'
                  ? `${summary.avgDailySongs} songs`
                  : formatAnalyticsDuration(metricAvg, false)}
              </span>
            </p>
          </div>

          <div className="inline-flex items-center rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-0.5 self-start sm:self-auto">
            {(
              [
                ['appSeconds', 'App Time'],
                ['listeningSeconds', 'Listening'],
                ['songsPlayed', 'Songs'],
              ] as Array<[ChartMetric, string]>
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setMetric(key)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  metric === key
                    ? 'bg-[var(--accent)] text-[var(--accent-contrast)] font-semibold'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="relative pt-6 pb-1">
          {/* Dashed daily average reference line */}
          {metricAvg > 0 && (
            <div
              className="pointer-events-none absolute left-0 right-0 border-t border-dashed border-white/15 z-0 flex justify-end"
              style={{ bottom: `calc(28px + ${avgLinePercent}% * 0.72)` }}
            >
              <span className="-mt-4 text-[10px] font-mono tabular-nums text-[var(--text-muted)] bg-[var(--bg-elevated)] px-1.5 rounded">
                avg {formatMetricValue(metricAvg)}
              </span>
            </div>
          )}

          <div className="grid grid-cols-7 gap-2 sm:gap-3 items-end h-36 relative z-10">
            {summary.last7Days.map((day) => {
              const val = day[metric];
              const pct = val > 0 ? Math.max(8, Math.round((val / chartMax) * 100)) : 3;
              return (
                <div
                  key={day.date}
                  className="h-full flex flex-col items-center justify-end gap-1.5 group"
                  title={`${day.shortDate}: ${formatAnalyticsDuration(day.appSeconds, false)} in app · ${formatAnalyticsDuration(day.listeningSeconds, false)} listening · ${day.songsPlayed} songs`}
                >
                  <span className="text-[11px] font-mono tabular-nums text-[var(--text-muted)] group-hover:text-[var(--text-primary)] transition-colors">
                    {val > 0 ? formatMetricValue(val) : '—'}
                  </span>
                  <div className="w-full max-w-[44px] flex-1 flex items-end justify-center">
                    <div
                      className={`w-full rounded-t-lg transition-all duration-300 ${
                        day.isToday
                          ? 'bg-[var(--accent)] shadow-[0_0_18px_color-mix(in_srgb,var(--accent)_45%,transparent)]'
                          : val > 0
                          ? 'bg-[var(--accent)]/40 group-hover:bg-[var(--accent)]/70'
                          : 'bg-white/[0.06]'
                      }`}
                      style={{ height: `${pct}%` }}
                    />
                  </div>
                  <span
                    className={`text-[11px] font-medium truncate ${
                      day.isToday ? 'text-[var(--accent)] font-semibold' : 'text-[var(--text-muted)]'
                    }`}
                  >
                    {day.dayLabel}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bottom 2-Column Insights: Peak Rhythm + Top Played Songs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 24-Hour Listening Rhythm & Taste Snapshot */}
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/60 p-4 space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-[var(--accent)]" />
                <h3 className="text-sm font-semibold">24-Hour Listening Rhythm</h3>
              </div>
              <span className="text-xs font-mono text-[var(--text-muted)]">
                {summary.todaySessions} session{summary.todaySessions === 1 ? '' : 's'} today
              </span>
            </div>
            <p className="text-xs text-[var(--text-secondary)] mt-1">{summary.peakWindowLabel}</p>
          </div>

          <div>
            <div className="grid grid-cols-24 gap-1 items-end h-14">
              {summary.hourlyDistribution.map((secs, hr) => {
                const heightPct = secs > 0 ? Math.max(14, Math.round((secs / maxHourly) * 100)) : 8;
                const isPeak = summary.peakHour === hr && secs > 0;
                return (
                  <div
                    key={hr}
                    title={`${hr}:00 – ${(hr + 1) % 24}:00 · ${formatAnalyticsDuration(secs, false)} listening`}
                    className={`w-full rounded-sm transition-all ${
                      isPeak
                        ? 'bg-[var(--accent)] shadow-[0_0_10px_color-mix(in_srgb,var(--accent)_65%,transparent)]'
                        : secs > 0
                        ? 'bg-[var(--accent)]/45'
                        : 'bg-white/[0.07]'
                    }`}
                    style={{ height: `${heightPct}%` }}
                  />
                );
              })}
            </div>
            <div className="flex justify-between text-[10px] font-mono text-[var(--text-muted)] mt-1.5">
              <span>12 AM</span>
              <span>6 AM</span>
              <span>12 PM</span>
              <span>6 PM</span>
              <span>11 PM</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5 pt-2 border-t border-[var(--border-subtle)] text-xs">
            <div className="min-w-0">
              <p className="text-[var(--text-muted)]">Top Artist</p>
              <p className="font-semibold text-[var(--text-primary)] truncate mt-0.5">
                {summary.topArtist ? `${summary.topArtist.name} (${summary.topArtist.plays})` : '—'}
              </p>
            </div>
            <div className="min-w-0">
              <p className="text-[var(--text-muted)]">Top Language</p>
              <p className="font-semibold text-[var(--text-primary)] truncate mt-0.5">
                {summary.topLanguage ? summary.topLanguage.name : '—'}
              </p>
            </div>
          </div>
        </div>

        {/* Most Played Songs */}
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/60 p-4 flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Headphones className="w-4 h-4 text-[var(--accent)]" />
              <h3 className="text-sm font-semibold">Most Played Songs</h3>
            </div>
            <span className="text-xs font-mono text-[var(--text-muted)]">
              Longest streak: {summary.longestStreakDays}d
            </span>
          </div>

          {summary.topTracks.length > 0 ? (
            <div className="space-y-2">
              {summary.topTracks.map(({ track, plays }, idx) => (
                <button
                  key={track.id}
                  type="button"
                  onClick={() => void playTrack(track, tracks)}
                  className="w-full flex items-center gap-3 p-2 rounded-xl bg-[var(--bg-surface)]/75 hover:bg-[var(--bg-hover)] border border-[var(--border-subtle)] text-left transition-colors cursor-pointer group"
                >
                  <span className="w-5 text-center text-xs font-mono font-semibold text-[var(--text-muted)] shrink-0">
                    {idx + 1}
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
                    <p className="text-sm font-semibold truncate text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors">
                      {track.title}
                    </p>
                    <p className="text-xs text-[var(--text-muted)] truncate">{track.artist}</p>
                  </div>
                  <span className="text-xs font-mono tabular-nums text-[var(--text-secondary)] shrink-0">
                    {plays} play{plays === 1 ? '' : 's'}
                  </span>
                  <Play className="w-3.5 h-3.5 text-[var(--text-muted)] group-hover:text-[var(--accent)] shrink-0" />
                </button>
              ))}
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-6 text-xs text-[var(--text-muted)]">
              <Headphones className="w-6 h-6 mb-2 opacity-40" />
              Play songs in ISAI to populate your most-played tracks and taste insights.
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
