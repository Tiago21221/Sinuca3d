/**
 * Áudio 100% sintético (Web Audio API) — sem amostras protegidas por direitos autorais.
 */
export class GameAudio {
  constructor() {
    this.ctx = null;
    this.sfxGain = null;
    this.musicGain = null;
    this.musicNodes = [];
    this.enabled = false;
    this.volumes = { sfx: 0.75, music: 0.28 };
  }

  async unlock() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.sfxGain = this.ctx.createGain();
      this.musicGain = this.ctx.createGain();
      this.sfxGain.connect(this.ctx.destination);
      this.musicGain.connect(this.ctx.destination);
      this._applyVolumes();
    }
    if (this.ctx.state === "suspended") await this.ctx.resume();
    this.enabled = true;
    this.startMusic();
  }

  setVolumes({ sfx, music }) {
    if (sfx != null) this.volumes.sfx = sfx;
    if (music != null) this.volumes.music = music;
    this._applyVolumes();
  }

  _applyVolumes() {
    if (!this.ctx) return;
    this.sfxGain.gain.value = this.volumes.sfx;
    this.musicGain.gain.value = this.volumes.music;
  }

  _beep({ freq = 440, dur = 0.12, type = "sine", gain = 0.12, slide = 0 }) {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  _noise(dur, gain, freq = 800) {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * dur, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.sfxGain);
    src.start(t);
  }

  click() {
    this._beep({ freq: 880, dur: 0.06, type: "triangle", gain: 0.08 });
  }

  cueHit(power) {
    this._noise(0.08, 0.08 + power * 0.18, 400 + power * 900);
    this._beep({ freq: 180 + power * 80, dur: 0.1, type: "sine", gain: 0.06 + power * 0.08 });
  }

  ballHit(impulse) {
    const k = Math.min(1, impulse / 6);
    this._noise(0.035, 0.025 + k * 0.09, 1700 + k * 900);
    this._beep({ freq: 720 + k * 420, dur: 0.045 + k * 0.045, type: "triangle", gain: 0.035 + k * 0.13, slide: -120 });
  }

  cushion(impulse) {
    const k = Math.min(1, impulse / 7);
    this._noise(0.09, 0.045 + k * 0.13, 180 + k * 120);
    this._beep({ freq: 105 + k * 45, dur: 0.11, type: "triangle", gain: 0.045 + k * 0.1, slide: -25 });
  }

  pocket() {
    this._beep({ freq: 240, dur: 0.28, type: "sine", gain: 0.12, slide: -140 });
    this._noise(0.2, 0.06, 180);
  }

  startMatch() {
    [392, 494, 587].forEach((f, i) => {
      setTimeout(() => this._beep({ freq: f, dur: 0.16, type: "triangle", gain: 0.1 }), i * 90);
    });
  }

  win() {
    [523, 659, 784, 1046].forEach((f, i) => {
      setTimeout(() => this._beep({ freq: f, dur: 0.22, type: "sine", gain: 0.1 }), i * 120);
    });
  }

  lose() {
    [392, 330, 262].forEach((f, i) => {
      setTimeout(() => this._beep({ freq: f, dur: 0.25, type: "triangle", gain: 0.1, slide: -40 }), i * 140);
    });
  }

  startMusic() {
    if (!this.ctx || this.musicNodes.length) return;
    const t = this.ctx.currentTime;
    const notes = [130.81, 164.81, 196, 246.94];
    notes.forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      g.gain.value = 0.035 / (i + 1);
      const lfo = this.ctx.createOscillator();
      const lfoGain = this.ctx.createGain();
      lfo.frequency.value = 0.08 + i * 0.03;
      lfoGain.gain.value = 6;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      osc.connect(g);
      g.connect(this.musicGain);
      osc.start(t);
      lfo.start(t);
      this.musicNodes.push(osc, lfo, g);
    });
  }
}
