import { parseBlob } from 'music-metadata';
import {
  deleteCachedDriveTrackMedia,
  getCachedDriveAudio,
  hasLocalArtwork,
  saveCachedDriveAudio,
  saveTrackArtwork,
} from '../db/sonoraDb';
import { clearDriveAccessToken } from './firebaseClient';
import { buildDuplicateKey, getAudioExtension } from './importer';
import type { AudioFormat, MoodType, MusicLanguage, Track } from '../types/music';

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';
const LOCKER_FOLDER_NAME = 'ISAI Music Locker';
const CATALOG_FILE_NAME = 'isai-catalog.json';
const MAX_DRIVE_UPLOAD_BYTES = 250 * 1024 * 1024; // 250 MB per audio file
const MAX_DRIVE_AUDIO_CACHE = 6;
const CLOUD_LOCAL_STATS_KEY = 'isai_cloud_track_stats_v1';

interface LocalCloudStatsEntry {
  playCount?: number;
  skipCount?: number;
  isFavorite?: boolean;
  lastPlayedAt?: number;
}

export class DriveAuthExpiredError extends Error {
  constructor(message = 'Your Google Drive session expired. Please click "Reconnect Google Drive" to continue.') {
    super(message);
    this.name = 'DriveAuthExpiredError';
  }
}

interface DriveCatalogEntry {
  id: string;
  driveFileId: string;
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
  hasArtwork: boolean;
  artworkDataUrl?: string;
  embeddedLyrics?: string;
  lrcContent?: string;
  dateAdded: number;
}

interface DriveCatalogFile {
  version: 1;
  updatedAt: number;
  tracks: DriveCatalogEntry[];
}

const driveAudioCache = new Map<string, Blob>();
let cachedFolderId: string | null = null;
let cachedCatalogFileId: string | null = null;

export function resetDriveRuntimeCache() {
  driveAudioCache.clear();
  cachedFolderId = null;
  cachedCatalogFileId = null;
}

function cacheDriveBlob(driveFileId: string, blob: Blob) {
  if (driveAudioCache.has(driveFileId)) {
    driveAudioCache.delete(driveFileId);
  } else if (driveAudioCache.size >= MAX_DRIVE_AUDIO_CACHE) {
    const oldestKey = driveAudioCache.keys().next().value;
    if (oldestKey) driveAudioCache.delete(oldestKey);
  }
  driveAudioCache.set(driveFileId, blob);
}

function readLocalStatsMap(): Record<string, LocalCloudStatsEntry> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(CLOUD_LOCAL_STATS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, LocalCloudStatsEntry>) : {};
  } catch {
    return {};
  }
}

async function driveFetch(url: string, accessToken: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${accessToken}`);
  const res = await fetch(url, { ...init, headers });
  if (res.status === 401) {
    clearDriveAccessToken();
    throw new DriveAuthExpiredError();
  }
  return res;
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(binary);
}

/**
 * Preserves the exact original embedded cover image untouched when <= 450 KB.
 * For very large images (> 450 KB), encodes a crisp high-resolution cover
 * (up to 1200px on the longest side, preserving exact aspect ratio at 0.95 quality)
 * for the lightweight Drive catalog, while the 100% untouched original Blob is
 * also stored in IndexedDB for lossless display.
 */
async function prepareHighResArtworkDataUrl(data: Uint8Array, mime: string): Promise<string | undefined> {
  try {
    const safeMime = mime && mime.startsWith('image/') ? mime : 'image/jpeg';
    if (data.byteLength <= 450 * 1024) {
      return `data:${safeMime};base64,${uint8ToBase64(data)}`;
    }

    const blob = new Blob([data.slice().buffer], { type: safeMime });
    const bitmapUrl = URL.createObjectURL(blob);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = reject;
        el.src = bitmapUrl;
      });
      const maxDim = 1200;
      const naturalW = img.naturalWidth || maxDim;
      const naturalH = img.naturalHeight || maxDim;
      const scale = Math.min(1, maxDim / Math.max(naturalW, naturalH));
      const targetW = Math.max(1, Math.round(naturalW * scale));
      const targetH = Math.max(1, Math.round(naturalH * scale));

      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      if (!ctx) return undefined;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, targetW, targetH);

      const highQuality = canvas.toDataURL('image/jpeg', 0.95);
      if (highQuality.length <= 650_000) return highQuality;
      return canvas.toDataURL('image/jpeg', 0.88);
    } finally {
      URL.revokeObjectURL(bitmapUrl);
    }
  } catch {
    return undefined;
  }
}

export async function ensureLosslessArtworkFromAudioBlob(trackId: string, audioBlob: Blob): Promise<void> {
  try {
    if (await hasLocalArtwork(trackId)) return;
    const meta = await parseBlob(audioBlob, { duration: false });
    const pic = meta.common.picture?.[0];
    if (!pic?.data?.length) return;
    const mime = pic.format && pic.format.startsWith('image/') ? pic.format : 'image/jpeg';
    const rawBlob = new Blob([new Uint8Array(pic.data)], { type: mime });
    await saveTrackArtwork(trackId, rawBlob, mime);
  } catch {
    // non-fatal: track continues displaying catalog cover
  }
}

function detectLanguage(title: string, artist: string, album: string, genre: string): MusicLanguage {
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

function entryToTrack(entry: DriveCatalogEntry, localStats?: LocalCloudStatsEntry): Track {
  return {
    id: entry.id,
    title: entry.title,
    artist: entry.artist,
    album: entry.album,
    genre: entry.genre,
    year: entry.year,
    duration: entry.duration,
    format: entry.format,
    mimeType: entry.mimeType,
    fileSize: entry.fileSize,
    fileName: entry.fileName,
    duplicateKey: entry.duplicateKey,
    language: entry.language,
    moods: entry.moods?.length ? entry.moods : ['Relaxed'],
    energy: typeof entry.energy === 'number' ? entry.energy : 0.5,
    playCount: localStats?.playCount || 0,
    skipCount: localStats?.skipCount || 0,
    lastPlayedAt: localStats?.lastPlayedAt,
    dateAdded: entry.dateAdded || Date.now(),
    isFavorite: localStats?.isFavorite ?? false,
    hasArtwork: !!entry.hasArtwork && !!entry.artworkDataUrl,
    artworkUrl: entry.artworkDataUrl,
    embeddedLyrics: entry.embeddedLyrics,
    lrcContent: entry.lrcContent,
    sourceType: 'gdrive',
    driveFileId: entry.driveFileId,
  };
}

async function ensureLockerFolder(accessToken: string): Promise<string> {
  if (cachedFolderId) return cachedFolderId;

  const qByProp = encodeURIComponent(
    `mimeType='application/vnd.google-apps.folder' and trashed=false and appProperties has { key='isaiLockerRoot' and value='true' }`
  );
  const res1 = await driveFetch(`${DRIVE_API_BASE}/files?q=${qByProp}&fields=files(id,name)&pageSize=5`, accessToken);
  if (!res1.ok) {
    throw new Error(`Unable to inspect Google Drive folder (${res1.status}).`);
  }
  const data1 = (await res1.json()) as { files?: Array<{ id: string; name: string }> };
  if (data1.files && data1.files.length > 0) {
    cachedFolderId = data1.files[0].id;
    return cachedFolderId;
  }

  // Fallback search by folder name
  const qByName = encodeURIComponent(
    `mimeType='application/vnd.google-apps.folder' and name='${LOCKER_FOLDER_NAME}' and trashed=false`
  );
  const res2 = await driveFetch(`${DRIVE_API_BASE}/files?q=${qByName}&fields=files(id,name)&pageSize=5`, accessToken);
  if (res2.ok) {
    const data2 = (await res2.json()) as { files?: Array<{ id: string; name: string }> };
    if (data2.files && data2.files.length > 0) {
      cachedFolderId = data2.files[0].id;
      return cachedFolderId;
    }
  }

  // Create dedicated ISAI Music Locker folder
  const createRes = await driveFetch(`${DRIVE_API_BASE}/files?fields=id`, accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: LOCKER_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
      appProperties: { isaiLockerRoot: 'true' },
    }),
  });
  if (!createRes.ok) {
    const detail = await createRes.text().catch(() => '');
    throw new Error(`Unable to create "${LOCKER_FOLDER_NAME}" folder in Google Drive (${createRes.status}). ${detail}`);
  }
  const created = (await createRes.json()) as { id: string };
  cachedFolderId = created.id;
  return cachedFolderId;
}

async function findCatalogFileId(accessToken: string, folderId: string): Promise<string | null> {
  if (cachedCatalogFileId) return cachedCatalogFileId;
  const q = encodeURIComponent(
    `'${folderId}' in parents and name='${CATALOG_FILE_NAME}' and trashed=false`
  );
  const res = await driveFetch(`${DRIVE_API_BASE}/files?q=${q}&fields=files(id,name)&pageSize=5`, accessToken);
  if (!res.ok) return null;
  const data = (await res.json()) as { files?: Array<{ id: string }> };
  const id = data.files?.[0]?.id ?? null;
  cachedCatalogFileId = id;
  return id;
}

async function readCatalog(accessToken: string, folderId: string): Promise<DriveCatalogFile> {
  const catalogId = await findCatalogFileId(accessToken, folderId);
  if (!catalogId) {
    return { version: 1, updatedAt: Date.now(), tracks: [] };
  }
  const res = await driveFetch(`${DRIVE_API_BASE}/files/${encodeURIComponent(catalogId)}?alt=media`, accessToken);
  if (!res.ok) {
    if (res.status === 404) {
      cachedCatalogFileId = null;
      return { version: 1, updatedAt: Date.now(), tracks: [] };
    }
    throw new Error(`Unable to read ISAI catalog from Google Drive (${res.status}).`);
  }
  try {
    const parsed = (await res.json()) as Partial<DriveCatalogFile>;
    return {
      version: 1,
      updatedAt: parsed.updatedAt || Date.now(),
      tracks: Array.isArray(parsed.tracks) ? parsed.tracks : [],
    };
  } catch {
    return { version: 1, updatedAt: Date.now(), tracks: [] };
  }
}

async function writeCatalog(accessToken: string, folderId: string, entries: DriveCatalogEntry[]): Promise<void> {
  const payload: DriveCatalogFile = {
    version: 1,
    updatedAt: Date.now(),
    tracks: entries,
  };
  const bodyJson = JSON.stringify(payload);
  const existingId = await findCatalogFileId(accessToken, folderId);

  if (existingId) {
    const res = await driveFetch(
      `${DRIVE_UPLOAD_BASE}/files/${encodeURIComponent(existingId)}?uploadType=media`,
      accessToken,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json; charset=UTF-8' },
        body: bodyJson,
      }
    );
    if (!res.ok) {
      throw new Error(`Failed to update ISAI catalog in Google Drive (${res.status}).`);
    }
    return;
  }

  // Create new catalog file via multipart upload
  const boundary = `isai_cat_${crypto.randomUUID().replace(/-/g, '')}`;
  const metadata = JSON.stringify({
    name: CATALOG_FILE_NAME,
    parents: [folderId],
    mimeType: 'application/json',
    appProperties: { isaiCatalog: 'true' },
  });
  const multipartBody =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${metadata}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${bodyJson}\r\n` +
    `--${boundary}--`;

  const res = await driveFetch(
    `${DRIVE_UPLOAD_BASE}/files?uploadType=multipart&fields=id`,
    accessToken,
    {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body: multipartBody,
    }
  );
  if (!res.ok) {
    throw new Error(`Failed to create ISAI catalog in Google Drive (${res.status}).`);
  }
  const created = (await res.json()) as { id: string };
  cachedCatalogFileId = created.id;
}

async function uploadRawAudioFileToDrive(
  accessToken: string,
  folderId: string,
  file: File,
  mimeType: string,
  appProps: Record<string, string>
): Promise<string> {
  // Initiate resumable upload session (supports large MP3/FLAC/WAV files cleanly without base64 bloat)
  const initRes = await driveFetch(
    `${DRIVE_UPLOAD_BASE}/files?uploadType=resumable&fields=id`,
    accessToken,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': mimeType,
        'X-Upload-Content-Length': String(file.size),
      },
      body: JSON.stringify({
        name: file.name,
        parents: [folderId],
        mimeType,
        appProperties: appProps,
      }),
    }
  );

  if (!initRes.ok) {
    const detail = await initRes.text().catch(() => '');
    throw new Error(`Could not start Google Drive upload for "${file.name}" (${initRes.status}). ${detail}`);
  }

  const uploadUrl = initRes.headers.get('Location');
  if (!uploadUrl) {
    throw new Error(`Google Drive did not return an upload URL for "${file.name}".`);
  }

  const putRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': mimeType,
    },
    body: file,
  });

  if (putRes.status === 401) {
    clearDriveAccessToken();
    throw new DriveAuthExpiredError();
  }
  if (!putRes.ok) {
    const detail = await putRes.text().catch(() => '');
    throw new Error(`Google Drive upload failed for "${file.name}" (${putRes.status}). ${detail}`);
  }

  const uploaded = (await putRes.json()) as { id: string };
  return uploaded.id;
}

export async function listGoogleDriveTracks(accessToken: string): Promise<Track[]> {
  const folderId = await ensureLockerFolder(accessToken);
  const catalog = await readCatalog(accessToken, folderId);

  // Also list audio files currently in the folder to remove deleted entries or recover unindexed files
  const q = encodeURIComponent(`'${folderId}' in parents and trashed=false and name!='${CATALOG_FILE_NAME}'`);
  const folderFiles: Array<{ id: string; name: string; size?: string; mimeType?: string; createdTime?: string }> = [];
  let pageToken: string | undefined;

  do {
    const url = `${DRIVE_API_BASE}/files?q=${q}&fields=nextPageToken,files(id,name,size,mimeType,createdTime)&pageSize=200${
      pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''
    }`;
    const res = await driveFetch(url, accessToken);
    if (!res.ok) break;
    const data = (await res.json()) as {
      nextPageToken?: string;
      files?: Array<{ id: string; name: string; size?: string; mimeType?: string; createdTime?: string }>;
    };
    if (data.files) folderFiles.push(...data.files);
    pageToken = data.nextPageToken;
  } while (pageToken);

  const liveFileIds = new Set(folderFiles.map((f) => f.id));
  const indexedIds = new Set<string>();
  const validEntries: DriveCatalogEntry[] = [];

  for (const entry of catalog.tracks) {
    if (liveFileIds.has(entry.driveFileId)) {
      validEntries.push(entry);
      indexedIds.add(entry.driveFileId);
    }
  }

  // Recover any audio files uploaded directly into ISAI Music Locker not yet in catalog
  for (const f of folderFiles) {
    if (indexedIds.has(f.id)) continue;
    const ext = getAudioExtension(f.name);
    if (ext === 'unknown') continue;
    const fallback = parseFilenameFallback(f.name);
    const { moods, energy } = inferMoods('Personal Audio', fallback.title);
    validEntries.push({
      id: `gd_${f.id}`,
      driveFileId: f.id,
      title: fallback.title,
      artist: fallback.artist,
      album: 'Google Drive Locker',
      genre: 'Personal Audio',
      duration: 0,
      format: ext,
      mimeType: f.mimeType || (ext === 'mp3' ? 'audio/mpeg' : `audio/${ext}`),
      fileSize: Number(f.size) || 0,
      fileName: f.name,
      duplicateKey: buildDuplicateKey(fallback.title, fallback.artist, 0),
      language: detectLanguage(fallback.title, fallback.artist, '', ''),
      moods,
      energy,
      hasArtwork: false,
      dateAdded: f.createdTime ? Date.parse(f.createdTime) || Date.now() : Date.now(),
    });
  }

  const localStats = readLocalStatsMap();
  const mapped = validEntries.map((entry) => entryToTrack(entry, localStats[entry.id]));
  mapped.sort((a, b) => b.dateAdded - a.dateAdded);
  return mapped;
}

export async function uploadFilesToGoogleDrive(
  accessToken: string,
  fileList: FileList | File[],
  onProgress?: (done: number, total: number, fileName: string) => void
): Promise<{ uploaded: Track[]; skipped: Array<{ fileName: string; reason: string }> }> {
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

  if (audioFiles.length === 0) {
    return { uploaded: [], skipped: [] };
  }

  const folderId = await ensureLockerFolder(accessToken);
  const catalog = await readCatalog(accessToken, folderId);
  const entries = [...catalog.tracks];
  const existingKeys = new Set(entries.map((e) => e.duplicateKey));

  const uploaded: Track[] = [];
  const skipped: Array<{ fileName: string; reason: string }> = [];
  let completedCount = 0;
  let dirtySinceSave = 0;

  // Upload up to 3 audio files concurrently for fast bulk uploads
  const CONCURRENCY = 3;
  let nextIndex = 0;
  let fatalError: unknown = null;

  const processSingleFile = async (file: File) => {
    if (file.size <= 0 || file.size > MAX_DRIVE_UPLOAD_BYTES) {
      skipped.push({
        fileName: file.name,
        reason: file.size > MAX_DRIVE_UPLOAD_BYTES ? 'Exceeds 250 MB limit' : 'Empty file',
      });
      return;
    }

    const fallback = parseFilenameFallback(file.name);
    let title = fallback.title;
    let artist = fallback.artist;
    let album = 'Google Drive Locker';
    let genre = 'Tamil';
    let year: number | undefined;
    let duration = 0;
    let embeddedLyrics: string | undefined;
    let artworkDataUrl: string | undefined;
    let originalArtwork: { blob: Blob; mimeType: string } | undefined;

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
        const picMime = pic.format && pic.format.startsWith('image/') ? pic.format : 'image/jpeg';
        originalArtwork = {
          blob: new Blob([new Uint8Array(pic.data)], { type: picMime }),
          mimeType: picMime,
        };
        artworkDataUrl = await prepareHighResArtworkDataUrl(pic.data, picMime);
      }
    } catch {
      // keep filename fallback
    }

    const safeTitle = title.slice(0, 200) || 'Untitled';
    const safeArtist = artist.slice(0, 200) || 'Unknown Artist';
    const safeAlbum = album.slice(0, 200) || 'Google Drive Locker';
    const safeGenre = genre.slice(0, 100) || 'Tamil';
    const duplicateKey = buildDuplicateKey(safeTitle, safeArtist, duration);

    if (existingKeys.has(duplicateKey)) {
      skipped.push({ fileName: file.name, reason: 'Already in Google Drive Music Locker' });
      return;
    }
    existingKeys.add(duplicateKey);

    const baseName = file.name.replace(/\.[^/.]+$/, '').toLowerCase().trim();
    const matchedLrc = lrcMap.get(baseName)?.slice(0, 50000);
    const language = detectLanguage(safeTitle, safeArtist, safeAlbum, safeGenre);
    const { moods, energy } = inferMoods(safeGenre, safeTitle);
    const format = getAudioExtension(file.name);
    const mimeType = file.type || (format === 'mp3' ? 'audio/mpeg' : `audio/${format}`);

    const driveFileId = await uploadRawAudioFileToDrive(accessToken, folderId, file, mimeType, {
      isaiTrack: 'true',
      isaiTitle: safeTitle.slice(0, 100),
    });

    const trackId = `gd_${driveFileId}`;

    // Persist 100% lossless original cover art & audio file locally so daily playback works instantly without re-login
    if (originalArtwork) {
      await saveTrackArtwork(trackId, originalArtwork.blob, originalArtwork.mimeType).catch(() => {});
    }
    await saveCachedDriveAudio(trackId, file);

    const entry: DriveCatalogEntry = {
      id: trackId,
      driveFileId,
      title: safeTitle,
      artist: safeArtist,
      album: safeAlbum,
      genre: safeGenre,
      year,
      duration: Number.isFinite(duration) ? duration : 0,
      format,
      mimeType,
      fileSize: file.size,
      fileName: file.name,
      duplicateKey,
      language,
      moods,
      energy,
      hasArtwork: !!artworkDataUrl || !!originalArtwork,
      artworkDataUrl,
      embeddedLyrics,
      lrcContent: matchedLrc,
      dateAdded: Date.now(),
    };

    entries.unshift(entry);
    dirtySinceSave++;
    cacheDriveBlob(driveFileId, file);
    uploaded.push(entryToTrack(entry));
  };

  let catalogSaveQueue: Promise<void> = Promise.resolve();
  const flushCatalogIncremental = () => {
    const snapshot = [...entries];
    catalogSaveQueue = catalogSaveQueue.then(() => writeCatalog(accessToken, folderId, snapshot));
    return catalogSaveQueue;
  };

  const worker = async () => {
    while (nextIndex < audioFiles.length && !fatalError) {
      const idx = nextIndex++;
      const file = audioFiles[idx];
      onProgress?.(completedCount, audioFiles.length, file.name);
      try {
        await processSingleFile(file);
        if (dirtySinceSave >= 5) {
          dirtySinceSave = 0;
          await flushCatalogIncremental();
        }
      } catch (err) {
        if (err instanceof DriveAuthExpiredError) {
          fatalError = err;
          return;
        }
        skipped.push({
          fileName: file.name,
          reason: err instanceof Error ? err.message : 'Upload failed',
        });
      } finally {
        completedCount++;
        onProgress?.(completedCount, audioFiles.length, file.name);
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, audioFiles.length) }, () => worker()));
  await catalogSaveQueue;

  if (uploaded.length > 0 && dirtySinceSave > 0) {
    await writeCatalog(accessToken, folderId, entries);
  }

  if (fatalError) {
    throw fatalError;
  }

  onProgress?.(audioFiles.length, audioFiles.length, '');
  return { uploaded, skipped };
}

export async function fetchGoogleDriveAudioBlob(
  accessToken: string,
  driveFileId: string,
  mimeType?: string,
  trackId?: string
): Promise<Blob> {
  const resolvedTrackId = trackId || `gd_${driveFileId}`;
  const cached = driveAudioCache.get(driveFileId);
  if (cached) {
    void ensureLosslessArtworkFromAudioBlob(resolvedTrackId, cached);
    return cached;
  }

  const localCached = await getCachedDriveAudio(resolvedTrackId);
  if (localCached) {
    cacheDriveBlob(driveFileId, localCached);
    void ensureLosslessArtworkFromAudioBlob(resolvedTrackId, localCached);
    return localCached;
  }

  const res = await driveFetch(`${DRIVE_API_BASE}/files/${encodeURIComponent(driveFileId)}?alt=media`, accessToken);
  if (!res.ok) {
    throw new Error(`Unable to stream song from Google Drive (${res.status}).`);
  }
  const rawBlob = await res.blob();
  const blob = mimeType && !rawBlob.type ? new Blob([rawBlob], { type: mimeType }) : rawBlob;
  cacheDriveBlob(driveFileId, blob);
  void saveCachedDriveAudio(resolvedTrackId, blob);
  void ensureLosslessArtworkFromAudioBlob(resolvedTrackId, blob);
  return blob;
}

export async function updateGoogleDriveTrackMetadata(
  accessToken: string,
  updated: Track
): Promise<void> {
  if (!updated.driveFileId) throw new Error('Missing Google Drive file ID.');
  const folderId = await ensureLockerFolder(accessToken);
  const catalog = await readCatalog(accessToken, folderId);

  const nextTracks = catalog.tracks.map((entry) => {
    if (entry.driveFileId !== updated.driveFileId && entry.id !== updated.id) return entry;
    return {
      ...entry,
      title: updated.title.slice(0, 200) || entry.title,
      artist: updated.artist.slice(0, 200) || 'Unknown Artist',
      album: updated.album.slice(0, 200) || 'Google Drive Locker',
      genre: updated.genre.slice(0, 100) || 'Personal Audio',
      year: updated.year,
      language: updated.language,
      moods: updated.moods.slice(0, 8),
      energy: Math.max(0, Math.min(1, updated.energy)),
      embeddedLyrics: updated.embeddedLyrics,
      lrcContent: updated.lrcContent,
    };
  });

  await writeCatalog(accessToken, folderId, nextTracks);
}

export async function deleteGoogleDriveTrack(accessToken: string, driveFileId: string): Promise<void> {
  const folderId = await ensureLockerFolder(accessToken);

  const delRes = await driveFetch(`${DRIVE_API_BASE}/files/${encodeURIComponent(driveFileId)}`, accessToken, {
    method: 'DELETE',
  });
  if (!delRes.ok && delRes.status !== 404) {
    throw new Error(`Unable to delete file from Google Drive (${delRes.status}).`);
  }

  driveAudioCache.delete(driveFileId);
  await deleteCachedDriveTrackMedia(`gd_${driveFileId}`);
  const catalog = await readCatalog(accessToken, folderId);
  const nextTracks = catalog.tracks.filter((e) => e.driveFileId !== driveFileId);
  await writeCatalog(accessToken, folderId, nextTracks);
}
