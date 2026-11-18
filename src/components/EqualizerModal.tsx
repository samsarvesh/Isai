import React from 'react';
import { RotateCcw, X } from 'lucide-react';
import { useSonora } from '../contexts/SonoraContext';
import { audioEngine } from '../services/audioEngine';
import { EQ_FREQUENCIES, EQ_PRESETS } from '../types/music';
import { AudioVisualizer } from './AudioVisualizer';

export const EqualizerModal: React.FC = () => {
  const { isEqualizerOpen, setIsEqualizerOpen, settings, updateSettings, isPlaying } = useSonora();

  if (!isEqualizerOpen) return null;

  const applyPreset = (name: string) => {
    const gains = EQ_PRESETS[name] || EQ_PRESETS.Flat;
    audioEngine.setEqGains(gains);
    void updateSettings({ eqPreset: name, eqGains: [...gains] });
  };

  const updateBand = (index: number, db: number) => {
    const next = [...settings.eqGains];
    next[index] = db;
    audioEngine.setEqGains(next);
    void updateSettings({ eqPreset: 'Custom', eqGains: next });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-xl font-bold">Acoustic Equalizer &amp; Transitions</h2>
            <p className="text-sm text-[var(--text-muted)]">10-band Web Audio DSP filter bank + crossfade engine</p>
          </div>
          <button
            onClick={() => setIsEqualizerOpen(false)}
            aria-label="Close equalizer"
            className="p-2 rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mb-5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-3">
          <AudioVisualizer isPlaying={isPlaying} height={52} barCount={56} />
        </div>

        {/* Presets */}
        <div className="flex flex-wrap items-center gap-1.5 mb-6">
          {Object.keys(EQ_PRESETS).map((name) => (
            <button
              key={name}
              onClick={() => applyPreset(name)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
                settings.eqPreset === name
                  ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                  : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {name}
            </button>
          ))}
          <button
            onClick={() => applyPreset('Flat')}
            className="ml-auto flex items-center gap-1 px-2.5 py-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" /> Reset
          </button>
        </div>

        {/* 10 Bands */}
        <div className="grid grid-cols-5 sm:grid-cols-10 gap-3 mb-6">
          {EQ_FREQUENCIES.map((freq, i) => {
            const val = settings.eqGains[i] ?? 0;
            return (
              <div key={freq} className="flex flex-col items-center gap-2">
                <span className="text-[13px] font-mono tabular-nums text-[var(--text-secondary)]">
                  {val > 0 ? `+${val}` : val}dB
                </span>
                <input
                  type="range"
                  min={-12}
                  max={12}
                  step={1}
                  value={val}
                  onChange={(e) => updateBand(i, parseInt(e.target.value, 10))}
                  aria-label={`${freq} Hz gain`}
                  className="h-28 w-2 accent-[var(--accent)] cursor-pointer [writing-mode:vertical-lr] [direction:rtl]"
                />
                <span className="text-[13px] font-mono text-[var(--text-muted)]">
                  {freq >= 1000 ? `${freq / 1000}k` : freq}
                </span>
              </div>
            );
          })}
        </div>

        {/* Crossfade & Gapless */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-[var(--border-subtle)]">
          <div>
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="font-medium">Crossfade Duration</span>
              <span className="font-mono tabular-nums text-[var(--text-muted)]">{settings.crossfadeSeconds}s</span>
            </div>
            <input
              type="range"
              min={0}
              max={10}
              step={1}
              value={settings.crossfadeSeconds}
              onChange={(e) => void updateSettings({ crossfadeSeconds: parseInt(e.target.value, 10) })}
              className="w-full accent-[var(--accent)] cursor-pointer"
            />
          </div>

          <label className="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-elevated)] cursor-pointer">
            <div>
              <p className="text-sm font-medium">Gapless &amp; Smart Shuffle</p>
              <p className="text-[13px] text-[var(--text-muted)]">Avoid consecutive same-artist repeats</p>
            </div>
            <input
              type="checkbox"
              checked={settings.smartShuffle}
              onChange={(e) => void updateSettings({ smartShuffle: e.target.checked })}
              className="w-4 h-4 accent-[var(--accent)]"
            />
          </label>
        </div>
      </div>
    </div>
  );
};
