import React, { useEffect, useState } from 'react';
import { Disc3 } from 'lucide-react';
import { getArtworkUrl } from '../db/sonoraDb';

interface TrackArtworkProps {
  trackId?: string;
  hasArtwork?: boolean;
  artworkUrl?: string;
  title?: string;
  artist?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<TrackArtworkProps['size']>, string> = {
  xs: 'w-9 h-9 rounded-md',
  sm: 'w-11 h-11 rounded-lg',
  md: 'w-14 h-14 rounded-lg',
  lg: 'w-24 h-24 rounded-xl',
  xl: 'w-full aspect-square rounded-3xl',
};

const PALETTES = [
  'from-amber-900/50 via-stone-900 to-zinc-950',
  'from-slate-800 via-zinc-900 to-neutral-950',
  'from-emerald-950/70 via-zinc-900 to-neutral-950',
  'from-indigo-950/70 via-slate-900 to-zinc-950',
  'from-rose-950/60 via-neutral-900 to-zinc-950',
];

export const TrackArtwork: React.FC<TrackArtworkProps> = ({
  trackId,
  hasArtwork,
  artworkUrl,
  title = 'ISAI',
  artist = '',
  size = 'sm',
  className = '',
}) => {
  const [src, setSrc] = useState<string | null>(artworkUrl || null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let mounted = true;
    setFailed(false);
    if (artworkUrl) {
      setSrc(artworkUrl);
      return;
    }
    if (!trackId || !hasArtwork) {
      setSrc(null);
      return;
    }
    void getArtworkUrl(trackId).then((url) => {
      if (mounted) setSrc(url);
    });
    return () => {
      mounted = false;
    };
  }, [trackId, hasArtwork, artworkUrl]);

  const paletteIndex = (title.charCodeAt(0) + (artist?.charCodeAt(0) || 0)) % PALETTES.length;

  return (
    <div
      className={`relative shrink-0 overflow-hidden border border-[var(--border-subtle)] bg-gradient-to-br ${PALETTES[paletteIndex]} flex items-center justify-center ${SIZE_CLASSES[size]} ${className}`}
    >
      {src && !failed ? (
        <img
          src={src}
          alt={`${title} artwork`}
          referrerPolicy="no-referrer"
          loading="lazy"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex flex-col items-center justify-center text-white/60 select-none">
          <Disc3 className={size === 'xl' ? 'w-14 h-14' : size === 'lg' ? 'w-8 h-8' : 'w-4 h-4'} />
        </div>
      )}
    </div>
  );
};
