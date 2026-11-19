import { getArtworkRecord, saveTrackArtwork } from '../db/sonoraDb';

const MIN_HD_DIMENSION = 700;
const inFlightRequests = new Map<string, Promise<string | null>>();
const failedLookupIds = new Set<string>();

async function measureBlobDimensions(blob: Blob): Promise<{ width: number; height: number } | null> {
  const url = URL.createObjectURL(blob);
  try {
    return await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = reject;
      img.src = url;
    });
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Ensures a track has a crisp studio-HD cover (>= 700px).
 * - If IndexedDB already holds a verified HD cover (>= 700px), returns immediately with zero network traffic.
 * - If the embedded MP3 cover is low-resolution (< 700px) or missing, fetches the 1400x1400 master cover
 *   via `/api/hd-artwork`, persists it to IndexedDB, and notifies all mounted TrackArtwork components live.
 */
export async function upgradeTrackArtworkToHdIfNeeded(
  trackId: string,
  title: string,
  artist?: string
): Promise<string | null> {
  if (!trackId || !title || failedLookupIds.has(trackId)) return null;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return null;

  const existingPromise = inFlightRequests.get(trackId);
  if (existingPromise) return existingPromise;

  const task = (async (): Promise<string | null> => {
    try {
      const existing = await getArtworkRecord(trackId);
      if (existing) {
        if (existing.isHd) return null;
        const dims = await measureBlobDimensions(existing.blob);
        if (dims && Math.max(dims.width, dims.height) >= MIN_HD_DIMENSION) {
          // Existing embedded cover is already crisp HD — mark it so we don't re-measure on future opens
          await saveTrackArtwork(trackId, existing.blob, existing.mimeType, true);
          return null;
        }
      }

      const params = new URLSearchParams({
        title: title.trim(),
        artist: (artist || '').trim(),
      });
      const res = await fetch(`/api/hd-artwork?${params.toString()}`);
      if (!res.ok) {
        failedLookupIds.add(trackId);
        return null;
      }

      const blob = await res.blob();
      if (!blob || blob.size < 8000 || !blob.type.startsWith('image/')) {
        failedLookupIds.add(trackId);
        return null;
      }

      // Only replace if the fetched cover is genuinely higher resolution than what we had
      const hdDims = await measureBlobDimensions(blob);
      if (!hdDims || Math.max(hdDims.width, hdDims.height) < MIN_HD_DIMENSION) {
        failedLookupIds.add(trackId);
        return null;
      }

      return await saveTrackArtwork(trackId, blob, blob.type || 'image/jpeg', true);
    } catch {
      return null;
    } finally {
      inFlightRequests.delete(trackId);
    }
  })();

  inFlightRequests.set(trackId, task);
  return task;
}
