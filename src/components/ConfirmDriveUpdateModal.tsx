import React from 'react';
import { Cloud, X } from 'lucide-react';
import { useSonora } from '../contexts/SonoraContext';

export const ConfirmDriveUpdateModal: React.FC = () => {
  const { pendingDriveUpdateTrack, confirmDriveUpdateTrack, cancelDriveUpdateTrack } = useSonora();

  if (!pendingDriveUpdateTrack) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="drive-update-title"
        className="w-full max-w-md rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-2xl space-y-4"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 text-[var(--accent)]">
            <Cloud className="w-5 h-5 shrink-0" />
            <h2 id="drive-update-title" className="text-base font-bold text-[var(--text-primary)]">
              Update Song in Google Drive?
            </h2>
          </div>
          <button
            onClick={cancelDriveUpdateTrack}
            aria-label="Cancel update"
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-hover)] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
          Save updated song metadata and lyrics for{' '}
          <strong className="text-[var(--text-primary)]">{pendingDriveUpdateTrack.title}</strong> to your{' '}
          <span className="font-mono text-[13px]">ISAI Music Locker</span> catalog in Google Drive?
        </p>

        <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
          <button
            onClick={cancelDriveUpdateTrack}
            className="px-4 py-2 rounded-lg border border-[var(--border-subtle)] text-sm font-medium hover:bg-[var(--bg-hover)] cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={() => void confirmDriveUpdateTrack()}
            className="px-4 py-2 rounded-lg bg-[var(--accent)] text-[var(--accent-contrast)] text-sm font-semibold hover:opacity-90 cursor-pointer"
          >
            Confirm Update
          </button>
        </div>
      </div>
    </div>
  );
};
