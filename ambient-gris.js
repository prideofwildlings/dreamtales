// ambient-gris.js — a slow, generative score in the spirit of Gris:
// a soft felt piano in D minor, low strings, a wordless choir and a celesta,
// all in a big hall reverb. Nothing is a recording; every note is made here.
// Modes: "piano" (piano alone), "strings" (piano + strings), "full" (+ choir + celesta).
(function () {
  const hz = m => 440 * Math.pow(2, (m - 69) / 12);

  // chords: bass note + the notes the melody may lean on (as pitch classes, D = 2)
  const CH = {
    Dm9:   { name: "Dm9",    bass: 38, pcs: [2, 5, 9, 4] },
    Bbmaj7:{ name: "B♭maj7", bass: 34, pcs: [10, 2, 5, 9] },
    F:     { name: "F",      bass: 41, pcs: [5, 9, 0] },
    CE:    { name: "C/E",    bass: 40, pcs: [0, 4, 7] },
    Gm7:   { name: "Gm7",    bass: 43, pcs: [7, 10, 2, 5] },
    Asus:  { name: "Asus4",  bass: 45, pcs: [9, 2, 4] },
    A:     { name: "A",      bass: 45, pcs: [9, 1, 4] },
  };
  const PHRASES = [
    [CH.Dm9, CH.Bbmaj7, CH.F, CH.CE],
    [CH.Dm9, CH.Bbmaj7, CH.F, CH.CE],
    [CH.Gm7, CH.Bbmaj7, CH.Dm9, CH.Asus],
    [CH.Gm7, CH.Bbmaj7, CH.Asus, CH.A],
  ];
  const SCALE = [2, 4, 5, 7, 9, 10, 0];          // D natural minor, as pitch classes
  const inScale = m => SCALE.includes(((m % 12) + 12) % 12);
  const RHYTHMS = [[0, 1.5, 2, 3], [0, 2], [0.5, 1, 2.5], [1, 2, 3], [0, 3], [0, 1, 1.5, 3], []];

  function impulse(ac, secs, decay) {
    const len = Math.floor(ac.sampleRate * secs), buf = ac.createBuffer(2, len, ac.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c); let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len, k = 0.25 + 0.7 * t;            // darker as the tail goes on
        lp += k * ((Math.random() * 2 - 1) - lp);
        d[i] = lp * Math.pow(1 - t, decay) * (i < ac.sampleRate * 0.01 ? i / (ac.sampleRate * 0.01) : 1);
      }
    }
    return buf;
  }

  function create(ac, dest, mode) {
    const state = { mode: mode || "strings", chord: CH.Dm9 };
    const master = ac.createGain(); master.gain.value = 3.2;
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -20; comp.ratio.value = 3; comp.attack.value = 0.02; comp.release.value = 0.4;
    master.connect(comp); comp.connect(dest || ac.destination);
    const rev = ac.createConvolver(); rev.buffer = impulse(ac, 6.5, 2.4);
    const wet = ac.createGain(); wet.gain.value = 0.62; rev.connect(wet); wet.connect(master);
    const dry = ac.createGain(); dry.gain.value = 0.55; dry.connect(master);

    function route(node, pan, send) {
      const p = ac.createStereoPanner(); p.pan.value = Math.max(-0.8, Math.min(0.8, pan));
      node.connect(p); p.connect(dry);
      const s = ac.createGain(); s.gain.value = send; p.connect(s); s.connect(rev);
    }

    // one shared slow vibrato for the bowed / sung parts
    const vib = ac.createOscillator(); vib.frequency.value = 4.6;
    const vibAmt = ac.createGain(); vibAmt.gain.value = 6; vib.connect(vibAmt); vib.start();

    // a short noise burst reused for the felt hammer
    const nbuf = ac.createBuffer(1, ac.sampleRate * 0.06, ac.sampleRate);
    { const d = nbuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length); }

    // ---- felt piano ----
    const AMPS = [1, 0.42, 0.22, 0.12, 0.06, 0.03];
    function piano(m, t, vel) {
      const f = hz(m), dur = 2.8 + Math.max(0, 84 - m) / 9;
      const lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = 0.2;
      const bright = 700 + vel * 2200 + (m - 40) * 12;
      lp.frequency.setValueAtTime(bright, t);
      lp.frequency.exponentialRampToValueAtTime(Math.max(260, bright * 0.3), t + 2.2);
      route(lp, (m - 62) / 36, 0.95);
      AMPS.forEach((a0, i) => {
        const p = i + 1, o = ac.createOscillator(), g = ac.createGain();
        o.frequency.value = f * p * Math.sqrt(1 + 0.00035 * p * p);
        o.detune.value = (Math.random() - 0.5) * 5;
        const a = a0 * vel * 0.16;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(a, t + 0.007);
        g.gain.exponentialRampToValueAtTime(a * 0.32, t + 0.3 / (1 + i * 0.5));
        g.gain.exponentialRampToValueAtTime(0.00001, t + dur / (1 + i * 0.45));
        o.connect(g); g.connect(lp); o.start(t); o.stop(t + dur + 0.1);
      });
      const n = ac.createBufferSource(); n.buffer = nbuf;           // the soft felt "thud"
      const nf = ac.createBiquadFilter(); nf.type = "bandpass"; nf.frequency.value = Math.min(2000, f * 2); nf.Q.value = 1.2;
      const ng = ac.createGain(); ng.gain.value = vel * 0.035;
      n.connect(nf); nf.connect(ng); ng.connect(lp); n.start(t);
    }

    // ---- strings (low, slow bowing) ----
    function strings(ms, t, dur, vol) {
      ms.forEach((m, k) => {
        const lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 520 + (m - 40) * 9; lp.Q.value = 0.6;
        const g = ac.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(vol, t + dur * 0.45);
        g.gain.linearRampToValueAtTime(vol * 0.8, t + dur);
        g.gain.linearRampToValueAtTime(0, t + dur + 2.5);
        [-9, 0, 8].forEach(dt => {
          const o = ac.createOscillator(); o.type = "sawtooth";
          o.frequency.value = hz(m); o.detune.value = dt; vibAmt.connect(o.detune);
          o.connect(lp); o.start(t); o.stop(t + dur + 2.6);
        });
        lp.connect(g); route(g, (k - 1) * 0.35, 1.3);
      });
    }

    // ---- wordless choir ("ah") ----
    const FORM = [[800, 1, 9], [1150, 0.55, 10], [2900, 0.22, 12]];
    function choir(m, t, dur, vol) {
      const src = ac.createGain();
      [-6, 5].forEach(dt => {
        const o = ac.createOscillator(); o.type = "sawtooth";
        o.frequency.value = hz(m); o.detune.value = dt; vibAmt.connect(o.detune);
        o.connect(src); o.start(t); o.stop(t + dur + 3.1);
      });
      const g = ac.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol, t + dur * 0.5);
      g.gain.linearRampToValueAtTime(0, t + dur + 3);
      FORM.forEach(([f, a, q]) => {
        const bp = ac.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = f; bp.Q.value = q;
        const fg = ac.createGain(); fg.gain.value = a; src.connect(bp); bp.connect(fg); fg.connect(g);
      });
      route(g, 0.15, 1.8);
    }

    // ---- celesta ----
    function celesta(m, t, vol) {
      const g = ac.createGain();
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.00001, t + 1.8);
      [[1, 1], [4.01, 0.18], [2, 0.12]].forEach(([p, a]) => {
        const o = ac.createOscillator(), og = ac.createGain();
        o.frequency.value = hz(m) * p; og.gain.value = a;
        o.connect(og); og.connect(g); o.start(t); o.stop(t + 1.9);
      });
      route(g, 0.4, 1.6);
    }

    // ---- the composer ----
    const BAR = 4.6, BEAT = BAR / 4;
    let tNext = ac.currentTime + 0.3, phraseNo = 0, mel = 74;
    const chordTones = (ch, lo, hi) => { const r = []; for (let m = lo; m <= hi; m++) if (ch.pcs.includes(m % 12)) r.push(m); return r; };
    const nearest = (arr, m) => arr.reduce((a, b) => Math.abs(b - m) < Math.abs(a - m) ? b : a);
    function stepScale(m, s) {
      let k = 0; const dir = Math.sign(s);
      while (k < Math.abs(s)) { m += dir; if (inScale(m)) k++; }
      return m;
    }
    const events = [];                                      // for the "now playing" readout
    function phrase(t0) {
      const chords = PHRASES[phraseNo % PHRASES.length];
      const cycle = Math.floor(phraseNo / PHRASES.length);
      const last = phraseNo % 4 === 3;
      const swell = [0.6, 0.8, 1, 0.9][phraseNo % 4];
      chords.forEach((ch, b) => {
        const t = t0 + b * BAR;
        events.push([t, ch]);
        const human = () => (Math.random() - 0.5) * 0.08;
        // left hand
        piano(ch.bass + 12, t + human(), 0.42);
        if (Math.random() < 0.55) piano(ch.bass + 19, t + BEAT * 2 + human(), 0.26);
        if (Math.random() < 0.35) piano(ch.bass, t + 0.03, 0.22);
        // right hand
        const tones = chordTones(ch, 65, 84);
        const ending = last && b === 3;
        if (ending) {
          [0, 0.18, 0.36].forEach((d, k) => piano(tones[k * 2 % tones.length], t + d, 0.24));
        } else if (Math.random() < 0.22) {                   // a gentle broken chord
          chordTones(ch, 55, 74).slice(0, 5).forEach((m, k) => piano(m, t + k * BEAT * 0.5 + human(), 0.2 + k * 0.02));
        } else {
          const rh = RHYTHMS[Math.floor(Math.random() * RHYTHMS.length)];
          rh.forEach(beat => {
            mel = stepScale(mel, [-2, -1, -1, 1, 1, 2, 0][Math.floor(Math.random() * 7)] || 1);
            if (beat % 2 === 0) mel = nearest(tones, mel);
            if (mel > 81) mel -= 5; if (mel < 66) mel += 5;
            const tt = t + beat * BEAT + human(), v = 0.26 + Math.random() * 0.16;
            piano(mel, tt, v);
            if (state.mode === "full" && Math.random() < 0.22) celesta(mel + 24, tt + BEAT * 1.5, 0.035);
          });
        }
        // strings under it
        if (state.mode !== "piano") {
          const low = chordTones(ch, 45, 64);
          strings([ch.bass + 12, low[1] || low[0], low[2] || low[0]], t, BAR + 0.6, 0.016 * swell);
        }
      });
      if (state.mode === "full" && (phraseNo % 4 === 2 || phraseNo % 4 === 3)) {
        const top = chordTones(chords[0], 69, 77);
        choir(top[Math.floor(Math.random() * top.length)], t0 + 0.2, BAR * 2, 0.05);
        const top2 = chordTones(chords[2], 69, 77);
        choir(top2[Math.floor(Math.random() * top2.length)], t0 + BAR * 2 + 0.2, BAR * 2, 0.045);
      }
      phraseNo++;
      return t0 + 4 * BAR + (last ? BAR : 0);              // breathe: a silent bar after every 4th phrase
    }
    function scheduleUntil(t) { while (tNext < t) tNext = phrase(tNext); }
    function currentChord(at) {
      const now = at == null ? ac.currentTime : at; let c = CH.Dm9;
      for (const [t, ch] of events) if (t <= now) c = ch;
      while (events.length > 40) events.shift();
      return c;
    }

    // ---------- star voices: every dream theme has its own small sound ----------
    const nlong = ac.createBuffer(1, ac.sampleRate * 1.6, ac.sampleRate);
    { const d = nlong.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    function env(g, t, a, peak, dur) {
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + a);
      g.gain.exponentialRampToValueAtTime(0.00001, t + dur);
    }
    function partials(m, t, vol, dur, list, pan, send, attack) {   // list: [ratio, amp, decayScale]
      const g = ac.createGain(); env(g, t, attack || 0.004, vol, dur);
      list.forEach(([r, a, k]) => {
        const o = ac.createOscillator(), og = ac.createGain();
        o.frequency.value = hz(m) * r;
        og.gain.setValueAtTime(a, t); og.gain.exponentialRampToValueAtTime(0.0001, t + dur * (k || 1));
        o.connect(og); og.connect(g); o.start(t); o.stop(t + dur + 0.1);
      });
      route(g, pan, send); return g;
    }
    const V = {
      piano:   (m, t, v) => piano(m, t, 0.34 * v),
      low:     (m, t, v) => piano(m, t, 0.4 * v),
      celesta: (m, t, v) => celesta(m, t, 0.055 * v),
      harp:    (m, t, v) => {                                   // plucked string
        const lp = ac.createBiquadFilter(); lp.type = "lowpass";
        lp.frequency.setValueAtTime(3200, t); lp.frequency.exponentialRampToValueAtTime(500, t + 1);
        const g = ac.createGain(); env(g, t, 0.003, 0.07 * v, 2.6);
        const o = ac.createOscillator(); o.type = "triangle"; o.frequency.value = hz(m);
        const o2 = ac.createOscillator(); o2.frequency.value = hz(m) * 2; const g2 = ac.createGain(); g2.gain.value = 0.3;
        o.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(g);
        o.start(t); o2.start(t); o.stop(t + 2.7); o2.stop(t + 2.7); route(g, -0.3, 1.3);
      },
      marimba: (m, t, v) => partials(m, t, 0.09 * v, 0.8, [[1, 1, 1], [4, 0.35, 0.2], [10, 0.08, 0.08]], 0.2, 0.7),
      bell:    (m, t, v) => partials(m, t, 0.045 * v, 4, [[1, 1, 1], [2.76, 0.45, 0.6], [5.4, 0.22, 0.4], [8.93, 0.1, 0.25]], 0.35, 1.5),
      glass:   (m, t, v) => partials(m, t, 0.04 * v, 5, [[1, 1, 1], [2, 0.3, 0.8], [3, 0.15, 0.6]], 0.5, 2, 0.06),
      gong:    (m, t, v) => partials(m, t, 0.07 * v, 5, [[1, 1, 1], [1.48, 0.5, 0.8], [2.13, 0.35, 0.6], [3.1, 0.2, 0.4]], -0.2, 1.4, 0.02),
      drop:    (m, t, v) => {                                   // a water drop: a note that bends down a little
        const g = ac.createGain(); env(g, t, 0.003, 0.06 * v, 1.6);
        const o = ac.createOscillator(); o.frequency.setValueAtTime(hz(m) * 1.06, t);
        o.frequency.exponentialRampToValueAtTime(hz(m), t + 0.12);
        o.connect(g); o.start(t); o.stop(t + 1.7); route(g, -0.4, 2.2);
      },
      choir:   (m, t, v) => choir(m, t, 0.7, 0.06 * v),
      ghost:   (m, t, v) => {                                   // a wobbly, slightly out-of-tune voice
        choir(m, t, 0.9, 0.05 * v);
        const g = ac.createGain(); env(g, t, 0.4, 0.02 * v, 2.6);
        const o = ac.createOscillator(); o.frequency.value = hz(m) * 1.012;
        const w = ac.createOscillator(); w.frequency.value = 3; const wg = ac.createGain(); wg.gain.value = 18;
        w.connect(wg); wg.connect(o.detune); o.connect(g); o.start(t); w.start(t); o.stop(t + 2.7); w.stop(t + 2.7);
        route(g, 0.5, 2);
      },
      theremin:(m, t, v) => {                                   // a sliding sine with vibrato
        const g = ac.createGain(); g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.035 * v, t + 0.25); g.gain.linearRampToValueAtTime(0, t + 1.6);
        const o = ac.createOscillator(); o.frequency.setValueAtTime(hz(m) * 0.84, t);
        o.frequency.exponentialRampToValueAtTime(hz(m), t + 0.35);
        const w = ac.createOscillator(); w.frequency.value = 6; const wg = ac.createGain(); wg.gain.value = 14;
        w.connect(wg); wg.connect(o.detune); o.connect(g); o.start(t); w.start(t); o.stop(t + 1.7); w.stop(t + 1.7);
        route(g, 0.3, 1.8);
      },
      swish:   (m, t, v) => {                                   // wind / rain brushing past
        const n = ac.createBufferSource(); n.buffer = nlong;
        const bp = ac.createBiquadFilter(); bp.type = "bandpass"; bp.Q.value = 0.8;
        bp.frequency.setValueAtTime(1600, t); bp.frequency.exponentialRampToValueAtTime(350, t + 1.4);
        const g = ac.createGain(); g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.05 * v, t + 0.3); g.gain.linearRampToValueAtTime(0, t + 1.5);
        n.connect(bp); bp.connect(g); n.start(t); n.stop(t + 1.6); route(g, -0.5, 1.2);
      },
      tick:    (m, t, v) => piano(m, t, 0.2 * v),
    };
    // [voice, step along the chord (0 = the star's own note), delay in seconds, loudness]
    // "low" voices use the bass register; the rest sit above the music
    const STAR = {
      house:    [["piano", 0, 0, 1]],                                            // home: one warm piano note
      family:   [["piano", 0, 0, 0.9], ["piano", -1, 0.03, 0.7]],                 // two notes together
      school:   [["celesta", 0, 0, 1]],                                          // plain little bell
      travel:   [["harp", 0, 0, 1], ["harp", 1, 0.13, 0.9], ["harp", 2, 0.26, 0.8]],   // walking upward
      water:    [["drop", 1, 0, 1], ["drop", 0, 0.22, 0.6]],                      // two drops
      love:     [["choir", 0, 0, 1], ["celesta", 1, 0.06, 0.5]],                  // a sung breath
      death:    [["low", 0, 0, 1]],                                              // one low, dark note
      falling:  [["celesta", 2, 0, 1], ["celesta", 1, 0.11, 0.85], ["celesta", 0, 0.22, 0.7], ["celesta", -1, 0.33, 0.55]],
      flying:   [["harp", -1, 0, 0.7], ["harp", 0, 0.07, 0.8], ["harp", 1, 0.14, 0.9], ["harp", 2, 0.21, 1], ["celesta", 4, 0.3, 0.6]],
      dance:    [["marimba", 0, 0, 1], ["marimba", 1, 0.17, 0.85], ["marimba", 0, 0.34, 0.7]],
      animals:  [["marimba", 0, 0, 1]],                                          // a soft wooden knock
      chase:    [["piano", 0, 0, 0.9], ["piano", 0, 0.12, 0.75], ["piano", 0, 0.24, 0.6]],  // a quick heartbeat
      fire:     [["bell", 1, 0, 0.8], ["celesta", 2, 0.03, 0.5], ["celesta", 3, 0.09, 0.4]], // a flicker
      storm:    [["swish", 0, 0, 1], ["low", 0, 0.05, 0.7]],                      // wind + a low note
      sky:      [["celesta", 3, 0, 0.9], ["celesta", 4, 0.16, 0.6]],              // a high twinkle
      moon:     [["glass", 3, 0, 1]],                                            // a long glass tone
      monsters: [["ghost", -2, 0, 1]],                                           // an eerie voice
      aliens:   [["theremin", 1, 0, 1]],                                         // a sliding, wobbly tone
      dragons:  [["gong", 0, 0, 1], ["celesta", 2, 0.25, 0.5]],                   // a low gong
      castle:   [["bell", 0, 0, 1], ["bell", 2, 0.28, 0.6]],                      // two tower bells
      none:     [["tick", 0, 0, 1]],                                             // everyday dreams: a soft tap
    };
    const LOW = { low: 1, gong: 1 };
    const BAL = { flying: 0.65, dragons: 0.7, travel: 0.75, water: 0.8, aliens: 0.85, animals: 1.6, dance: 1.2, school: 1.15 };   // even out loudness
    function star(theme, level, at) {
      const t = (at == null ? ac.currentTime : at) + 0.01, ch = currentChord(t);
      const hi = chordTones(ch, 67, 100), lo = chordTones(ch, 33, 52);
      const base = Math.max(0, Math.min(hi.length - 5, 3 + (level | 0)));     // rarer dreams sit higher
      (STAR[theme] || STAR.none).forEach(([voice, step, d, v]) => {
        const list = LOW[voice] ? lo : hi, b = LOW[voice] ? 1 : base;
        const m = list[Math.max(0, Math.min(list.length - 1, b + step))];
        V[voice](m, t + d, v * (BAL[theme] || 1));
      });
    }

    // a hover chime that always fits the chord playing now (rare dreams ring higher)
    function chime(level) {
      const ch = currentChord(), tones = chordTones(ch, 74, 98);
      const i = Math.max(0, Math.min(tones.length - 1, Math.floor(tones.length / 2 + level)));
      const t = ac.currentTime + 0.01;
      if (state.mode === "piano") piano(tones[i], t, 0.3); else celesta(tones[i], t, 0.05);
    }
    return { master, scheduleUntil, chime, star, themes: Object.keys(STAR), currentChord, setMode: m => state.mode = m, get mode() { return state.mode; } };
  }

  // live helper for pages: start on a click, keeps itself scheduled
  function start(mode) {
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    const out = ac.createGain(); out.gain.value = 0; out.connect(ac.destination);
    const eng = create(ac, out, mode);
    eng.scheduleUntil(ac.currentTime + 6);
    const timer = setInterval(() => eng.scheduleUntil(ac.currentTime + 6), 1000);
    out.gain.setTargetAtTime(0.9, ac.currentTime, 1.5);
    return { ac, out, eng, timer };
  }
  window.GrisAmbient = { create, start };
})();
