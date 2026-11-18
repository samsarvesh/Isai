import type { LrcLine } from '../types/music';

export interface ParsedLyrics {
  synced: LrcLine[];
  plain: string[];
  isSynchronized: boolean;
  offsetMs: number;
}

const TIMESTAMP_REGEX = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
const OFFSET_REGEX = /\[offset:\s*([+-]?\d+)\]/i;
const META_TAG_REGEX = /^\[(ar|ti|al|au|by|length|re|ve):.*\]$/i;

export function parseLrcOrPlainLyrics(raw?: string): ParsedLyrics {
  if (!raw || !raw.trim()) {
    return { synced: [], plain: [], isSynchronized: false, offsetMs: 0 };
  }

  const lines = raw.split(/\r?\n/);
  let offsetMs = 0;
  const synced: LrcLine[] = [];
  const plain: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const offsetMatch = trimmed.match(OFFSET_REGEX);
    if (offsetMatch) {
      offsetMs = parseInt(offsetMatch[1], 10) || 0;
      continue;
    }

    if (META_TAG_REGEX.test(trimmed)) {
      continue;
    }

    const timestamps: number[] = [];
    let match: RegExpExecArray | null;
    TIMESTAMP_REGEX.lastIndex = 0;
    while ((match = TIMESTAMP_REGEX.exec(trimmed)) !== null) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      const fracRaw = match[3] || '0';
      const fracMs = fracRaw.length === 3 ? parseInt(fracRaw, 10) : parseInt(fracRaw, 10) * 10;
      const totalSeconds = minutes * 60 + seconds + fracMs / 1000;
      timestamps.push(totalSeconds);
    }

    const textOnly = trimmed.replace(TIMESTAMP_REGEX, '').trim();
    if (timestamps.length > 0) {
      for (const ts of timestamps) {
        synced.push({
          time: Math.max(0, ts - offsetMs / 1000),
          text: textOnly || '···',
        });
      }
    } else {
      plain.push(trimmed);
    }
  }

  if (synced.length > 0) {
    synced.sort((a, b) => a.time - b.time);
    return {
      synced,
      plain: synced.map((s) => s.text),
      isSynchronized: true,
      offsetMs,
    };
  }

  return {
    synced: [],
    plain,
    isSynchronized: false,
    offsetMs: 0,
  };
}

export function getActiveLrcIndex(lines: LrcLine[], currentTime: number): number {
  if (lines.length === 0) return -1;
  let active = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].time <= currentTime + 0.15) {
      active = i;
    } else {
      break;
    }
  }
  return active;
}

export function formatLrcTimestamp(seconds: number): string {
  const safe = Math.max(0, seconds);
  const mins = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  const cs = Math.floor((safe % 1) * 100);
  return `[${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(cs).padStart(2, '0')}]`;
}

export interface OnlineLyricsCandidate {
  id: number;
  trackName: string;
  artistName: string;
  albumName: string;
  duration: number;
  syncedLyrics?: string | null;
  plainLyrics?: string | null;
}

// Permitted, zero-cost, open-source lyrics lookup via LRCLIB (no API key required)
export async function searchPermittedOnlineLyrics(
  title: string,
  artist: string
): Promise<OnlineLyricsCandidate[]> {
  if (!navigator.onLine) {
    throw new Error('You are currently offline. Connect to the internet to search LRCLIB.');
  }
  const query = [title, artist !== 'Unknown Artist' ? artist : ''].filter(Boolean).join(' ').trim();
  if (!query) return [];

  const url = `https://lrclib.net/api/search?q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`Lyrics lookup failed (${res.status}).`);
  }
  const data = (await res.json()) as OnlineLyricsCandidate[];
  return Array.isArray(data) ? data.slice(0, 8) : [];
}
