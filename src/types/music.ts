export type AudioFormat = 'mp3' | 'wav' | 'flac' | 'aac' | 'm4a' | 'ogg' | 'opus' | 'unknown';

export type TrackSourceType = 'local' | 'firebase' | 'gdrive';

export type AudioAvailability = 'local' | 'firebase' | 'gdrive' | 'unavailable-offline';

export interface ExternalPlaylist {
  id: string;
  provider: 'spotify' | 'youtube';
  name: string;
  url: string;
  embedUrl: string;
  addedAt: number;
}

export type MoodType =
  | 'Happy'
  | 'Sad'
  | 'Romantic'
  | 'Relaxed'
  | 'Energetic'
  | 'Focus'
  | 'Nostalgic'
  | 'Motivational';

export type MusicLanguage = 'English' | 'Tamil' | 'Hindi' | 'Malayalam' | 'Telugu' | 'Instrumental' | 'Other';

export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  albumArtist?: string;
  genre: string;
  year?: number;
  trackNumber?: number;
  duration: number; // seconds
  format: AudioFormat;
  mimeType?: string;
  fileSize: number;
  fileName: string;
  duplicateKey: string; // normalized title|artist|roundedDuration
  language: MusicLanguage;
  moods: MoodType[];
  energy: number; // 0..1 estimated from genre/mood/tempo heuristics
  playCount: number;
  skipCount: number;
  lastPlayedAt?: number;
  dateAdded: number;
  isFavorite: boolean;
  hasArtwork: boolean;
  artworkUrl?: string;
  embeddedLyrics?: string;
  lrcContent?: string;
  sourceType: TrackSourceType;
  streamUrl?: string;
  firebaseDocId?: string;
  driveFileId?: string;
  catalogLicense?: string;
  catalogSource?: string;
}

export interface Playlist {
  id: string;
  name: string;
  description: string;
  trackIds: string[];
  artworkTrackId?: string;
  customCoverUrl?: string;
  createdAt: number;
  updatedAt: number;
  isAIGenerated?: boolean;
  mood?: MoodType;
}

export const ALL_SONGS_PLAYLIST_ID = '__all_songs__';

export interface ListeningEvent {
  id: string;
  trackId: string;
  playedAt: number;
  durationListened: number;
  completed: boolean;
}

export interface AIMemory {
  id: 'primary';
  preferredGenres: Record<string, number>;
  favoriteArtists: Record<string, number>;
  preferredLanguages: Record<string, number>;
  frequentlySkippedIds: string[];
  selectedMoods: Record<string, number>;
  chatHistory: AIChatMessage[];
}

export type ThemeMode = 'dark' | 'amoled' | 'light';

export type AccentPreset = 'amber' | 'emerald' | 'cobalt' | 'crimson' | 'violet';

export interface AppSettings {
  id: 'primary';
  theme: ThemeMode;
  accent: AccentPreset;
  crossfadeSeconds: number;
  gapless: boolean;
  playbackSpeed: number;
  volume: number;
  smartShuffle: boolean;
  eqPreset: string;
  eqGains: number[]; // 10 bands: 32, 64, 125, 250, 500, 1k, 2k, 4k, 8k, 16k
  ollamaEnabled: boolean;
  ollamaUrl: string;
  ollamaModel: string;
  focusMode: boolean;
  discoveryMode: boolean;
}

export interface LrcWord {
  text: string;
  start: number; // seconds
  end: number; // seconds
}

export interface LrcLine {
  time: number; // seconds
  endTime?: number; // seconds
  text: string;
  words?: LrcWord[];
  isSectionHeader?: boolean;
}

export interface ImportSummary {
  imported: Track[];
  duplicates: { fileName: string; matchedTitle: string }[];
  lrcMatched: number;
  unsupported: { fileName: string; reason: string }[];
  errors: { fileName: string; reason: string }[];
}

export interface AIChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export type NavView =
  | 'home'
  | 'playlists'
  | 'playlist-detail'
  | 'lyrics'
  | 'analytics'
  | 'settings';

export type RepeatMode = 'off' | 'all' | 'one';

export const EQ_FREQUENCIES = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const;

export const EQ_PRESETS: Record<string, number[]> = {
  Flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  'Bass Boost': [6, 5, 4, 2, 0, 0, 0, 1, 2, 2],
  'Vocal Clarity': [-2, -1, 0, 1, 3, 4, 4, 3, 1, 0],
  'Studio Warm': [3, 2, 1, 0, -1, 0, 1, 2, 2, 1],
  Electronic: [5, 4, 1, -2, -1, 1, 3, 4, 5, 4],
  Acoustic: [2, 2, 1, 0, 1, 1, 2, 3, 2, 1],
  'Late Night': [3, 2, 0, -1, 0, 1, 1, 0, -1, -2],
};

export const ACCENT_COLORS: Record<AccentPreset, { label: string; dark: string; light: string; contrastDark: string; contrastLight: string }> = {
  amber: { label: 'Warm Amber', dark: '#e5a038', light: '#d97706', contrastDark: '#0b0c0f', contrastLight: '#ffffff' },
  emerald: { label: 'Studio Emerald', dark: '#34d399', light: '#059669', contrastDark: '#06281e', contrastLight: '#ffffff' },
  cobalt: { label: 'Hi-Fi Cobalt', dark: '#60a5fa', light: '#2563eb', contrastDark: '#0b1628', contrastLight: '#ffffff' },
  crimson: { label: 'Vinyl Crimson', dark: '#f87171', light: '#dc2626', contrastDark: '#260909', contrastLight: '#ffffff' },
  violet: { label: 'Midnight Iris', dark: '#a78bfa', light: '#7c3aed', contrastDark: '#160d2b', contrastLight: '#ffffff' },
};
