import { parseBlob } from 'music-metadata';
import { getAllTracks, saveTrackWithMedia } from '../db/sonoraDb';
import type { AudioFormat, ImportSummary, MoodType, MusicLanguage, Track } from '../types/music';

const SUPPORTED_EXTENSIONS = new Set<AudioFormat>(['mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg', 'opus']);

export function getAudioExtension(fileName: string): AudioFormat {
  const parts = fileName.toLowerCase().split('.');
  const ext = parts.length > 1 ? parts[parts.length - 1] : '';
  if (SUPPORTED_EXTENSIONS.has(ext as AudioFormat)) {
    return ext as AudioFormat;
  }
  return 'unknown';
}

export function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\u0900-\u0d7f]+/g, ' ').trim();
}

export function buildDuplicateKey(title: string, artist: string, duration: number): string {
  return `${normalizeText(title)}|${normalizeText(artist)}|${Math.round(duration)}`;
}

function detectLanguageFromMetadata(title: string, artist: string, album: string, genre: string): MusicLanguage {
  const combined = `${title} ${artist} ${album} ${genre}`;
  if (/[\u0B80-\u0BFF]/.test(combined)) return 'Tamil';
  if (/[\u0900-\u097F]/.test(combined)) return 'Hindi';
  if (/[\u0D00-\u0D7F]/.test(combined)) return 'Malayalam';
  if (/[\u0C00-\u0C7F]/.test(combined)) return 'Telugu';

  const lower = combined.toLowerCase();
  if (
    /\b(tamil|kollywood|anirudh|rahman|ilayaraja|ilaiyaraaja|yuvan|harris|sid sriram|dhanush|vijay|gv prakash|santhosh narayanan|vidyasagar|imman|spb|madras|chennai|sai abhyankkar|hiphop tamizha|pradeep kumar)\b/.test(
      lower
    )
  ) {
    return 'Tamil';
  }
  if (/\b(hindi|bollywood|arijit|pritam|shreya|jubin|sonu nigam|lata|kishore)\b/.test(lower)) {
    return 'Hindi';
  }
  if (/\b(malayalam|mollywood|vineeth|ks chithra|yesudas|sushin|thaikkudam)\b/.test(lower)) {
    return 'Malayalam';
  }
  if (/\b(telugu|tollywood|devi sri|thaman|keeravani|dsp)\b/.test(lower)) {
    return 'Telugu';
  }
  if (/\b(instrumental|ambient|classical|piano|orchestral|lofi|lo-fi|beats)\b/.test(lower)) {
    return 'Instrumental';
  }
  return 'Tamil';
}

function inferMoodsAndEnergy(genre: string, title: string, album: string): { moods: MoodType[]; energy: number } {
  const text = `${genre} ${title} ${album}`.toLowerCase();
  const moods = new Set<MoodType>();
  let energy = 0.52;

  if (/\b(rock|metal|edm|dance|gym|workout|trap|hip[- ]?hop|rap|electronic|dubstep|drum|kuthu|fast|pump)\b/.test(text)) {
    moods.add('Energetic');
    moods.add('Motivational');
    energy = 0.85;
  }
  if (/\b(ambient|chill|lofi|lo-fi|acoustic|sleep|calm|peaceful|soft|piano|meditation|bossa)\b/.test(text)) {
    moods.add('Relaxed');
    moods.add('Focus');
    energy = 0.28;
  }
  if (/\b(love|romance|romantic|melody|ballad|duet|soul|r&b|rnb)\b/.test(text)) {
    moods.add('Romantic');
    energy = Math.min(energy, 0.48);
  }
  if (/\b(sad|blues|melancholy|heartbreak|pain|lonely|broken)\b/.test(text)) {
    moods.add('Sad');
    energy = 0.3;
  }
  if (/\b(classical|jazz|study|instrumental|minimal|score|soundtrack)\b/.test(text)) {
    moods.add('Focus');
    energy = Math.min(energy, 0.42);
  }
  if (/\b(90s|80s|retro|classic|vintage|oldies|nostalgic|memory)\b/.test(text)) {
    moods.add('Nostalgic');
  }
  if (/\b(pop|funk|disco|happy|sunny|summer|celebration|party|upbeat)\b/.test(text)) {
    moods.add('Happy');
    energy = Math.max(energy, 0.72);
  }

  if (moods.size === 0) {
    moods.add('Relaxed');
  }

  return { moods: Array.from(moods), energy };
}

function stripExtension(fileName: string): string {
  return fileName.replace(/\.[^/.]+$/, '');
}

function parseFilenameFallback(fileName: string): { title: string; artist: string } {
  const base = stripExtension(fileName).replace(/_/g, ' ').trim();
  const dashSplit = base.split(/\s+-\s+/);
  if (dashSplit.length >= 2) {
    return {
      artist: dashSplit[0].trim() || 'Unknown Artist',
      title: dashSplit.slice(1).join(' - ').trim() || base,
    };
  }
  return { title: base || 'Untitled Track', artist: 'Unknown Artist' };
}

function getAudioElementDuration(blob: Blob): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio();
    audio.preload = 'metadata';
    const cleanup = () => URL.revokeObjectURL(url);
    audio.onloadedmetadata = () => {
      const dur = Number.isFinite(audio.duration) ? audio.duration : 0;
      cleanup();
      resolve(dur);
    };
    audio.onerror = () => {
      cleanup();
      resolve(0);
    };
    audio.src = url;
  });
}

export async function importAudioFiles(
  files: File[],
  onProgress?: (processed: number, total: number, currentFileName: string) => void
): Promise<ImportSummary> {
  const summary: ImportSummary = {
    imported: [],
    duplicates: [],
    lrcMatched: 0,
    unsupported: [],
    errors: [],
  };

  // Separate sidecar .lrc files so they automatically attach to matching audio tracks
  const lrcMap = new Map<string, string>();
  const audioCandidates: File[] = [];

  for (const file of files) {
    const lower = file.name.toLowerCase();
    if (lower.endsWith('.lrc')) {
      try {
        const text = await file.text();
        lrcMap.set(stripExtension(lower), text);
      } catch {
        // Ignore unreadable sidecar
      }
      continue;
    }

    const ext = getAudioExtension(file.name);
    if (ext === 'unknown') {
      if (!lower.startsWith('.')) {
        summary.unsupported.push({
          fileName: file.name,
          reason: 'Unsupported format (supported: MP3, WAV, FLAC, AAC, M4A, OGG, OPUS)',
        });
      }
      continue;
    }
    audioCandidates.push(file);
  }

  const existingTracks = await getAllTracks();
  const existingKeys = new Map(existingTracks.map((t) => [t.duplicateKey, t]));

  for (let i = 0; i < audioCandidates.length; i++) {
    const file = audioCandidates[i];
    onProgress?.(i + 1, audioCandidates.length, file.name);

    try {
      const ext = getAudioExtension(file.name);
      const fallback = parseFilenameFallback(file.name);

      let title = fallback.title;
      let artist = fallback.artist;
      let album = 'Single / Local Files';
      let albumArtist: string | undefined;
      let genre = 'Personal Audio';
      let year: number | undefined;
      let trackNumber: number | undefined;
      let duration = 0;
      let embeddedLyrics: string | undefined;
      let artwork: { blob: Blob; mimeType: string } | undefined;

      try {
        const metadata = await parseBlob(file, { duration: true });
        const { common, format } = metadata;

        if (common.title?.trim()) title = common.title.trim();
        if (common.artist?.trim()) artist = common.artist.trim();
        if (common.album?.trim()) album = common.album.trim();
        if (common.albumartist?.trim()) albumArtist = common.albumartist.trim();
        if (common.genre && common.genre.length > 0 && common.genre[0].trim()) {
          genre = common.genre[0].trim();
        }
        if (common.year) year = common.year;
        if (common.track?.no) trackNumber = common.track.no;
        if (format.duration && Number.isFinite(format.duration)) {
          duration = format.duration;
        }
        if (common.lyrics && common.lyrics.length > 0) {
          const firstLyric = common.lyrics[0];
          if (typeof firstLyric === 'string') {
            embeddedLyrics = firstLyric;
          } else if (firstLyric && typeof firstLyric === 'object' && 'text' in firstLyric && typeof firstLyric.text === 'string') {
            embeddedLyrics = firstLyric.text;
          } else if (firstLyric && typeof firstLyric === 'object' && 'syncText' in firstLyric && Array.isArray(firstLyric.syncText)) {
            embeddedLyrics = firstLyric.syncText
              .map((line: { timestamp?: number; text: string }) => {
                const sec = (line.timestamp || 0) / 1000;
                const m = String(Math.floor(sec / 60)).padStart(2, '0');
                const s = (sec % 60).toFixed(2).padStart(5, '0');
                return `[${m}:${s}] ${line.text}`;
              })
              .join('\n');
          }
        }
        if (common.picture && common.picture.length > 0) {
          const pic = common.picture[0];
          const bytes = new Uint8Array(pic.data);
          artwork = {
            blob: new Blob([bytes], { type: pic.format || 'image/jpeg' }),
            mimeType: pic.format || 'image/jpeg',
          };
        }
      } catch {
        // Fallback metadata extraction already populated from filename
      }

      if (!duration || duration <= 0) {
        duration = await getAudioElementDuration(file);
      }

      const duplicateKey = buildDuplicateKey(title, artist, duration);
      const existing = existingKeys.get(duplicateKey);
      if (existing) {
        summary.duplicates.push({ fileName: file.name, matchedTitle: `${existing.title} — ${existing.artist}` });
        continue;
      }

      const baseLower = stripExtension(file.name.toLowerCase());
      const matchedLrc = lrcMap.get(baseLower);
      if (matchedLrc) {
        summary.lrcMatched++;
      }

      const language = detectLanguageFromMetadata(title, artist, album, genre);
      const { moods, energy } = inferMoodsAndEnergy(genre, title, album);

      const newTrack: Track = {
        id: crypto.randomUUID(),
        title,
        artist,
        album,
        albumArtist,
        genre,
        year,
        trackNumber,
        duration,
        format: ext,
        fileSize: file.size,
        fileName: file.name,
        duplicateKey,
        language,
        moods,
        energy,
        playCount: 0,
        skipCount: 0,
        dateAdded: Date.now(),
        isFavorite: false,
        hasArtwork: !!artwork,
        embeddedLyrics,
        lrcContent: matchedLrc,
        sourceType: 'local',
      };

      await saveTrackWithMedia(newTrack, file, artwork);
      existingKeys.set(duplicateKey, newTrack);
      summary.imported.push(newTrack);
    } catch (err) {
      summary.errors.push({
        fileName: file.name,
        reason: err instanceof Error ? err.message : 'Failed to read audio file',
      });
    }
  }

  return summary;
}

export async function collectFilesFromDirectoryHandle(dirHandle: FileSystemDirectoryHandle): Promise<File[]> {
  const collected: File[] = [];
  for await (const entry of dirHandle.values()) {
    if (entry.kind === 'file') {
      const file = await (entry as FileSystemFileHandle).getFile();
      collected.push(file);
    } else if (entry.kind === 'directory') {
      const nested = await collectFilesFromDirectoryHandle(entry as FileSystemDirectoryHandle);
      collected.push(...nested);
    }
  }
  return collected;
}
