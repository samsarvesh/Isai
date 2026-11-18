import { parseBlob } from 'music-metadata';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Timestamp,
} from 'firebase/firestore';
import {
  db,
  handleFirestoreError,
  isCloudWriteQuotaExceeded,
  isQuotaExceededError,
  markCloudWriteQuotaExceeded,
  OperationType,
  QUOTA_EXCEEDED_MESSAGE,
  withFirestoreWriteGuard,
} from './firebaseClient';
import { buildDuplicateKey, getAudioExtension } from './importer';
import type { AudioFormat, MoodType, MusicLanguage, Track } from '../types/music';

const CLOUD_LOCAL_STATS_KEY = 'isai_cloud_track_stats_v1';

interface LocalCloudStatsEntry {
  playCount?: number;
  skipCount?: number;
  isFavorite?: boolean;
  lastPlayedAt?: number;
}

function readLocalCloudStatsMap(): Record<string, LocalCloudStatsEntry> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(CLOUD_LOCAL_STATS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, LocalCloudStatsEntry>) : {};
  } catch {
    return {};
  }
}

export function saveLocalCloudTrackStats(trackId: string, patch: LocalCloudStatsEntry): void {
  if (typeof window === 'undefined') return;
  try {
    const map = readLocalCloudStatsMap();
    map[trackId] = { ...(map[trackId] || {}), ...patch };
    window.localStorage.setItem(CLOUD_LOCAL_STATS_KEY, JSON.stringify(map));
  } catch {
    // ignore storage quota errors
  }
}

function removeLocalCloudTrackStats(trackId: string): void {
  if (typeof window === 'undefined') return;
  try {
    const map = readLocalCloudStatsMap();
    if (trackId in map) {
      delete map[trackId];
      window.localStorage.setItem(CLOUD_LOCAL_STATS_KEY, JSON.stringify(map));
    }
  } catch {
    // ignore
  }
}

// ~320 KB raw binary per chunk -> ~427 KB base64 string (safely below 460 KB rule cap & 1 MB Firestore doc limit)
const RAW_CHUNK_BYTES = 320 * 1024;
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const MAX_AUDIO_CACHE = 5;

const audioBlobCache = new Map<string, Blob>();

function cacheCloudBlob(trackId: string, blob: Blob) {
  if (audioBlobCache.has(trackId)) {
    audioBlobCache.delete(trackId);
  } else if (audioBlobCache.size >= MAX_AUDIO_CACHE) {
    const oldestKey = audioBlobCache.keys().next().value;
    if (oldestKey) audioBlobCache.delete(oldestKey);
  }
  audioBlobCache.set(trackId, blob);
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(binary);
}

function base64ToUint8(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function compressArtworkToDataUrl(data: Uint8Array, mime: string): Promise<string | undefined> {
  try {
    const blob = new Blob([data.slice().buffer], { type: mime || 'image/jpeg' });
    const bitmapUrl = URL.createObjectURL(blob);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = reject;
        el.src = bitmapUrl;
      });
      const size = 240;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) return undefined;
      ctx.drawImage(img, 0, 0, size, size);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.72);
      return dataUrl.length <= 145000 ? dataUrl : undefined;
    } finally {
      URL.revokeObjectURL(bitmapUrl);
    }
  } catch {
    return undefined;
  }
}

function detectCloudLanguage(title: string, artist: string, album: string, genre: string): MusicLanguage {
  const combined = `${title} ${artist} ${album} ${genre}`;
  if (/[\u0B80-\u0BFF]/.test(combined)) return 'Tamil';
  const lower = combined.toLowerCase();
  if (
    /\b(tamil|kollywood|anirudh|rahman|ilayaraja|ilaiyaraaja|yuvan|harris|sid sriram|dhanush|vijay|gv prakash|santhosh narayanan|vidyasagar|imman|spb|chennai|madras|hiphop tamizha|sai abhyankkar)\b/.test(
      lower
    )
  ) {
    return 'Tamil';
  }
  if (/[\u0900-\u097F]/.test(combined) || /\b(hindi|bollywood|arijit)\b/.test(lower)) return 'Hindi';
  if (/[\u0D00-\u0D7F]/.test(combined) || /\b(malayalam|mollywood)\b/.test(lower)) return 'Malayalam';
  if (/[\u0C00-\u0C7F]/.test(combined) || /\b(telugu|tollywood)\b/.test(lower)) return 'Telugu';
  if (/\b(instrumental|ambient|classical|piano|lofi)\b/.test(lower)) return 'Instrumental';
  // Default uploaded personal songs to Tamil when user operates in Tamil mode unless explicitly detected otherwise
  return 'Tamil';
}

function inferMoods(genre: string, title: string): { moods: MoodType[]; energy: number } {
  const text = `${genre} ${title}`.toLowerCase();
  const moods: MoodType[] = [];
  if (/(kuthu|rock|dance|gym|workout|edm|mass|fast)/.test(text)) moods.push('Energetic', 'Motivational');
  if (/(ambient|chill|lofi|acoustic|calm|peaceful|soft|melody)/.test(text)) moods.push('Relaxed', 'Focus');
  if (/(love|romantic|kadhal|duet)/.test(text)) moods.push('Romantic');
  if (/(sad|melancholy|heartbreak)/.test(text)) moods.push('Sad');
  if (/(90s|80s|classic|retro)/.test(text)) moods.push('Nostalgic');
  if (moods.length === 0) moods.push('Relaxed');
  return {
    moods: Array.from(new Set(moods)).slice(0, 8),
    energy: moods.includes('Energetic') ? 0.82 : 0.48,
  };
}

function parseFilenameFallback(fileName: string): { title: string; artist: string } {
  const base = fileName.replace(/\.[^/.]+$/, '').replace(/_/g, ' ').trim();
  const parts = base.split(/\s+-\s+/);
  if (parts.length >= 2) {
    return {
      artist: parts[0].trim() || 'Unknown Artist',
      title: parts.slice(1).join(' - ').trim() || base,
    };
  }
  return { title: base || 'Untitled Track', artist: 'Unknown Artist' };
}

function sanitizeId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
}

interface FirestoreCloudTrackDoc {
  id: string;
  ownerId: string;
  title: string;
  artist: string;
  album: string;
  genre: string;
  year?: number;
  duration: number;
  format: AudioFormat;
  mimeType: string;
  fileSize: number;
  fileName: string;
  duplicateKey: string;
  language: MusicLanguage;
  moods: MoodType[];
  energy: number;
  chunkCount: number;
  hasArtwork: boolean;
  artworkDataUrl?: string;
  embeddedLyrics?: string;
  lrcContent?: string;
  isFavorite: boolean;
  playCount: number;
  skipCount: number;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

function mapDocToTrack(docData: FirestoreCloudTrackDoc, localStats?: LocalCloudStatsEntry): Track {
  const createdMs = docData.createdAt?.toMillis?.() ?? Date.now();
  return {
    id: docData.id,
    title: docData.title,
    artist: docData.artist,
    album: docData.album,
    genre: docData.genre,
    year: docData.year,
    duration: docData.duration,
    format: docData.format,
    fileSize: docData.fileSize,
    fileName: docData.fileName,
    duplicateKey: docData.duplicateKey,
    language: docData.language,
    moods: docData.moods?.length ? docData.moods : ['Relaxed'],
    energy: typeof docData.energy === 'number' ? docData.energy : 0.5,
    playCount: Math.max(docData.playCount || 0, localStats?.playCount || 0),
    skipCount: Math.max(docData.skipCount || 0, localStats?.skipCount || 0),
    lastPlayedAt: localStats?.lastPlayedAt,
    dateAdded: createdMs,
    isFavorite: localStats?.isFavorite !== undefined ? localStats.isFavorite : !!docData.isFavorite,
    hasArtwork: !!docData.hasArtwork,
    artworkUrl: docData.artworkDataUrl,
    embeddedLyrics: docData.embeddedLyrics,
    lrcContent: docData.lrcContent,
    sourceType: 'firebase',
    firebaseDocId: docData.id,
  };
}

export function subscribeFirebaseCloudTracks(
  userId: string,
  onTracks: (tracks: Track[]) => void,
  onError?: (err: Error) => void
) {
  const path = `users/${userId}/cloudTracks`;
  const q = query(collection(db, 'users', userId, 'cloudTracks'), where('ownerId', '==', userId));

  return onSnapshot(
    q,
    (snapshot) => {
      const localMap = readLocalCloudStatsMap();
      const list = snapshot.docs.map((d) => {
        const data = d.data() as FirestoreCloudTrackDoc;
        return mapDocToTrack(data, localMap[data.id]);
      });
      list.sort((a, b) => b.dateAdded - a.dateAdded);
      onTracks(list);
    },
    (err) => {
      const code = (err as { code?: string })?.code;
      if (code === 'unavailable') {
        onError?.(new Error('Cloud Firestore is temporarily unreachable. Using local playback until connection resumes.'));
        return;
      }
      try {
        handleFirestoreError(err, OperationType.LIST, path);
      } catch (wrapped) {
        onError?.(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export async function uploadFilesToFirebaseCloud(
  userId: string,
  fileList: FileList | File[],
  onProgress?: (done: number, total: number, fileName: string) => void
): Promise<{ uploaded: Track[]; skipped: Array<{ fileName: string; reason: string }> }> {
  if (isCloudWriteQuotaExceeded()) {
    throw new Error(QUOTA_EXCEEDED_MESSAGE);
  }
  const allFiles = Array.from(fileList);
  const lrcMap = new Map<string, string>();
  const audioFiles: File[] = [];

  for (const f of allFiles) {
    const ext = f.name.toLowerCase().split('.').pop() || '';
    if (ext === 'lrc') {
      const base = f.name.replace(/\.[^/.]+$/, '').toLowerCase().trim();
      lrcMap.set(base, await f.text());
    } else if (getAudioExtension(f.name) !== 'unknown') {
      audioFiles.push(f);
    }
  }

  const uploaded: Track[] = [];
  const skipped: Array<{ fileName: string; reason: string }> = [];

  for (let i = 0; i < audioFiles.length; i++) {
    const file = audioFiles[i];
    onProgress?.(i, audioFiles.length, file.name);

    if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) {
      skipped.push({
        fileName: file.name,
        reason: file.size > MAX_UPLOAD_BYTES ? 'Exceeds 50 MB cloud track limit' : 'Empty file',
      });
      continue;
    }

    const fallback = parseFilenameFallback(file.name);
    let title = fallback.title;
    let artist = fallback.artist;
    let album = 'Tamil Cloud Library';
    let genre = 'Tamil';
    let year: number | undefined;
    let duration = 0;
    let embeddedLyrics: string | undefined;
    let artworkDataUrl: string | undefined;

    try {
      const meta = await parseBlob(file, { duration: true });
      title = meta.common.title?.trim() || title;
      artist = meta.common.artist?.trim() || artist;
      album = meta.common.album?.trim() || album;
      genre = meta.common.genre?.[0]?.trim() || genre;
      year = meta.common.year && meta.common.year >= 1900 && meta.common.year <= 2100 ? meta.common.year : undefined;
      duration = meta.format.duration || 0;

      const lyricEntry: unknown = meta.common.lyrics?.[0];
      if (typeof lyricEntry === 'string' && lyricEntry.trim()) {
        embeddedLyrics = lyricEntry.trim().slice(0, 50000);
      } else if (lyricEntry && typeof lyricEntry === 'object' && 'text' in lyricEntry && (lyricEntry as { text?: unknown }).text) {
        embeddedLyrics = String((lyricEntry as { text?: unknown }).text).trim().slice(0, 50000);
      }

      const pic = meta.common.picture?.[0];
      if (pic?.data?.length) {
        artworkDataUrl = await compressArtworkToDataUrl(pic.data, pic.format || 'image/jpeg');
      }
    } catch {
      // keep filename fallbacks
    }

    const baseName = file.name.replace(/\.[^/.]+$/, '').toLowerCase().trim();
    const matchedLrc = lrcMap.get(baseName)?.slice(0, 50000);
    const language = detectCloudLanguage(title, artist, album, genre);
    const { moods, energy } = inferMoods(genre, title);
    const format = getAudioExtension(file.name);
    const mimeType = (file.type || `audio/${format === 'mp3' ? 'mpeg' : format}`).slice(0, 100);

    const buffer = await file.arrayBuffer();
    const rawBytes = new Uint8Array(buffer);
    const chunkCount = Math.ceil(rawBytes.length / RAW_CHUNK_BYTES);
    if (chunkCount < 1 || chunkCount > 200) {
      skipped.push({ fileName: file.name, reason: 'File chunk count out of bounds' });
      continue;
    }

    const trackId = sanitizeId(`fb_${crypto.randomUUID()}`);
    const trackPath = `users/${userId}/cloudTracks/${trackId}`;
    const trackRef = doc(db, 'users', userId, 'cloudTracks', trackId);

    const safeTitle = title.slice(0, 200) || 'Untitled';
    const safeArtist = artist.slice(0, 200) || 'Unknown Artist';
    const safeAlbum = album.slice(0, 200) || 'Tamil Cloud Library';
    const safeGenre = genre.slice(0, 100) || 'Tamil';
    const safeFileName = file.name.slice(0, 260) || 'audio.mp3';
    const duplicateKey = buildDuplicateKey(safeTitle, safeArtist, duration).slice(0, 300) || trackId;

    const payload: Record<string, unknown> = {
      id: trackId,
      ownerId: userId,
      title: safeTitle,
      artist: safeArtist,
      album: safeAlbum,
      genre: safeGenre,
      duration: Math.max(0, Math.min(86400, Number.isFinite(duration) ? duration : 0)),
      format,
      mimeType,
      fileSize: Math.round(file.size),
      fileName: safeFileName,
      duplicateKey,
      language,
      moods,
      energy: Math.max(0, Math.min(1, energy)),
      chunkCount,
      hasArtwork: !!artworkDataUrl,
      isFavorite: false,
      playCount: 0,
      skipCount: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    if (year !== undefined) payload.year = Math.trunc(year);
    if (artworkDataUrl) payload.artworkDataUrl = artworkDataUrl;
    if (embeddedLyrics) payload.embeddedLyrics = embeddedLyrics;
    if (matchedLrc) payload.lrcContent = matchedLrc;

    try {
      await withFirestoreWriteGuard(setDoc(trackRef, payload));
    } catch (err) {
      if (isQuotaExceededError(err) || (err instanceof Error && err.message === QUOTA_EXCEEDED_MESSAGE)) {
        markCloudWriteQuotaExceeded();
        throw new Error(QUOTA_EXCEEDED_MESSAGE);
      }
      handleFirestoreError(err, OperationType.CREATE, trackPath);
    }

    try {
      for (let idx = 0; idx < chunkCount; idx++) {
        const start = idx * RAW_CHUNK_BYTES;
        const end = Math.min(rawBytes.length, start + RAW_CHUNK_BYTES);
        const sliceBase64 = uint8ToBase64(rawBytes.subarray(start, end));
        const chunkId = `chunk_${idx}`;
        const chunkPath = `${trackPath}/chunks/${chunkId}`;
        try {
          await withFirestoreWriteGuard(
            setDoc(doc(db, 'users', userId, 'cloudTracks', trackId, 'chunks', chunkId), {
              ownerId: userId,
              trackId,
              index: idx,
              data: sliceBase64,
              createdAt: serverTimestamp(),
            }),
            15000
          );
        } catch (err) {
          if (isQuotaExceededError(err) || (err instanceof Error && err.message === QUOTA_EXCEEDED_MESSAGE)) {
            markCloudWriteQuotaExceeded();
            throw new Error(QUOTA_EXCEEDED_MESSAGE);
          }
          handleFirestoreError(err, OperationType.CREATE, chunkPath);
        }
      }
    } catch (err) {
      // Clean up orphaned track document if chunk upload fails (best effort when quota allows)
      if (!isCloudWriteQuotaExceeded()) {
        await withFirestoreWriteGuard(deleteDoc(trackRef), 5000).catch(() => {});
      }
      throw err;
    }

    const mapped = mapDocToTrack({
      ...(payload as unknown as FirestoreCloudTrackDoc),
    });
    cacheCloudBlob(trackId, new Blob([rawBytes], { type: mimeType }));
    uploaded.push(mapped);
  }

  onProgress?.(audioFiles.length, audioFiles.length, '');
  return { uploaded, skipped };
}

export async function fetchFirebaseCloudAudioBlob(userId: string, trackId: string, mimeType?: string): Promise<Blob> {
  const cached = audioBlobCache.get(trackId);
  if (cached) return cached;

  const chunksPath = `users/${userId}/cloudTracks/${trackId}/chunks`;
  let snap;
  try {
    const q = query(
      collection(db, 'users', userId, 'cloudTracks', trackId, 'chunks'),
      where('ownerId', '==', userId)
    );
    snap = await getDocs(q);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, chunksPath);
  }

  if (snap.empty) {
    throw new Error('Cloud audio chunks not found in Firebase.');
  }

  const ordered = snap.docs
    .map((d) => d.data() as { index: number; data: string })
    .sort((a, b) => a.index - b.index);

  const byteParts = ordered.map((c) => base64ToUint8(c.data));
  const totalBytes = byteParts.reduce((acc, part) => acc + part.length, 0);
  const merged = new Uint8Array(totalBytes);
  let offset = 0;
  for (const part of byteParts) {
    merged.set(part, offset);
    offset += part.length;
  }

  const blob = new Blob([merged], { type: mimeType || 'audio/mpeg' });
  cacheCloudBlob(trackId, blob);
  return blob;
}

export async function updateFirebaseCloudTrackMetadata(
  userId: string,
  trackId: string,
  updated: Track
): Promise<void> {
  if (isCloudWriteQuotaExceeded()) {
    throw new Error(QUOTA_EXCEEDED_MESSAGE);
  }
  const path = `users/${userId}/cloudTracks/${trackId}`;
  const patch: Record<string, unknown> = {
    title: updated.title.slice(0, 200) || 'Untitled',
    artist: updated.artist.slice(0, 200) || 'Unknown Artist',
    album: updated.album.slice(0, 200) || 'Tamil Cloud Library',
    genre: updated.genre.slice(0, 100) || 'Tamil',
    language: updated.language,
    moods: updated.moods.slice(0, 8),
    energy: Math.max(0, Math.min(1, updated.energy)),
    updatedAt: serverTimestamp(),
  };

  if (updated.year && updated.year >= 1900 && updated.year <= 2100) {
    patch.year = Math.trunc(updated.year);
  }
  if (updated.embeddedLyrics !== undefined) {
    patch.embeddedLyrics = updated.embeddedLyrics.slice(0, 50000);
  }
  if (updated.lrcContent !== undefined) {
    patch.lrcContent = updated.lrcContent.slice(0, 50000);
  }

  try {
    await withFirestoreWriteGuard(updateDoc(doc(db, 'users', userId, 'cloudTracks', trackId), patch));
  } catch (err) {
    if (isQuotaExceededError(err) || (err instanceof Error && err.message === QUOTA_EXCEEDED_MESSAGE)) {
      markCloudWriteQuotaExceeded();
      throw new Error(QUOTA_EXCEEDED_MESSAGE);
    }
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function updateFirebaseCloudTrackStats(
  userId: string,
  trackId: string,
  stats: { isFavorite: boolean; playCount: number; skipCount: number },
  options?: { silentOnQuota?: boolean }
): Promise<void> {
  if (isCloudWriteQuotaExceeded()) {
    if (options?.silentOnQuota) return;
    throw new Error(QUOTA_EXCEEDED_MESSAGE);
  }
  const path = `users/${userId}/cloudTracks/${trackId}`;
  try {
    await withFirestoreWriteGuard(
      updateDoc(doc(db, 'users', userId, 'cloudTracks', trackId), {
        isFavorite: stats.isFavorite,
        playCount: Math.max(0, Math.trunc(stats.playCount)),
        skipCount: Math.max(0, Math.trunc(stats.skipCount)),
        updatedAt: serverTimestamp(),
      })
    );
  } catch (err) {
    if (isQuotaExceededError(err) || (err instanceof Error && err.message === QUOTA_EXCEEDED_MESSAGE)) {
      markCloudWriteQuotaExceeded();
      if (options?.silentOnQuota) return;
      throw new Error(QUOTA_EXCEEDED_MESSAGE);
    }
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteFirebaseCloudTrack(userId: string, trackId: string): Promise<void> {
  if (isCloudWriteQuotaExceeded()) {
    throw new Error(QUOTA_EXCEEDED_MESSAGE);
  }
  const trackPath = `users/${userId}/cloudTracks/${trackId}`;
  const chunksPath = `${trackPath}/chunks`;

  try {
    const q = query(
      collection(db, 'users', userId, 'cloudTracks', trackId, 'chunks'),
      where('ownerId', '==', userId)
    );
    const snap = await getDocs(q);
    await withFirestoreWriteGuard(
      Promise.all(
        snap.docs.map((chunkDoc) =>
          deleteDoc(doc(db, 'users', userId, 'cloudTracks', trackId, 'chunks', chunkDoc.id))
        )
      ),
      15000
    );
  } catch (err) {
    if (isQuotaExceededError(err) || (err instanceof Error && err.message === QUOTA_EXCEEDED_MESSAGE)) {
      markCloudWriteQuotaExceeded();
      throw new Error(QUOTA_EXCEEDED_MESSAGE);
    }
    handleFirestoreError(err, OperationType.DELETE, chunksPath);
  }

  try {
    await withFirestoreWriteGuard(deleteDoc(doc(db, 'users', userId, 'cloudTracks', trackId)));
    audioBlobCache.delete(trackId);
    removeLocalCloudTrackStats(trackId);
  } catch (err) {
    if (isQuotaExceededError(err) || (err instanceof Error && err.message === QUOTA_EXCEEDED_MESSAGE)) {
      markCloudWriteQuotaExceeded();
      throw new Error(QUOTA_EXCEEDED_MESSAGE);
    }
    handleFirestoreError(err, OperationType.DELETE, trackPath);
  }
}
