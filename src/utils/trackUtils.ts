import type { Track } from '../types/music';

export function findSimilarTracks(seed: Track, allTracks: Track[], limit = 12): Track[] {
  return allTracks
    .filter((t) => t.id !== seed.id)
    .map((t) => {
      let sim = 0;
      if (t.artist.toLowerCase() === seed.artist.toLowerCase()) sim += 35;
      if (t.genre.toLowerCase() === seed.genre.toLowerCase()) sim += 25;
      if (t.language === seed.language) sim += 20;
      const sharedMoods = t.moods.filter((m) => seed.moods.includes(m)).length;
      sim += sharedMoods * 18;
      sim += Math.round((1 - Math.abs(t.energy - seed.energy)) * 15);
      return { track: t, sim };
    })
    .sort((a, b) => b.sim - a.sim)
    .slice(0, limit)
    .map((x) => x.track);
}

export function fisherYatesShuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Smart Shuffle avoids placing two consecutive tracks by the same artist or album
export function smartShuffleTracks(tracks: Track[], currentTrackId?: string): Track[] {
  const pool = fisherYatesShuffle(tracks.filter((t) => t.id !== currentTrackId));

  const result: Track[] = [];
  const remaining = [...pool];

  while (remaining.length > 0) {
    const prev = result[result.length - 1];
    let pickIdx = 0;
    if (prev) {
      const differentArtistIdx = remaining.findIndex(
        (t) => t.artist.toLowerCase() !== prev.artist.toLowerCase() && t.album.toLowerCase() !== prev.album.toLowerCase()
      );
      if (differentArtistIdx !== -1) {
        pickIdx = differentArtistIdx;
      } else {
        const diffArtistOnly = remaining.findIndex((t) => t.artist.toLowerCase() !== prev.artist.toLowerCase());
        if (diffArtistOnly !== -1) pickIdx = diffArtistOnly;
      }
    }
    result.push(remaining.splice(pickIdx, 1)[0]);
  }

  return result;
}
