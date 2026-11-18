import React, { useMemo, useState } from 'react';
import { Check, ChevronDown, Home, ListMusic, MicVocal, Palette, Settings } from 'lucide-react';
import { BottomPlayer } from './components/BottomPlayer';
import { ConfirmCloudDeleteModal } from './components/ConfirmCloudDeleteModal';
import { EqualizerModal } from './components/EqualizerModal';
import { ErrorBoundary } from './components/ErrorBoundary';
import { FullScreenPlayer } from './components/FullScreenPlayer';
import JellyRadio, { type JellyRadioItem } from './components/JellyRadio';
import { OfflineIndicator } from './components/OfflineIndicator';
import { PWAInstallButton } from './components/PWAInstallButton';
import { QueueDrawer } from './components/QueueDrawer';
import { TrackEditorModal } from './components/TrackEditorModal';
import { SonoraProvider, useSonora } from './contexts/SonoraContext';
import type { NavView } from './types/music';
import { WALLPAPER_PRESETS } from './utils/wallpapers';
import { HomeView } from './views/HomeView';
import { LyricsView } from './views/LyricsView';
import { PlaylistDetailView } from './views/PlaylistDetailView';
import { PlaylistsView } from './views/PlaylistsView';
import { SettingsView } from './views/SettingsView';

const ICON_NAV: Array<{ id: NavView; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'playlists', label: 'Playlists', icon: ListMusic },
  { id: 'settings', label: 'Settings', icon: Settings },
];

const SonoraShell: React.FC = () => {
  const { activeView, setActiveView, toasts, wallpaperId, setWallpaperId } = useSonora();
  const [wallpaperMenuOpen, setWallpaperMenuOpen] = useState(false);

  const renderView = () => {
    switch (activeView) {
      case 'home':
        return <HomeView />;
      case 'playlists':
        return <PlaylistsView />;
      case 'playlist-detail':
        return <PlaylistDetailView />;
      case 'lyrics':
        return <LyricsView />;
      case 'settings':
        return <SettingsView />;
      default:
        return <HomeView />;
    }
  };

  const isHome = activeView === 'home';
  const activeWallpaper = WALLPAPER_PRESETS.find((p) => p.id === wallpaperId) || WALLPAPER_PRESETS[0];

  const jellyNavItems = useMemo<JellyRadioItem[]>(
    () => [
      { value: 'home', icon: <Home className="w-[18px] h-[18px]" />, ariaLabel: 'Home', title: 'Home' },
      { value: 'playlists', icon: <ListMusic className="w-[18px] h-[18px]" />, ariaLabel: 'Playlists', title: 'Playlists' },
      { value: 'lyrics', icon: <MicVocal className="w-[18px] h-[18px]" />, ariaLabel: 'Lyrics', title: 'Lyrics' },
      { value: 'settings', icon: <Settings className="w-[18px] h-[18px]" />, ariaLabel: 'Settings', title: 'Settings' },
    ],
    []
  );

  const activeNavValue = activeView === 'playlist-detail' ? 'playlists' : activeView;

  return (
    <div className="h-dvh w-full flex flex-col bg-[var(--bg-canvas)] text-[var(--text-primary)] overflow-hidden relative">
      {/* Unified 3-Zone Top Bar with iPhone Glass Icon Selector */}
      <header
        className={`h-16 px-4 sm:px-8 grid grid-cols-[1fr_auto_1fr] items-center gap-4 shrink-0 z-30 transition-colors ${
          isHome
            ? 'absolute top-0 left-0 right-0 bg-transparent text-white'
            : 'sticky top-0 border-b border-[var(--border-subtle)] bg-[var(--bg-canvas)]/80 backdrop-blur-xl'
        }`}
      >
        {/* Zone 1: Stylish ISAI Acoustic Wordmark */}
        <div className="flex items-center justify-start">
          <button
            onClick={() => setActiveView('home')}
            className="group inline-flex items-center gap-2.5 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)]"
            aria-label="ISAI Home"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
              className={`shrink-0 transition-transform duration-300 group-hover:scale-105 ${
                isHome ? 'text-white' : 'text-[var(--accent)]'
              }`}
            >
              <rect x="3" y="9" width="2.4" height="6" rx="1.2" fill="currentColor" opacity="0.6" />
              <rect x="7.8" y="5" width="2.4" height="14" rx="1.2" fill="currentColor" opacity="0.9" />
              <rect x="12.6" y="3" width="2.4" height="18" rx="1.2" fill="currentColor" />
              <rect x="17.4" y="7" width="2.4" height="10" rx="1.2" fill="currentColor" opacity="0.75" />
            </svg>
            <span
              className={`font-display text-base sm:text-lg font-bold tracking-[0.28em] uppercase bg-clip-text text-transparent transition-opacity ${
                isHome
                  ? 'bg-gradient-to-r from-white via-white to-white/65'
                  : 'bg-gradient-to-r from-white via-zinc-200 to-zinc-400'
              }`}
            >
              ISAI
            </span>
          </button>
        </div>

        {/* Zone 2: Centered JellyRadio Frosted Glass Navigation (Home, Playlists, Lyrics, Settings) */}
        <nav
          aria-label="Primary navigation"
          className="relative inline-flex items-center rounded-full backdrop-blur-2xl backdrop-saturate-150 border bg-black/30 border-white/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_12px_32px_rgba(0,0,0,0.35)]"
        >
          <JellyRadio
            items={jellyNavItems}
            value={activeNavValue}
            onChange={(val) => {
              setWallpaperMenuOpen(false);
              setActiveView(val as NavView);
            }}
            chipColor="rgba(255, 255, 255, 0.1)"
            activeColor="#f5f5f5"
            textColor="#f5f5f5"
            activeTextColor="#18181b"
            size="md"
            gap={10}
            radius={18}
            swell={0.2}
            barge={6}
            shrink={0.05}
            jelly={1}
            bounce={0.25}
            stagger={22}
            stiffness={580}
            ariaLabel="Primary navigation"
          />
        </nav>

        {/* Zone 3: Single Right Slot (Wallpaper Button on Home / Compact Utility) */}
        <div className="flex items-center justify-end gap-2 shrink-0">
          <OfflineIndicator />
          {!isHome && <PWAInstallButton compact />}

          {isHome && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setWallpaperMenuOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={wallpaperMenuOpen}
                aria-label={`Change background theme (${activeWallpaper.label})`}
                title="Background theme"
                className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-full bg-black/25 hover:bg-black/35 backdrop-blur-2xl backdrop-saturate-150 border border-white/20 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_10px_28px_rgba(0,0,0,0.3)] transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <Palette className="w-4 h-4 text-white/90 shrink-0" />
                <ChevronDown className={`w-3.5 h-3.5 text-white/75 transition-transform ${wallpaperMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {wallpaperMenuOpen && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setWallpaperMenuOpen(false)} />
                  <div
                    role="menu"
                    aria-label="Background theme"
                    className="absolute right-0 mt-2 z-40 w-52 rounded-2xl bg-black/75 backdrop-blur-2xl border border-white/20 p-1.5 shadow-[0_18px_48px_rgba(0,0,0,0.55)]"
                  >
                    {WALLPAPER_PRESETS.map((preset) => {
                      const selected = preset.id === wallpaperId;
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          role="menuitemradio"
                          aria-checked={selected}
                          onClick={() => {
                            setWallpaperId(preset.id);
                            setWallpaperMenuOpen(false);
                          }}
                          className={`w-full flex items-center justify-between gap-2.5 px-3 py-2.5 rounded-xl text-[13px] text-left transition-colors cursor-pointer ${
                            selected
                              ? 'bg-white/20 text-white font-semibold'
                              : 'text-white/85 hover:bg-white/10 hover:text-white'
                          }`}
                        >
                          <span className="flex items-center gap-2.5 min-w-0">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: preset.swatch }}
                            />
                            <span className="truncate">{preset.label}</span>
                          </span>
                          {selected && <Check className="w-3.5 h-3.5 text-white shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Main Content Viewport */}
      <main className={`flex-1 min-h-0 ${isHome ? 'overflow-hidden' : 'overflow-y-auto'}`}>
        {isHome ? (
          renderView()
        ) : (
          <div className="w-full max-w-[1440px] mx-auto px-5 sm:px-10 py-7">
            {renderView()}
          </div>
        )}
      </main>

      {/* Persistent Bottom Player */}
      <BottomPlayer />

      {/* Overlays & Modals */}
      <FullScreenPlayer />
      <QueueDrawer />
      <EqualizerModal />
      <TrackEditorModal />
      <ConfirmCloudDeleteModal />

      {/* Non-blocking Toasts */}
      {toasts.length > 0 && (
        <div className="fixed top-20 right-4 z-[60] space-y-2 max-w-sm pointer-events-none">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`rounded-xl border px-4 py-2.5 text-sm font-medium shadow-lg backdrop-blur-md ${
                toast.tone === 'error'
                  ? 'border-rose-500/40 bg-rose-950/90 text-rose-100'
                  : toast.tone === 'success'
                  ? 'border-emerald-500/40 bg-emerald-950/90 text-emerald-100'
                  : 'border-[var(--border-strong)] bg-[var(--bg-surface)]/95 text-[var(--text-primary)]'
              }`}
            >
              {toast.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default function App() {
  return (
    <ErrorBoundary>
      <SonoraProvider>
        <SonoraShell />
      </SonoraProvider>
    </ErrorBoundary>
  );
}
