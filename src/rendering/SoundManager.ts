const STORAGE_KEY = 'dicewars_muted';

export class SoundManager {
  private ctx: AudioContext | null = null;
  private muted = false;
  private volume = 0.3;

  constructor() {
    this.muted = localStorage.getItem(STORAGE_KEY) === 'true';
    try {
      this.ctx = new AudioContext();
    } catch {
      // Web Audio API unavailable
    }
  }

  private ensureContext(): AudioContext | null {
    if (!this.ctx) return null;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private createGain(ctx: AudioContext, startTime: number, vol: number): GainNode {
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol * this.volume, startTime);
    gain.connect(ctx.destination);
    return gain;
  }

  playDiceRoll(): void {
    const ctx = this.ensureContext();
    if (!ctx || this.muted) return;
    const now = ctx.currentTime;
    const burstCount = 5;

    for (let i = 0; i < burstCount; i++) {
      const t = now + i * 0.05;
      const bufferSize = ctx.sampleRate * 0.03;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let s = 0; s < bufferSize; s++) {
        data[s] = (Math.random() * 2 - 1) * 0.5;
      }
      const source = ctx.createBufferSource();
      source.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 2000 + i * 400;
      filter.Q.value = 2;

      const gain = this.createGain(ctx, t, 0.4);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.03);

      source.connect(filter);
      filter.connect(gain);
      source.start(t);
      source.stop(t + 0.03);
    }
  }

  playCapture(): void {
    const ctx = this.ensureContext();
    if (!ctx || this.muted) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, now);
    osc.frequency.linearRampToValueAtTime(800, now + 0.2);

    const gain = this.createGain(ctx, now, 0.3);
    gain.gain.setValueAtTime(0.3 * this.volume, now);
    gain.gain.linearRampToValueAtTime(0.4 * this.volume, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    osc.connect(gain);
    osc.start(now);
    osc.stop(now + 0.25);
  }

  playAttackFail(): void {
    const ctx = this.ensureContext();
    if (!ctx || this.muted) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, now);

    const gain = this.createGain(ctx, now, 0.5);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

    osc.connect(gain);
    osc.start(now);
    osc.stop(now + 0.3);
  }

  playTurnStart(): void {
    const ctx = this.ensureContext();
    if (!ctx || this.muted) return;
    const now = ctx.currentTime;

    // First tone
    const osc1 = ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.value = 600;
    const gain1 = this.createGain(ctx, now, 0.25);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    osc1.connect(gain1);
    osc1.start(now);
    osc1.stop(now + 0.08);

    // Second tone
    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = 800;
    const gain2 = this.createGain(ctx, now + 0.08, 0.25);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    osc2.connect(gain2);
    osc2.start(now + 0.08);
    osc2.stop(now + 0.16);
  }

  playElimination(): void {
    const ctx = this.ensureContext();
    if (!ctx || this.muted) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.linearRampToValueAtTime(200, now + 0.4);

    const gain = this.createGain(ctx, now, 0.4);
    gain.gain.linearRampToValueAtTime(0.4 * this.volume, now + 0.1);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

    osc.connect(gain);
    osc.start(now);
    osc.stop(now + 0.5);
  }

  playVictory(): void {
    const ctx = this.ensureContext();
    if (!ctx || this.muted) return;
    const now = ctx.currentTime;

    // C5, E5, G5
    const freqs = [523.25, 659.25, 783.99];
    freqs.forEach((freq, i) => {
      const t = now + i * 0.15;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;

      const gain = this.createGain(ctx, t, 0.3);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);

      osc.connect(gain);
      osc.start(t);
      osc.stop(t + 0.2);
    });
  }

  playDefeat(): void {
    const ctx = this.ensureContext();
    if (!ctx || this.muted) return;
    const now = ctx.currentTime;

    // G4, Eb4, C4
    const freqs = [392.0, 311.13, 261.63];
    freqs.forEach((freq, i) => {
      const t = now + i * 0.15;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;

      const gain = this.createGain(ctx, t, 0.3);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);

      osc.connect(gain);
      osc.start(t);
      osc.stop(t + 0.2);
    });
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    localStorage.setItem(STORAGE_KEY, String(muted));
  }

  isMuted(): boolean {
    return this.muted;
  }

  setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol));
  }

  destroy(): void {
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }
}
