// ambient-gris.js — a slow, generative score in the spirit of Gris:
// a soft felt piano in D minor, low strings, a wordless choir and a celesta,
// all in a big hall reverb. Nothing is a recording; every note is made here.
// Modes: "atmos" (dreamy atmosphere only, so the star sounds lead), "piano", "strings", "full".
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

    // a soft echo that star sounds (and far-away notes) fall into
    const echo = ac.createDelay(3); echo.delayTime.value = 0.62;
    const eLp = ac.createBiquadFilter(); eLp.type = "lowpass"; eLp.frequency.value = 2400;
    const eFb = ac.createGain(); eFb.gain.value = 0.42;
    echo.connect(eLp); eLp.connect(eFb); eFb.connect(echo);
    const eOut = ac.createGain(); eOut.gain.value = 0.5; eLp.connect(eOut); eOut.connect(dry); eOut.connect(rev);
    let toEcho = false;
    function route(node, pan, send) {
      const p = ac.createStereoPanner(); p.pan.value = Math.max(-0.8, Math.min(0.8, pan));
      node.connect(p); p.connect(dry);
      if (toEcho) p.connect(echo);
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


    // ---------- the dreamy atmosphere (mode "atmos") ----------
    // a slow tape-like wobble shared by the pads, so everything floats a little
    const wob = ac.createOscillator(); wob.frequency.value = 0.18;
    const wobAmt = ac.createGain(); wobAmt.gain.value = 7; wob.connect(wobAmt); wob.start();
    // soft space-air: filtered noise whose colour drifts very slowly
    const abuf = ac.createBuffer(2, ac.sampleRate * 4, ac.sampleRate);
    for (let c = 0; c < 2; c++) { const d = abuf.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    const air = ac.createBufferSource(); air.buffer = abuf; air.loop = true;
    const aBp = ac.createBiquadFilter(); aBp.type = "bandpass"; aBp.frequency.value = 900; aBp.Q.value = 0.5;
    const aLfo = ac.createOscillator(); aLfo.frequency.value = 0.035;
    const aLfoAmt = ac.createGain(); aLfoAmt.gain.value = 500; aLfo.connect(aLfoAmt); aLfoAmt.connect(aBp.frequency); aLfo.start();
    const airG = ac.createGain(); airG.gain.value = 0;
    air.connect(aBp); aBp.connect(airG); airG.connect(master); const airRev = ac.createGain(); airRev.gain.value = 0.6; airG.connect(airRev); airRev.connect(rev);
    air.start();

    function pad(ms, t, dur, vol) {                    // a chord that blooms in and fades away
      ms.forEach((m, k) => {
        const lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = 0.4;
        lp.frequency.setValueAtTime(300, t);
        lp.frequency.linearRampToValueAtTime(900 + k * 150, t + dur * 0.5);
        lp.frequency.linearRampToValueAtTime(350, t + dur);
        const g = ac.createGain();
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + dur * 0.45);
        g.gain.linearRampToValueAtTime(0, t + dur);
        [-11, 0, 10].forEach(dt => {
          const o = ac.createOscillator(); o.type = k === 0 ? "sine" : "triangle";
          o.frequency.value = hz(m); o.detune.value = dt; wobAmt.connect(o.detune);
          o.connect(lp); o.start(t); o.stop(t + dur + 0.1);
        });
        lp.connect(g); route(g, (k - 1.5) * 0.4, 1.8);
      });
    }
    function swellNote(m, t, vol) {                    // a note that grows in, like tape played backwards
      const g = ac.createGain(); const len = 3.2;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + len);
      g.gain.linearRampToValueAtTime(0, t + len + 0.08);
      [[1, 1], [2, 0.25], [3, 0.08]].forEach(([r, a]) => {
        const o = ac.createOscillator(), og = ac.createGain(); o.frequency.value = hz(m) * r; og.gain.value = a;
        wobAmt.connect(o.detune); o.connect(og); og.connect(g); o.start(t); o.stop(t + len + 0.1);
      });
      toEcho = true; route(g, (Math.random() - 0.5) * 1.2, 2.6); toEcho = false;
    }
    function hum(m, t, dur, vol) {                     // a far-off voice humming "mm"
      const src = ac.createGain();
      [-5, 6].forEach(dt => {
        const o = ac.createOscillator(); o.type = "sawtooth"; o.frequency.value = hz(m); o.detune.value = dt;
        vibAmt.connect(o.detune); o.connect(src); o.start(t); o.stop(t + dur + 0.1);
      });
      const lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 650; lp.Q.value = 0.3;
      const g = ac.createGain();
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + dur * 0.5); g.gain.linearRampToValueAtTime(0, t + dur);
      [[300, 1, 5], [900, 0.25, 7]].forEach(([f, a, q]) => {
        const bp = ac.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = f; bp.Q.value = q;
        const fg = ac.createGain(); fg.gain.value = a; src.connect(bp); bp.connect(fg); fg.connect(lp);
      });
      lp.connect(g); route(g, -0.3, 2.4);
    }
    function shimmer(ms, t, vol) {                     // faint high sparkle that hangs in the air
      ms.forEach((m, k) => {
        const g = ac.createGain(), tr = ac.createOscillator(), tg = ac.createGain();
        g.gain.value = 0; g.gain.setValueAtTime(0, t); g.gain.setValueAtTime(0, t + k * 0.7); g.gain.linearRampToValueAtTime(vol, t + k * 0.7 + 3);
        g.gain.linearRampToValueAtTime(0, t + k * 0.7 + 9);
        const trem = ac.createGain(); trem.gain.value = 0.65;
        tr.frequency.value = 0.4 + k * 0.13; tg.gain.value = 0.35; tr.connect(tg); tg.connect(trem.gain);
        const o = ac.createOscillator(); o.frequency.value = hz(m);
        o.connect(trem); trem.connect(g); o.start(t); tr.start(t); o.stop(t + k * 0.7 + 9.2); tr.stop(t + k * 0.7 + 9.2);
        route(g, (k - 1) * 0.6, 3);
      });
    }


    // ---------- deep space (fades in when nobody is playing the stars) ----------
    const idleG = ac.createGain(); idleG.gain.value = 0;
    idleG.connect(master);
    const idleSend = ac.createGain(); idleSend.gain.value = 1.2; idleG.connect(idleSend); idleSend.connect(rev);
    function toIdle(node, pan) {
      const p = ac.createStereoPanner(); p.pan.value = Math.max(-0.95, Math.min(0.95, pan));
      node.connect(p); p.connect(idleG);
    }
    // a low hum on D and A that slowly beats, like distance itself
    {
      const lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 260; lp.Q.value = 0.3;
      const hg = ac.createGain(); hg.gain.value = 0.0055;
      const swell = ac.createOscillator(); swell.frequency.value = 0.05;
      const sw = ac.createGain(); sw.gain.value = 0.0028; swell.connect(sw); sw.connect(hg.gain); swell.start();
      [[73.42, 1], [73.72, 0.8], [110.0, 0.5], [110.35, 0.4], [146.83, 0.18]].forEach(([f, a]) => {
        const o = ac.createOscillator(), og = ac.createGain(); o.frequency.value = f; og.gain.value = a;
        o.connect(og); og.connect(lp); o.start();
      });
      lp.connect(hg); toIdle(hg, 0);
    }
    // solar wind: wide, slow, darker than the air
    for (let c = 0; c < 2; c++) {
      const n = ac.createBufferSource(); n.buffer = abuf; n.loop = true; n.playbackRate.value = 0.5 + c * 0.13;
      const lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = 1.2; lp.frequency.value = 380;
      const l = ac.createOscillator(); l.frequency.value = 0.021 + c * 0.013;
      const la = ac.createGain(); la.gain.value = 260; l.connect(la); la.connect(lp.frequency); l.start();
      const g = ac.createGain(); g.gain.value = 0.0045;
      const gl = ac.createOscillator(); gl.frequency.value = 0.04 + c * 0.017;
      const gla = ac.createGain(); gla.gain.value = 0.0035; gl.connect(gla); gla.connect(g.gain); gl.start();
      n.connect(lp); lp.connect(g); toIdle(g, c ? 0.8 : -0.8); n.start();
    }
    // a faraway star twinkling: tiny, high, short, mostly reverb
    function twinkle(t, pan, level) {
      const ch = currentChord(t), hi = chordTones(ch, 88, 108);
      const m = hi[Math.max(0, Math.min(hi.length - 1, Math.floor(Math.random() * 4) + (level | 0)))];
      const g = ac.createGain(); env(g, t, 0.01, 0.022 + Math.random() * 0.016, 1.1);
      const o = ac.createOscillator(); o.frequency.value = hz(m);
      o.connect(g); o.start(t); o.stop(t + 1);
      toIdle(g, pan == null ? Math.random() * 1.8 - 0.9 : pan);
    }
    // a distant signal: a soft tone gliding slowly up and dissolving
    function signal(t) {
      const lo = chordTones(currentChord(t), 57, 69), m = lo[Math.floor(Math.random() * lo.length)];
      const o = ac.createOscillator(); o.type = "triangle";
      o.frequency.setValueAtTime(hz(m), t); o.frequency.exponentialRampToValueAtTime(hz(m + 12), t + 7);
      wobAmt.connect(o.detune);
      const bp = ac.createBiquadFilter(); bp.type = "bandpass"; bp.Q.value = 2;
      bp.frequency.setValueAtTime(hz(m) * 2, t); bp.frequency.exponentialRampToValueAtTime(hz(m) * 5, t + 7);
      const g = ac.createGain(); g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.014, t + 3); g.gain.linearRampToValueAtTime(0, t + 7.5);
      o.connect(bp); bp.connect(g); o.start(t); o.stop(t + 7.6);
      toIdle(g, Math.random() * 1.2 - 0.6);
    }
    let tTw = ac.currentTime + 1, tSig = ac.currentTime + 12, extTwinkles = false;
    function scheduleSpace(until) {
      if (!extTwinkles) while (tTw < until) { twinkle(tTw); tTw += 0.6 + Math.random() * 1.8; }
      while (tSig < until) { signal(tSig); tSig += 22 + Math.random() * 25; }
    }
    function setIdle(on) {
      const now = ac.currentTime;
      idleG.gain.cancelScheduledValues(now);
      idleG.gain.setTargetAtTime(on ? 1 : 0, now, on ? 2.2 : 0.5);    // slow to open, quick to step back
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
    let aIdx = 0;
    const ACH = PHRASES.flat();
    function atmos(t0) {
      const B = 9, ch = ACH[aIdx++ % ACH.length];
      events.push([t0, ch]);
      const low = chordTones(ch, 50, 69);
      pad([ch.bass + 12, low[0], low[1], low[2]].filter(Boolean), Math.max(0, t0 - 1), B + 5, 0.0018);
      if (Math.random() < 0.45) hum(nearest(chordTones(ch, 55, 64), 59), t0 + 1 + Math.random() * 2, 7, 0.0025);
      if (Math.random() < 0.5) shimmer(chordTones(ch, 86, 98).slice(0, 3), t0 + Math.random() * 3, 0.0009);
      if (Math.random() < 0.35) {
        const hi = chordTones(ch, 72, 86);
        swellNote(hi[Math.floor(Math.random() * hi.length)], t0 + 2 + Math.random() * 4, 0.005);
      }
      return t0 + B;
    }
    function phrase(t0) {
      if (state.mode === "atmos") return atmos(t0);
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
    function scheduleUntil(t) { while (tNext < t) tNext = phrase(tNext); scheduleSpace(t); }
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
        toEcho = true; V[voice](m, t + d, v * (BAL[theme] || 1)); toEcho = false;
      });
    }

    // a hover chime that always fits the chord playing now (rare dreams ring higher)
    function chime(level) {
      const ch = currentChord(), tones = chordTones(ch, 74, 98);
      const i = Math.max(0, Math.min(tones.length - 1, Math.floor(tones.length / 2 + level)));
      const t = ac.currentTime + 0.01;
      if (state.mode === "piano") piano(tones[i], t, 0.3); else celesta(tones[i], t, 0.05);
    }
    const setAir = () => airG.gain.setTargetAtTime(state.mode === "atmos" ? 0.003 : 0, ac.currentTime, 1.5);
    setAir();
    return { master, scheduleUntil, chime, star, setIdle, twinkle: (pan, level) => { extTwinkles = true; twinkle(ac.currentTime + 0.02, pan, level); }, themes: Object.keys(STAR), currentChord, setMode: m => { state.mode = m; setAir(); }, get mode() { return state.mode; } };
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
