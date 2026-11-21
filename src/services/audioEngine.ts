import { getAudioBlob, getCachedDriveAudio } from '../db/sonoraDb';
import { auth, getDriveAccessToken, signInWithFirebaseGoogle } from './firebaseClient';
import { fetchFirebaseCloudAudioBlob } from './firebaseMusicService';
import { ensureLosslessArtworkFromAudioBlob, fetchGoogleDriveAudioBlob } from './googleDriveMusicService';
import { upgradeTrackArtworkToHdIfNeeded } from './hdArtworkService';
import { EQ_FREQUENCIES, type Track } from '../types/music';

type DeckName = 'A' | 'B';

export interface EngineCallbacks {
  onTimeUpdate: (time: number, duration: number) => void;
  onTrackEnded: () => void;
  onPlayStateChange: (isPlaying: boolean) => void;
  onError: (message: string) => void;
  /** Fired once when the active track is within the crossfade window of its end. */
  onNearEnd?: () => void;
}

const AudioEngineCurves = {
  build(fadeIn: boolean): Float32Array {
    const n = 64;
    const arr = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * (Math.PI / 2);
      arr[i] = fadeIn ? Math.sin(x) : Math.cos(x);
    }
    return arr;
  },
};

class AudioEngine {
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
  private playRequestId = 0;
  // True while a track is being resolved/started. Pause/ended/timeupdate events from the old
  // deck are ignored during this window so the UI and queue never get out of sync.
  private loading = false;
  private loadedTrackId: string | null = null;
  private autoCrossfadeSeconds = 0;
  private nearEndTriggered = false;

  private static readonly FADE_IN_CURVE = AudioEngineCurves.build(true);
  private static readonly FADE_OUT_CURVE = AudioEngineCurves.build(false);

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
        if (this.activeDeck !== name || this.loading) return;
        const dur = Number.isFinite(el.duration) ? el.duration : 0;
        const time = el.currentTime || 0;
        this.callbacks?.onTimeUpdate(time, dur);
        this.checkNearEnd(el, time, dur);
      });
      el.addEventListener('ended', () => {
        if (this.activeDeck === name && !this.loading) {
          this.callbacks?.onTrackEnded();
        }
      });
      el.addEventListener('play', () => {
        if (this.activeDeck === name) this.callbacks?.onPlayStateChange(true);
      });
      el.addEventListener('pause', () => {
        if (this.activeDeck === name && !this.loading) this.callbacks?.onPlayStateChange(false);
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
    if (track.sourceType === 'gdrive') {
      // 1. Play immediately from local IndexedDB cache if already uploaded or streamed on this device (zero login required)
      const cachedBlob = await getCachedDriveAudio(track.id);
      if (cachedBlob) {
        void ensureLosslessArtworkFromAudioBlob(track.id, cachedBlob);
        return { url: URL.createObjectURL(cachedBlob), isObjectUrl: true };
      }

      if (!track.driveFileId) {
        throw new Error('Google Drive file reference is missing for this track.');
      }

      // 2. If not cached yet on this device and the 1-hour in-memory token expired, seamlessly renew using the active signed-in Google account
      let token = getDriveAccessToken();
      if (!token && auth.currentUser) {
        const renewed = await signInWithFirebaseGoogle();
        token = renewed.accessToken;
      }
      if (!token) {
        throw new Error('Sign in with Google Drive to stream this uncached song.');
      }
      const mime = track.mimeType || (track.format === 'mp3' ? 'audio/mpeg' : `audio/${track.format}`);
      const blob = await fetchGoogleDriveAudioBlob(token, track.driveFileId, mime, track.id);
      return { url: URL.createObjectURL(blob), isObjectUrl: true };
    }
    if (track.sourceType === 'firebase') {
      const uid = auth.currentUser?.uid;
      if (!uid || !track.firebaseDocId) {
        throw new Error('Sign in with Google to stream your Firebase Cloud tracks.');
      }
      const mime = track.format === 'mp3' ? 'audio/mpeg' : `audio/${track.format}`;
      const blob = await fetchFirebaseCloudAudioBlob(uid, track.firebaseDocId, mime);
      void ensureLosslessArtworkFromAudioBlob(track.id, blob);
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

  private isPlayInterruptedError(err: unknown): boolean {
    if (!err) return false;
    const name = (err as { name?: string }).name;
    if (name === 'AbortError') return true;
    const msg = err instanceof Error ? err.message : String(err);
    return /play\(\)\s+request\s+was\s+interrupted/i.test(msg);
  }

  public setAutoCrossfade(seconds: number) {
    this.autoCrossfadeSeconds = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  }

  public isLoading(): boolean {
    return this.loading;
  }

  public getLoadedTrackId(): string | null {
    return this.loadedTrackId;
  }

  // Starts the next track slightly BEFORE the current one ends so the two can overlap.
  private checkNearEnd(el: HTMLAudioElement, time: number, dur: number) {
    const cf = this.autoCrossfadeSeconds;
    if (cf <= 0 || this.nearEndTriggered || !dur || dur < cf * 2 + 2 || time < 1) return;
    const rate = el.playbackRate || 1;
    const remaining = (dur - time) / rate;
    // +0.25s lead covers the time needed to load the next audio blob
    if (remaining <= cf + 0.25) {
      this.nearEndTriggered = true;
      this.callbacks?.onNearEnd?.();
    }
  }

  private resetGains(activeName: DeckName) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    (['A', 'B'] as DeckName[]).forEach((name) => {
      const g = this.decks[name].gain;
      if (!g) return;
      g.gain.cancelScheduledValues(now);
      g.gain.setValueAtTime(name === activeName ? 1 : 0, now);
    });
  }

  private hardStopDecks() {
    if (this.crossfadeTimer) {
      window.clearTimeout(this.crossfadeTimer);
      this.crossfadeTimer = null;
    }
    this.decks.A.el.pause();
    this.decks.B.el.pause();
  }

  public async playTrack(track: Track, crossfadeSeconds = 0): Promise<void> {
    this.ensureAudioGraph();
    const reqId = ++this.playRequestId;
    this.loading = true;
    this.loadedTrackId = null;
    void upgradeTrackArtworkToHdIfNeeded(track.id, track.title, track.artist);

    if (this.crossfadeTimer) {
      window.clearTimeout(this.crossfadeTimer);
      this.crossfadeTimer = null;
    }

    const outgoingName = this.activeDeck;
    const otherName: DeckName = outgoingName === 'A' ? 'B' : 'A';
    const outgoing = this.decks[outgoingName];
    const outgoingAudible =
      !!outgoing.el.src && !outgoing.el.paused && !outgoing.el.ended && outgoing.el.currentTime > 0;
    const canFade = !!(this.ctx && outgoing.gain && this.decks[otherName].gain);
    const shouldCrossfade = crossfadeSeconds > 0 && outgoingAudible && canFade;

    // Hard cut: silence the old song immediately. Crossfade: keep it playing until the new one is ready.
    if (!shouldCrossfade) this.hardStopDecks();

    let resolved: { url: string; isObjectUrl: boolean };
    try {
      resolved = await this.resolveSourceUrl(track);
    } catch (err) {
      if (reqId === this.playRequestId) {
        // Make sure nothing keeps playing under a UI that already shows the new track
        this.hardStopDecks();
        this.loading = false;
        this.callbacks?.onPlayStateChange(false);
      }
      throw err;
    }

    // A newer play request or a pause() superseded this one while the audio was loading
    if (reqId !== this.playRequestId) {
      if (resolved.isObjectUrl) URL.revokeObjectURL(resolved.url);
      return;
    }

    const incomingName: DeckName = shouldCrossfade ? otherName : outgoingName;
    const incoming = this.decks[incomingName];
    const outgoingDeck = this.decks[outgoingName];

    this.releaseDeckUrl(incomingName);
    if (resolved.isObjectUrl) incoming.objectUrl = resolved.url;

    incoming.el.crossOrigin = 'anonymous';
    incoming.el.src = resolved.url;
    incoming.el.currentTime = 0;
    incoming.el.playbackRate = this.currentSpeed;
    incoming.el.volume = this.masterGain ? 1 : this.currentVolume;

    this.activeDeck = incomingName;
    this.nearEndTriggered = false;

    if (this.ctx && incoming.gain) {
      const now = this.ctx.currentTime;
      if (shouldCrossfade) {
        incoming.gain.gain.cancelScheduledValues(now);
        incoming.gain.gain.setValueAtTime(0, now);
      } else {
        this.resetGains(incomingName);
      }
    }

    try {
      await incoming.el.play();
    } catch (err) {
      if (this.isPlayInterruptedError(err) || reqId !== this.playRequestId) {
        return;
      }
      this.hardStopDecks();
      this.loading = false;
      this.callbacks?.onPlayStateChange(false);
      throw err;
    }

    if (reqId !== this.playRequestId) {
      incoming.el.pause();
      return;
    }

    this.loadedTrackId = track.id;
    this.loading = false;

    if (shouldCrossfade && this.ctx && incoming.gain && outgoingDeck.gain) {
      const now = this.ctx.currentTime;
      const remainingOld = Number.isFinite(outgoingDeck.el.duration)
        ? Math.max(0.3, (outgoingDeck.el.duration - outgoingDeck.el.currentTime) / (outgoingDeck.el.playbackRate || 1))
        : crossfadeSeconds;
      const fade = Math.max(0.3, Math.min(crossfadeSeconds, remainingOld));

      incoming.gain.gain.cancelScheduledValues(now);
      outgoingDeck.gain.gain.cancelScheduledValues(now);
      try {
        // Equal-power curves keep perceived loudness steady through the overlap
        incoming.gain.gain.setValueCurveAtTime(AudioEngine.FADE_IN_CURVE, now, fade);
        outgoingDeck.gain.gain.setValueCurveAtTime(AudioEngine.FADE_OUT_CURVE, now, fade);
      } catch {
        incoming.gain.gain.setValueAtTime(0, now);
        incoming.gain.gain.linearRampToValueAtTime(1, now + fade);
        outgoingDeck.gain.gain.setValueAtTime(1, now);
        outgoingDeck.gain.gain.linearRampToValueAtTime(0, now + fade);
      }
      this.crossfadeTimer = window.setTimeout(() => {
        if (this.activeDeck !== outgoingName) {
          outgoingDeck.el.pause();
          outgoingDeck.el.currentTime = 0;
        }
        this.crossfadeTimer = null;
      }, fade * 1000 + 60);
    }
  }

  public pause() {
    this.playRequestId++;
    this.loading = false;
    this.hardStopDecks();
    this.resetGains(this.activeDeck);
  }

  public async resume() {
    // A load is already in flight and will start playing by itself; do not resume the OLD source.
    if (this.loading) return;
    this.ensureAudioGraph();
    const activeEl = this.decks[this.activeDeck].el;
    if (!activeEl.src) return;
    this.resetGains(this.activeDeck);
    try {
      await activeEl.play();
    } catch (err) {
      if (this.isPlayInterruptedError(err)) return;
      throw err;
    }
  }

  public seek(seconds: number) {
    const el = this.decks[this.activeDeck].el;
    if (Number.isFinite(seconds)) {
      el.currentTime = Math.max(0, seconds);
      const dur = Number.isFinite(el.duration) ? el.duration : 0;
      if (dur && seconds < dur - this.autoCrossfadeSeconds - 1) this.nearEndTriggered = false;
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

export const audioEngine = new AudioEngine();
