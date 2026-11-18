import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useSonora } from '../contexts/SonoraContext';
import type { MoodType, MusicLanguage } from '../types/music';

const ALL_MOODS: MoodType[] = ['Happy', 'Sad', 'Romantic', 'Relaxed', 'Energetic', 'Focus', 'Nostalgic', 'Motivational'];
const ALL_LANGUAGES: MusicLanguage[] = ['English', 'Tamil', 'Hindi', 'Malayalam', 'Telugu', 'Instrumental', 'Other'];

export const TrackEditorModal: React.FC = () => {
  const { editingTrack, setEditingTrack, saveTrackEdits } = useSonora();

  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [album, setAlbum] = useState('');
  const [genre, setGenre] = useState('');
  const [year, setYear] = useState('');
  const [language, setLanguage] = useState<MusicLanguage>('English');
  const [moods, setMoods] = useState<MoodType[]>([]);

  useEffect(() => {
    if (editingTrack) {
      setTitle(editingTrack.title);
      setArtist(editingTrack.artist);
      setAlbum(editingTrack.album);
      setGenre(editingTrack.genre);
      setYear(editingTrack.year ? String(editingTrack.year) : '');
      setLanguage(editingTrack.language);
      setMoods(editingTrack.moods);
    }
  }, [editingTrack]);

  if (!editingTrack) return null;

  const toggleMood = (mood: MoodType) => {
    setMoods((prev) => (prev.includes(mood) ? prev.filter((m) => m !== mood) : [...prev, mood]));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await saveTrackEdits({
      ...editingTrack,
      title: title.trim() || editingTrack.title,
      artist: artist.trim() || 'Unknown Artist',
      album: album.trim() || 'Single',
      genre: genre.trim() || 'Personal Audio',
      year: year.trim() ? parseInt(year, 10) || undefined : undefined,
      language,
      moods: moods.length > 0 ? moods : ['Relaxed'],
    });
    setEditingTrack(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="w-full max-w-lg rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-2xl max-h-[90vh] overflow-y-auto space-y-4"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Edit Song Metadata</h2>
          <button
            type="button"
            onClick={() => setEditingTrack(null)}
            aria-label="Close editor"
            className="p-2 rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block sm:col-span-2">
            <span className="text-sm font-medium text-[var(--text-secondary)]">Title</span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 text-sm"
              required
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-[var(--text-secondary)]">Artist</span>
            <input
              type="text"
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-[var(--text-secondary)]">Album</span>
            <input
              type="text"
              value={album}
              onChange={(e) => setAlbum(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-[var(--text-secondary)]">Genre</span>
            <input
              type="text"
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-[var(--text-secondary)]">Year</span>
            <input
              type="number"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 text-sm font-mono"
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="text-sm font-medium text-[var(--text-secondary)]">Language</span>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as MusicLanguage)}
              className="mt-1 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 text-sm"
            >
              {ALL_LANGUAGES.map((lang) => (
                <option key={lang} value={lang}>
                  {lang}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div>
          <span className="text-sm font-medium text-[var(--text-secondary)] block mb-2">Mood Classification</span>
          <div className="flex flex-wrap gap-1.5">
            {ALL_MOODS.map((m) => {
              const active = moods.includes(m);
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => toggleMood(m)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                    active
                      ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                      : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {m}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-[var(--border-subtle)]">
          <button
            type="button"
            onClick={() => setEditingTrack(null)}
            className="px-4 py-2 rounded-lg text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-2 rounded-lg bg-[var(--accent)] text-[var(--accent-contrast)] text-sm font-semibold cursor-pointer"
          >
            Save Changes
          </button>
        </div>
      </form>
    </div>
  );
};
