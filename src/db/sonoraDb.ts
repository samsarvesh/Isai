import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { AIMemory, AppSettings, ListeningEvent, Playlist, Track } from '../types/music';

interface SonoraDBSchema extends DBSchema {
  tracks: {
    key: string;
    value: Track;
    indexes: {
      'by-artist': string;
      'by-album': string;
      'by-dateAdded': number;
      'by-duplicateKey': string;
    };
  };
  audioFiles: {
    key: string;
    value: { id: string; blob: Blob };
  };
  artworks: {
    key: string;
    value: { id: string; blob: Blob; mimeType: string; isHd?: boolean };
  };
  playlists: {
    key: string;
    value: Playlist;
  };
  history: {
    key: string;
    value: ListeningEvent;
    indexes: { 'by-playedAt': number; 'by-trackId': string };
  };
  aiMemory: {
    key: string;
    value: AIMemory;
  };
  settings: {
    key: string;
    value: AppSettings;
  };
  driveCatalog: {
    key: string;
    value: { id: string; updatedAt: number; tracks: Track[] };
  };
}

const DB_NAME = 'sonora-ecosystem-db';
const DB_VERSION = 2;

let dbPromise: Promise<IDBPDatabase<SonoraDBSchema>> | null = null;

export function getDb(): Promise<IDBPDatabase<SonoraDBSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<SonoraDBSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('tracks')) {
          const trackStore = db.createObjectStore('tracks', { keyPath: 'id' });
          trackStore.createIndex('by-artist', 'artist');
          trackStore.createIndex('by-album', 'album');
          trackStore.createIndex('by-dateAdded', 'dateAdded');
          trackStore.createIndex('by-duplicateKey', 'duplicateKey');
        }
        if (!db.objectStoreNames.contains('audioFiles')) {
          db.createObjectStore('audioFiles', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('artworks')) {
          db.createObjectStore('artworks', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('playlists')) {
          db.createObjectStore('playlists', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('history')) {
          const historyStore = db.createObjectStore('history', { keyPath: 'id' });
          historyStore.createIndex('by-playedAt', 'playedAt');
          historyStore.createIndex('by-trackId', 'trackId');
        }
        if (!db.objectStoreNames.contains('aiMemory')) {
          db.createObjectStore('aiMemory', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('driveCatalog')) {
          db.createObjectStore('driveCatalog', { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
}

export const DEFAULT_SETTINGS: AppSettings = {
  id: 'primary',
  theme: 'dark',
  accent: 'amber',
  crossfadeSeconds: 1,
  gapless: true,
  playbackSpeed: 1,
  volume: 0.85,
  smartShuffle: true,
  eqPreset: 'Flat',
  eqGains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  ollamaEnabled: false,
  ollamaUrl: 'http://localhost:11434',
  ollamaModel: 'llama3.2',
  focusMode: false,
  discoveryMode: false,
};

export const DEFAULT_AI_MEMORY: AIMemory = {
  id: 'primary',
  preferredGenres: {},
  favoriteArtists: {},
  preferredLanguages: {},
  frequentlySkippedIds: [],
  selectedMoods: {},
  chatHistory: [],
};

// In-memory LRU artwork URL cache so virtualized/lazy artwork never leaks object URLs
const artworkUrlCache = new Map<string, string>();
const artworkListeners = new Map<string, Set<(url: string) => void>>();

export function subscribeArtworkUpdates(trackId: string, listener: (url: string) => void): () => void {
  let set = artworkListeners.get(trackId);
  if (!set) {
    set = new Set();
    artworkListeners.set(trackId, set);
  }
  set.add(listener);
  return () => {
    set?.delete(listener);
    if (set && set.size === 0) {
      artworkListeners.delete(trackId);
    }
  };
}

export async function getArtworkUrl(trackId: string): Promise<string | null> {
  if (artworkUrlCache.has(trackId)) {
    return artworkUrlCache.get(trackId)!;
  }
  const db = await getDb();
  const record = await db.get('artworks', trackId);
  if (!record) return null;
  const url = URL.createObjectURL(record.blob);
  artworkUrlCache.set(trackId, url);
  return url;
}

export async function hasLocalArtwork(trackId: string): Promise<boolean> {
  if (artworkUrlCache.has(trackId)) return true;
  const db = await getDb();
  const key = await db.getKey('artworks', trackId);
  return key !== undefined;
}

export async function getArtworkRecord(
  trackId: string
): Promise<{ id: string; blob: Blob; mimeType: string; isHd?: boolean } | null> {
  const db = await getDb();
  const rec = await db.get('artworks', trackId);
  return rec ?? null;
}

export async function saveTrackArtwork(
  trackId: string,
  blob: Blob,
  mimeType: string,
  isHd = false
): Promise<string> {
  const db = await getDb();
  await db.put('artworks', { id: trackId, blob, mimeType: mimeType || blob.type || 'image/jpeg', isHd });
  const prev = artworkUrlCache.get(trackId);
  const url = URL.createObjectURL(blob);
  artworkUrlCache.set(trackId, url);
  if (prev && prev !== url) {
    window.setTimeout(() => URL.revokeObjectURL(prev), 3000);
  }
  const listeners = artworkListeners.get(trackId);
  if (listeners) {
    for (const cb of listeners) cb(url);
  }
  return url;
}

export function revokeArtworkUrl(trackId: string) {
  const existing = artworkUrlCache.get(trackId);
  if (existing) {
    URL.revokeObjectURL(existing);
    artworkUrlCache.delete(trackId);
  }
}

export async function getAllTracks(): Promise<Track[]> {
  const db = await getDb();
  return db.getAll('tracks');
}

export async function saveTrackWithMedia(
  track: Track,
  audioBlob?: Blob,
  artwork?: { blob: Blob; mimeType: string }
): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['tracks', 'audioFiles', 'artworks'], 'readwrite');
  await tx.objectStore('tracks').put(track);
  if (audioBlob) {
    await tx.objectStore('audioFiles').put({ id: track.id, blob: audioBlob });
  }
  if (artwork) {
    await tx.objectStore('artworks').put({ id: track.id, blob: artwork.blob, mimeType: artwork.mimeType });
  }
  await tx.done;
}

export async function updateTrack(track: Track): Promise<void> {
  const db = await getDb();
  await db.put('tracks', track);
}

export async function removeTrackFromLibrary(trackId: string): Promise<void> {
  const db = await getDb();
  revokeArtworkUrl(trackId);
  const tx = db.transaction(['tracks', 'audioFiles', 'artworks', 'playlists'], 'readwrite');
  await tx.objectStore('tracks').delete(trackId);
  await tx.objectStore('audioFiles').delete(trackId);
  await tx.objectStore('artworks').delete(trackId);
  const playlists = await tx.objectStore('playlists').getAll();
  for (const pl of playlists) {
    if (pl.trackIds.includes(trackId)) {
      await tx.objectStore('playlists').put({
        ...pl,
        trackIds: pl.trackIds.filter((id) => id !== trackId),
        updatedAt: Date.now(),
      });
    }
  }
  await tx.done;
}

export async function getAudioBlob(trackId: string): Promise<Blob | null> {
  const db = await getDb();
  const rec = await db.get('audioFiles', trackId);
  return rec?.blob ?? null;
}

export async function saveCachedDriveAudio(trackId: string, blob: Blob): Promise<void> {
  try {
    const db = await getDb();
    await db.put('audioFiles', { id: trackId, blob });
  } catch {
    // ignore IndexedDB quota pressure on huge libraries
  }
}

export async function getCachedDriveAudio(trackId: string): Promise<Blob | null> {
  try {
    const db = await getDb();
    const rec = await db.get('audioFiles', trackId);
    return rec?.blob ?? null;
  } catch {
    return null;
  }
}

export async function deleteCachedDriveTrackMedia(trackId: string): Promise<void> {
  try {
    const db = await getDb();
    revokeArtworkUrl(trackId);
    const tx = db.transaction(['audioFiles', 'artworks'], 'readwrite');
    await tx.objectStore('audioFiles').delete(trackId);
    await tx.objectStore('artworks').delete(trackId);
    await tx.done;
  } catch {
    // ignore cleanup errors
  }
}

export async function saveDriveCatalogCache(userId: string, tracks: Track[]): Promise<void> {
  try {
    const db = await getDb();
    await db.put('driveCatalog', {
      id: userId,
      updatedAt: Date.now(),
      tracks,
    });
  } catch {
    // ignore cache errors
  }
}

export async function getDriveCatalogCache(userId: string): Promise<Track[]> {
  try {
    const db = await getDb();
    const rec = await db.get('driveCatalog', userId);
    return rec?.tracks ?? [];
  } catch {
    return [];
  }
}

export async function clearDriveCacheForUser(userId: string): Promise<void> {
  try {
    const db = await getDb();
    const rec = await db.get('driveCatalog', userId);
    const driveTrackIds = (rec?.tracks || []).map((t) => t.id);
    const tx = db.transaction(['driveCatalog', 'audioFiles', 'artworks'], 'readwrite');
    await tx.objectStore('driveCatalog').delete(userId);
    for (const id of driveTrackIds) {
      revokeArtworkUrl(id);
      await tx.objectStore('audioFiles').delete(id);
      await tx.objectStore('artworks').delete(id);
    }
    await tx.done;
  } catch {
    // ignore cleanup errors
  }
}

export async function getAllPlaylists(): Promise<Playlist[]> {
  const db = await getDb();
  return db.getAll('playlists');
}

export async function savePlaylist(playlist: Playlist): Promise<void> {
  const db = await getDb();
  await db.put('playlists', playlist);
}

export async function deletePlaylist(playlistId: string): Promise<void> {
  const db = await getDb();
  await db.delete('playlists', playlistId);
}

export async function getListeningHistory(): Promise<ListeningEvent[]> {
  const db = await getDb();
  return db.getAllFromIndex('history', 'by-playedAt');
}

export async function addListeningEvent(event: ListeningEvent): Promise<void> {
  const db = await getDb();
  await db.put('history', event);
}

export async function getSettings(): Promise<AppSettings> {
  const db = await getDb();
  const stored = await db.get('settings', 'primary');
  if (!stored) return DEFAULT_SETTINGS;
  const merged = { ...DEFAULT_SETTINGS, ...stored };
  // One-time migration: the old built-in default was 2s; the new default is 1s
  try {
    if (localStorage.getItem('isai_crossfade_default_v1') !== 'done') {
      localStorage.setItem('isai_crossfade_default_v1', 'done');
      if (merged.crossfadeSeconds === 2) {
        merged.crossfadeSeconds = 1;
        await db.put('settings', merged);
      }
    }
  } catch {
    // ignore storage errors
  }
  return merged;
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  const db = await getDb();
  await db.put('settings', settings);
}

export async function getAIMemory(): Promise<AIMemory> {
  const db = await getDb();
  const stored = await db.get('aiMemory', 'primary');
  return stored ? { ...DEFAULT_AI_MEMORY, ...stored } : DEFAULT_AI_MEMORY;
}

export async function saveAIMemory(memory: AIMemory): Promise<void> {
  const db = await getDb();
  await db.put('aiMemory', memory);
}

export async function clearAllLocalData(): Promise<void> {
  const db = await getDb();
  for (const key of artworkUrlCache.keys()) {
    revokeArtworkUrl(key);
  }
  const tx = db.transaction(['tracks', 'audioFiles', 'artworks', 'playlists', 'history', 'aiMemory'], 'readwrite');
  await Promise.all([
    tx.objectStore('tracks').clear(),
    tx.objectStore('audioFiles').clear(),
    tx.objectStore('artworks').clear(),
    tx.objectStore('playlists').clear(),
    tx.objectStore('history').clear(),
    tx.objectStore('aiMemory').clear(),
  ]);
  await tx.done;
}

export interface SonoraBackupPayload {
  version: number;
  exportedAt: number;
  playlists: Playlist[];
  history: ListeningEvent[];
  aiMemory: AIMemory;
  settings: AppSettings;
  trackMetadata: Pick<
    Track,
    'id' | 'duplicateKey' | 'title' | 'artist' | 'album' | 'genre' | 'year' | 'language' | 'moods' | 'isFavorite' | 'playCount' | 'skipCount' | 'lastPlayedAt' | 'lrcContent' | 'embeddedLyrics'
  >[];
}

export async function exportBackupJson(): Promise<string> {
  const [tracks, playlists, history, aiMemory, settings] = await Promise.all([
    getAllTracks(),
    getAllPlaylists(),
    getListeningHistory(),
    getAIMemory(),
    getSettings(),
  ]);

  const payload: SonoraBackupPayload = {
    version: 1,
    exportedAt: Date.now(),
    playlists,
    history,
    aiMemory,
    settings,
    trackMetadata: tracks.map((t) => ({
      id: t.id,
      duplicateKey: t.duplicateKey,
      title: t.title,
      artist: t.artist,
      album: t.album,
      genre: t.genre,
      year: t.year,
      language: t.language,
      moods: t.moods,
      isFavorite: t.isFavorite,
      playCount: t.playCount,
      skipCount: t.skipCount,
      lastPlayedAt: t.lastPlayedAt,
      lrcContent: t.lrcContent,
      embeddedLyrics: t.embeddedLyrics,
    })),
  };
  return JSON.stringify(payload, null, 2);
}

export async function importBackupJson(rawJson: string): Promise<{ restoredPlaylists: number; restoredTracksMeta: number }> {
  const parsed = JSON.parse(rawJson) as SonoraBackupPayload;
  if (!parsed || parsed.version !== 1) {
    throw new Error('Unsupported or invalid ISAI backup file.');
  }
  const db = await getDb();
  const existingTracks = await db.getAll('tracks');
  const byDupKey = new Map(existingTracks.map((t) => [t.duplicateKey, t]));
  const byId = new Map(existingTracks.map((t) => [t.id, t]));

  let restoredTracksMeta = 0;
  for (const meta of parsed.trackMetadata || []) {
    const match = byId.get(meta.id) || byDupKey.get(meta.duplicateKey);
    if (match) {
      await db.put('tracks', {
        ...match,
        title: meta.title,
        artist: meta.artist,
        album: meta.album,
        genre: meta.genre,
        year: meta.year,
        language: meta.language,
        moods: meta.moods,
        isFavorite: meta.isFavorite,
        playCount: Math.max(match.playCount, meta.playCount),
        skipCount: Math.max(match.skipCount, meta.skipCount),
        lastPlayedAt: meta.lastPlayedAt ?? match.lastPlayedAt,
        lrcContent: meta.lrcContent ?? match.lrcContent,
        embeddedLyrics: meta.embeddedLyrics ?? match.embeddedLyrics,
      });
      restoredTracksMeta++;
    }
  }

  for (const pl of parsed.playlists || []) {
    await db.put('playlists', pl);
  }
  for (const ev of parsed.history || []) {
    await db.put('history', ev);
  }
  if (parsed.aiMemory) {
    await db.put('aiMemory', { ...DEFAULT_AI_MEMORY, ...parsed.aiMemory, id: 'primary' });
  }
  if (parsed.settings) {
    await db.put('settings', { ...DEFAULT_SETTINGS, ...parsed.settings, id: 'primary' });
  }

  return {
    restoredPlaylists: (parsed.playlists || []).length,
    restoredTracksMeta,
  };
}
