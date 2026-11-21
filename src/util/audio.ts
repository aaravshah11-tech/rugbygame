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

  /** intensity 0..1, raised as the ball nears a try line. */
  setCrowd(intensity: number) {
    if (!this.ctx || !this.crowdStarted) return;
    const t = this.ctx.currentTime;
    this.crowdGain.gain.setTargetAtTime(0.12 + intensity * 0.55, t, 0.4);
    this.crowdFilter.frequency.setTargetAtTime(600 + intensity * 700, t, 0.4);
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

  click() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(1300, t);
    o.frequency.exponentialRampToValueAtTime(700, t + 0.05);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.18, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    o.connect(g).connect(this.sfx);
    o.start(t);
    o.stop(t + 0.08);
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
