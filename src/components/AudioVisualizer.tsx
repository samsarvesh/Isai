import React, { useEffect, useRef } from 'react';
import { audioEngine } from '../services/audioEngine';

interface AudioVisualizerProps {
  isPlaying: boolean;
  height?: number;
  barCount?: number;
  className?: string;
}

export const AudioVisualizer: React.FC<AudioVisualizerProps> = ({
  isPlaying,
  height = 42,
  barCount = 48,
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const sampleCount = Math.max(36, barCount);
    const smoothedWave = new Float32Array(sampleCount);

    const draw = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const nextW = Math.round(rect.width * dpr);
        const nextH = Math.round(rect.height * dpr);
        if (canvas.width !== nextW || canvas.height !== nextH) {
          canvas.width = nextW;
          canvas.height = nextH;
        }
      }

      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      if (w <= 0 || h <= 0) {
        if (isPlaying && !prefersReduced) rafId = requestAnimationFrame(draw);
        return;
      }

      const accent =
        getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#e5a038';
      const timeData = audioEngine.getTimeDomainData();
      const freqData = audioEngine.getFrequencyData();

      // Measure RMS audio energy for dynamic envelope scaling
      let energy = 0;
      if (isPlaying && !prefersReduced && freqData && freqData.length > 0) {
        let sum = 0;
        const limit = Math.min(freqData.length, 48);
        for (let i = 0; i < limit; i++) {
          sum += freqData[i];
        }
        energy = sum / (limit * 255);
      }

      const midY = h * 0.5;
      const maxAmp = h * 0.44;
      const nowSec = performance.now() * 0.001;

      const topPoints: { x: number; y: number }[] = [];
      const botPoints: { x: number; y: number }[] = [];

      for (let i = 0; i < sampleCount; i++) {
        const norm = i / (sampleCount - 1);
        // Hann window ensures smooth natural taper at left and right edges
        const windowFactor = Math.sin(Math.PI * norm);
        let rawVal = 0;

        if (isPlaying && !prefersReduced) {
          if (timeData && timeData.length > 0 && energy > 0.015) {
            const idx = Math.min(timeData.length - 1, Math.floor(norm * (timeData.length - 1)));
            // Normalize byte sample [-1, 1] and combine with subtle low-frequency envelope
            const sample = (timeData[idx] - 128) / 128;
            const freqIdx = Math.min((freqData?.length || 1) - 1, Math.floor(norm * ((freqData?.length || 1) * 0.55)));
            const bandAmp = freqData ? (freqData[freqIdx] / 255) * 0.55 : 0;
            rawVal = (sample * 1.45 + Math.sin(norm * Math.PI * 5 + nowSec * 6) * bandAmp * 0.55) * windowFactor;
          } else {
            // Ultra-subtle breathing line when track is quiet or silent intro
            rawVal = Math.sin(nowSec * 3.2 + norm * 7.5) * 0.08 * windowFactor;
          }
        }

        const clamped = Math.max(-1, Math.min(1, rawVal));
        const attack = Math.abs(clamped) > Math.abs(smoothedWave[i]) ? 0.42 : 0.18;
        smoothedWave[i] = smoothedWave[i] + (clamped - smoothedWave[i]) * attack;

        const x = norm * w;
        const offset = smoothedWave[i] * maxAmp;
        topPoints.push({ x, y: midY - Math.abs(offset) * 0.85 - offset * 0.25 });
        botPoints.push({ x, y: midY + Math.abs(offset) * 0.85 - offset * 0.25 });
      }

      // Soft translucent acoustic ribbon fill between upper & lower wave envelopes
      const fillGrad = ctx.createLinearGradient(0, midY - maxAmp, 0, midY + maxAmp);
      fillGrad.addColorStop(0, accent);
      fillGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.22)');
      fillGrad.addColorStop(1, accent);

      ctx.beginPath();
      ctx.moveTo(topPoints[0].x, topPoints[0].y);
      for (let i = 1; i < topPoints.length - 1; i++) {
        const xc = (topPoints[i].x + topPoints[i + 1].x) * 0.5;
        const yc = (topPoints[i].y + topPoints[i + 1].y) * 0.5;
        ctx.quadraticCurveTo(topPoints[i].x, topPoints[i].y, xc, yc);
      }
      ctx.lineTo(topPoints[topPoints.length - 1].x, topPoints[topPoints.length - 1].y);

      for (let i = botPoints.length - 1; i > 0; i--) {
        const xc = (botPoints[i].x + botPoints[i - 1].x) * 0.5;
        const yc = (botPoints[i].y + botPoints[i - 1].y) * 0.5;
        ctx.quadraticCurveTo(botPoints[i].x, botPoints[i].y, xc, yc);
      }
      ctx.closePath();

      ctx.fillStyle = fillGrad;
      ctx.globalAlpha = isPlaying ? 0.26 : 0.1;
      ctx.fill();

      // Crisp luminous primary waveform trace along the center
      ctx.beginPath();
      for (let i = 0; i < sampleCount; i++) {
        const x = (i / (sampleCount - 1)) * w;
        const y = midY + smoothedWave[i] * maxAmp;
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          const prevX = ((i - 1) / (sampleCount - 1)) * w;
          const prevY = midY + smoothedWave[i - 1] * maxAmp;
          ctx.quadraticCurveTo(prevX, prevY, (prevX + x) * 0.5, (prevY + y) * 0.5);
        }
      }
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.8 * dpr;
      ctx.globalAlpha = isPlaying ? 0.92 : 0.35;
      ctx.stroke();

      ctx.globalAlpha = 1;

      if (isPlaying && !prefersReduced) {
        rafId = requestAnimationFrame(draw);
      }
    };

    draw();
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [barCount, isPlaying]);

  return (
    <canvas
      ref={canvasRef}
      style={{ height }}
      className={`w-full block [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)] ${className}`}
      aria-label="Real-time audio waveform visualizer"
    />
  );
};
