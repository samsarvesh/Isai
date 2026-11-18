import React from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { useSonora } from '../contexts/SonoraContext';

export const ConfirmCloudDeleteModal: React.FC = () => {
  const { pendingCloudDeleteTrack, confirmDeleteCloudTrack, cancelDeleteCloudTrack } = useSonora();

  if (!pendingCloudDeleteTrack) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cloud-delete-title"
        className="w-full max-w-md rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-2xl space-y-4"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 text-rose-400">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <h2 id="cloud-delete-title" className="text-base font-bold text-[var(--text-primary)]">
              Delete from Firebase Cloud?
            </h2>
          </div>
          <button
            onClick={cancelDeleteCloudTrack}
            aria-label="Cancel deletion"
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-hover)] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
          This will permanently delete{' '}
          <strong className="text-[var(--text-primary)]">{pendingCloudDeleteTrack.title}</strong> (
          {pendingCloudDeleteTrack.fileName}) and its audio chunks from your Firebase Cloud library.
        </p>

        <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
          <button
            onClick={cancelDeleteCloudTrack}
            className="px-4 py-2 rounded-lg border border-[var(--border-subtle)] text-sm font-medium hover:bg-[var(--bg-hover)] cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={() => void confirmDeleteCloudTrack()}
            className="px-4 py-2 rounded-lg bg-rose-600 text-white text-sm font-semibold hover:bg-rose-500 cursor-pointer"
          >
            Delete from Cloud
          </button>
        </div>
      </div>
    </div>
  );
};
