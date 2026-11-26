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
    let toEcho = false, starPan = 0;
    function route(node, pan, send) {
      if (toEcho && starPan) pan = pan * 0.35 + starPan;       // star sounds come from where the star sits
      const p = ac.createStereoPanner(); p.pan.value = Math.max(-0.85, Math.min(0.85, pan));
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


    // ---------- regions: every constellation is its own little universe ----------
    // As the cursor drifts across the sky, the sound of the nearest constellations
    // fades in (dragons: horns and drums; water: a stream; animals: crickets and an owl...).
    const pick = a => a[Math.floor(Math.random() * a.length)];
    const tonesAt = (t, lo, hi) => chordTones(currentChord(t), lo, hi);
    function noiseSrc(rate) { const n = ac.createBufferSource(); n.buffer = abuf; n.loop = true; n.playbackRate.value = rate || 1; return n; }
    function lfoTo(L, keep, param, rate, depth) {
      const o = keep(ac.createOscillator()); o.frequency.value = rate;
      const d = ac.createGain(); d.gain.value = depth; o.connect(d); d.connect(param); o.start();
    }
    function bed(L, keep, o) {                       // a continuous noise texture
      const n = keep(noiseSrc(o.rate)), fl = ac.createBiquadFilter();
      fl.type = o.type || "bandpass"; fl.frequency.value = o.f || 800; fl.Q.value = o.q == null ? 0.7 : o.q;
      const g = ac.createGain(); g.gain.value = o.gain;
      if (o.lfo) lfoTo(L, keep, fl.frequency, o.lfo, o.depth);
      if (o.amp) lfoTo(L, keep, g.gain, o.amp, o.ampDepth);
      const p = ac.createStereoPanner(); p.pan.value = o.pan || 0;
      n.connect(fl); fl.connect(g); g.connect(p); p.connect(L.out); n.start(ac.currentTime, Math.random() * 3);
    }
    function tone(L, keep, o) {                      // a continuous drone
      const fl = ac.createBiquadFilter(); fl.type = "lowpass"; fl.frequency.value = o.lp || 2000;
      const g = ac.createGain(); g.gain.value = o.gain;
      o.freqs.forEach((f, i) => {
        const osc = keep(ac.createOscillator()); osc.type = o.type || "sine"; osc.frequency.value = f;
        osc.detune.value = (i % 2 ? 4 : -4); if (o.wob) wobAmt.connect(osc.detune);
        osc.connect(fl); osc.start();
      });
      if (o.amp) lfoTo(L, keep, g.gain, o.amp, o.ampDepth);
      const p = ac.createStereoPanner(); p.pan.value = o.pan || 0;
      fl.connect(g); g.connect(p); p.connect(L.out);
    }
    function blip(L, t, f, o) {                      // one short sound event
      o = o || {};
      const g = ac.createGain(), dur = o.dur || 0.5;
      g.gain.value = 0;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(o.a || 0.02, t + (o.att || 0.004));
      g.gain.exponentialRampToValueAtTime(0.00001, t + dur);
      const fl = ac.createBiquadFilter(); fl.type = "lowpass"; fl.frequency.value = o.lp || 6000;
      (o.parts || [[1, 1]]).forEach(([r, a]) => {
        const osc = ac.createOscillator(), og = ac.createGain(); osc.type = o.type || "sine";
        osc.frequency.setValueAtTime(f * r, t);
        if (o.glide) osc.frequency.exponentialRampToValueAtTime(o.glide * r, t + dur * (o.glideT || 0.9));
        if (o.vib) { const v = ac.createOscillator(), vg = ac.createGain(); v.frequency.value = 6; vg.gain.value = o.vib; v.connect(vg); vg.connect(osc.detune); v.start(t); v.stop(t + dur + 0.05); }
        og.gain.value = a; osc.connect(og); og.connect(fl); osc.start(t); osc.stop(t + dur + 0.05);
      });
      const p = ac.createStereoPanner(); p.pan.value = o.pan == null ? Math.random() * 1.2 - 0.6 : o.pan;
      fl.connect(g); g.connect(p); p.connect(L.out);
    }
    function hit(L, t, o) {                          // one short noise event (tick, crackle, thunder...)
      const n = noiseSrc(o.rate), fl = ac.createBiquadFilter(), g = ac.createGain(), dur = o.dur || 0.05;
      g.gain.value = 0;
      fl.type = o.type || "bandpass"; fl.frequency.value = o.f || 2000; fl.frequency.setValueAtTime(o.f || 2000, t); fl.Q.value = o.q || 1;
      if (o.fTo) fl.frequency.exponentialRampToValueAtTime(o.fTo, t + dur);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(o.a || 0.02, t + (o.att || 0.002));
      g.gain.exponentialRampToValueAtTime(0.00001, t + dur);
      const p = ac.createStereoPanner(); p.pan.value = o.pan == null ? Math.random() * 1.4 - 0.7 : o.pan;
      n.connect(fl); fl.connect(g); g.connect(p); p.connect(L.out);
      n.start(t, Math.random() * 3); n.stop(t + dur + 0.05);
    }
    const BELL = [[1, 1], [2.76, 0.4], [5.4, 0.18], [8.93, 0.07]];
    const BOX = [[1, 1], [3.01, 0.2]];
    const REGION = {
      house: { every: 1, build: (L, k) => bed(L, k, { type: "lowpass", f: 230, gain: 0.05 }),
        ev: (t, L) => { L.k = (L.k || 0) + 1; hit(L, t, { f: L.k % 2 ? 2900 : 2300, q: 9, a: 0.035, dur: 0.05, pan: 0.35 });
          if (Math.random() < 0.06) blip(L, t + 0.5, hz(pick(tonesAt(t, 50, 62))), { type: "triangle", lp: 900, a: 0.05, dur: 3, pan: -0.2 }); } },
      family: { every: 6, build: (L, k) => tone(L, k, { freqs: [146.83, 220, 293.66, 349.23], type: "triangle", lp: 900, gain: 0.009, wob: 1, amp: 0.12, ampDepth: 0.004 }),
        ev: (t, L) => { const c = tonesAt(t, 74, 86); blip(L, t, hz(c[c.length - 1]), { parts: BOX, a: 0.035, dur: 2 }); blip(L, t + 0.6, hz(c[1] || c[0]), { parts: BOX, a: 0.03, dur: 2.4 }); } },
      school: { every: 8, build: (L, k) => bed(L, k, { f: 1500, q: 0.5, gain: 0.012 }),
        ev: (t, L) => { if (Math.random() < 0.7) { const c = tonesAt(t, 76, 90); [2, 1, 0].forEach((j, n) => blip(L, t + n * 0.38, hz(c[Math.min(j, c.length - 1)]), { parts: BELL, a: 0.03, dur: 2.2, pan: 0.4 })); } } },
      travel: { every: 0.42, build: (L, k) => bed(L, k, { type: "lowpass", f: 300, gain: 0.02 }),
        ev: (t, L) => { L.k = (L.k || 0) + 1; hit(L, t, { f: 420, q: 1.4, a: [0.05, 0.022, 0.035, 0.022][L.k % 4], dur: 0.13, pan: -0.25 });
          if (L.k % 23 === 0) blip(L, t, 760, { glide: 540, dur: 2.6, a: 0.02, att: 0.8, pan: 0.5 }); } },
      water: { every: 0.45, build: (L, k) => { bed(L, k, { f: 1300, q: 1.2, gain: 0.03, lfo: 0.3, depth: 500, amp: 7, ampDepth: 0.015, pan: -0.3 });
          bed(L, k, { type: "lowpass", f: 320, gain: 0.05, amp: 0.09, ampDepth: 0.04, pan: 0.3 }); },
        ev: (t, L) => { if (Math.random() < 0.35) { const f = hz(pick(tonesAt(t, 84, 98))); blip(L, t, f, { glide: f * 0.78, glideT: 0.5, dur: 0.25, a: 0.03 }); } } },
      love: { every: 1.35, build: (L, k) => tone(L, k, { freqs: [174.61, 220, 261.63, 329.63], type: "triangle", lp: 1100, gain: 0.008, wob: 1, amp: 0.08, ampDepth: 0.003 }),
        ev: (t, L) => { blip(L, t, 72, { lp: 300, a: 0.09, dur: 0.3, pan: 0 }); blip(L, t + 0.28, 68, { lp: 300, a: 0.06, dur: 0.3, pan: 0 }); } },
      death: { every: 12, build: (L, k) => { tone(L, k, { freqs: [73.42, 110, 146.83], lp: 400, gain: 0.02 }); bed(L, k, { type: "lowpass", f: 500, q: 0.3, gain: 0.015 }); },
        ev: (t, L) => blip(L, t, hz(pick(tonesAt(t, 45, 57))), { parts: BELL, lp: 900, a: 0.05, dur: 7, att: 0.01 }) },
      falling: { every: 4, build: (L, k) => bed(L, k, { type: "highpass", f: 2200, gain: 0.012, lfo: 0.05, depth: 1500 }),
        ev: (t, L) => { if (Math.random() < 0.75) { const f = hz(pick(tonesAt(t, 79, 91))); blip(L, t, f, { glide: f / 2, dur: 2.4, a: 0.03, att: 0.2 });
          hit(L, t, { f: 3000, fTo: 400, q: 0.8, a: 0.03, dur: 2, att: 0.4 }); } } },
      flying: { every: 5, build: (L, k) => { bed(L, k, { f: 900, q: 0.6, gain: 0.035, lfo: 0.07, depth: 700, pan: 0.45 });
          bed(L, k, { f: 1400, q: 0.8, gain: 0.025, lfo: 0.05, depth: 900, pan: -0.45 }); },
        ev: (t, L) => { if (Math.random() < 0.6) { const f = hz(pick(tonesAt(t, 79, 88))); blip(L, t, f, { glide: f * 1.5, dur: 1.9, a: 0.018, att: 0.5 }); } } },
      dance: { every: 0.3, build: () => {},
        ev: (t, L) => { L.k = (L.k || 0) + 1; const c = tonesAt(t, 74, 91), pat = [0, 2, 1, 3, 2, 4, 3, 1];
          blip(L, t, hz(c[Math.min(pat[L.k % 8], c.length - 1)]), { parts: BOX, a: L.k % 4 === 0 ? 0.045 : 0.03, dur: 0.9, pan: (L.k % 2 ? 0.3 : -0.3) });
          if (L.k % 2) hit(L, t, { f: 6500, q: 0.9, a: 0.012, dur: 0.05, pan: 0.5 }); } },
      animals: { every: 0.26, build: (L, k) => bed(L, k, { type: "lowpass", f: 400, gain: 0.012 }),
        ev: (t, L) => { if (Math.random() < 0.55) for (let j = 0; j < 3; j++) blip(L, t + j * 0.045, 4400, { dur: 0.03, a: 0.01, pan: L.cr == null ? (L.cr = Math.random() - 0.5) : L.cr });
          if (Math.random() < 0.035) { const n = 2 + Math.floor(Math.random() * 2); for (let j = 0; j < n; j++) blip(L, t + j * 0.16, 2200, { glide: 3300, dur: 0.12, a: 0.02, pan: 0.6 }); }
          if (Math.random() < 0.012) { blip(L, t, 420, { type: "triangle", lp: 900, a: 0.04, dur: 0.5, att: 0.06, pan: -0.6 }); blip(L, t + 0.6, 395, { type: "triangle", lp: 900, a: 0.035, dur: 0.7, att: 0.06, pan: -0.6 }); } } },
      chase: { every: 0.5, build: (L, k) => tone(L, k, { freqs: [73.42, 110], type: "sawtooth", lp: 320, gain: 0.008, amp: 2, ampDepth: 0.005 }),
        ev: (t, L) => { blip(L, t, 70, { lp: 300, a: 0.08, dur: 0.22, pan: 0 }); blip(L, t + 0.16, 66, { lp: 300, a: 0.05, dur: 0.22, pan: 0 }); } },
      fire: { every: 0.07, build: (L, k) => bed(L, k, { type: "lowpass", f: 350, gain: 0.05, amp: 0.3, ampDepth: 0.02 }),
        ev: (t, L) => { if (Math.random() < 0.35) hit(L, t, { f: 1500 + Math.random() * 3500, q: 2, a: 0.01 + Math.random() * 0.03, dur: 0.01 + Math.random() * 0.025 }); } },
      storm: { every: 10, build: (L, k) => { bed(L, k, { type: "highpass", f: 3500, gain: 0.02, amp: 9, ampDepth: 0.005 }); bed(L, k, { type: "lowpass", f: 120, gain: 0.04, amp: 0.07, ampDepth: 0.03 }); },
        ev: (t, L) => { if (Math.random() < 0.8) hit(L, t, { type: "lowpass", f: 160, q: 0.5, a: 0.25, dur: 4.5, att: 0.3, rate: 0.5 }); } },
      sky: { every: 2.8, build: (L, k) => { tone(L, k, { freqs: [1174.66, 1760], gain: 0.003, amp: 0.2, ampDepth: 0.002 }); bed(L, k, { f: 2500, q: 0.4, gain: 0.008 }); },
        ev: (t, L) => { if (Math.random() < 0.6) blip(L, t, hz(pick(tonesAt(t, 96, 108))), { a: 0.018, dur: 1 }); } },
      moon: { every: 7, build: (L, k) => tone(L, k, { freqs: [587.33, 880, 1174.66], gain: 0.0035, wob: 1, amp: 0.05, ampDepth: 0.002 }),
        ev: (t, L) => blip(L, t, hz(pick(tonesAt(t, 84, 96))), { parts: [[1, 1], [2, 0.3], [3, 0.12]], a: 0.035, dur: 5.5, att: 0.06 }) },
      monsters: { every: 5.5, build: (L, k) => tone(L, k, { freqs: [73.42, 74.3, 155.56], type: "sawtooth", lp: 260, gain: 0.012, wob: 1 }),
        ev: (t, L) => { if (Math.random() < 0.7) hit(L, t, { f: 1800, fTo: 600, q: 5, a: 0.05, dur: 1.6, att: 0.5 });
          if (Math.random() < 0.3) blip(L, t + 1.2, 62, { type: "sawtooth", glide: 50, lp: 500, a: 0.03, dur: 0.9, att: 0.05 }); } },
      aliens: { every: 0.4, build: (L, k) => bed(L, k, { f: 3000, q: 10, gain: 0.01, lfo: 0.5, depth: 1500 }),
        ev: (t, L) => { if (Math.random() < 0.28) { const c = tonesAt(t, 81, 100); blip(L, t, hz(pick(c)), { dur: 0.08, a: 0.018 }); blip(L, t + 0.1, hz(pick(c)), { dur: 0.08, a: 0.015 }); }
          if (Math.random() < 0.05) { const f = hz(pick(tonesAt(t, 69, 79))); blip(L, t, f, { glide: f * 1.33, dur: 2.2, a: 0.025, att: 0.3, vib: 25 }); } } },
      dragons: { every: 8, build: (L, k) => tone(L, k, { freqs: [73.42, 110, 146.83], type: "sawtooth", lp: 420, gain: 0.011, amp: 0.1, ampDepth: 0.007 }),
        ev: (t, L) => { hit(L, t, { type: "lowpass", f: 110, q: 0.6, a: 0.12, dur: 2, att: 0.01, rate: 0.6 }); blip(L, t, 58, { glide: 46, lp: 400, a: 0.08, dur: 1.6 });
          if (Math.random() < 0.6) tonesAt(t, 67, 91).slice(0, 7).forEach((m, j) => blip(L, t + 2 + j * 0.06, hz(m), { type: "triangle", lp: 2600, a: 0.022, dur: 1.6, pan: -0.5 + j * 0.15 })); } },
      castle: { every: 9, build: (L, k) => tone(L, k, { freqs: [146.83, 220, 293.66], type: "sawtooth", lp: 650, gain: 0.0045, wob: 1, amp: 0.06, ampDepth: 0.002 }),
        ev: (t, L) => { const c = tonesAt(t, 62, 74); [0, 1.3].forEach((d, j) => blip(L, t + d, hz(c[j % c.length]), { parts: BELL, lp: 2500, a: 0.04, dur: 5, pan: 0.5 }));
          if (Math.random() < 0.45) { const m = tonesAt(t, 67, 79); [0, 2, 1, 0].forEach((j, n) => blip(L, t + 4 + n * 0.36, hz(m[Math.min(j, m.length - 1)]), { type: "triangle", lp: 1800, a: 0.025, dur: 1.2, pan: -0.4 })); } } },
    };
    const NORM = {house: 0.539, family: 0.543, school: 0.791, travel: 1.047, water: 0.358, love: 0.467, death: 0.222, falling: 0.586, flying: 0.361, dance: 0.454, animals: 1.172, chase: 0.436, fire: 0.486, storm: 0.491, sky: 1.024, moon: 0.585, monsters: 0.601, aliens: 1.893, dragons: 0.603, castle: 0.537};   // per-region loudness trims (measured)
    const REG_LEVEL = 1;
    const regions = {};
    function makeRegion(id) {
      const spec = REGION[id]; if (!spec) return null;
      const out = ac.createGain(); out.gain.value = 0; out.connect(master);
      const snd = ac.createGain(); snd.gain.value = 1.2; out.connect(snd); snd.connect(rev);
      const L = { id, out, srcs: [], w: 0, next: ac.currentTime + 0.3, every: spec.every, ev: spec.ev, dead: 0 };
      spec.build(L, n => (L.srcs.push(n), n));
      return L;
    }
    function setRegions(weights) {
      const now = ac.currentTime;
      for (const id in REGION) {
        const w = weights[id] || 0; let L = regions[id];
        if (!L && w < 0.03) continue;
        if (!L) L = regions[id] = makeRegion(id);
        L.w = w; L.dead = w < 0.03 ? (L.dead || now + 5) : 0;
        L.out.gain.setTargetAtTime(w * (NORM[id] || 1) * REG_LEVEL, now, 0.7);
      }
    }
    function scheduleRegions(until) {
      const now = ac.currentTime;
      for (const id in regions) {
        const L = regions[id];
        if (L.dead && now > L.dead) {                 // nobody near for a while: switch it off
          L.srcs.forEach(n => { try { n.stop(); } catch (e) {} }); L.out.disconnect(); delete regions[id]; continue;
        }
        if (L.next < now) L.next = now + 0.05;
        while (L.next < until) { if (L.w > 0.08) L.ev(L.next, L); L.next += L.every; }
      }
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
      if (state.mode === "silent") return t0 + 9;
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
    function scheduleUntil(t) { while (tNext < t) tNext = phrase(tNext); scheduleSpace(t); scheduleRegions(Math.min(t, ac.currentTime + 1.2)); }
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
      g.gain.value = 0;
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
        const g = ac.createGain(); g.gain.value = 0; g.gain.setValueAtTime(0, t);
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
    // a star gets touched: an instant music-box ping, then (unless we are sweeping fast) its theme's sound
    const STAR_GAIN = 1.7;
    function touch(m, t, vol) {
      const g = ac.createGain(); env(g, t, 0.003, vol, 1.5);
      [[1, 1], [3.01, 0.22], [5.98, 0.05]].forEach(([r, a]) => {
        const o = ac.createOscillator(), og = ac.createGain(); o.frequency.value = hz(m) * r; og.gain.value = a;
        o.connect(og); og.connect(g); o.start(t); o.stop(t + 1.6);
      });
      route(g, 0, 1.2);
    }
    function star(theme, level, at, pan, light) {
      const t = (at == null ? ac.currentTime : at) + 0.005, ch = currentChord(t);
      const hi = chordTones(ch, 67, 100), lo = chordTones(ch, 33, 52);
      const base = Math.max(0, Math.min(hi.length - 5, 3 + (level | 0)));     // rarer dreams sit higher
      toEcho = true; starPan = pan || 0;
      touch(hi[Math.min(hi.length - 1, base + 2)], t, light ? 0.055 : 0.06);
      if (!light) (STAR[theme] || STAR.none).forEach(([voice, step, d, v]) => {
        const list = LOW[voice] ? lo : hi, b = LOW[voice] ? 1 : base;
        const m = list[Math.max(0, Math.min(list.length - 1, b + step))];
        V[voice](m, t + d, v * STAR_GAIN * (BAL[theme] || 1));
      });
      toEcho = false; starPan = 0;
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
    return { master, scheduleUntil, chime, star, setIdle, setRegions, regionIds: Object.keys(REGION), _norm: NORM, twinkle: (pan, level) => { extTwinkles = true; twinkle(ac.currentTime + 0.02, pan, level); }, themes: Object.keys(STAR), currentChord, setMode: m => { state.mode = m; setAir(); }, get mode() { return state.mode; } };
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
