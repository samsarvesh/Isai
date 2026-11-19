import type { LrcLine, LrcWord } from '../types/music';

export interface ParsedLyrics {
  synced: LrcLine[];
  plain: string[];
  isSynchronized: boolean;
  isAutoSynced: boolean;
  offsetMs: number;
}

const TIMESTAMP_REGEX = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
const WORD_TIMESTAMP_REGEX = /<(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?>/g;
const OFFSET_REGEX = /\[offset:\s*([+-]?\d+)\]/i;
const META_TAG_REGEX = /^\[(ar|ti|al|au|by|length|re|ve|tool|id):.*\]$/i;
const SECTION_HEADER_REGEX = /^(\[(verse|chorus|bridge|intro|outro|pre-chorus|post-chorus|hook|refrain|interlude|instrumental|solo|break|part)[^\]]*\]|\((verse|chorus|bridge|intro|outro|instrumental|music)[^)]*\))$/i;

function parseTimestampParts(minStr: string, secStr: string, fracRaw = '0'): number {
  const minutes = parseInt(minStr, 10) || 0;
  const seconds = parseInt(secStr, 10) || 0;
  const fracMs =
    fracRaw.length === 3
      ? parseInt(fracRaw, 10)
      : fracRaw.length === 2
      ? parseInt(fracRaw, 10) * 10
      : fracRaw.length === 1
      ? parseInt(fracRaw, 10) * 100
      : 0;
  return minutes * 60 + seconds + fracMs / 1000;
}

function buildProportionalWords(text: string, lineStart: number, lineEnd: number): LrcWord[] {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];

  const totalSpan = Math.max(0.35, lineEnd - lineStart);
  const weights = tokens.map((token) => {
    const clean = token.replace(/[^\p{L}\p{N}]/gu, '');
    const punctuationPause = /[,;:.!?…—-]$/.test(token) ? 1.6 : 0;
    return Math.max(1.8, clean.length) + punctuationPause;
  });
  const totalWeight = weights.reduce((acc, w) => acc + w, 0) || 1;

  let cursor = lineStart;
  return tokens.map((token, idx) => {
    const portion = (weights[idx] / totalWeight) * totalSpan;
    const start = cursor;
    const end = idx === tokens.length - 1 ? lineEnd : cursor + portion;
    cursor = end;
    return { text: token, start, end };
  });
}

function parseEnhancedWordTokens(rawText: string, offsetSec: number, lineStart: number, lineEnd: number): LrcWord[] | null {
  WORD_TIMESTAMP_REGEX.lastIndex = 0;
  const matches = [...rawText.matchAll(WORD_TIMESTAMP_REGEX)];
  if (matches.length === 0) return null;

  const segments: { start: number; text: string }[] = [];
  const leadingText = rawText.slice(0, matches[0].index ?? 0).trim();
  if (leadingText) {
    segments.push({ start: lineStart, text: leadingText });
  }

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const ts = Math.max(0, parseTimestampParts(m[1], m[2], m[3]) - offsetSec);
    const contentStart = (m.index ?? 0) + m[0].length;
    const contentEnd = i + 1 < matches.length ? (matches[i + 1].index ?? rawText.length) : rawText.length;
    const chunk = rawText.slice(contentStart, contentEnd).trim();
    if (chunk) {
      segments.push({ start: ts, text: chunk });
    }
  }

  if (segments.length === 0) return null;

  const words: LrcWord[] = [];
  for (let i = 0; i < segments.length; i++) {
    const segStart = segments[i].start;
    const segEnd =
      i + 1 < segments.length
        ? Math.max(segStart + 0.08, segments[i + 1].start)
        : Math.max(segStart + 0.25, lineEnd);
    const subWords = buildProportionalWords(segments[i].text, segStart, segEnd);
    words.push(...subWords);
  }
  return words.length > 0 ? words : null;
}

function estimateLineDuration(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.min(6.5, Math.max(1.4, words * 0.42 + 0.5));
}

function buildAutoSyncedFromPlain(plainLines: string[], trackDuration?: number): LrcLine[] {
  if (plainLines.length === 0) return [];

  const duration = trackDuration && trackDuration > 5 ? trackDuration : Math.max(30, plainLines.length * 3.4);
  const introOffset = Math.min(10, duration * 0.045);
  const outroBuffer = Math.min(8, duration * 0.035);
  const usableDuration = Math.max(10, duration - introOffset - outroBuffer);

  const lineWeights = plainLines.map((line) => {
    if (SECTION_HEADER_REGEX.test(line)) return 0.45;
    const words = line.split(/\s+/).filter(Boolean).length;
    const chars = line.replace(/\s+/g, '').length;
    return Math.max(3, chars * 0.35 + words * 1.4);
  });
  const totalWeight = lineWeights.reduce((acc, w) => acc + w, 0) || 1;

  let cursor = introOffset;
  return plainLines.map((text, idx) => {
    const isSectionHeader = SECTION_HEADER_REGEX.test(text);
    const span = (lineWeights[idx] / totalWeight) * usableDuration;
    const start = cursor;
    const end = idx === plainLines.length - 1 ? introOffset + usableDuration : start + span;
    cursor = end;
    const activeEnd = Math.max(start + 0.3, end - Math.min(0.18, span * 0.08));
    return {
      time: start,
      endTime: activeEnd,
      text,
      isSectionHeader,
      words: isSectionHeader ? [] : buildProportionalWords(text, start, activeEnd),
    };
  });
}

export function parseLrcOrPlainLyrics(raw?: string, trackDuration?: number): ParsedLyrics {
  if (!raw || !raw.trim()) {
    return { synced: [], plain: [], isSynchronized: false, isAutoSynced: false, offsetMs: 0 };
  }

  const lines = raw.split(/\r?\n/);
  let offsetMs = 0;
  const rawSynced: { time: number; rawText: string; cleanText: string }[] = [];
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
      timestamps.push(parseTimestampParts(match[1], match[2], match[3]));
    }

    const rawTextOnly = trimmed.replace(TIMESTAMP_REGEX, '').trim();
    const cleanTextOnly = rawTextOnly.replace(WORD_TIMESTAMP_REGEX, ' ').replace(/\s+/g, ' ').trim();

    if (timestamps.length > 0) {
      for (const ts of timestamps) {
        rawSynced.push({
          time: Math.max(0, ts - offsetMs / 1000),
          rawText: rawTextOnly,
          cleanText: cleanTextOnly || '···',
        });
      }
    } else {
      plain.push(cleanTextOnly || trimmed);
    }
  }

  if (rawSynced.length > 0) {
    rawSynced.sort((a, b) => a.time - b.time);
    const offsetSec = offsetMs / 1000;
    const synced: LrcLine[] = rawSynced.map((entry, idx) => {
      const nextTime = idx + 1 < rawSynced.length ? rawSynced[idx + 1].time : undefined;
      const estimatedEnd = entry.time + estimateLineDuration(entry.cleanText);
      const hardEnd =
        nextTime !== undefined
          ? Math.max(entry.time + 0.35, nextTime - 0.06)
          : trackDuration && trackDuration > entry.time
          ? Math.min(trackDuration, Math.max(entry.time + 0.6, estimatedEnd))
          : estimatedEnd;
      // Cap very long instrumental gaps so words finish naturally during the vocal phrase
      const phraseEnd =
        nextTime !== undefined && nextTime - entry.time > 8
          ? Math.min(hardEnd, entry.time + Math.max(3.5, estimateLineDuration(entry.cleanText) * 1.25))
          : hardEnd;

      const isSectionHeader = SECTION_HEADER_REGEX.test(entry.cleanText);
      const enhancedWords = parseEnhancedWordTokens(entry.rawText, offsetSec, entry.time, phraseEnd);
      const words =
        isSectionHeader || entry.cleanText === '···'
          ? []
          : enhancedWords ?? buildProportionalWords(entry.cleanText, entry.time, phraseEnd);

      return {
        time: entry.time,
        endTime: phraseEnd,
        text: entry.cleanText,
        isSectionHeader,
        words,
      };
    });

    return {
      synced,
      plain: synced.map((s) => s.text),
      isSynchronized: true,
      isAutoSynced: false,
      offsetMs,
    };
  }

  const autoSynced = buildAutoSyncedFromPlain(plain, trackDuration);
  return {
    synced: autoSynced,
    plain,
    isSynchronized: autoSynced.length > 0,
    isAutoSynced: autoSynced.length > 0,
    offsetMs: 0,
  };
}

export function getActiveLrcIndex(lines: LrcLine[], currentTime: number): number {
  if (lines.length === 0) return -1;
  let active = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].time <= currentTime + 0.12) {
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
