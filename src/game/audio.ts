/**
 * AudioManager — todos os efeitos gerados com Web Audio API (sem arquivos).
 * O AudioContext é criado no primeiro gesto do usuário (política de autoplay).
 */
export class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  volume = 0.7;

  /** Deve ser chamado num evento de usuário (click/keydown). */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 0.5;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) {
      console.error("[AudioManager] Web Audio indisponível:", e);
    }
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  private noise(dur: number, freq: number, q = 1, gain = 0.3, type: BiquadFilterType = "lowpass"): void {
    if (!this.ctx || !this.master || !this.noiseBuf) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + dur + 0.02);
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain = 0.2, slideTo?: number): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo !== undefined) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  uiClick(): void { this.tone(660, 0.06, "square", 0.08); }
  uiOpen(): void { this.tone(440, 0.09, "triangle", 0.12, 620); }
  uiClose(): void { this.tone(520, 0.09, "triangle", 0.12, 340); }

  step(surface: "grama" | "terra" | "pedra" | "areia" | "madeira" | "areia_fofa"): void {
    const f = surface === "pedra" ? 900 : surface === "areia" || surface === "areia_fofa" ? 1600 : 1200;
    this.noise(0.07, f, 0.8, 0.12);
  }

  jump(): void { this.tone(240, 0.12, "square", 0.07, 380); }
  land(): void { this.noise(0.1, 700, 0.8, 0.16); }

  breakBlock(hardness: number): void {
    this.noise(0.12 + Math.min(0.2, hardness * 0.05), 1400, 0.7, 0.28, "bandpass");
    this.tone(140, 0.1, "triangle", 0.2, 70);
  }

  place(): void {
    this.tone(200, 0.06, "triangle", 0.18, 150);
    this.noise(0.05, 2200, 0.8, 0.1, "highpass");
  }

  digTick(): void { this.noise(0.04, 1800, 0.8, 0.08, "bandpass"); }

  splash(): void {
    this.noise(0.35, 900, 0.6, 0.3);
    this.tone(300, 0.25, "sine", 0.1, 90);
  }

  swim(): void { this.noise(0.12, 700, 0.7, 0.08); }

  craft(): void {
    this.tone(520, 0.08, "square", 0.1);
    setTimeout(() => this.tone(780, 0.12, "square", 0.1), 70);
  }

  pickup(): void { this.tone(880, 0.07, "square", 0.07, 1180); }

  denied(): void { this.tone(180, 0.12, "sawtooth", 0.08, 120); }
}
