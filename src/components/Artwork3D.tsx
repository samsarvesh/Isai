import React, { useRef, useState } from 'react';
import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from 'motion/react';
import { TrackArtwork } from './TrackArtwork';

interface Artwork3DProps {
  trackId?: string;
  hasArtwork?: boolean;
  artworkUrl?: string;
  title?: string;
  artist?: string;
  isPlaying?: boolean;
  className?: string;
}

const SPRING_CONFIG = { stiffness: 220, damping: 24, mass: 0.65 };

export const Artwork3D: React.FC<Artwork3DProps> = ({
  trackId,
  hasArtwork,
  artworkUrl,
  title = 'ISAI',
  artist = '',
  isPlaying = false,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  // Normalized pointer coords in [-0.5, 0.5]
  const px = useMotionValue(0);
  const py = useMotionValue(0);

  const smoothPx = useSpring(px, SPRING_CONFIG);
  const smoothPy = useSpring(py, SPRING_CONFIG);

  const rotateY = useTransform(smoothPx, [-0.5, 0.5], [-16, 16]);
  const rotateX = useTransform(smoothPy, [-0.5, 0.5], [16, -16]);

  // Parallax shadow shift opposite to tilt
  const shadowX = useTransform(smoothPx, [-0.5, 0.5], [18, -18]);
  const shadowY = useTransform(smoothPy, [-0.5, 0.5], [22, -6]);
  const boxShadow = useMotionTemplate`${shadowX}px ${shadowY}px 65px -10px rgba(0, 0, 0, 0.82), 0 18px 40px -15px color-mix(in srgb, var(--accent) 32%, transparent)`;

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (prefersReducedMotion || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const nx = (e.clientX - rect.left) / rect.width - 0.5;
    const ny = (e.clientY - rect.top) / rect.height - 0.5;
    px.set(Math.max(-0.5, Math.min(0.5, nx)));
    py.set(Math.max(-0.5, Math.min(0.5, ny)));
  };

  const handlePointerEnter = () => {
    if (!prefersReducedMotion) setIsHovered(true);
  };

  const handlePointerLeave = () => {
    setIsHovered(false);
    px.set(0);
    py.set(0);
  };

  const shouldAmbientFloat = Boolean(isPlaying && !isHovered && !prefersReducedMotion);

  return (
    <div
      ref={containerRef}
      onPointerMove={handlePointerMove}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      className={`relative select-none ${className}`}
      style={{ perspective: '1150px' }}
    >
      {/* Ambient 3D floating motion wrapper (disabled on hover or reduced motion) */}
      <motion.div
        style={{ transformStyle: 'preserve-3d' }}
        animate={
          shouldAmbientFloat
            ? {
                rotateX: [2.5, -2.5, 2.5],
                rotateY: [-4.5, 4.5, -4.5],
                y: [-3, 3, -3],
              }
            : { rotateX: 0, rotateY: 0, y: 0 }
        }
        transition={
          shouldAmbientFloat
            ? {
                duration: 7.5,
                repeat: Infinity,
                ease: 'easeInOut',
              }
            : { duration: 0.45, ease: 'easeOut' }
        }
      >
        {/* Interactive pointer-tracked 3D card */}
        <motion.div
          style={{
            transformStyle: 'preserve-3d',
            rotateX: prefersReducedMotion ? 0 : rotateX,
            rotateY: prefersReducedMotion ? 0 : rotateY,
            boxShadow,
          }}
          className="relative rounded-3xl"
        >
          {/* Layer -3: Accent-tinted deep studio halo behind artwork */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -inset-3 rounded-[28px] opacity-55 blur-2xl"
            style={{
              transform: 'translateZ(-42px)',
              background:
                'radial-gradient(circle at 50% 50%, color-mix(in srgb, var(--accent) 42%, transparent) 0%, transparent 72%)',
            }}
          />

          {/* Layer -2: Physical 3D sleeve thickness / backing plate */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-3xl bg-zinc-950/95 border border-white/10"
            style={{ transform: 'translateZ(-16px) scale(0.985)' }}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-3xl bg-zinc-900/90 border border-white/15"
            style={{ transform: 'translateZ(-8px) scale(0.992)' }}
          />

          {/* Layer 0: Crisp primary album artwork */}
          <div style={{ transform: 'translateZ(0px)' }} className="relative rounded-3xl overflow-hidden">
            <TrackArtwork
              trackId={trackId}
              hasArtwork={hasArtwork}
              artworkUrl={artworkUrl}
              title={title}
              artist={artist}
              size="xl"
              className="border-white/15"
            />
          </div>

          {/* Layer +1: Elevated 3D beveled edge highlight */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-3xl ring-1 ring-inset ring-white/20"
            style={{ transform: 'translateZ(10px)' }}
          />
        </motion.div>
      </motion.div>
    </div>
  );
};
