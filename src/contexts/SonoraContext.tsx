import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  addListeningEvent,
  clearAllLocalData,
  clearDriveCacheForUser,
  DEFAULT_AI_MEMORY,
  DEFAULT_SETTINGS,
  deletePlaylist,
  getAIMemory,
  getAllPlaylists,
  getAllTracks,
  getArtworkUrl,
  getDriveCatalogCache,
  getListeningHistory,
  getSettings,
  removeTrackFromLibrary,
  saveAIMemory,
  saveDriveCatalogCache,
  savePlaylist,
  saveSettings,
  updateTrack,
} from '../db/sonoraDb';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import {
  clearActivityStore,
  type DailyActivityStore,
  loadActivityStore,
  mergeHistoryBackfill,
  recordSessionOpen,
  recordSongHeardInStore,
  saveActivityStore,
  tickActivitySecond,
} from '../services/analyticsService';
import { audioEngine } from '../services/audioEngine';
import {
  getDriveAccessToken,
  isCloudWriteQuotaExceeded,
  signInWithFirebaseGoogle,
  signOutFirebase,
  subscribeToFirebaseAuth,
} from '../services/firebaseClient';
import {
  deleteAllFirebaseCloudTracks,
  deleteFirebaseCloudTrack,
  fetchFirebaseCloudTracksOnce,
  isFirebaseLockerConfirmedEmpty,
  saveLocalCloudTrackStats,
  setFirebaseLockerConfirmedEmpty,
  updateFirebaseCloudTrackMetadata,
  updateFirebaseCloudTrackStats,
} from '../services/firebaseMusicService';
import {
  deleteGoogleDriveTrack,
  DriveAuthExpiredError,
  listGoogleDriveTracks,
  resetDriveRuntimeCache,
  updateGoogleDriveTrackMetadata,
  uploadFilesToGoogleDrive,
} from '../services/googleDriveMusicService';
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
  driveTracks: Track[];
  trackMap: Map<string, Track>;
  playlists: Playlist[];
  history: ListeningEvent[];
  activityStore: DailyActivityStore;
  resetAnalytics: () => void;
  aiMemory: AIMemory;
  settings: AppSettings;
  isLoadingData: boolean;
  isOnline: boolean;

  // Cloud Music Locker (Google Drive primary + legacy Firebase reads)
  firebaseUser: User | null;
  isFirebaseConnected: boolean;
  isDriveConnected: boolean;
  needsDriveReconnect: boolean;
  isFirebaseSigningIn: boolean;
  isSyncingCloud: boolean;
  cloudUploadProgress: { done: number; total: number; fileName: string } | null;
  isDeletingAllFirebase: boolean;
  firebaseDeleteProgress: { done: number; total: number; title: string } | null;
  hideLegacyFirebaseTracks: boolean;
  setHideLegacyFirebaseTracks: (hidden: boolean) => void;
  deleteAllFirebaseTracks: () => Promise<void>;
  pendingCloudDeleteTrack: Track | null;
  pendingDriveUpdateTrack: Track | null;
  connectFirebaseCloud: () => Promise<void>;
  disconnectFirebaseCloud: () => Promise<void>;
  refreshDriveLibrary: () => Promise<void>;
  uploadFilesToCloud: (files: FileList | File[]) => Promise<void>;
  requestDeleteCloudTrack: (track: Track) => void;
  confirmDeleteCloudTrack: () => Promise<void>;
  cancelDeleteCloudTrack: () => void;
  confirmDriveUpdateTrack: () => Promise<void>;
  cancelDriveUpdateTrack: () => void;

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
  reorderUpcomingQueue: (fromUpcomingIndex: number, toUpcomingIndex: number) => void;
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
  const [driveTracks, setDriveTracks] = useState<Track[]>([]);

  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [isFirebaseConnected, setIsFirebaseConnected] = useState(false);
  const [isDriveConnected, setIsDriveConnected] = useState(false);
  const [isFirebaseSigningIn, setIsFirebaseSigningIn] = useState(false);
  const [isSyncingCloud, setIsSyncingCloud] = useState(false);
  const [cloudUploadProgress, setCloudUploadProgress] = useState<{ done: number; total: number; fileName: string } | null>(null);
  const [isDeletingAllFirebase, setIsDeletingAllFirebase] = useState(false);
  const [firebaseDeleteProgress, setFirebaseDeleteProgress] = useState<{ done: number; total: number; title: string } | null>(null);
  const [hideLegacyFirebaseTracks, setHideLegacyFirebaseTracksState] = useState<boolean>(() => {
    try {
      return localStorage.getItem('isai_hide_legacy_firebase_v1') === 'true';
    } catch {
      return false;
    }
  });
  const setHideLegacyFirebaseTracks = useCallback((hidden: boolean) => {
    setHideLegacyFirebaseTracksState(hidden);
    try {
      localStorage.setItem('isai_hide_legacy_firebase_v1', hidden ? 'true' : 'false');
    } catch {
      // ignore storage errors
    }
  }, []);
  const [pendingCloudDeleteTrack, setPendingCloudDeleteTrack] = useState<Track | null>(null);
  const [pendingDriveUpdateTrack, setPendingDriveUpdateTrack] = useState<Track | null>(null);

  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const playlistsRef = useRef<Playlist[]>([]);
  playlistsRef.current = playlists;
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
  const queueRef = useRef<Track[]>([]);
  const queueIndexRef = useRef<number>(-1);
  queueRef.current = queue;
  queueIndexRef.current = queueIndex;
  const [isPlaying, setIsPlaying] = useState(false);
  const isPlayingRef = useRef(false);
  isPlayingRef.current = isPlaying;
  const [activityStore, setActivityStore] = useState<DailyActivityStore>(() =>
    recordSessionOpen(loadActivityStore())
  );
  const activityStoreRef = useRef<DailyActivityStore>(activityStore);
  activityStoreRef.current = activityStore;
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

  const visibleFirebaseTracks = useMemo(
    () => (hideLegacyFirebaseTracks ? [] : firebaseTracks),
    [firebaseTracks, hideLegacyFirebaseTracks]
  );

  const tracks = useMemo(
    () => [...driveTracks, ...visibleFirebaseTracks, ...localTracks],
    [driveTracks, visibleFirebaseTracks, localTracks]
  );
  const trackMap = useMemo(() => {
    const map = new Map<string, Track>();
    for (const t of localTracks) map.set(t.id, t);
    for (const t of visibleFirebaseTracks) map.set(t.id, t);
    for (const t of driveTracks) map.set(t.id, t);
    return map;
  }, [driveTracks, visibleFirebaseTracks, localTracks]);
  const currentTrack = queueIndex >= 0 && queueIndex < queue.length ? queue[queueIndex] : null;
  const needsDriveReconnect = isFirebaseConnected && !isDriveConnected;

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
    setActivityStore((prev) => mergeHistoryBackfill(prev, loadedHistory));
    setAiMemory(loadedMemory);
    setSettings(loadedSettings);
    audioEngine.setVolume(loadedSettings.volume);
    audioEngine.setSpeed(loadedSettings.playbackSpeed);
    audioEngine.setEqGains(loadedSettings.eqGains);
    setIsLoadingData(false);
  }, []);

  const syncDriveLibrary = useCallback(
    async (tokenOverride?: string | null, userIdOverride?: string | null) => {
      const token = tokenOverride ?? getDriveAccessToken();
      if (!token) {
        setIsDriveConnected(false);
        return;
      }
      setIsSyncingCloud(true);
      try {
        const list = await listGoogleDriveTracks(token);
        setDriveTracks(list);
        setIsDriveConnected(true);
        const uid = userIdOverride ?? firebaseUser?.uid;
        if (uid) {
          void saveDriveCatalogCache(uid, list);
        }
      } catch (err) {
        if (err instanceof DriveAuthExpiredError) {
          setIsDriveConnected(false);
        }
        notify(err instanceof Error ? err.message : 'Unable to sync Google Drive Music Locker.', 'error');
      } finally {
        setIsSyncingCloud(false);
      }
    },
    [firebaseUser?.uid, notify]
  );

  const ensureDriveToken = useCallback(async (): Promise<string | null> => {
    const existing = getDriveAccessToken();
    if (existing) {
      setIsDriveConnected(true);
      return existing;
    }
    setIsFirebaseSigningIn(true);
    try {
      const { user, accessToken } = await signInWithFirebaseGoogle();
      setFirebaseUser(user);
      setIsFirebaseConnected(true);
      if (accessToken) {
        setIsDriveConnected(true);
        return accessToken;
      }
      setIsDriveConnected(false);
      return null;
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Google Drive authorization was cancelled.', 'error');
      return null;
    } finally {
      setIsFirebaseSigningIn(false);
    }
  }, [notify]);

  const refreshDriveLibrary = useCallback(async () => {
    const token = await ensureDriveToken();
    if (!token) return;
    await syncDriveLibrary(token);
  }, [ensureDriveToken, syncDriveLibrary]);

  const connectFirebaseCloud = useCallback(async () => {
    setIsFirebaseSigningIn(true);
    try {
      const { user, accessToken } = await signInWithFirebaseGoogle();
      setFirebaseUser(user);
      setIsFirebaseConnected(true);
      if (accessToken) {
        setIsDriveConnected(true);
        notify(`Signed in to Google Drive (${user.email || 'Account ready'}).`, 'success');
        await syncDriveLibrary(accessToken, user.uid);
      } else {
        setIsDriveConnected(false);
        notify('Signed in, but Google Drive access was not granted. Click Connect Google Drive again and allow Drive access.', 'info');
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Google sign-in was cancelled or failed.', 'error');
    } finally {
      setIsFirebaseSigningIn(false);
    }
  }, [notify, syncDriveLibrary]);

  const disconnectFirebaseCloud = useCallback(async () => {
    const uid = firebaseUser?.uid;
    await signOutFirebase();
    resetDriveRuntimeCache();
    if (uid) {
      await clearDriveCacheForUser(uid);
    }
    setFirebaseUser(null);
    setIsFirebaseConnected(false);
    setIsDriveConnected(false);
    setFirebaseTracks([]);
    setDriveTracks([]);
    notify('Signed out of Google Drive & Cloud Locker.', 'info');
  }, [firebaseUser?.uid, notify]);

  const uploadFilesToCloud = useCallback(
    async (fileList: FileList | File[]) => {
      const files = Array.from(fileList);
      if (files.length === 0) return;

      const token = await ensureDriveToken();
      if (!token) {
        notify('Connect Google Drive to upload songs to your Google Drive Music Locker.', 'info');
        return;
      }

      setCloudUploadProgress({ done: 0, total: files.length, fileName: files[0].name });
      try {
        const res = await uploadFilesToGoogleDrive(token, files, (done, total, fileName) => {
          setCloudUploadProgress({ done, total, fileName });
        });
        setCloudUploadProgress(null);

        if (res.uploaded.length > 0) {
          setDriveTracks((prev) => {
            const seen = new Set(res.uploaded.map((t) => t.id));
            const next = [...res.uploaded, ...prev.filter((t) => !seen.has(t.id))];
            if (firebaseUser?.uid) {
              void saveDriveCatalogCache(firebaseUser.uid, next);
            }
            return next;
          });
          const skippedMsg = res.skipped.length > 0 ? ` (${res.skipped.length} skipped)` : '';
          notify(
            `Uploaded ${res.uploaded.length} song${res.uploaded.length === 1 ? '' : 's'} to Google Drive${skippedMsg}.`,
            'success'
          );
        } else if (res.skipped.length > 0) {
          notify(res.skipped[0].reason || 'No new supported audio files uploaded.', 'info');
        } else {
          notify('No supported audio files found in selection.', 'error');
        }
      } catch (err) {
        setCloudUploadProgress(null);
        if (err instanceof DriveAuthExpiredError) {
          setIsDriveConnected(false);
        }
        notify(err instanceof Error ? err.message : 'Google Drive upload failed.', 'error');
      }
    },
    [ensureDriveToken, firebaseUser?.uid, notify]
  );

  const requestDeleteCloudTrack = useCallback((track: Track) => {
    setPendingCloudDeleteTrack(track);
  }, []);

  const confirmDeleteCloudTrack = useCallback(async () => {
    const target = pendingCloudDeleteTrack;
    if (!target) {
      setPendingCloudDeleteTrack(null);
      return;
    }

    try {
      if (target.sourceType === 'gdrive' && target.driveFileId) {
        const token = await ensureDriveToken();
        if (!token) {
          setIsDriveConnected(false);
          notify('Google Drive authorization is required to delete this song.', 'info');
          setPendingCloudDeleteTrack(null);
          return;
        }
        await deleteGoogleDriveTrack(token, target.driveFileId);
        setDriveTracks((prev) => {
          const next = prev.filter((t) => t.id !== target.id);
          if (firebaseUser?.uid) {
            void saveDriveCatalogCache(firebaseUser.uid, next);
          }
          return next;
        });
        setQueue((prev) => prev.filter((t) => t.id !== target.id));
        notify(`Deleted "${target.title}" from Google Drive.`, 'info');
      } else if (target.sourceType === 'firebase' && target.firebaseDocId && firebaseUser) {
        await deleteFirebaseCloudTrack(firebaseUser.uid, target.firebaseDocId);
        setFirebaseTracks((prev) => prev.filter((t) => t.id !== target.id));
        setQueue((prev) => prev.filter((t) => t.id !== target.id));
        notify(`Deleted "${target.title}" from Firebase Cloud.`, 'info');
      }
    } catch (err) {
      if (err instanceof DriveAuthExpiredError) {
        setIsDriveConnected(false);
      }
      notify(err instanceof Error ? err.message : 'Could not delete song from cloud.', 'error');
    } finally {
      setPendingCloudDeleteTrack(null);
    }
  }, [ensureDriveToken, firebaseUser, notify, pendingCloudDeleteTrack]);

  const deleteAllFirebaseTracks = useCallback(async () => {
    if (!firebaseUser) {
      notify('Sign in with Google first to remove songs from Firebase Cloud.', 'info');
      return;
    }
    if (isDeletingAllFirebase) return;

    setIsDeletingAllFirebase(true);
    setFirebaseDeleteProgress({
      done: 0,
      total: firebaseTracks.length || 1,
      title: firebaseTracks[0]?.title || 'Loading Firebase Cloud songs...',
    });

    try {
      const result = await deleteAllFirebaseCloudTracks(firebaseUser.uid, (done, total, title) => {
        setFirebaseDeleteProgress({ done, total, title });
      });

      if (result.deletedIds.length > 0) {
        const deletedSet = new Set(result.deletedIds);
        setFirebaseTracks((prev) => prev.filter((t) => !deletedSet.has(t.id)));
        setQueue((prev) => {
          const next = prev.filter((t) => !deletedSet.has(t.id));
          if (currentTrack && deletedSet.has(currentTrack.id)) {
            audioEngine.pause();
            setIsPlaying(false);
            setQueueIndex(next.length > 0 ? 0 : -1);
          }
          return next;
        });

        // Clean removed Firebase track IDs out of any local playlists
        const affectedPlaylists = playlists.filter((pl) => pl.trackIds.some((id) => deletedSet.has(id)));
        if (affectedPlaylists.length > 0) {
          const updatedPlaylists = playlists.map((pl) => {
            if (!pl.trackIds.some((id) => deletedSet.has(id))) return pl;
            return {
              ...pl,
              trackIds: pl.trackIds.filter((id) => !deletedSet.has(id)),
              updatedAt: Date.now(),
            };
          });
          setPlaylists(updatedPlaylists);
          await Promise.all(
            updatedPlaylists
              .filter((pl) => affectedPlaylists.some((ap) => ap.id === pl.id))
              .map((pl) => savePlaylist(pl))
          );
        }
      }

      if (result.quotaHit) {
        notify(
          result.deletedIds.length > 0
            ? `Removed ${result.deletedIds.length} song(s) from Firebase Cloud. ${result.remainingCount} remaining hit today's Firestore daily write limit — retry after midnight PT or click Hide.`
            : `Firebase Cloud's daily write quota is currently full (${result.remainingCount} song(s) remaining). Retry after midnight PT or click Hide to remove them from ISAI now.`,
          'error'
        );
      } else if (result.deletedIds.length === 0) {
        setFirebaseLockerConfirmedEmpty(firebaseUser.uid, true);
        notify('No songs found in Firebase Cloud.', 'info');
      } else {
        setFirebaseLockerConfirmedEmpty(firebaseUser.uid, result.remainingCount === 0);
        setHideLegacyFirebaseTracks(false);
        notify(
          `Removed all ${result.deletedIds.length} song${result.deletedIds.length === 1 ? '' : 's'} from Firebase Cloud.`,
          'success'
        );
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Unable to remove songs from Firebase Cloud.', 'error');
    } finally {
      setIsDeletingAllFirebase(false);
      setFirebaseDeleteProgress(null);
    }
  }, [currentTrack, firebaseTracks, firebaseUser, isDeletingAllFirebase, notify, playlists, setHideLegacyFirebaseTracks]);

  const confirmDriveUpdateTrack = useCallback(async () => {
    const updated = pendingDriveUpdateTrack;
    if (!updated || updated.sourceType !== 'gdrive') {
      setPendingDriveUpdateTrack(null);
      return;
    }
    const token = await ensureDriveToken();
    if (!token) {
      setIsDriveConnected(false);
      notify('Google Drive authorization is required to save changes.', 'info');
      setPendingDriveUpdateTrack(null);
      return;
    }
    try {
      await updateGoogleDriveTrackMetadata(token, updated);
      setDriveTracks((prev) => {
        const next = prev.map((t) => (t.id === updated.id ? updated : t));
        if (firebaseUser?.uid) {
          void saveDriveCatalogCache(firebaseUser.uid, next);
        }
        return next;
      });
      setQueue((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      notify(`Updated "${updated.title}" in Google Drive.`, 'success');
    } catch (err) {
      if (err instanceof DriveAuthExpiredError) {
        setIsDriveConnected(false);
      }
      notify(err instanceof Error ? err.message : 'Unable to update song in Google Drive.', 'error');
    } finally {
      setPendingDriveUpdateTrack(null);
    }
  }, [ensureDriveToken, firebaseUser?.uid, notify, pendingDriveUpdateTrack]);

  useEffect(() => {
    void refreshAllData();
    const unsub = subscribeToFirebaseAuth((user, driveToken) => {
      if (user) {
        setFirebaseUser(user);
        setIsFirebaseConnected(true);
        // Immediately restore the user's cached Google Drive song library from IndexedDB so daily opens work with zero re-login
        void getDriveCatalogCache(user.uid).then((cachedTracks) => {
          if (cachedTracks.length > 0) {
            setDriveTracks((prev) => (prev.length > 0 ? prev : cachedTracks));
          }
        });
        if (driveToken) {
          setIsDriveConnected(true);
          void syncDriveLibrary(driveToken, user.uid);
        } else {
          setIsDriveConnected(false);
        }
      } else {
        resetDriveRuntimeCache();
        setFirebaseUser(null);
        setIsFirebaseConnected(false);
        setIsDriveConnected(false);
        setFirebaseTracks([]);
        setDriveTracks([]);
      }
    });
    return () => unsub();
  }, [refreshAllData, syncDriveLibrary]);

  useEffect(() => {
    if (!isOnline || !firebaseUser || !firebaseUser.emailVerified || hideLegacyFirebaseTracks) {
      return;
    }
    if (isFirebaseLockerConfirmedEmpty(firebaseUser.uid)) {
      return;
    }
    let cancelled = false;
    void fetchFirebaseCloudTracksOnce(firebaseUser.uid)
      .then((remoteTracks) => {
        if (!cancelled) {
          setFirebaseTracks(remoteTracks);
        }
      })
      .catch(() => {
        // Legacy Firebase tracks are optional fallback; silently ignore transient offline/unavailable errors
      });
    return () => {
      cancelled = true;
    };
  }, [firebaseUser, hideLegacyFirebaseTracks, isOnline]);

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
      } else if (track.sourceType === 'gdrive') {
        setDriveTracks((prev) => prev.map((t) => (t.id === track.id ? updatedTrack : t)));
        saveLocalCloudTrackStats(track.id, {
          playCount: updatedTrack.playCount,
          lastPlayedAt: updatedTrack.lastPlayedAt,
        });
      } else if (track.sourceType === 'firebase') {
        setFirebaseTracks((prev) => prev.map((t) => (t.id === track.id ? updatedTrack : t)));
        saveLocalCloudTrackStats(track.id, {
          playCount: updatedTrack.playCount,
          lastPlayedAt: updatedTrack.lastPlayedAt,
        });
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
      setActivityStore((prev) => recordSongHeardInStore(prev));

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
    [updateAIMemory]
  );

  const playTrackAtIndex = useCallback(
    async (targetQueue: Track[], index: number, crossfadeOverride?: number) => {
      const target = targetQueue[index];
      if (!target) return;
      if (target.sourceType === 'firebase' && !isOnline) {
        notify('This legacy Firebase Cloud song requires an internet connection.', 'error');
        return;
      }

      queueRef.current = targetQueue;
      queueIndexRef.current = index;
      setQueue(targetQueue);
      setQueueIndex(index);
      setCurrentTime(0);
      setDuration(target.duration || 0);
      trackPlayRecordedRef.current = null;

      try {
        const effectiveCrossfade = crossfadeOverride !== undefined ? crossfadeOverride : settings.crossfadeSeconds;
        await audioEngine.playTrack(target, effectiveCrossfade);
        // Update Media Session API for OS / Bluetooth / Android lock-screen controls
        if ('mediaSession' in navigator) {
          const localArtUrl = await getArtworkUrl(target.id);
          const artUrl: string | null = localArtUrl || target.artworkUrl || null;
          navigator.mediaSession.metadata = new MediaMetadata({
            title: target.title,
            artist: target.artist,
            album: target.album,
            artwork: artUrl ? [{ src: artUrl, sizes: '512x512', type: 'image/jpeg' }] : [],
          });
        }
      } catch (err) {
        if (err instanceof DriveAuthExpiredError) {
          setIsDriveConnected(false);
        }
        const msg = err instanceof Error ? err.message : 'Playback failed for this track.';
        notify(msg, 'error');
      }
    },
    [isOnline, notify, settings.crossfadeSeconds]
  );

  const playTrack = useCallback(
    async (track: Track, newQueue?: Track[]) => {
      // If clicking a track inside the currently active queue (e.g. QueueDrawer), jump directly to its index without reshuffling
      if (newQueue && newQueue === queueRef.current && newQueue.length > 0) {
        const directIdx = newQueue.findIndex((t) => t.id === track.id);
        if (directIdx >= 0) {
          await playTrackAtIndex(newQueue, directIdx, 0);
          return;
        }
      }

      const fallbackQueue = tracks.length > 0 ? (tracks.some((t) => t.id === track.id) ? tracks : [track, ...tracks]) : [track];
      const targetQueue = newQueue && newQueue.length > 0 ? newQueue : fallbackQueue;
      if (shuffle && targetQueue.length > 1) {
        const rest = settings.smartShuffle
          ? smartShuffleTracks(targetQueue, track.id)
          : fisherYatesShuffle(targetQueue.filter((t) => t.id !== track.id));
        await playTrackAtIndex([track, ...rest], 0, 0);
        return;
      }
      const idx = targetQueue.findIndex((t) => t.id === track.id);
      await playTrackAtIndex(targetQueue, idx >= 0 ? idx : 0, 0);
    },
    [playTrackAtIndex, settings.smartShuffle, shuffle, tracks]
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
        await playTrackAtIndex(ordered, 0, 0);
      } else {
        await playTrackAtIndex(list, startIndex ?? 0, 0);
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
      try {
        await audioEngine.resume();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unable to resume playback.';
        notify(msg, 'error');
      }
    }
  }, [currentTrack, isPlaying, notify, playTracksList, shuffle, tracks]);

  const playNext = useCallback(
    async (manualSkip = true) => {
      const activeQueue = queueRef.current;
      const activeIndex = queueIndexRef.current;
      const activeTrack = activeIndex >= 0 && activeIndex < activeQueue.length ? activeQueue[activeIndex] : null;

      if (activeQueue.length === 0) {
        if (tracks.length > 0) {
          await playTracksList(tracks, shuffle ? undefined : 0, shuffle);
        }
        return;
      }

      if (manualSkip && activeTrack && audioEngine.getCurrentTime() < 20) {
        const updated = { ...activeTrack, skipCount: activeTrack.skipCount + 1 };
        if (activeTrack.sourceType === 'local') {
          void updateTrack(updated);
          setLocalTracks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
        } else if (activeTrack.sourceType === 'gdrive') {
          setDriveTracks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
          saveLocalCloudTrackStats(updated.id, { skipCount: updated.skipCount });
        } else if (activeTrack.sourceType === 'firebase') {
          setFirebaseTracks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
          saveLocalCloudTrackStats(updated.id, { skipCount: updated.skipCount });
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
        setCurrentTime(0);
        await audioEngine.resume();
        return;
      }

      // If the active queue only has 1 song but the library has more, expand to the full library on manual Next
      if (manualSkip && activeQueue.length <= 1 && tracks.length > 1) {
        const currentId = activeTrack?.id;
        const rest = shuffle
          ? settings.smartShuffle
            ? smartShuffleTracks(tracks, currentId)
            : fisherYatesShuffle(tracks.filter((t) => t.id !== currentId))
          : (() => {
              const curIdx = tracks.findIndex((t) => t.id === currentId);
              if (curIdx < 0) return tracks.filter((t) => t.id !== currentId);
              return [...tracks.slice(curIdx + 1), ...tracks.slice(0, curIdx)];
            })();
        if (rest.length > 0) {
          const expanded = activeTrack ? [activeTrack, ...rest] : rest;
          await playTrackAtIndex(expanded, activeTrack ? 1 : 0, 0);
          return;
        }
      }

      const nextIndex = activeIndex + 1;
      const crossfade = manualSkip ? 0 : settings.crossfadeSeconds;
      if (nextIndex < activeQueue.length) {
        await playTrackAtIndex(activeQueue, nextIndex, crossfade);
      } else if (repeat === 'all' || manualSkip) {
        // Wrap around to the first track on Repeat All or explicit Next button click
        await playTrackAtIndex(activeQueue, 0, crossfade);
      } else {
        audioEngine.pause();
        setIsPlaying(false);
      }
    },
    [playTrackAtIndex, playTracksList, repeat, settings.crossfadeSeconds, settings.smartShuffle, shuffle, tracks, updateAIMemory]
  );

  const playPrevious = useCallback(async () => {
    const activeQueue = queueRef.current;
    const activeIndex = queueIndexRef.current;
    const activeTrack = activeIndex >= 0 && activeIndex < activeQueue.length ? activeQueue[activeIndex] : null;

    if (activeQueue.length === 0) {
      if (tracks.length > 0) {
        await playTrackAtIndex(tracks, tracks.length - 1, 0);
      }
      return;
    }

    // If the active queue only has 1 song but the library has more, expand to the full library and jump to the previous track
    if (activeQueue.length <= 1 && tracks.length > 1) {
      const currentId = activeTrack?.id;
      const curIdx = tracks.findIndex((t) => t.id === currentId);
      const prevLibIdx = curIdx > 0 ? curIdx - 1 : tracks.length - 1;
      await playTrackAtIndex(tracks, prevLibIdx, 0);
      return;
    }

    if (activeQueue.length > 1) {
      const prevIndex = activeIndex > 0 ? activeIndex - 1 : activeQueue.length - 1;
      await playTrackAtIndex(activeQueue, prevIndex, 0);
      return;
    }

    // Only 1 song exists in total: restart it from 0:00
    audioEngine.seek(0);
    setCurrentTime(0);
    await audioEngine.resume();
  }, [playTrackAtIndex, tracks]);

  // Wire Web Audio Engine callbacks
  useEffect(() => {
    audioEngine.setCallbacks({
      onTimeUpdate: (time, dur) => {
        setCurrentTime(time);
        if (dur > 0) setDuration(dur);
        if (currentTrack && time >= Math.min(8, (dur || 24) * 0.3) && trackPlayRecordedRef.current !== currentTrack.id) {
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

      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const key = e.key.toLowerCase();
      if (e.code === 'Space') {
        e.preventDefault();
        void togglePlayPause();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (e.shiftKey) void playNext(true);
        else audioEngine.seek(audioEngine.getCurrentTime() + 5);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (e.shiftKey) void playPrevious();
        else audioEngine.seek(Math.max(0, audioEngine.getCurrentTime() - 5));
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        if (target?.closest('[role="listbox"]')) return;
        e.preventDefault();
        const delta = (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 0.1 : 0.05);
        const nextVol = Math.max(0, Math.min(1, Math.round((settings.volume + delta) * 100) / 100));
        audioEngine.setVolume(nextVol);
        void updateSettings({ volume: nextVol });
      } else if (key === 'n') {
        e.preventDefault();
        void playNext(true);
      } else if (key === 'p') {
        e.preventDefault();
        void playPrevious();
      } else if (key === 'm') {
        const nextVol = settings.volume > 0 ? 0 : 0.85;
        audioEngine.setVolume(nextVol);
        void updateSettings({ volume: nextVol });
      } else if (key === 'l') {
        setActiveView('lyrics');
      } else if (key === 'f') {
        if (currentTrack) setIsFullPlayerOpen((prev) => !prev);
      } else if (key === 's') {
        setShuffle((prev) => !prev);
      } else if (key === 'r') {
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

  const reorderUpcomingQueue = useCallback(
    (fromUpcomingIndex: number, toUpcomingIndex: number) => {
      if (fromUpcomingIndex === toUpcomingIndex) return;
      const activeQueue = queueRef.current;
      const activeIdx = queueIndexRef.current;
      if (activeQueue.length === 0) return;

      if (activeIdx >= 0 && activeIdx < activeQueue.length) {
        const current = activeQueue[activeIdx];
        const upcoming = [...activeQueue.slice(activeIdx + 1), ...activeQueue.slice(0, activeIdx)];
        if (
          fromUpcomingIndex < 0 ||
          fromUpcomingIndex >= upcoming.length ||
          toUpcomingIndex < 0 ||
          toUpcomingIndex >= upcoming.length
        ) {
          return;
        }
        const [moved] = upcoming.splice(fromUpcomingIndex, 1);
        upcoming.splice(toUpcomingIndex, 0, moved);
        const nextQueue = [current, ...upcoming];
        queueRef.current = nextQueue;
        queueIndexRef.current = 0;
        setQueue(nextQueue);
        setQueueIndex(0);
      } else {
        const copy = [...activeQueue];
        if (
          fromUpcomingIndex < 0 ||
          fromUpcomingIndex >= copy.length ||
          toUpcomingIndex < 0 ||
          toUpcomingIndex >= copy.length
        ) {
          return;
        }
        const [moved] = copy.splice(fromUpcomingIndex, 1);
        copy.splice(toUpcomingIndex, 0, moved);
        queueRef.current = copy;
        setQueue(copy);
      }
    },
    []
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
      } else if (target.sourceType === 'gdrive') {
        setDriveTracks((prev) => prev.map((t) => (t.id === trackId ? updated : t)));
        saveLocalCloudTrackStats(trackId, { isFavorite: updated.isFavorite });
      } else if (target.sourceType === 'firebase') {
        setFirebaseTracks((prev) => prev.map((t) => (t.id === trackId ? updated : t)));
        saveLocalCloudTrackStats(trackId, { isFavorite: updated.isFavorite });
        if (firebaseUser && target.firebaseDocId && !isCloudWriteQuotaExceeded()) {
          try {
            await updateFirebaseCloudTrackStats(firebaseUser.uid, target.firebaseDocId, {
              isFavorite: updated.isFavorite,
              playCount: updated.playCount,
              skipCount: updated.skipCount,
            });
          } catch (err) {
            notify(err instanceof Error ? err.message : 'Saved favorite locally (cloud write quota reached).', 'info');
          }
        }
      }
      setQueue((prev) => prev.map((t) => (t.id === trackId ? updated : t)));

      // Automatically sync with the "Liked" playlist
      const existingLiked = playlistsRef.current.find((p) => p.name.trim().toLowerCase() === 'liked');
      const now = Date.now();

      if (updated.isFavorite) {
        if (existingLiked) {
          if (!existingLiked.trackIds.includes(trackId)) {
            const nextTrackIds = [trackId, ...existingLiked.trackIds];
            const nextPlaylist: Playlist = {
              ...existingLiked,
              trackIds: nextTrackIds,
              artworkTrackId: existingLiked.artworkTrackId || (target.hasArtwork ? trackId : undefined),
              updatedAt: now,
            };
            await savePlaylist(nextPlaylist);
            const nextList = playlistsRef.current.map((p) => (p.id === nextPlaylist.id ? nextPlaylist : p));
            playlistsRef.current = nextList;
            setPlaylists(nextList);
          }
        } else {
          // Create the "Liked" playlist (including any previously favorited tracks)
          const priorLikedIds = tracks
            .filter((t) => t.id !== trackId && t.isFavorite)
            .map((t) => t.id);
          const initialTrackIds = [trackId, ...priorLikedIds];
          const firstArtTrack = initialTrackIds.find((id) => trackMap.get(id)?.hasArtwork);
          const newLikedPlaylist: Playlist = {
            id: crypto.randomUUID(),
            name: 'Liked',
            description: 'Songs you liked in ISAI',
            trackIds: initialTrackIds,
            artworkTrackId: firstArtTrack,
            createdAt: now,
            updatedAt: now,
          };
          await savePlaylist(newLikedPlaylist);
          const nextList = [newLikedPlaylist, ...playlistsRef.current];
          playlistsRef.current = nextList;
          setPlaylists(nextList);
        }
        notify(`Added "${target.title}" to Liked.`, 'success');
      } else if (existingLiked && existingLiked.trackIds.includes(trackId)) {
        const nextTrackIds = existingLiked.trackIds.filter((id) => id !== trackId);
        const nextArtworkId =
          existingLiked.artworkTrackId === trackId
            ? nextTrackIds.find((id) => trackMap.get(id)?.hasArtwork)
            : existingLiked.artworkTrackId;
        const nextPlaylist: Playlist = {
          ...existingLiked,
          trackIds: nextTrackIds,
          artworkTrackId: nextArtworkId,
          updatedAt: now,
        };
        await savePlaylist(nextPlaylist);
        const nextList = playlistsRef.current.map((p) => (p.id === nextPlaylist.id ? nextPlaylist : p));
        playlistsRef.current = nextList;
        setPlaylists(nextList);
        notify(`Removed "${target.title}" from Liked.`, 'info');
      }
    },
    [firebaseUser, notify, trackMap, tracks]
  );

  const saveTrackEdits = useCallback(
    async (updated: Track) => {
      if (updated.sourceType === 'local') {
        await updateTrack(updated);
        setLocalTracks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      } else if (updated.sourceType === 'gdrive') {
        // Require explicit user confirmation before overwriting catalog data in Google Drive
        setPendingDriveUpdateTrack(updated);
        return;
      } else if (updated.sourceType === 'firebase') {
        if (firebaseUser && updated.firebaseDocId) {
          try {
            await updateFirebaseCloudTrackMetadata(firebaseUser.uid, updated.firebaseDocId, updated);
          } catch (err) {
            notify(err instanceof Error ? err.message : 'Unable to save track metadata to Firebase Cloud.', 'error');
            return;
          }
        }
        setFirebaseTracks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      }
      setQueue((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      notify(`Saved changes for "${updated.title}".`, 'success');
    },
    [firebaseUser, notify]
  );

  const deleteTrackFromLibrary = useCallback(
    async (trackId: string) => {
      const target = trackMap.get(trackId);
      if (target?.sourceType === 'firebase' || target?.sourceType === 'gdrive') {
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

  // Live 1-second app usage & playback listening time tracker
  useEffect(() => {
    let ticksSinceSave = 0;
    const flush = () => {
      saveActivityStore(activityStoreRef.current);
      ticksSinceSave = 0;
    };

    const timer = window.setInterval(() => {
      const playing = isPlayingRef.current;
      const visible = document.visibilityState === 'visible';
      if (!visible && !playing) return;

      setActivityStore((prev) => {
        const next = tickActivitySecond(prev, playing);
        activityStoreRef.current = next;
        ticksSinceSave += 1;
        if (ticksSinceSave >= 5) {
          saveActivityStore(next);
          ticksSinceSave = 0;
        }
        return next;
      });
    }, 1000);

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.clearInterval(timer);
      flush();
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', flush);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const resetAnalytics = useCallback(() => {
    clearActivityStore();
    const fresh = recordSessionOpen({});
    activityStoreRef.current = fresh;
    setActivityStore(fresh);
    notify('Listening & app usage analytics reset.', 'info');
  }, [notify]);

  const resetLibraryData = useCallback(async () => {
    audioEngine.pause();
    setQueue([]);
    setQueueIndex(-1);
    clearActivityStore();
    const fresh = recordSessionOpen({});
    activityStoreRef.current = fresh;
    setActivityStore(fresh);
    await clearAllLocalData();
    await refreshAllData();
    notify('All local ISAI library data cleared.', 'info');
  }, [notify, refreshAllData]);

  const value: SonoraContextValue = {
    tracks,
    localTracks,
    firebaseTracks,
    driveTracks,
    trackMap,
    playlists,
    history,
    activityStore,
    resetAnalytics,
    aiMemory,
    settings,
    isLoadingData,
    isOnline,
    firebaseUser,
    isFirebaseConnected,
    isDriveConnected,
    needsDriveReconnect,
    isFirebaseSigningIn,
    isSyncingCloud,
    cloudUploadProgress,
    isDeletingAllFirebase,
    firebaseDeleteProgress,
    hideLegacyFirebaseTracks,
    setHideLegacyFirebaseTracks,
    deleteAllFirebaseTracks,
    pendingCloudDeleteTrack,
    pendingDriveUpdateTrack,
    connectFirebaseCloud,
    disconnectFirebaseCloud,
    refreshDriveLibrary,
    uploadFilesToCloud,
    requestDeleteCloudTrack,
    confirmDeleteCloudTrack,
    cancelDeleteCloudTrack: () => setPendingCloudDeleteTrack(null),
    confirmDriveUpdateTrack,
    cancelDriveUpdateTrack: () => setPendingDriveUpdateTrack(null),
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
    reorderUpcomingQueue,
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
