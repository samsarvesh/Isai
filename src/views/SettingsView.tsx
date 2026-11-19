import React, { useRef, useState } from 'react';
import {
  Cloud,
  Download,
  Keyboard,
  Loader2,
  LogOut,
  Palette,
  ShieldCheck,
  Smartphone,
  Trash2,
  Upload,
} from 'lucide-react';
import { GoogleSignInButton } from '../components/GoogleSignInButton';
import { PWAInstallButton } from '../components/PWAInstallButton';
import { useSonora } from '../contexts/SonoraContext';
import { exportBackupJson, importBackupJson } from '../db/sonoraDb';
import { ACCENT_COLORS, type AccentPreset } from '../types/music';
import { downloadTextFile } from '../utils/formatters';

export const SettingsView: React.FC = () => {
  const {
    settings,
    tracks,
    localTracks,
    firebaseTracks,
    driveTracks,
    playlists,
    firebaseUser,
    isFirebaseConnected,
    isDriveConnected,
    needsDriveReconnect,
    isFirebaseSigningIn,
    isSyncingCloud,
    isDeletingAllFirebase,
    firebaseDeleteProgress,
    hideLegacyFirebaseTracks,
    setHideLegacyFirebaseTracks,
    deleteAllFirebaseTracks,
    connectFirebaseCloud,
    disconnectFirebaseCloud,
    refreshDriveLibrary,
    updateSettings,
    refreshAllData,
    resetLibraryData,
    setIsEqualizerOpen,
    notify,
  } = useSonora();

  const backupInputRef = useRef<HTMLInputElement | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmPurgeFirebase, setConfirmPurgeFirebase] = useState(false);

  const handleExportBackup = async () => {
    const json = await exportBackupJson();
    downloadTextFile(`isai-backup-${new Date().toISOString().slice(0, 10)}.json`, json, 'application/json');
    notify('Backup exported cleanly (playlists, preferences, lyrics, and history).', 'success');
  };

  const handleImportBackup = async (file: File) => {
    try {
      const raw = await file.text();
      const res = await importBackupJson(raw);
      await refreshAllData();
      notify(
        `Restored ${res.restoredPlaylists} playlist(s) and metadata for ${res.restoredTracksMeta} matching local track(s).`,
        'success'
      );
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Invalid backup file.', 'error');
    }
  };

  return (
    <div className="w-full space-y-6">
      <input
        ref={backupInputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleImportBackup(f);
        }}
      />

      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 pb-3 border-b border-[var(--border-subtle)]">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Settings</h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            Accent color, audio playback, Google Drive Music Locker, backup, and installation
          </p>
        </div>
        <p className="text-sm font-mono tabular-nums text-[var(--text-muted)]">
          {tracks.length} songs · {playlists.length} playlists
        </p>
      </div>

      {/* Full-Width Balanced 2-Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        {/* Accent Color (Themes removed per user preference) */}
        <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 flex flex-col justify-between gap-5">
          <div>
            <div className="flex items-center gap-2.5">
              <Palette className="w-5 h-5 text-[var(--accent)]" />
              <h2 className="text-lg font-bold">Accent Color</h2>
            </div>
            <p className="text-sm text-[var(--text-muted)] mt-1">
              Highlight color used across playback controls, sliders, and active highlights
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {(Object.keys(ACCENT_COLORS) as AccentPreset[]).map((key) => {
              const preset = ACCENT_COLORS[key];
              return (
                <button
                  key={key}
                  onClick={() => void updateSettings({ accent: key })}
                  className={`flex items-center gap-2.5 px-3.5 py-3 rounded-xl text-sm font-medium cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
                    settings.accent === key
                      ? 'bg-[var(--accent-soft)] ring-1 ring-[var(--accent)] text-[var(--text-primary)]'
                      : 'bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)]'
                  }`}
                >
                  <span
                    className="w-3.5 h-3.5 rounded-full shrink-0"
                    style={{ backgroundColor: preset.dark }}
                  />
                  <span className="truncate">{preset.label}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Audio & Playback */}
        <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 flex flex-col justify-between gap-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">Playback &amp; Equalizer</h2>
              <p className="text-sm text-[var(--text-muted)] mt-0.5">
                Transitions, smart shuffle, and 10-band frequency tuning
              </p>
            </div>
            <button
              onClick={() => setIsEqualizerOpen(true)}
              className="px-4 py-2.5 rounded-lg bg-[var(--accent)] text-[var(--accent-contrast)] text-sm font-semibold cursor-pointer whitespace-nowrap shrink-0"
            >
              Open 10-Band EQ
            </button>
          </div>

          <div className="space-y-3.5">
            <label className="flex items-center justify-between py-3 px-4 rounded-xl bg-[var(--bg-elevated)] cursor-pointer gap-3">
              <div>
                <p className="text-sm font-semibold">Smart Shuffle</p>
                <p className="text-[13px] text-[var(--text-muted)]">Prevent back-to-back songs by the same artist</p>
              </div>
              <input
                type="checkbox"
                checked={settings.smartShuffle}
                onChange={(e) => void updateSettings({ smartShuffle: e.target.checked })}
                className="w-4 h-4 accent-[var(--accent)] shrink-0"
              />
            </label>

            <div className="py-3 px-4 rounded-xl bg-[var(--bg-elevated)]">
              <div className="flex justify-between text-sm mb-2">
                <span className="font-semibold">Crossfade</span>
                <span className="font-mono tabular-nums text-[var(--text-muted)]">{settings.crossfadeSeconds}s</span>
              </div>
              <input
                type="range"
                min={0}
                max={10}
                step={1}
                value={settings.crossfadeSeconds}
                onChange={(e) => void updateSettings({ crossfadeSeconds: parseInt(e.target.value, 10) })}
                className="w-full accent-[var(--accent)] cursor-pointer"
              />
            </div>
          </div>
        </section>

        {/* Google Drive Cloud Music Locker */}
        <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 flex flex-col justify-between gap-4">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <Cloud className="w-5 h-5 text-[var(--accent)] mt-0.5 shrink-0" />
              <div>
                <h2 className="text-lg font-bold flex items-center gap-2">
                  Google Drive Music Locker
                  {isSyncingCloud && <Loader2 className="w-4 h-4 animate-spin text-[var(--accent)]" />}
                </h2>
                <p className="text-sm text-[var(--text-secondary)] mt-1 leading-relaxed">
                  {isFirebaseConnected
                    ? `Signed in as ${firebaseUser?.email || 'Google Account'} · ${driveTracks.length} Google Drive song(s) ready${
                        firebaseTracks.length > 0 ? ` · ${firebaseTracks.length} legacy Firebase song(s)` : ''
                      }. You stay signed in until you click Sign Out.`
                    : 'Connect your Google Drive to bulk-upload hundreds of MP3, FLAC, M4A, or WAV songs using your own Drive storage (15 GB+) with no daily Firestore write limits.'}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {!isFirebaseConnected ? (
                <GoogleSignInButton
                  onClick={() => void connectFirebaseCloud()}
                  loading={isFirebaseSigningIn}
                  label="Connect Google Drive"
                />
              ) : (
                <>
                  <button
                    onClick={() => void refreshDriveLibrary()}
                    disabled={isSyncingCloud || isFirebaseSigningIn}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[var(--bg-elevated)] text-sm text-[var(--text-primary)] hover:bg-[var(--bg-hover)] disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    Sync Drive
                  </button>
                  <button
                    onClick={() => void disconnectFirebaseCloud()}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[var(--bg-elevated)] text-sm text-rose-400 hover:bg-[var(--bg-hover)] cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <LogOut className="w-4 h-4" /> Sign Out
                  </button>
                </>
              )}
            </div>
          </div>
          <p className="text-[13px] text-[var(--text-muted)] pt-3 border-t border-[var(--border-subtle)] leading-relaxed">
            ISAI only accesses files it creates inside your dedicated <code className="font-mono">ISAI Music Locker</code> Google Drive folder (least-privilege <code className="font-mono">drive.file</code> access).
          </p>

          {firebaseTracks.length > 0 && (
            <div className="pt-3 border-t border-[var(--border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="text-xs text-[var(--text-secondary)]">
                <span className="font-semibold text-rose-300">
                  {firebaseTracks.length} legacy Firebase Cloud song{firebaseTracks.length === 1 ? '' : 's'}
                </span>
                {firebaseDeleteProgress
                  ? ` · Removing ${firebaseDeleteProgress.done} / ${firebaseDeleteProgress.total} (${firebaseDeleteProgress.title})`
                  : hideLegacyFirebaseTracks
                  ? ' · Hidden from library'
                  : ' · Delete them permanently from Firestore'}
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {isDeletingAllFirebase ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/20 text-rose-300 text-xs font-semibold">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Removing...
                  </span>
                ) : !confirmPurgeFirebase ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setConfirmPurgeFirebase(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-xs font-semibold cursor-pointer whitespace-nowrap"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Remove All Firebase Songs
                    </button>
                    <button
                      type="button"
                      onClick={() => setHideLegacyFirebaseTracks(!hideLegacyFirebaseTracks)}
                      className="px-3 py-1.5 rounded-lg bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] text-xs text-[var(--text-secondary)] cursor-pointer whitespace-nowrap"
                    >
                      {hideLegacyFirebaseTracks ? 'Show' : 'Hide'}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmPurgeFirebase(false);
                        void deleteAllFirebaseTracks();
                      }}
                      className="px-3 py-1.5 rounded-lg bg-rose-500 hover:bg-rose-600 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
                    >
                      Confirm Delete ({firebaseTracks.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmPurgeFirebase(false)}
                      className="px-3 py-1.5 rounded-lg bg-[var(--bg-elevated)] text-xs text-[var(--text-secondary)] cursor-pointer whitespace-nowrap"
                    >
                      Cancel
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </section>

        {/* Backup, Restore & Privacy */}
        <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 flex flex-col justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="w-5 h-5 text-[var(--accent)]" />
              <h2 className="text-lg font-bold">Backup, Restore &amp; Privacy</h2>
            </div>
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
              {driveTracks.length} Google Drive song(s), {localTracks.length} local track(s)
              {firebaseTracks.length > 0 ? `, ${firebaseTracks.length} Firebase track(s)` : ''}, {playlists.length} playlist(s), LRC lyrics, and preferences are stored privately on your device and Google account.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 pt-2">
            <button
              onClick={() => void handleExportBackup()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] text-sm font-medium cursor-pointer whitespace-nowrap shrink-0"
            >
              <Download className="w-4 h-4" /> Export Backup
            </button>
            <button
              onClick={() => backupInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] text-sm font-medium cursor-pointer whitespace-nowrap shrink-0"
            >
              <Upload className="w-4 h-4" /> Restore Backup
            </button>

            {!confirmReset ? (
              <button
                onClick={() => setConfirmReset(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm text-rose-400 hover:bg-[var(--bg-hover)] cursor-pointer ml-auto whitespace-nowrap shrink-0"
              >
                <Trash2 className="w-4 h-4" /> Clear Local Data
              </button>
            ) : (
              <div className="flex items-center gap-2 ml-auto">
                <span className="text-sm text-rose-400">Clear IndexedDB?</span>
                <button
                  onClick={() => {
                    void resetLibraryData();
                    setConfirmReset(false);
                  }}
                  className="px-3.5 py-1.5 rounded-lg bg-rose-600 text-white text-sm font-semibold cursor-pointer"
                >
                  Confirm
                </button>
                <button
                  onClick={() => setConfirmReset(false)}
                  className="px-3.5 py-1.5 rounded-lg text-sm text-[var(--text-secondary)] cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </section>

        {/* Install PWA & Platform Notes */}
        <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 flex flex-col justify-between gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <Smartphone className="w-5 h-5 text-[var(--accent)] shrink-0" />
              <div>
                <h2 className="text-lg font-bold">Install App (Windows &amp; Android)</h2>
                <p className="text-sm text-[var(--text-muted)]">
                  Run ISAI standalone with offline audio playback
                </p>
              </div>
            </div>
            <PWAInstallButton compact />
          </div>

          <div className="text-sm text-[var(--text-secondary)] space-y-1.5 pt-3 border-t border-[var(--border-subtle)] leading-relaxed">
            <p>
              <strong>Desktop:</strong> Click &ldquo;Install ISAI App&rdquo; in Edge/Chrome to launch ISAI as a dedicated window.
            </p>
            <p>
              <strong>Mobile:</strong> Open in Chrome (Android) or Safari Share &rarr; &ldquo;Add to Home Screen&rdquo; (iOS) for background &amp; lock-screen playback controls.
            </p>
          </div>
        </section>

        {/* Keyboard Shortcuts Reference */}
        <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 space-y-4">
          <div className="flex items-center gap-2.5">
            <Keyboard className="w-5 h-5 text-[var(--accent)]" />
            <h2 className="text-lg font-bold">Keyboard Shortcuts</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5 text-sm">
            {[
              ['Space', 'Play / Pause'],
              ['Up / Down', 'Volume ±5%'],
              ['Left / Right', 'Seek ±5 seconds'],
              ['N / P', 'Next / Previous'],
              ['M', 'Mute / Unmute'],
              ['L', 'Open Lyrics'],
              ['F', 'Full-screen Player'],
              ['S', 'Toggle Shuffle'],
              ['R', 'Cycle Repeat'],
            ].map(([key, action]) => (
              <div key={key} className="flex items-center justify-between py-2 border-b border-[var(--border-subtle)]">
                <span className="text-[var(--text-secondary)]">{action}</span>
                <kbd className="font-mono text-[13px] font-semibold text-[var(--text-primary)]">{key}</kbd>
              </div>
            ))}
          </div>
        </section>
      </div>

      <footer className="!mt-4 pt-3 border-t border-[var(--border-subtle)] text-center space-y-0.5">
        <p className="text-xs font-medium text-[var(--text-secondary)]">Created by Sam Sarvesh</p>
        <p className="text-[11px] text-[var(--text-muted)]">
          Made with <span className="text-rose-400" aria-label="love">❤</span> in India
        </p>
      </footer>
    </div>
  );
};
