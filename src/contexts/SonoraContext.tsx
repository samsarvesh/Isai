import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  addListeningEvent,
  clearAllLocalData,
  DEFAULT_AI_MEMORY,
  DEFAULT_SETTINGS,
  deletePlaylist,
  getAIMemory,
  getAllPlaylists,
  getAllTracks,
  getArtworkUrl,
  getListeningHistory,
  getSettings,
  removeTrackFromLibrary,
  saveAIMemory,
  savePlaylist,
  saveSettings,
  updateTrack,
} from '../db/sonoraDb';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { audioEngine } from '../services/audioEngine';
import {
  signInWithFirebaseGoogle,
  signOutFirebase,
  subscribeToFirebaseAuth,
} from '../services/firebaseClient';
import {
  deleteFirebaseCloudTrack,
  subscribeFirebaseCloudTracks,
  updateFirebaseCloudTrackMetadata,
  updateFirebaseCloudTrackStats,
  uploadFilesToFirebaseCloud,
} from '../services/firebaseMusicService';
import { collectFilesFromDirectoryHandle, importAudioFiles } from '../services/importer';
import { findSimilarTracks, fisherYatesShuffle, smartShuffleTracks } from '../utils/trackUtils';
import {
  ACCENT_COLORS,
  type AIMemory,
  type AppSettings,
  type ImportSummary,
  type ListeningEvent,
  type MoodType,
  type NavView,
  type Playlist,
  type RepeatMode,
  type Track,
} from '../types/music';
import {
  WALLPAPER_PRESETS,
  WALLPAPER_STORAGE_KEY,
  type WallpaperPresetId,
} from '../utils/wallpapers';

interface ToastMessage {
  id: string;
  text: string;
  tone: 'info' | 'success' | 'error';
}

interface SonoraContextValue {
  // Data
  tracks: Track[];
  localTracks: Track[];
  firebaseTracks: Track[];
  trackMap: Map<string, Track>;
  playlists: Playlist[];
  history: ListeningEvent[];
  aiMemory: AIMemory;
  settings: AppSettings;
  isLoadingData: boolean;
  isOnline: boolean;

  // Firebase Cloud Music Locker
  firebaseUser: User | null;
  isFirebaseConnected: boolean;
  isFirebaseSigningIn: boolean;
  isSyncingCloud: boolean;
  cloudUploadProgress: { done: number; total: number; fileName: string } | null;
  pendingCloudDeleteTrack: Track | null;
  connectFirebaseCloud: () => Promise<void>;
  disconnectFirebaseCloud: () => Promise<void>;
  uploadFilesToCloud: (files: FileList | File[]) => Promise<void>;
  requestDeleteCloudTrack: (track: Track) => void;
  confirmDeleteCloudTrack: () => Promise<void>;
  cancelDeleteCloudTrack: () => void;

  // Navigation & Modals
  activeView: NavView;
  setActiveView: (view: NavView) => void;
  selectedPlaylistId: string | null;
  openPlaylistDetail: (id: string) => void;
  isFullPlayerOpen: boolean;
  setIsFullPlayerOpen: (open: boolean) => void;
  isQueueOpen: boolean;
  setIsQueueOpen: (open: boolean) => void;
  isEqualizerOpen: boolean;
  setIsEqualizerOpen: (open: boolean) => void;
  editingTrack: Track | null;
  setEditingTrack: (track: Track | null) => void;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  wallpaperId: WallpaperPresetId;
  setWallpaperId: (id: WallpaperPresetId) => void;

  // Import state
  importProgress: { processed: number; total: number; fileName: string } | null;
  lastImportSummary: ImportSummary | null;
  clearImportSummary: () => void;
  handleImportFiles: (files: FileList | File[]) => Promise<void>;
  handleImportDirectoryPicker: () => Promise<void>;

  // Player state
  currentTrack: Track | null;
  queue: Track[];
  queueIndex: number;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  shuffle: boolean;
  repeat: RepeatMode;
  sleepRemainingSeconds: number | null;
  sleepEndOfTrack: boolean;

  // Player actions
  playTrack: (track: Track, newQueue?: Track[]) => Promise<void>;
  playTracksList: (list: Track[], startIndex?: number, forceShuffle?: boolean) => Promise<void>;
  togglePlayPause: () => Promise<void>;
  playNext: (manualSkip?: boolean) => Promise<void>;
  playPrevious: () => Promise<void>;
  seekTo: (seconds: number) => void;
  addToQueue: (track: Track) => void;
  playTrackNext: (track: Track) => void;
  removeFromQueue: (index: number) => void;
  reorderQueue: (fromIndex: number, toIndex: number) => void;
  clearQueue: () => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  setVolume: (vol: number) => void;
  setSpeed: (speed: number) => void;
  setSleepTimer: (minutes: number | null, endOfTrack?: boolean) => void;
  startSmartRadio: (seedTrack: Track) => Promise<void>;
  startMoodMix: (mood: MoodType) => Promise<void>;
  startFocusMode: () => Promise<void>;
  startPartyMode: () => Promise<void>;
  startDiscoveryMode: () => Promise<void>;

  // Library & Playlist mutations
  toggleFavorite: (trackId: string) => Promise<void>;
  saveTrackEdits: (updated: Track) => Promise<void>;
  deleteTrackFromLibrary: (trackId: string) => Promise<void>;
  createPlaylist: (data: { name: string; description?: string; trackIds: string[]; isAIGenerated?: boolean; mood?: MoodType }) => Promise<Playlist>;
  updatePlaylistData: (playlist: Playlist) => Promise<void>;
  removePlaylist: (playlistId: string) => Promise<void>;
  duplicatePlaylist: (playlistId: string) => Promise<void>;
  addTrackToPlaylist: (playlistId: string, trackId: string) => Promise<void>;

  // Settings & AI Memory
  updateSettings: (partial: Partial<AppSettings>) => Promise<void>;
  updateAIMemory: (updater: (prev: AIMemory) => AIMemory) => Promise<void>;
  refreshAllData: () => Promise<void>;
  resetLibraryData: () => Promise<void>;

  // Notifications
  toasts: ToastMessage[];
  notify: (text: string, tone?: 'info' | 'success' | 'error') => void;
}

const SonoraContext = createContext<SonoraContextValue | null>(null);

export const SonoraProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const isOnline = useOnlineStatus();
  const [localTracks, setLocalTracks] = useState<Track[]>([]);
  const [firebaseTracks, setFirebaseTracks] = useState<Track[]>([]);

  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [isFirebaseConnected, setIsFirebaseConnected] = useState(false);
  const [isFirebaseSigningIn, setIsFirebaseSigningIn] = useState(false);
  const [isSyncingCloud, setIsSyncingCloud] = useState(false);
  const [cloudUploadProgress, setCloudUploadProgress] = useState<{ done: number; total: number; fileName: string } | null>(null);
  const [pendingCloudDeleteTrack, setPendingCloudDeleteTrack] = useState<Track | null>(null);

  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [history, setHistory] = useState<ListeningEvent[]>([]);
  const [aiMemory, setAiMemory] = useState<AIMemory>(DEFAULT_AI_MEMORY);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [isLoadingData, setIsLoadingData] = useState(true);

  const [activeView, setActiveView] = useState<NavView>('home');
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [isFullPlayerOpen, setIsFullPlayerOpen] = useState(false);
  const [isQueueOpen, setIsQueueOpen] = useState(false);
  const [isEqualizerOpen, setIsEqualizerOpen] = useState(false);
  const [editingTrack, setEditingTrack] = useState<Track | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [wallpaperId, setWallpaperIdState] = useState<WallpaperPresetId>(() => {
    try {
      const saved = localStorage.getItem(WALLPAPER_STORAGE_KEY) as WallpaperPresetId | null;
      if (saved && WALLPAPER_PRESETS.some((p) => p.id === saved)) return saved;
    } catch {
      // ignore storage errors
    }
    return 'aurora';
  });
  const setWallpaperId = useCallback((id: WallpaperPresetId) => {
    setWallpaperIdState(id);
    try {
      localStorage.setItem(WALLPAPER_STORAGE_KEY, id);
    } catch {
      // ignore
    }
  }, []);

  const [importProgress, setImportProgress] = useState<{ processed: number; total: number; fileName: string } | null>(null);
  const [lastImportSummary, setLastImportSummary] = useState<ImportSummary | null>(null);

  const [queue, setQueue] = useState<Track[]>([]);
  const [queueIndex, setQueueIndex] = useState<number>(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<RepeatMode>('off');
  const [sleepRemainingSeconds, setSleepRemainingSeconds] = useState<number | null>(null);
  const [sleepEndOfTrack, setSleepEndOfTrack] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const trackPlayRecordedRef = useRef<string | null>(null);

  const notify = useCallback((text: string, tone: 'info' | 'success' | 'error' = 'info') => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev.slice(-3), { id, text, tone }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3600);
  }, []);

  const tracks = useMemo(() => [...firebaseTracks, ...localTracks], [firebaseTracks, localTracks]);
  const trackMap = useMemo(() => {
    const map = new Map<string, Track>();
    for (const t of localTracks) map.set(t.id, t);
    for (const t of firebaseTracks) map.set(t.id, t);
    return map;
  }, [firebaseTracks, localTracks]);
  const currentTrack = queueIndex >= 0 && queueIndex < queue.length ? queue[queueIndex] : null;

  const refreshAllData = useCallback(async () => {
    const [loadedTracks, loadedPlaylists, loadedHistory, loadedMemory, loadedSettings] = await Promise.all([
      getAllTracks(),
      getAllPlaylists(),
      getListeningHistory(),
      getAIMemory(),
      getSettings(),
    ]);
    setLocalTracks(loadedTracks.sort((a, b) => b.dateAdded - a.dateAdded));
    setPlaylists(loadedPlaylists.sort((a, b) => b.updatedAt - a.updatedAt));
    setHistory(loadedHistory);
    setAiMemory(loadedMemory);
    setSettings(loadedSettings);
    audioEngine.setVolume(loadedSettings.volume);
    audioEngine.setSpeed(loadedSettings.playbackSpeed);
    audioEngine.setEqGains(loadedSettings.eqGains);
    setIsLoadingData(false);
  }, []);

  const connectFirebaseCloud = useCallback(async () => {
    setIsFirebaseSigningIn(true);
    try {
      const user = await signInWithFirebaseGoogle();
      setFirebaseUser(user);
      setIsFirebaseConnected(true);
      notify(`Connected Firebase Cloud (${user.email || 'Account ready'}).`, 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Google sign-in was cancelled or failed.', 'error');
    } finally {
      setIsFirebaseSigningIn(false);
    }
  }, [notify]);

  const disconnectFirebaseCloud = useCallback(async () => {
    await signOutFirebase();
    setFirebaseUser(null);
    setIsFirebaseConnected(false);
    setFirebaseTracks([]);
    notify('Signed out of Firebase Cloud.', 'info');
  }, [notify]);

  const uploadFilesToCloud = useCallback(
    async (fileList: FileList | File[]) => {
      const files = Array.from(fileList);
      if (files.length === 0) return;
      if (!firebaseUser) {
        notify('Please sign in with Google first to upload songs to your Firebase Cloud library.', 'info');
        return;
      }

      setCloudUploadProgress({ done: 0, total: files.length, fileName: files[0].name });
      try {
        const res = await uploadFilesToFirebaseCloud(firebaseUser.uid, files, (done, total, fileName) => {
          setCloudUploadProgress({ done, total, fileName });
        });
        setCloudUploadProgress(null);

        if (res.uploaded.length > 0) {
          notify(
            `Uploaded ${res.uploaded.length} song${res.uploaded.length === 1 ? '' : 's'} to Firebase Cloud. You can now delete the local copies from your laptop to free space.`,
            'success'
          );
        } else if (res.skipped.length > 0) {
          notify(res.skipped[0].reason || 'No supported audio files uploaded.', 'error');
        } else {
          notify('No supported audio files found in selection.', 'error');
        }
      } catch (err) {
        setCloudUploadProgress(null);
        notify(err instanceof Error ? err.message : 'Firebase Cloud upload failed.', 'error');
      }
    },
    [firebaseUser, notify]
  );

  const requestDeleteCloudTrack = useCallback((track: Track) => {
    setPendingCloudDeleteTrack(track);
  }, []);

  const confirmDeleteCloudTrack = useCallback(async () => {
    const target = pendingCloudDeleteTrack;
    if (!target || !target.firebaseDocId || !firebaseUser) {
      setPendingCloudDeleteTrack(null);
      return;
    }
    try {
      await deleteFirebaseCloudTrack(firebaseUser.uid, target.firebaseDocId);
      setFirebaseTracks((prev) => prev.filter((t) => t.id !== target.id));
      setQueue((prev) => prev.filter((t) => t.id !== target.id));
      notify(`Deleted "${target.title}" from Firebase Cloud.`, 'info');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not delete song from Firebase Cloud.', 'error');
    } finally {
      setPendingCloudDeleteTrack(null);
    }
  }, [firebaseUser, notify, pendingCloudDeleteTrack]);

  useEffect(() => {
    void refreshAllData();
    const unsub = subscribeToFirebaseAuth((user) => {
      if (user) {
        setFirebaseUser(user);
        setIsFirebaseConnected(true);
      } else {
        setFirebaseUser(null);
        setIsFirebaseConnected(false);
        setFirebaseTracks([]);
      }
    });
    return () => unsub();
  }, [refreshAllData]);

  useEffect(() => {
    if (!firebaseUser || !firebaseUser.emailVerified) {
      setIsSyncingCloud(false);
      return;
    }
    setIsSyncingCloud(true);
    const unsub = subscribeFirebaseCloudTracks(
      firebaseUser.uid,
      (remoteTracks) => {
        setFirebaseTracks(remoteTracks);
        setIsSyncingCloud(false);
      },
      (err) => {
        setIsSyncingCloud(false);
        notify(err.message || 'Unable to sync Firebase Cloud songs.', 'error');
      }
    );
    return () => unsub();
  }, [firebaseUser, notify]);

  // Apply dark theme & accent CSS tokens cleanly to <html>
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('amoled');
    root.classList.add('dark');

    const preset = ACCENT_COLORS[settings.accent] || ACCENT_COLORS.amber;
    const accentHex = preset.dark;
    const contrastHex = preset.contrastDark;
    root.style.setProperty('--accent', accentHex);
    root.style.setProperty('--accent-contrast', contrastHex);
    root.style.setProperty('--accent-soft', `${accentHex}24`);
  }, [settings.accent]);

  const updateSettings = useCallback(async (partial: Partial<AppSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...partial };
      void saveSettings(next);
      return next;
    });
  }, []);

  const updateAIMemory = useCallback(async (updater: (prev: AIMemory) => AIMemory) => {
    setAiMemory((prev) => {
      const next = updater(prev);
      void saveAIMemory(next);
      return next;
    });
  }, []);

  const recordPlayCompletion = useCallback(
    async (track: Track, listenedSeconds: number, completed: boolean) => {
      const updatedTrack: Track = {
        ...track,
        playCount: track.playCount + 1,
        lastPlayedAt: Date.now(),
      };
      if (track.sourceType === 'local') {
        await updateTrack(updatedTrack);
        setLocalTracks((prev) => prev.map((t) => (t.id === track.id ? updatedTrack : t)));
      } else if (track.sourceType === 'firebase') {
        setFirebaseTracks((prev) => prev.map((t) => (t.id === track.id ? updatedTrack : t)));
        if (firebaseUser && track.firebaseDocId) {
          void updateFirebaseCloudTrackStats(firebaseUser.uid, track.firebaseDocId, {
            isFavorite: updatedTrack.isFavorite,
            playCount: updatedTrack.playCount,
            skipCount: updatedTrack.skipCount,
          }).catch(() => {});
        }
      }

      const ev: ListeningEvent = {
        id: crypto.randomUUID(),
        trackId: track.id,
        playedAt: Date.now(),
        durationListened: Math.round(listenedSeconds),
        completed,
      };
      await addListeningEvent(ev);
      setHistory((prev) => [...prev, ev]);

      await updateAIMemory((prev) => ({
        ...prev,
        favoriteArtists: {
          ...prev.favoriteArtists,
          [track.artist]: (prev.favoriteArtists[track.artist] || 0) + 1,
        },
        preferredGenres: {
          ...prev.preferredGenres,
          [track.genre]: (prev.preferredGenres[track.genre] || 0) + 1,
        },
        preferredLanguages: {
          ...prev.preferredLanguages,
          [track.language]: (prev.preferredLanguages[track.language] || 0) + 1,
        },
      }));
    },
    [firebaseUser, updateAIMemory]
  );

  const playTrackAtIndex = useCallback(
    async (targetQueue: Track[], index: number) => {
      const target = targetQueue[index];
      if (!target) return;
      if (target.sourceType === 'firebase' && !isOnline) {
        notify('This Firebase Cloud stream requires an internet connection.', 'error');
        return;
      }

      setQueue(targetQueue);
      setQueueIndex(index);
      setCurrentTime(0);
      setDuration(target.duration || 0);
      trackPlayRecordedRef.current = null;

      try {
        await audioEngine.playTrack(target, settings.crossfadeSeconds);
        // Update Media Session API for OS / Bluetooth / Android lock-screen controls
        if ('mediaSession' in navigator) {
          let artUrl: string | null = target.artworkUrl || null;
          if (!artUrl && target.hasArtwork) {
            artUrl = await getArtworkUrl(target.id);
          }
          navigator.mediaSession.metadata = new MediaMetadata({
            title: target.title,
            artist: target.artist,
            album: target.album,
            artwork: artUrl ? [{ src: artUrl, sizes: '512x512', type: 'image/jpeg' }] : [],
          });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Playback failed for this track.';
        notify(msg, 'error');
      }
    },
    [isOnline, notify, settings.crossfadeSeconds]
  );

  const playTrack = useCallback(
    async (track: Track, newQueue?: Track[]) => {
      const targetQueue = newQueue && newQueue.length > 0 ? newQueue : [track];
      if (shuffle && targetQueue.length > 1) {
        const rest = settings.smartShuffle
          ? smartShuffleTracks(targetQueue, track.id)
          : fisherYatesShuffle(targetQueue.filter((t) => t.id !== track.id));
        await playTrackAtIndex([track, ...rest], 0);
        return;
      }
      const idx = targetQueue.findIndex((t) => t.id === track.id);
      await playTrackAtIndex(targetQueue, idx >= 0 ? idx : 0);
    },
    [playTrackAtIndex, settings.smartShuffle, shuffle]
  );

  const playTracksList = useCallback(
    async (list: Track[], startIndex?: number, forceShuffle = false) => {
      if (list.length === 0) return;
      if (forceShuffle || shuffle) {
        let ordered: Track[];
        if (startIndex !== undefined && list[startIndex]) {
          const seed = list[startIndex];
          const rest = settings.smartShuffle
            ? smartShuffleTracks(list, seed.id)
            : fisherYatesShuffle(list.filter((t) => t.id !== seed.id));
          ordered = [seed, ...rest];
        } else {
          ordered = settings.smartShuffle ? smartShuffleTracks(list) : fisherYatesShuffle(list);
          // Avoid restarting on the exact same song if user triggers Play Music / Shuffle again
          if (ordered.length > 1 && currentTrack && ordered[0].id === currentTrack.id) {
            const swapIdx = 1 + Math.floor(Math.random() * (ordered.length - 1));
            [ordered[0], ordered[swapIdx]] = [ordered[swapIdx], ordered[0]];
          }
        }
        setShuffle(true);
        await playTrackAtIndex(ordered, 0);
      } else {
        await playTrackAtIndex(list, startIndex ?? 0);
      }
    },
    [currentTrack, playTrackAtIndex, settings.smartShuffle, shuffle]
  );

  const togglePlayPause = useCallback(async () => {
    if (!currentTrack) {
      if (tracks.length > 0) {
        await playTracksList(tracks, shuffle ? undefined : 0, shuffle);
      }
      return;
    }
    if (isPlaying) {
      audioEngine.pause();
    } else {
      await audioEngine.resume();
    }
  }, [currentTrack, isPlaying, playTracksList, shuffle, tracks]);

  const playNext = useCallback(
    async (manualSkip = true) => {
      if (queue.length === 0) return;

      if (manualSkip && currentTrack && currentTime < 20 && (currentTrack.sourceType === 'local' || currentTrack.sourceType === 'firebase')) {
        const updated = { ...currentTrack, skipCount: currentTrack.skipCount + 1 };
        if (currentTrack.sourceType === 'local') {
          void updateTrack(updated);
          setLocalTracks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
        } else if (firebaseUser && currentTrack.firebaseDocId) {
          setFirebaseTracks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
          void updateFirebaseCloudTrackStats(firebaseUser.uid, currentTrack.firebaseDocId, {
            isFavorite: updated.isFavorite,
            playCount: updated.playCount,
            skipCount: updated.skipCount,
          }).catch(() => {});
        }
        if (updated.skipCount >= 3) {
          void updateAIMemory((prev) => ({
            ...prev,
            frequentlySkippedIds: prev.frequentlySkippedIds.includes(updated.id)
              ? prev.frequentlySkippedIds
              : [...prev.frequentlySkippedIds, updated.id],
          }));
        }
      }

      if (repeat === 'one' && !manualSkip) {
        audioEngine.seek(0);
        await audioEngine.resume();
        return;
      }

      const nextIndex = queueIndex + 1;
      if (nextIndex < queue.length) {
        await playTrackAtIndex(queue, nextIndex);
      } else if (repeat === 'all') {
        await playTrackAtIndex(queue, 0);
      } else {
        audioEngine.pause();
        setIsPlaying(false);
      }
    },
    [currentTime, currentTrack, playTrackAtIndex, queue, queueIndex, repeat, updateAIMemory]
  );

  const playPrevious = useCallback(async () => {
    if (queue.length === 0) return;
    if (currentTime > 4) {
      audioEngine.seek(0);
      return;
    }
    const prevIndex = queueIndex - 1;
    if (prevIndex >= 0) {
      await playTrackAtIndex(queue, prevIndex);
    } else if (repeat === 'all') {
      await playTrackAtIndex(queue, queue.length - 1);
    } else {
      audioEngine.seek(0);
    }
  }, [currentTime, playTrackAtIndex, queue, queueIndex, repeat]);

  // Wire Web Audio Engine callbacks
  useEffect(() => {
    audioEngine.setCallbacks({
      onTimeUpdate: (time, dur) => {
        setCurrentTime(time);
        if (dur > 0) setDuration(dur);
        if (currentTrack && time >= Math.min(12, (dur || 30) * 0.35) && trackPlayRecordedRef.current !== currentTrack.id) {
          trackPlayRecordedRef.current = currentTrack.id;
          void recordPlayCompletion(currentTrack, time, true);
        }
      },
      onTrackEnded: () => {
        if (sleepEndOfTrack) {
          audioEngine.pause();
          setSleepEndOfTrack(false);
          notify('Sleep timer paused playback at the end of the track.');
          return;
        }
        void playNext(false);
      },
      onPlayStateChange: (playing) => {
        setIsPlaying(playing);
        if ('mediaSession' in navigator) {
          navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
        }
      },
      onError: (msg) => {
        notify(msg, 'error');
      },
    });
  }, [currentTrack, notify, playNext, recordPlayCompletion, sleepEndOfTrack]);

  // Media Session Action Handlers
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.setActionHandler('play', () => void togglePlayPause());
    navigator.mediaSession.setActionHandler('pause', () => void togglePlayPause());
    navigator.mediaSession.setActionHandler('nexttrack', () => void playNext(true));
    navigator.mediaSession.setActionHandler('previoustrack', () => void playPrevious());
    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (details.seekTime !== undefined) {
        audioEngine.seek(details.seekTime);
        setCurrentTime(details.seekTime);
      }
    });
  }, [playNext, playPrevious, togglePlayPause]);

  // Sleep timer countdown
  useEffect(() => {
    if (sleepRemainingSeconds === null) return;
    if (sleepRemainingSeconds <= 0) {
      audioEngine.pause();
      setSleepRemainingSeconds(null);
      notify('Sleep timer finished. Playback paused.');
      return;
    }
    const timer = window.setTimeout(() => {
      setSleepRemainingSeconds((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [notify, sleepRemainingSeconds]);

  // Global keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)
      ) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        void togglePlayPause();
      } else if (e.key === 'ArrowRight') {
        if (e.shiftKey) void playNext(true);
        else audioEngine.seek(audioEngine.getCurrentTime() + 5);
      } else if (e.key === 'ArrowLeft') {
        if (e.shiftKey) void playPrevious();
        else audioEngine.seek(Math.max(0, audioEngine.getCurrentTime() - 5));
      } else if (e.key.toLowerCase() === 'm') {
        const nextVol = settings.volume > 0 ? 0 : 0.85;
        audioEngine.setVolume(nextVol);
        void updateSettings({ volume: nextVol });
      } else if (e.key.toLowerCase() === 'l') {
        setActiveView('lyrics');
      } else if (e.key.toLowerCase() === 'f') {
        if (currentTrack) setIsFullPlayerOpen((prev) => !prev);
      } else if (e.key.toLowerCase() === 's') {
        setShuffle((prev) => !prev);
      } else if (e.key.toLowerCase() === 'r') {
        setRepeat((prev) => (prev === 'off' ? 'all' : prev === 'all' ? 'one' : 'off'));
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [currentTrack, playNext, playPrevious, settings.volume, togglePlayPause, updateSettings]);

  const seekTo = useCallback((seconds: number) => {
    audioEngine.seek(seconds);
    setCurrentTime(seconds);
  }, []);

  const addToQueue = useCallback(
    (track: Track) => {
      setQueue((prev) => {
        if (prev.length === 0) {
          void playTrackAtIndex([track], 0);
          return [track];
        }
        return [...prev, track];
      });
      notify(`Added "${track.title}" to queue.`);
    },
    [notify, playTrackAtIndex]
  );

  const playTrackNext = useCallback(
    (track: Track) => {
      setQueue((prev) => {
        if (prev.length === 0) {
          void playTrackAtIndex([track], 0);
          return [track];
        }
        const copy = [...prev];
        copy.splice(queueIndex + 1, 0, track);
        return copy;
      });
      notify(`"${track.title}" will play next.`);
    },
    [notify, playTrackAtIndex, queueIndex]
  );

  const removeFromQueue = useCallback(
    (index: number) => {
      setQueue((prev) => {
        const next = prev.filter((_, i) => i !== index);
        if (index < queueIndex) {
          setQueueIndex((idx) => Math.max(0, idx - 1));
        } else if (index === queueIndex && next.length > 0) {
          void playTrackAtIndex(next, Math.min(index, next.length - 1));
        } else if (next.length === 0) {
          audioEngine.pause();
          setQueueIndex(-1);
        }
        return next;
      });
    },
    [playTrackAtIndex, queueIndex]
  );

  const reorderQueue = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (fromIndex === toIndex) return;
      setQueue((prev) => {
        const copy = [...prev];
        const [moved] = copy.splice(fromIndex, 1);
        copy.splice(toIndex, 0, moved);
        if (fromIndex === queueIndex) setQueueIndex(toIndex);
        else if (fromIndex < queueIndex && toIndex >= queueIndex) setQueueIndex((i) => i - 1);
        else if (fromIndex > queueIndex && toIndex <= queueIndex) setQueueIndex((i) => i + 1);
        return copy;
      });
    },
    [queueIndex]
  );

  const clearQueue = useCallback(() => {
    if (!currentTrack) {
      setQueue([]);
      setQueueIndex(-1);
      return;
    }
    setQueue([currentTrack]);
    setQueueIndex(0);
    notify('Cleared upcoming queue.');
  }, [currentTrack, notify]);

  const toggleShuffle = useCallback(() => {
    setShuffle((prev) => {
      const next = !prev;
      if (next && queue.length > 2 && currentTrack) {
        const upcoming = settings.smartShuffle
          ? smartShuffleTracks(queue, currentTrack.id)
          : fisherYatesShuffle(queue.filter((t) => t.id !== currentTrack.id));
        setQueue([currentTrack, ...upcoming]);
        setQueueIndex(0);
      }
      notify(next ? (settings.smartShuffle ? 'Smart Shuffle enabled.' : 'Shuffle enabled.') : 'Shuffle off.');
      return next;
    });
  }, [currentTrack, notify, queue, settings.smartShuffle]);

  const cycleRepeat = useCallback(() => {
    setRepeat((prev) => {
      const next: RepeatMode = prev === 'off' ? 'all' : prev === 'all' ? 'one' : 'off';
      notify(next === 'off' ? 'Repeat off.' : next === 'all' ? 'Repeating entire queue.' : 'Repeating current track.');
      return next;
    });
  }, [notify]);

  const setVolume = useCallback(
    (vol: number) => {
      audioEngine.setVolume(vol);
      void updateSettings({ volume: vol });
    },
    [updateSettings]
  );

  const setSpeed = useCallback(
    (speed: number) => {
      audioEngine.setSpeed(speed);
      void updateSettings({ playbackSpeed: speed });
    },
    [updateSettings]
  );

  const setSleepTimer = useCallback(
    (minutes: number | null, endOfTrack = false) => {
      setSleepEndOfTrack(endOfTrack);
      if (endOfTrack) {
        setSleepRemainingSeconds(null);
        notify('Sleep timer set for end of current track.');
      } else if (minutes !== null && minutes > 0) {
        setSleepRemainingSeconds(minutes * 60);
        notify(`Sleep timer set for ${minutes} minutes.`);
      } else {
        setSleepRemainingSeconds(null);
        notify('Sleep timer cancelled.');
      }
    },
    [notify]
  );

  const startSmartRadio = useCallback(
    async (seedTrack: Track) => {
      const similar = findSimilarTracks(seedTrack, tracks, 18);
      const radioQueue = [seedTrack, ...similar];
      await playTrackAtIndex(radioQueue, 0);
      notify(`Smart Radio started from "${seedTrack.title}" (${radioQueue.length} tracks).`, 'success');
    },
    [notify, playTrackAtIndex, tracks]
  );

  const startMoodMix = useCallback(
    async (mood: MoodType) => {
      const matching = tracks.filter((t) => t.moods.includes(mood));
      const pool = matching.length > 0 ? matching : tracks;
      if (pool.length === 0) {
        notify('Import local songs first to start a mood mix.', 'info');
        return;
      }
      await updateAIMemory((prev) => ({
        ...prev,
        selectedMoods: { ...prev.selectedMoods, [mood]: (prev.selectedMoods[mood] || 0) + 1 },
      }));
      await playTracksList(smartShuffleTracks(pool), undefined, true);
      notify(`Playing ${mood} mix (${pool.length} tracks).`, 'success');
    },
    [notify, playTracksList, tracks, updateAIMemory]
  );

  const startFocusMode = useCallback(async () => {
    const focusTracks = tracks.filter((t) => t.moods.includes('Focus') || t.moods.includes('Relaxed') || t.energy <= 0.5);
    const pool = focusTracks.length > 0 ? focusTracks : tracks;
    if (pool.length === 0) {
      notify('Import songs to launch Focus Mode.', 'info');
      return;
    }
    await updateSettings({ focusMode: true });
    await playTracksList(smartShuffleTracks(pool), undefined, true);
    notify('Focus Mode active — calm, uninterrupted concentration tracks queued.', 'success');
  }, [notify, playTracksList, tracks, updateSettings]);

  const startPartyMode = useCallback(async () => {
    const partyTracks = tracks.filter((t) => t.moods.includes('Energetic') || t.moods.includes('Happy') || t.energy >= 0.65);
    const pool = partyTracks.length > 0 ? partyTracks : tracks;
    if (pool.length === 0) {
      notify('Import songs to launch Party Mode.', 'info');
      return;
    }
    await playTracksList(smartShuffleTracks(pool), undefined, true);
    notify('Party Mode active — high-energy tracks queued.', 'success');
  }, [notify, playTracksList, tracks]);

  const startDiscoveryMode = useCallback(async () => {
    const unplayed = [...tracks].sort((a, b) => a.playCount - b.playCount);
    if (unplayed.length === 0) {
      notify('Import songs to launch Discovery Mode.', 'info');
      return;
    }
    await updateSettings({ discoveryMode: true });
    await playTracksList(unplayed, 0, false);
    notify('Discovery Mode active — prioritizing tracks you have played the least.', 'success');
  }, [notify, playTracksList, tracks, updateSettings]);

  const handleImportFiles = useCallback(
    async (fileList: FileList | File[]) => {
      const files = Array.from(fileList);
      if (files.length === 0) return;

      setImportProgress({ processed: 0, total: files.length, fileName: files[0].name });
      const summary = await importAudioFiles(files, (processed, total, fileName) => {
        setImportProgress({ processed, total, fileName });
      });
      setImportProgress(null);
      setLastImportSummary(summary);
      await refreshAllData();

      if (summary.imported.length > 0) {
        notify(
          `Imported ${summary.imported.length} song${summary.imported.length === 1 ? '' : 's'}${
            summary.lrcMatched > 0 ? ` and matched ${summary.lrcMatched} LRC lyric file(s)` : ''
          }.`,
          'success'
        );
      } else if (summary.duplicates.length > 0) {
        notify(`Skipped ${summary.duplicates.length} duplicate file(s) already in your library.`, 'info');
      } else if (summary.unsupported.length > 0) {
        notify('No supported audio files found in selection.', 'error');
      }
    },
    [notify, refreshAllData]
  );

  const handleImportDirectoryPicker = useCallback(async () => {
    const win = window as unknown as { showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle> };
    if (!win.showDirectoryPicker) {
      notify('Folder picker fallback active — please use the Select Music Folder button.', 'info');
      return;
    }
    try {
      const dirHandle = await win.showDirectoryPicker();
      setImportProgress({ processed: 0, total: 1, fileName: `Scanning ${dirHandle.name}...` });
      const files = await collectFilesFromDirectoryHandle(dirHandle);
      await handleImportFiles(files);
    } catch (err) {
      setImportProgress(null);
      if ((err as Error)?.name !== 'AbortError') {
        notify('Unable to scan selected directory.', 'error');
      }
    }
  }, [handleImportFiles, notify]);

  const toggleFavorite = useCallback(
    async (trackId: string) => {
      const target = trackMap.get(trackId);
      if (!target) return;
      const updated = { ...target, isFavorite: !target.isFavorite };
      if (target.sourceType === 'local') {
        await updateTrack(updated);
        setLocalTracks((prev) => prev.map((t) => (t.id === trackId ? updated : t)));
      } else if (target.sourceType === 'firebase') {
        setFirebaseTracks((prev) => prev.map((t) => (t.id === trackId ? updated : t)));
        if (firebaseUser && target.firebaseDocId) {
          await updateFirebaseCloudTrackStats(firebaseUser.uid, target.firebaseDocId, {
            isFavorite: updated.isFavorite,
            playCount: updated.playCount,
            skipCount: updated.skipCount,
          });
        }
      }
      setQueue((prev) => prev.map((t) => (t.id === trackId ? updated : t)));
    },
    [firebaseUser, trackMap]
  );

  const saveTrackEdits = useCallback(
    async (updated: Track) => {
      if (updated.sourceType === 'local') {
        await updateTrack(updated);
        setLocalTracks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      } else if (updated.sourceType === 'firebase') {
        setFirebaseTracks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
        if (firebaseUser && updated.firebaseDocId) {
          await updateFirebaseCloudTrackMetadata(firebaseUser.uid, updated.firebaseDocId, updated);
        }
      }
      setQueue((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      notify(`Saved changes for "${updated.title}".`, 'success');
    },
    [firebaseUser, notify]
  );

  const deleteTrackFromLibrary = useCallback(
    async (trackId: string) => {
      const target = trackMap.get(trackId);
      if (target?.sourceType === 'firebase') {
        setPendingCloudDeleteTrack(target);
        return;
      }
      await removeTrackFromLibrary(trackId);
      setLocalTracks((prev) => prev.filter((t) => t.id !== trackId));
      setQueue((prev) => prev.filter((t) => t.id !== trackId));
      setPlaylists((prev) =>
        prev.map((pl) => ({ ...pl, trackIds: pl.trackIds.filter((id) => id !== trackId) }))
      );
      notify('Removed song from ISAI library (original file on disk untouched).', 'info');
    },
    [notify, trackMap]
  );

  const createPlaylist = useCallback(
    async (data: { name: string; description?: string; trackIds: string[]; isAIGenerated?: boolean; mood?: MoodType }) => {
      const now = Date.now();
      const firstArtTrack = data.trackIds.find((id) => trackMap.get(id)?.hasArtwork);
      const playlist: Playlist = {
        id: crypto.randomUUID(),
        name: data.name.trim() || 'Untitled Playlist',
        description: data.description?.trim() || '',
        trackIds: data.trackIds,
        artworkTrackId: firstArtTrack,
        createdAt: now,
        updatedAt: now,
        isAIGenerated: data.isAIGenerated,
        mood: data.mood,
      };
      await savePlaylist(playlist);
      setPlaylists((prev) => [playlist, ...prev]);
      notify(`Created playlist "${playlist.name}".`, 'success');
      return playlist;
    },
    [notify, trackMap]
  );

  const updatePlaylistData = useCallback(async (playlist: Playlist) => {
    const updated = { ...playlist, updatedAt: Date.now() };
    await savePlaylist(updated);
    setPlaylists((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  }, []);

  const removePlaylist = useCallback(
    async (playlistId: string) => {
      await deletePlaylist(playlistId);
      setPlaylists((prev) => prev.filter((p) => p.id !== playlistId));
      if (selectedPlaylistId === playlistId) {
        setSelectedPlaylistId(null);
        setActiveView('playlists');
      }
      notify('Playlist deleted.', 'info');
    },
    [notify, selectedPlaylistId]
  );

  const duplicatePlaylist = useCallback(
    async (playlistId: string) => {
      const source = playlists.find((p) => p.id === playlistId);
      if (!source) return;
      await createPlaylist({
        name: `${source.name} (Copy)`,
        description: source.description,
        trackIds: [...source.trackIds],
        mood: source.mood,
      });
    },
    [createPlaylist, playlists]
  );

  const addTrackToPlaylist = useCallback(
    async (playlistId: string, trackId: string) => {
      const pl = playlists.find((p) => p.id === playlistId);
      if (!pl) return;
      if (pl.trackIds.includes(trackId)) {
        notify(`Already in "${pl.name}".`, 'info');
        return;
      }
      await updatePlaylistData({
        ...pl,
        trackIds: [...pl.trackIds, trackId],
        artworkTrackId: pl.artworkTrackId || (trackMap.get(trackId)?.hasArtwork ? trackId : undefined),
      });
      notify(`Added to "${pl.name}".`, 'success');
    },
    [notify, playlists, trackMap, updatePlaylistData]
  );

  const openPlaylistDetail = useCallback((id: string) => {
    setSelectedPlaylistId(id);
    setActiveView('playlist-detail');
  }, []);

  const resetLibraryData = useCallback(async () => {
    audioEngine.pause();
    setQueue([]);
    setQueueIndex(-1);
    await clearAllLocalData();
    await refreshAllData();
    notify('All local ISAI library data cleared.', 'info');
  }, [notify, refreshAllData]);

  const value: SonoraContextValue = {
    tracks,
    localTracks,
    firebaseTracks,
    trackMap,
    playlists,
    history,
    aiMemory,
    settings,
    isLoadingData,
    isOnline,
    firebaseUser,
    isFirebaseConnected,
    isFirebaseSigningIn,
    isSyncingCloud,
    cloudUploadProgress,
    pendingCloudDeleteTrack,
    connectFirebaseCloud,
    disconnectFirebaseCloud,
    uploadFilesToCloud,
    requestDeleteCloudTrack,
    confirmDeleteCloudTrack,
    cancelDeleteCloudTrack: () => setPendingCloudDeleteTrack(null),
    activeView,
    setActiveView,
    selectedPlaylistId,
    openPlaylistDetail,
    isFullPlayerOpen,
    setIsFullPlayerOpen,
    isQueueOpen,
    setIsQueueOpen,
    isEqualizerOpen,
    setIsEqualizerOpen,
    editingTrack,
    setEditingTrack,
    searchInputRef,
    wallpaperId,
    setWallpaperId,
    importProgress,
    lastImportSummary,
    clearImportSummary: () => setLastImportSummary(null),
    handleImportFiles,
    handleImportDirectoryPicker,
    currentTrack,
    queue,
    queueIndex,
    isPlaying,
    currentTime,
    duration,
    shuffle,
    repeat,
    sleepRemainingSeconds,
    sleepEndOfTrack,
    playTrack,
    playTracksList,
    togglePlayPause,
    playNext,
    playPrevious,
    seekTo,
    addToQueue,
    playTrackNext,
    removeFromQueue,
    reorderQueue,
    clearQueue,
    toggleShuffle,
    cycleRepeat,
    setVolume,
    setSpeed,
    setSleepTimer,
    startSmartRadio,
    startMoodMix,
    startFocusMode,
    startPartyMode,
    startDiscoveryMode,
    toggleFavorite,
    saveTrackEdits,
    deleteTrackFromLibrary,
    createPlaylist,
    updatePlaylistData,
    removePlaylist,
    duplicatePlaylist,
    addTrackToPlaylist,
    updateSettings,
    updateAIMemory,
    refreshAllData,
    resetLibraryData,
    toasts,
    notify,
  };

  return <SonoraContext.Provider value={value}>{children}</SonoraContext.Provider>;
};

export function useSonora(): SonoraContextValue {
  const ctx = useContext(SonoraContext);
  if (!ctx) throw new Error('useSonora must be used inside SonoraProvider');
  return ctx;
}
