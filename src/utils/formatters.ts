import type { AudioAvailability, Playlist, Track } from '../types/music';

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00';
  const total = Math.floor(seconds);
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export function formatListeningHours(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  return remMins > 0 ? `${hrs}h ${remMins}m` : `${hrs}h`;
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '—';
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return `${Math.round(bytes / 1024)} KB`;
  return `${mb.toFixed(1)} MB`;
}

export function getTrackAvailability(track: Track, isOnline: boolean): AudioAvailability {
  if (track.sourceType === 'local') return 'local';
  if (!isOnline) return 'unavailable-offline';
  return track.sourceType === 'gdrive' ? 'gdrive' : 'firebase';
}

export function exportPlaylistToM3U8(playlist: Playlist, trackMap: Map<string, Track>): string {
  const lines = ['#EXTM3U', `#PLAYLIST:${playlist.name}`];
  for (const id of playlist.trackIds) {
    const track = trackMap.get(id);
    if (!track) continue;
    lines.push(`#EXTINF:${Math.round(track.duration)},${track.artist} - ${track.title}`);
    lines.push(track.fileName);
  }
  return lines.join('\n');
}

export function parseM3U8Matches(content: string, allTracks: Track[]): { matchedIds: string[]; unmatchedCount: number; playlistName?: string } {
  const lines = content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let playlistName: string | undefined;
  const matchedIds: string[] = [];
  const seen = new Set<string>();
  let unmatchedCount = 0;

  let pendingTitle = '';
  for (const line of lines) {
    if (line.startsWith('#PLAYLIST:')) {
      playlistName = line.replace('#PLAYLIST:', '').trim();
      continue;
    }
    if (line.startsWith('#EXTINF:')) {
      const commaIdx = line.indexOf(',');
      pendingTitle = commaIdx !== -1 ? line.slice(commaIdx + 1).trim().toLowerCase() : '';
      continue;
    }
    if (line.startsWith('#')) continue;

    const fileBase = line.split(/[\\/]/).pop()?.toLowerCase() || '';
    const match = allTracks.find(
      (t) =>
        t.fileName.toLowerCase() === fileBase ||
        (t.streamUrl && t.streamUrl === line) ||
        (pendingTitle && `${t.artist} - ${t.title}`.toLowerCase() === pendingTitle) ||
        (pendingTitle && pendingTitle.includes(t.title.toLowerCase()))
    );
    pendingTitle = '';
    if (match && !seen.has(match.id)) {
      seen.add(match.id);
      matchedIds.push(match.id);
    } else if (!match) {
      unmatchedCount++;
    }
  }

  return { matchedIds, unmatchedCount, playlistName };
}

export function downloadTextFile(fileName: string, content: string, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
