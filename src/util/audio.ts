/**
 * All sound is synthesised with Web Audio, so there are no audio files to download.
 * iOS needs a user gesture before audio can start: call `unlockAudio()` from a touch handler.
 */
class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private music!: GainNode;
  private crowdGain!: GainNode;
  private crowdFilter!: BiquadFilterNode;
  private crowdStarted = false;
  private musicTimer: number | null = null;
  private musicStep = 0;
  sfxVolume = 0.8;
  musicVolume = 0.5;

  unlock() {
    if (!this.ctx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.sfx = this.ctx.createGain();
      this.sfx.connect(this.master);
      this.music = this.ctx.createGain();
      this.music.connect(this.master);
      this.applyVolumes();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setVolumes(music: number, sfx: number) {
    this.musicVolume = music;
    this.sfxVolume = sfx;
    this.applyVolumes();
  }

  private applyVolumes() {
    if (!this.ctx) return;
    this.sfx.gain.value = this.sfxVolume;
    this.music.gain.value = this.musicVolume * 0.35;
  }

  private noiseBuffer(seconds: number, brown = false) {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      if (brown) {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      } else d[i] = w;
    }
    return buf;
  }

  // ---------- crowd ----------
  startCrowd() {
    if (!this.ctx || this.crowdStarted) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(4, true);
    src.loop = true;
    this.crowdFilter = ctx.createBiquadFilter();
    this.crowdFilter.type = 'bandpass';
    this.crowdFilter.frequency.value = 700;
    this.crowdFilter.Q.value = 0.6;
    this.crowdGain = ctx.createGain();
    this.crowdGain.gain.value = 0;
    src.connect(this.crowdFilter).connect(this.crowdGain).connect(this.sfx);
    // the ground's echo: crowd -> convolver -> wet gain (set by setVenue)
    this.venueVerb = ctx.createConvolver();
    this.venueVerb.buffer = this.impulse(1.2, 2.5);
    this.venueWet = ctx.createGain();
    this.venueWet.gain.value = 0.2;
    this.crowdGain.connect(this.venueVerb).connect(this.venueWet).connect(this.sfx);
    src.start();
    // A second, brighter layer gives the "murmur" texture.
    const src2 = ctx.createBufferSource();
    src2.buffer = this.noiseBuffer(3);
    src2.loop = true;
    const f2 = ctx.createBiquadFilter();
    f2.type = 'bandpass';
    f2.frequency.value = 1800;
    f2.Q.value = 1.2;
    const g2 = ctx.createGain();
    g2.gain.value = 0.05;
    src2.connect(f2).connect(g2).connect(this.crowdGain);
    src2.start();
    this.crowdStarted = true;
  }

  private venueVerb: ConvolverNode | null = null;
  private venueWet: GainNode | null = null;
  /** crowd loudness from the ground: 0.35 school field .. 1 full national arena */
  private venueSize = 1;
  private venueBright = 0;

  /** Decaying stereo noise: a cheap room impulse. */
  private impulse(seconds: number, decay: number) {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  /**
   * Shape the crowd for the ground: how many people (capacity x fill) sets the loudness; a roof
   * makes it boomier (longer, wetter echo); a small ground is more intimate (short slap-back, you
   * hear individual voices - brighter, thinner).
   */
  setVenue(capacity: number, fill: number, roofed: boolean) {
    if (!this.ctx) return;
    const people = capacity * fill;
    // 800 people ~0.35, a full 80,000 arena 1.0
    this.venueSize = Math.max(0.3, Math.min(1, 0.35 + ((Math.log10(Math.max(500, people)) - 2.9) / 2) * 0.65));
    this.venueBright = people < 20000 ? 500 : 0;
    if (!this.venueVerb || !this.venueWet) return;
    const big = people > 40000;
    this.venueVerb.buffer = roofed ? this.impulse(big ? 2.6 : 1.6, 2.2) : this.impulse(big ? 1.4 : 0.6, 3.2);
    this.venueWet.gain.value = roofed ? (big ? 0.55 : 0.35) : big ? 0.22 : 0.12;
  }

  /** intensity 0..1, raised as the ball nears a try line. */
  setCrowd(intensity: number) {
    if (!this.ctx || !this.crowdStarted) return;
    const t = this.ctx.currentTime;
    this.crowdGain.gain.setTargetAtTime((0.12 + intensity * 0.55) * this.venueSize, t, 0.4);
    this.crowdFilter.frequency.setTargetAtTime(600 + this.venueBright + intensity * 700, t, 0.4);
  }

  /** Stadium PA: a short two-tone air horn for a try (original sound). */
  paHorn() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    for (const [f, d] of [[233, 0], [233, 0.32], [311, 0.62]] as const) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      const o2 = ctx.createOscillator();
      o2.type = 'sawtooth';
      o2.frequency.value = f * 1.006;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1400;
      const g = ctx.createGain();
      const len = d > 0.5 ? 0.9 : 0.24;
      g.gain.setValueAtTime(0, t + d);
      g.gain.linearRampToValueAtTime(0.16, t + d + 0.03);
      g.gain.setValueAtTime(0.16, t + d + len - 0.06);
      g.gain.linearRampToValueAtTime(0, t + d + len);
      o.connect(lp);
      o2.connect(lp);
      lp.connect(g).connect(this.sfx);
      if (this.venueVerb) g.connect(this.venueVerb);
      o.start(t + d);
      o2.start(t + d);
      o.stop(t + d + len + 0.05);
      o2.stop(t + d + len + 0.05);
    }
  }

  /** Stadium PA: a three-note announcer chime before kick-off (original). */
  paChime() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    [659, 523, 784].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const g = ctx.createGain();
      const s0 = t + i * 0.38;
      g.gain.setValueAtTime(0, s0);
      g.gain.linearRampToValueAtTime(0.2, s0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, s0 + 1.1);
      o.connect(g).connect(this.sfx);
      if (this.venueVerb) g.connect(this.venueVerb);
      o.start(s0);
      o.stop(s0 + 1.2);
    });
  }

  stopCrowd() {
    if (!this.ctx || !this.crowdStarted) return;
    this.crowdGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3);
  }

  cheer(strength = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(3.5);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1100;
    f.Q.value = 0.5;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.5 * strength, t + 0.25);
    g.gain.exponentialRampToValueAtTime(0.001, t + 3.4);
    src.connect(f).connect(g).connect(this.sfx);
    src.start();
  }

  /** A short, original brass-style fanfare for the walk-out (not any real anthem). */
  fanfare() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + 0.05;
    // [semitones from C4, beats]
    const tune: [number, number][] = [[0, 1], [4, 1], [7, 1], [12, 2], [11, 1], [7, 1], [9, 1], [12, 3]];
    const beat = 0.32;
    let t = t0;
    const master = ctx.createGain();
    master.gain.value = 0.16;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1800;
    master.connect(lp).connect(this.sfx);
    for (const [st, beats] of tune) {
      const f = 261.63 * Math.pow(2, st / 12);
      const dur = beats * beat;
      for (const [mult, type] of [[1, 'sawtooth'], [0.5, 'triangle'], [2, 'square']] as [number, OscillatorType][]) {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.value = f * mult;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(mult === 2 ? 0.15 : 0.6, t + 0.04);
        g.gain.setValueAtTime(mult === 2 ? 0.12 : 0.5, t + dur - 0.06);
        g.gain.linearRampToValueAtTime(0, t + dur);
        o.connect(g).connect(master);
        o.start(t);
        o.stop(t + dur + 0.02);
      }
      t += dur;
    }
  }

  /** Crowd groan: a low falling murmur (knock-ons, missed kicks). */
  groan(strength = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(2);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 0.8;
    const t = ctx.currentTime;
    f.frequency.setValueAtTime(520, t);
    f.frequency.exponentialRampToValueAtTime(220, t + 1.6);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.35 * strength, t + 0.2);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.8);
    src.connect(f).connect(g).connect(this.sfx);
    src.start();
  }

  // ---------- effects ----------
  whistle(long = false) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const dur = long ? 0.9 : 0.4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.25, t + 0.02);
    g.gain.setValueAtTime(0.25, t + dur - 0.05);
    g.gain.linearRampToValueAtTime(0, t + dur);
    g.connect(this.sfx);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 38;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 90;
    lfo.connect(lfoGain);
    for (const f of [2650, 2710]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      lfoGain.connect(o.frequency);
      o.connect(g);
      o.start(t);
      o.stop(t + dur);
    }
    lfo.start(t);
    lfo.stop(t + dur);
  }

  thud(strength = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.2);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.7 * strength, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    o.connect(g).connect(this.sfx);
    o.start(t);
    o.stop(t + 0.3);
    const n = ctx.createBufferSource();
    n.buffer = this.noiseBuffer(0.15);
    const nf = ctx.createBiquadFilter();
    nf.type = 'lowpass';
    nf.frequency.value = 900;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.4 * strength, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    n.connect(nf).connect(ng).connect(this.sfx);
    n.start(t);
  }

  kick() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(220, t);
    o.frequency.exponentialRampToValueAtTime(60, t + 0.08);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.6, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    o.connect(g).connect(this.sfx);
    o.start(t);
    o.stop(t + 0.12);
  }

  private lastClick = 0;
  /** Crisp UI tick. Taps are de-duplicated, so the global tap handler and a button's own onClick don't double up. */
  click() {
    if (!this.ctx) return;
    const now = performance.now();
    if (now - this.lastClick < 300) return;
    this.lastClick = now;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(2400, t);
    o.frequency.exponentialRampToValueAtTime(1100, t + 0.03);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.14, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.045);
    o.connect(g).connect(this.sfx);
    o.start(t);
    o.stop(t + 0.05);
    this.noiseHit(t, 0.02, 0.09, 5200);
  }

  /** A burst of filtered noise (ticks, thumps). */
  private noiseHit(t: number, dur: number, vol: number, freq: number, type: BiquadFilterType = 'highpass') {
    const ctx = this.ctx!;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(this.sfx);
    src.start(t);
  }

  /** Floodlight bank switching on: a heavy relay clunk with a hum tail. */
  clunk(delay = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.18);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    o.connect(g).connect(this.sfx);
    o.start(t);
    o.stop(t + 0.3);
    this.noiseHit(t, 0.06, 0.35, 900, 'lowpass');
    const hum = ctx.createOscillator();
    hum.type = 'sawtooth';
    hum.frequency.value = 100;
    const hg = ctx.createGain();
    hg.gain.setValueAtTime(0.0001, t);
    hg.gain.linearRampToValueAtTime(0.025, t + 0.05);
    hg.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 400;
    hum.connect(lp).connect(hg).connect(this.sfx);
    hum.start(t);
    hum.stop(t + 0.75);
  }

  /** Logo slam: sub boom plus a bright crack. */
  slam(delay = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(160, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.35);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.7, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    o.connect(g).connect(this.sfx);
    o.start(t);
    o.stop(t + 0.55);
    this.noiseHit(t, 0.12, 0.3, 2500);
  }

  coin() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    [988, 1319].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.08, t + i * 0.08);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.08 + 0.15);
      o.connect(g).connect(this.sfx);
      o.start(t + i * 0.08);
      o.stop(t + i * 0.08 + 0.16);
    });
  }

  // ---------- menu music: a simple driving synth loop ----------
  startMusic() {
    if (!this.ctx || this.musicTimer !== null) return;
    const bass = [45, 45, 52, 45, 48, 48, 43, 47];
    const lead = [69, 72, 76, 74, 72, 76, 79, 76, 69, 72, 76, 74, 71, 74, 79, 74];
    const stepDur = 0.2;
    let nextTime = this.ctx.currentTime + 0.05;
    const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);
    const tick = () => {
      const ctx = this.ctx!;
      while (nextTime < ctx.currentTime + 0.4) {
        const s = this.musicStep++;
        if (s % 2 === 0) this.note(midi(bass[(s / 2) % bass.length | 0]), nextTime, stepDur * 1.8, 'sawtooth', 0.12, 600);
        if (s % 4 !== 3) this.note(midi(lead[s % lead.length]), nextTime, stepDur * 0.8, 'square', 0.035, 2400);
        if (s % 4 === 0) this.drum(nextTime);
        nextTime += stepDur;
      }
    };
    this.musicTimer = window.setInterval(tick, 100);
  }

  stopMusic() {
    if (this.musicTimer !== null) clearInterval(this.musicTimer);
    this.musicTimer = null;
  }

  private note(freq: number, t: number, dur: number, type: OscillatorType, vol: number, cutoff: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    o.connect(f).connect(g).connect(this.music);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private drum(t: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    o.connect(g).connect(this.music);
    o.start(t);
    o.stop(t + 0.2);
  }
}

export const audio = new AudioEngine();
export const unlockAudio = () => audio.unlock();
