// All sound is synthesised live with the Web Audio API — no audio files.
// Engine hum, siren, gunshot, punch, door, jingles and stings.
export function createAudio() {
  const a = {
    ctx: null, master: null, muted: false,
    engineOsc: null, engineOsc2: null, engineGain: null, engineOn: false,
    sirenOsc: null, sirenGain: null, sirenOn: false,
    init() {
      if (a.ctx) return;
      try {
        a.ctx = new (window.AudioContext || window.webkitAudioContext)();
        a.master = a.ctx.createGain();
        a.master.gain.value = a.muted ? 0 : 0.5;
        a.master.connect(a.ctx.destination);
      } catch { a.ctx = null; }
    },
    resume() { if (a.ctx && a.ctx.state === 'suspended') a.ctx.resume(); },
    setMuted(m) {
      a.muted = m;
      if (a.master) a.master.gain.value = m ? 0 : 0.5;
    },
    // One-shot tone: freq slides from f0 to f1 over dur seconds.
    tone(f0, f1, dur, type, vol, when) {
      if (!a.ctx) return;
      const t0 = a.ctx.currentTime + (when || 0);
      const o = a.ctx.createOscillator(), g = a.ctx.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(f0, t0);
      o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
      g.gain.setValueAtTime(vol || 0.2, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      o.connect(g); g.connect(a.master);
      o.start(t0); o.stop(t0 + dur + 0.02);
    },
    // Short filtered noise burst (gunshot / impact).
    noise(dur, vol, freq) {
      if (!a.ctx) return;
      const t0 = a.ctx.currentTime;
      const len = Math.floor(a.ctx.sampleRate * dur);
      const buf = a.ctx.createBuffer(1, len, a.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = a.ctx.createBufferSource();
      src.buffer = buf;
      const f = a.ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = freq || 1200;
      const g = a.ctx.createGain();
      g.gain.setValueAtTime(vol || 0.3, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      src.connect(f); f.connect(g); g.connect(a.master);
      src.start(t0);
    },
    gunshot() { a.noise(0.18, 0.5, 900); a.tone(160, 50, 0.12, 'square', 0.15); },
    punch() { a.tone(120, 45, 0.12, 'sine', 0.35); },
    thud() { a.noise(0.12, 0.25, 500); },
    door() { a.noise(0.07, 0.2, 1800); a.tone(220, 140, 0.07, 'square', 0.08); },
    blip() { a.tone(660, 990, 0.12, 'sine', 0.2); },
    pickup() { a.tone(520, 780, 0.1, 'triangle', 0.2); },
    jingle() {
      const notes = [523, 659, 784, 1047];
      notes.forEach((n, i) => a.tone(n, n, 0.16, 'triangle', 0.22, i * 0.11));
    },
    sting(level) {
      // Minor sting that gets darker with the wanted level.
      a.tone(220, 207, 0.5, 'sawtooth', 0.12);
      a.tone(233, 220, 0.5, 'sawtooth', 0.12, 0.05);
      if (level >= 3) a.tone(110, 103, 0.7, 'sawtooth', 0.16, 0.1);
    },
    // Engine: two detuned saws through a lowpass; pitch follows speed ratio.
    engine(on, ratio) {
      if (!a.ctx) return;
      if (on && !a.engineOn) {
        a.engineOsc = a.ctx.createOscillator();
        a.engineOsc2 = a.ctx.createOscillator();
        a.engineGain = a.ctx.createGain();
        const f = a.ctx.createBiquadFilter();
        f.type = 'lowpass'; f.frequency.value = 900;
        a.engineOsc.type = 'sawtooth'; a.engineOsc2.type = 'sawtooth';
        a.engineOsc.frequency.value = 70; a.engineOsc2.frequency.value = 71.5;
        a.engineGain.gain.value = 0.05;
        a.engineOsc.connect(f); a.engineOsc2.connect(f);
        f.connect(a.engineGain); a.engineGain.connect(a.master);
        a.engineOsc.start(); a.engineOsc2.start();
        a.engineOn = true;
      } else if (!on && a.engineOn) {
        try { a.engineOsc.stop(); a.engineOsc2.stop(); } catch { /* already stopped */ }
        a.engineOn = false;
      }
      if (a.engineOn) {
        const f = 60 + ratio * 160;
        a.engineOsc.frequency.setTargetAtTime(f, a.ctx.currentTime, 0.05);
        a.engineOsc2.frequency.setTargetAtTime(f * 1.01, a.ctx.currentTime, 0.05);
        a.engineGain.gain.setTargetAtTime(0.04 + ratio * 0.05, a.ctx.currentTime, 0.1);
      }
    },
    // Two-tone siren while police are near.
    siren(on) {
      if (!a.ctx) return;
      if (on && !a.sirenOn) {
        a.sirenOsc = a.ctx.createOscillator();
        a.sirenGain = a.ctx.createGain();
        a.sirenOsc.type = 'triangle';
        a.sirenOsc.frequency.value = 700;
        a.sirenGain.gain.value = 0.045;
        const lfo = a.ctx.createOscillator();
        lfo.frequency.value = 0.9;
        const lfoGain = a.ctx.createGain();
        lfoGain.gain.value = 240;
        lfo.connect(lfoGain); lfoGain.connect(a.sirenOsc.frequency);
        a.sirenOsc.connect(a.sirenGain); a.sirenGain.connect(a.master);
        a.sirenOsc.start(); lfo.start();
        a.sirenLfo = lfo;
        a.sirenOn = true;
      } else if (!on && a.sirenOn) {
        try { a.sirenOsc.stop(); a.sirenLfo.stop(); } catch { /* already stopped */ }
        a.sirenOn = false;
      }
    },
  };
  return a;
}
