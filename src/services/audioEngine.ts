import { getAudioBlob } from '../db/sonoraDb';
import { auth } from './firebaseClient';
import { fetchFirebaseCloudAudioBlob } from './firebaseMusicService';
import { EQ_FREQUENCIES, type Track } from '../types/music';

type DeckName = 'A' | 'B';

export interface EngineCallbacks {
  onTimeUpdate: (time: number, duration: number) => void;
  onTrackEnded: () => void;
  onPlayStateChange: (isPlaying: boolean) => void;
  onError: (message: string) => void;
}

class SonoraAudioEngine {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private masterGain: GainNode | null = null;
  private eqFilters: BiquadFilterNode[] = [];
  private freqData: Uint8Array<ArrayBuffer> | null = null;
  private timeData: Uint8Array<ArrayBuffer> | null = null;

  private decks: Record<
    DeckName,
    {
      el: HTMLAudioElement;
      source: MediaElementAudioSourceNode | null;
      gain: GainNode | null;
      objectUrl: string | null;
      corsBound: boolean;
    }
  >;

  private activeDeck: DeckName = 'A';
  private callbacks: EngineCallbacks | null = null;
  private currentVolume = 0.85;
  private currentSpeed = 1;
  private currentEqGains = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  private crossfadeTimer: number | null = null;

  constructor() {
    const createEl = () => {
      const el = new Audio();
      el.preload = 'auto';
      el.crossOrigin = 'anonymous';
      return el;
    };

    this.decks = {
      A: { el: createEl(), source: null, gain: null, objectUrl: null, corsBound: false },
      B: { el: createEl(), source: null, gain: null, objectUrl: null, corsBound: false },
    };

    (['A', 'B'] as DeckName[]).forEach((name) => {
      const el = this.decks[name].el;
      el.addEventListener('timeupdate', () => {
        if (this.activeDeck === name) {
          this.callbacks?.onTimeUpdate(el.currentTime || 0, Number.isFinite(el.duration) ? el.duration : 0);
        }
      });
      el.addEventListener('ended', () => {
        if (this.activeDeck === name) {
          this.callbacks?.onTrackEnded();
        }
      });
      el.addEventListener('play', () => {
        if (this.activeDeck === name) this.callbacks?.onPlayStateChange(true);
      });
      el.addEventListener('pause', () => {
        if (this.activeDeck === name) this.callbacks?.onPlayStateChange(false);
      });
      el.addEventListener('error', () => {
        if (this.activeDeck === name && el.src) {
          this.callbacks?.onError('Unable to decode or reach this audio source.');
        }
      });
    });
  }

  public setCallbacks(cb: EngineCallbacks) {
    this.callbacks = cb;
  }

  private ensureAudioGraph() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
      return;
    }

    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    this.ctx = new AudioCtx();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.currentVolume;

    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.72;
    this.freqData = new Uint8Array(this.analyser.frequencyBinCount);
    this.timeData = new Uint8Array(this.analyser.fftSize);

    // 10-band EQ chain
    this.eqFilters = EQ_FREQUENCIES.map((freq, idx) => {
      const filter = this.ctx!.createBiquadFilter();
      filter.type = idx === 0 ? 'lowshelf' : idx === EQ_FREQUENCIES.length - 1 ? 'highshelf' : 'peaking';
      filter.frequency.value = freq;
      filter.Q.value = 1.2;
      filter.gain.value = this.currentEqGains[idx] ?? 0;
      return filter;
    });

    for (let i = 0; i < this.eqFilters.length - 1; i++) {
      this.eqFilters[i].connect(this.eqFilters[i + 1]);
    }

    const eqInput = this.eqFilters[0];
    const eqOutput = this.eqFilters[this.eqFilters.length - 1];
    eqOutput.connect(this.analyser);
    this.analyser.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);

    (['A', 'B'] as DeckName[]).forEach((name) => {
      const deck = this.decks[name];
      try {
        deck.source = this.ctx!.createMediaElementSource(deck.el);
        deck.gain = this.ctx!.createGain();
        deck.gain.gain.value = name === this.activeDeck ? 1 : 0;
        deck.source.connect(deck.gain);
        deck.gain.connect(eqInput);
        deck.corsBound = true;
      } catch {
        deck.corsBound = false;
      }
    });
  }

  private async resolveSourceUrl(track: Track): Promise<{ url: string; isObjectUrl: boolean }> {
    if (track.sourceType === 'local') {
      const blob = await getAudioBlob(track.id);
      if (!blob) {
        throw new Error('Local audio file is missing from IndexedDB storage.');
      }
      return { url: URL.createObjectURL(blob), isObjectUrl: true };
    }
    if (track.sourceType === 'firebase') {
      const uid = auth.currentUser?.uid;
      if (!uid || !track.firebaseDocId) {
        throw new Error('Sign in with Google to stream your Firebase Cloud tracks.');
      }
      const mime = track.format === 'mp3' ? 'audio/mpeg' : `audio/${track.format}`;
      const blob = await fetchFirebaseCloudAudioBlob(uid, track.firebaseDocId, mime);
      return { url: URL.createObjectURL(blob), isObjectUrl: true };
    }
    throw new Error('Audio source is unavailable.');
  }

  private releaseDeckUrl(name: DeckName) {
    const deck = this.decks[name];
    if (deck.objectUrl) {
      URL.revokeObjectURL(deck.objectUrl);
      deck.objectUrl = null;
    }
  }

  public async playTrack(track: Track, crossfadeSeconds = 0): Promise<void> {
    this.ensureAudioGraph();

    if (this.crossfadeTimer) {
      window.clearInterval(this.crossfadeTimer);
      this.crossfadeTimer = null;
    }

    const outgoingName = this.activeDeck;
    const outgoing = this.decks[outgoingName];
    const shouldCrossfade = crossfadeSeconds > 0 && !outgoing.el.paused && outgoing.el.currentTime > 0;
    const incomingName: DeckName = shouldCrossfade ? (outgoingName === 'A' ? 'B' : 'A') : outgoingName;
    const incoming = this.decks[incomingName];

    if (!shouldCrossfade) {
      outgoing.el.pause();
    }

    const { url, isObjectUrl } = await this.resolveSourceUrl(track);
    this.releaseDeckUrl(incomingName);
    if (isObjectUrl) incoming.objectUrl = url;

    incoming.el.crossOrigin = 'anonymous';
    incoming.el.src = url;
    incoming.el.playbackRate = this.currentSpeed;
    incoming.el.volume = 1;

    this.activeDeck = incomingName;

    await incoming.el.play();

    if (shouldCrossfade && this.ctx && incoming.gain && outgoing.gain) {
      const now = this.ctx.currentTime;
      incoming.gain.gain.cancelScheduledValues(now);
      outgoing.gain.gain.cancelScheduledValues(now);
      incoming.gain.gain.setValueAtTime(0.01, now);
      incoming.gain.gain.linearRampToValueAtTime(1, now + crossfadeSeconds);
      outgoing.gain.gain.setValueAtTime(outgoing.gain.gain.value, now);
      outgoing.gain.gain.linearRampToValueAtTime(0, now + crossfadeSeconds);
      this.crossfadeTimer = window.setTimeout(() => {
        outgoing.el.pause();
        outgoing.el.currentTime = 0;
      }, crossfadeSeconds * 1000);
    } else if (this.ctx && incoming.gain) {
      const now = this.ctx.currentTime;
      incoming.gain.gain.setValueAtTime(1, now);
      if (outgoing !== incoming && outgoing.gain) {
        outgoing.gain.gain.setValueAtTime(0, now);
      }
    }
  }

  public pause() {
    this.decks[this.activeDeck].el.pause();
  }

  public async resume() {
    this.ensureAudioGraph();
    await this.decks[this.activeDeck].el.play();
  }

  public seek(seconds: number) {
    const el = this.decks[this.activeDeck].el;
    if (Number.isFinite(seconds)) {
      el.currentTime = Math.max(0, seconds);
    }
  }

  public setVolume(vol: number) {
    this.currentVolume = Math.max(0, Math.min(1, vol));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.currentVolume, this.ctx.currentTime, 0.02);
    }
    this.decks.A.el.volume = this.masterGain ? 1 : this.currentVolume;
    this.decks.B.el.volume = this.masterGain ? 1 : this.currentVolume;
  }

  public setSpeed(speed: number) {
    this.currentSpeed = speed;
    this.decks.A.el.playbackRate = speed;
    this.decks.B.el.playbackRate = speed;
  }

  public setEqGains(gains: number[]) {
    this.currentEqGains = gains;
    if (this.eqFilters.length === gains.length && this.ctx) {
      gains.forEach((g, idx) => {
        this.eqFilters[idx].gain.setTargetAtTime(g, this.ctx!.currentTime, 0.03);
      });
    }
  }

  public getFrequencyData(): Uint8Array | null {
    if (!this.analyser || !this.freqData) return null;
    this.analyser.getByteFrequencyData(this.freqData);
    return this.freqData;
  }

  public getTimeDomainData(): Uint8Array | null {
    if (!this.analyser || !this.timeData) return null;
    this.analyser.getByteTimeDomainData(this.timeData);
    return this.timeData;
  }

  public getCurrentTime(): number {
    return this.decks[this.activeDeck].el.currentTime || 0;
  }
}

export const audioEngine = new SonoraAudioEngine();
