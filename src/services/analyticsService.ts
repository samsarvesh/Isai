import type { ListeningEvent, Track } from '../types/music';

const STORAGE_KEY = 'isai_daily_analytics_v1';
const MAX_STORED_DAYS = 365;

export interface DailyActivityRecord {
  date: string; // Local YYYY-MM-DD
  appSeconds: number;
  listeningSeconds: number;
  songsPlayed: number;
  sessions: number;
  hourlyListening: number[]; // 24 buckets (0..23) in seconds
}

export type DailyActivityStore = Record<string, DailyActivityRecord>;

export interface DayChartPoint {
  date: string;
  dayLabel: string;
  shortDate: string;
  isToday: boolean;
  appSeconds: number;
  listeningSeconds: number;
  songsPlayed: number;
}

export interface AnalyticsSummary {
  todayKey: string;
  todaySongs: number;
  todayUniqueSongs: number;
  todayAppSeconds: number;
  todayListeningSeconds: number;
  todaySessions: number;
  avgDailyAppSeconds: number;
  avgDailyListeningSeconds: number;
  avgDailySongs: number;
  totalAppSeconds: number;
  totalListeningSeconds: number;
  totalSongsPlayed: number;
  activeDaysCount: number;
  currentStreakDays: number;
  longestStreakDays: number;
  last7Days: DayChartPoint[];
  hourlyDistribution: number[];
  peakHour: number | null;
  peakWindowLabel: string;
  topTracks: Array<{ track: Track; plays: number }>;
  topArtist: { name: string; plays: number } | null;
  topLanguage: { name: string; plays: number } | null;
}

export function getLocalDateKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function createEmptyDay(date: string): DailyActivityRecord {
  return {
    date,
    appSeconds: 0,
    listeningSeconds: 0,
    songsPlayed: 0,
    sessions: 0,
    hourlyListening: Array.from({ length: 24 }, () => 0),
  };
}

function normalizeDay(raw: Partial<DailyActivityRecord>, date: string): DailyActivityRecord {
  const hourly = Array.isArray(raw.hourlyListening) && raw.hourlyListening.length === 24
    ? raw.hourlyListening.map((n) => (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0))
    : Array.from({ length: 24 }, () => 0);

  return {
    date,
    appSeconds: Number.isFinite(raw.appSeconds) && (raw.appSeconds ?? 0) > 0 ? Math.floor(raw.appSeconds!) : 0,
    listeningSeconds:
      Number.isFinite(raw.listeningSeconds) && (raw.listeningSeconds ?? 0) > 0
        ? Math.floor(raw.listeningSeconds!)
        : 0,
    songsPlayed: Number.isFinite(raw.songsPlayed) && (raw.songsPlayed ?? 0) > 0 ? Math.floor(raw.songsPlayed!) : 0,
    sessions: Number.isFinite(raw.sessions) && (raw.sessions ?? 0) > 0 ? Math.floor(raw.sessions!) : 0,
    hourlyListening: hourly,
  };
}

export function loadActivityStore(): DailyActivityStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, Partial<DailyActivityRecord>>;
    if (!parsed || typeof parsed !== 'object') return {};
    const clean: DailyActivityStore = {};
    for (const [key, val] of Object.entries(parsed)) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(key) && val && typeof val === 'object') {
        clean[key] = normalizeDay(val, key);
      }
    }
    return clean;
  } catch {
    return {};
  }
}

export function saveActivityStore(store: DailyActivityStore): void {
  try {
    const keys = Object.keys(store).sort();
    const pruned: DailyActivityStore = {};
    const keepKeys = keys.length > MAX_STORED_DAYS ? keys.slice(keys.length - MAX_STORED_DAYS) : keys;
    for (const k of keepKeys) {
      pruned[k] = store[k];
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pruned));
  } catch {
    // ignore quota/private-mode storage errors
  }
}

export function clearActivityStore(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function recordSessionOpen(store: DailyActivityStore): DailyActivityStore {
  const todayKey = getLocalDateKey();
  const existing = store[todayKey] ?? createEmptyDay(todayKey);
  const next: DailyActivityStore = {
    ...store,
    [todayKey]: {
      ...existing,
      sessions: existing.sessions + 1,
    },
  };
  saveActivityStore(next);
  return next;
}

export function tickActivitySecond(
  store: DailyActivityStore,
  isPlaying: boolean,
  now: Date = new Date()
): DailyActivityStore {
  const todayKey = getLocalDateKey(now);
  const existing = store[todayKey] ?? createEmptyDay(todayKey);
  const hour = now.getHours();
  let hourlyListening = existing.hourlyListening;

  if (isPlaying) {
    hourlyListening = [...existing.hourlyListening];
    hourlyListening[hour] = (hourlyListening[hour] || 0) + 1;
  }

  return {
    ...store,
    [todayKey]: {
      ...existing,
      appSeconds: existing.appSeconds + 1,
      listeningSeconds: existing.listeningSeconds + (isPlaying ? 1 : 0),
      hourlyListening,
    },
  };
}

export function recordSongHeardInStore(store: DailyActivityStore, now: Date = new Date()): DailyActivityStore {
  const todayKey = getLocalDateKey(now);
  const existing = store[todayKey] ?? createEmptyDay(todayKey);
  const next: DailyActivityStore = {
    ...store,
    [todayKey]: {
      ...existing,
      songsPlayed: existing.songsPlayed + 1,
    },
  };
  saveActivityStore(next);
  return next;
}

export function mergeHistoryBackfill(store: DailyActivityStore, history: ListeningEvent[]): DailyActivityStore {
  if (history.length === 0) return store;

  const eventsByDate = new Map<string, { songs: number; seconds: number; hourly: number[] }>();
  for (const ev of history) {
    const dt = new Date(ev.playedAt);
    if (Number.isNaN(dt.getTime())) continue;
    const key = getLocalDateKey(dt);
    let bucket = eventsByDate.get(key);
    if (!bucket) {
      bucket = { songs: 0, seconds: 0, hourly: Array.from({ length: 24 }, () => 0) };
      eventsByDate.set(key, bucket);
    }
    bucket.songs += 1;
    const secs = Math.max(15, Math.round(ev.durationListened || 0));
    bucket.seconds += secs;
    bucket.hourly[dt.getHours()] += secs;
  }

  let changed = false;
  const next: DailyActivityStore = { ...store };

  for (const [dateKey, agg] of eventsByDate.entries()) {
    const existing = next[dateKey];
    if (!existing) {
      next[dateKey] = {
        date: dateKey,
        appSeconds: agg.seconds,
        listeningSeconds: agg.seconds,
        songsPlayed: agg.songs,
        sessions: 1,
        hourlyListening: agg.hourly,
      };
      changed = true;
    } else if (existing.songsPlayed < agg.songs) {
      next[dateKey] = {
        ...existing,
        songsPlayed: agg.songs,
        listeningSeconds: Math.max(existing.listeningSeconds, agg.seconds),
        appSeconds: Math.max(existing.appSeconds, agg.seconds),
      };
      changed = true;
    }
  }

  if (changed) {
    saveActivityStore(next);
    return next;
  }
  return store;
}

export function formatAnalyticsDuration(totalSeconds: number, showLiveSeconds = false): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;

  if (hrs > 0) {
    return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
  }
  if (mins > 0) {
    return showLiveSeconds && mins < 10 ? `${mins}m ${secs}s` : `${mins}m`;
  }
  if (showLiveSeconds || safe > 0) {
    return `${secs}s`;
  }
  return '0m';
}

function formatHourRange(hour: number): string {
  const fmt = (h: number) => {
    const normalized = ((h % 24) + 24) % 24;
    const suffix = normalized >= 12 ? 'PM' : 'AM';
    const h12 = normalized % 12 === 0 ? 12 : normalized % 12;
    return `${h12} ${suffix}`;
  };
  const period =
    hour >= 5 && hour < 12
      ? 'Morning'
      : hour >= 12 && hour < 17
      ? 'Afternoon'
      : hour >= 17 && hour < 21
      ? 'Evening'
      : 'Late Night';
  return `${period} · ${fmt(hour)} – ${fmt(hour + 1)}`;
}

export function computeAnalyticsSummary(
  store: DailyActivityStore,
  history: ListeningEvent[],
  trackMap: Map<string, Track>,
  now: Date = new Date()
): AnalyticsSummary {
  const todayKey = getLocalDateKey(now);
  const todayRecord = store[todayKey] ?? createEmptyDay(todayKey);

  // Count unique songs heard today from ListeningEvent history
  const todayUniqueSet = new Set<string>();
  let todayHistoryCount = 0;
  const trackCounts = new Map<string, number>();
  const artistCounts = new Map<string, number>();
  const languageCounts = new Map<string, number>();

  for (const ev of history) {
    const evDate = getLocalDateKey(new Date(ev.playedAt));
    if (evDate === todayKey) {
      todayUniqueSet.add(ev.trackId);
      todayHistoryCount += 1;
    }
    trackCounts.set(ev.trackId, (trackCounts.get(ev.trackId) || 0) + 1);
    const track = trackMap.get(ev.trackId);
    if (track) {
      if (track.artist) {
        artistCounts.set(track.artist, (artistCounts.get(track.artist) || 0) + 1);
      }
      if (track.language) {
        languageCounts.set(track.language, (languageCounts.get(track.language) || 0) + 1);
      }
    }
  }

  // Also include playCount from trackMap if history hasn't logged everything yet
  if (trackCounts.size === 0) {
    for (const track of trackMap.values()) {
      if (track.playCount > 0) {
        trackCounts.set(track.id, track.playCount);
        if (track.artist) {
          artistCounts.set(track.artist, (artistCounts.get(track.artist) || 0) + track.playCount);
        }
        if (track.language) {
          languageCounts.set(track.language, (languageCounts.get(track.language) || 0) + track.playCount);
        }
      }
    }
  }

  const allRecords = Object.values(store);
  const activeRecords = allRecords.filter(
    (r) => r.appSeconds > 0 || r.listeningSeconds > 0 || r.songsPlayed > 0
  );

  const totalAppSeconds = activeRecords.reduce((sum, r) => sum + r.appSeconds, 0);
  const totalListeningSeconds = activeRecords.reduce((sum, r) => sum + r.listeningSeconds, 0);
  const totalSongsPlayed = Math.max(
    activeRecords.reduce((sum, r) => sum + r.songsPlayed, 0),
    history.length
  );

  const activeDaysCount = Math.max(activeRecords.length, 1);
  const avgDailyAppSeconds = Math.round(totalAppSeconds / activeDaysCount);
  const avgDailyListeningSeconds = Math.round(totalListeningSeconds / activeDaysCount);
  const avgDailySongs = Number((totalSongsPlayed / activeDaysCount).toFixed(1));

  // Build Last 7 Days points (oldest -> today)
  const last7Days: DayChartPoint[] = [];
  for (let offset = 6; offset >= 0; offset--) {
    const d = new Date(now);
    d.setDate(now.getDate() - offset);
    const key = getLocalDateKey(d);
    const rec = store[key];
    last7Days.push({
      date: key,
      dayLabel: offset === 0 ? 'Today' : d.toLocaleDateString(undefined, { weekday: 'short' }),
      shortDate: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      isToday: offset === 0,
      appSeconds: rec?.appSeconds ?? 0,
      listeningSeconds: rec?.listeningSeconds ?? 0,
      songsPlayed: rec?.songsPlayed ?? 0,
    });
  }

  // Compute listening streak (consecutive days ending today or yesterday)
  const activeDaySet = new Set(activeRecords.map((r) => r.date));
  let currentStreakDays = 0;
  const cursor = new Date(now);
  // If no activity today yet, check starting from yesterday
  if (!activeDaySet.has(getLocalDateKey(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
  }
  while (activeDaySet.has(getLocalDateKey(cursor))) {
    currentStreakDays += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  // Longest streak
  const sortedDates = Array.from(activeDaySet).sort();
  let longestStreakDays = currentStreakDays;
  let run = 0;
  let prevMs: number | null = null;
  for (const dateStr of sortedDates) {
    const [y, m, day] = dateStr.split('-').map(Number);
    const ms = new Date(y, m - 1, day).getTime();
    if (prevMs !== null && Math.round((ms - prevMs) / 86_400_000) === 1) {
      run += 1;
    } else {
      run = 1;
    }
    if (run > longestStreakDays) longestStreakDays = run;
    prevMs = ms;
  }

  // Aggregate 24-hour listening rhythm
  const hourlyDistribution = Array.from({ length: 24 }, () => 0);
  for (const rec of activeRecords) {
    for (let h = 0; h < 24; h++) {
      hourlyDistribution[h] += rec.hourlyListening[h] || 0;
    }
  }
  let peakHour: number | null = null;
  let peakVal = 0;
  for (let h = 0; h < 24; h++) {
    if (hourlyDistribution[h] > peakVal) {
      peakVal = hourlyDistribution[h];
      peakHour = h;
    }
  }

  const topTracks = Array.from(trackCounts.entries())
    .map(([id, plays]) => {
      const track = trackMap.get(id);
      return track ? { track, plays } : null;
    })
    .filter((entry): entry is { track: Track; plays: number } => Boolean(entry))
    .sort((a, b) => b.plays - a.plays)
    .slice(0, 3);

  const topArtistEntry = Array.from(artistCounts.entries()).sort((a, b) => b[1] - a[1])[0];
  const topLangEntry = Array.from(languageCounts.entries()).sort((a, b) => b[1] - a[1])[0];

  return {
    todayKey,
    todaySongs: Math.max(todayRecord.songsPlayed, todayHistoryCount),
    todayUniqueSongs: todayUniqueSet.size,
    todayAppSeconds: todayRecord.appSeconds,
    todayListeningSeconds: todayRecord.listeningSeconds,
    todaySessions: Math.max(todayRecord.sessions, 1),
    avgDailyAppSeconds,
    avgDailyListeningSeconds,
    avgDailySongs,
    totalAppSeconds,
    totalListeningSeconds,
    totalSongsPlayed,
    activeDaysCount: activeRecords.length,
    currentStreakDays,
    longestStreakDays,
    last7Days,
    hourlyDistribution,
    peakHour,
    peakWindowLabel: peakHour !== null ? formatHourRange(peakHour) : 'Start playing music to reveal your peak hour',
    topTracks,
    topArtist: topArtistEntry ? { name: topArtistEntry[0], plays: topArtistEntry[1] } : null,
    topLanguage: topLangEntry ? { name: topLangEntry[0], plays: topLangEntry[1] } : null,
  };
}
