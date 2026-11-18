import React, { useState } from 'react';
import { Download, Share, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        onClick={() => void install()}
        className={`flex items-center justify-center gap-2 rounded-lg bg-[var(--accent)] text-[var(--accent-contrast)] font-medium transition-opacity hover:opacity-90 whitespace-nowrap shrink-0 cursor-pointer ${
          compact ? 'px-3.5 py-1.5 text-[13px] min-h-[40px]' : 'px-4 py-2.5 text-sm w-full min-h-[42px]'
        }`}
      >
        <Download className="w-4 h-4" />
        <span>Install ISAI App</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          className="flex items-center justify-center gap-2 rounded-lg border border-[var(--border-strong)] px-3.5 py-2 text-[13px] font-medium text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors whitespace-nowrap shrink-0 min-h-[40px] cursor-pointer"
        >
          <Share className="w-4 h-4" />
          <span>Install on iOS</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="w-full max-w-sm rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-2xl">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-semibold text-[var(--text-primary)]">Install ISAI on iPhone / iPad</h3>
                <button
                  onClick={() => setShowIOSGuide(false)}
                  aria-label="Close installation guide"
                  className="p-2 rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <ol className="space-y-2 text-sm text-[var(--text-secondary)] list-decimal list-inside">
                <li>Tap the <strong>Share</strong> icon in Safari&apos;s toolbar.</li>
                <li>Scroll down and tap <strong>Add to Home Screen</strong>.</li>
                <li>Launch ISAI from your home screen for standalone offline playback.</li>
              </ol>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full rounded-lg bg-[var(--accent)] text-[var(--accent-contrast)] py-2.5 text-sm font-medium cursor-pointer"
              >
                Got it
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
