// The dark theme's blade (partials/body.html, archive.css .hero-saber) sounds as it ignites: a crackle, a rising
// whoosh and the hum, made with Web Audio (no recording). The hum holds until the red bleed starts, then fades out
// gradually and is gone when the bleed finishes. The timings are read from the blade's own CSS animations, so the
// sound follows any change to them. Browsers let a page make sound only after the visitor clicks or taps on it, so it
// is heard when Dark is chosen, not when a page opens already in Dark. Reduced motion has no animation, so no sound.
const blade = document.querySelector('.hero-saber-blade');
const AudioCtx = window.AudioContext || window.webkitAudioContext;
if (blade && AudioCtx) {
  let ctx = null;
  let stop = null;
  const silence = () => { if (stop) { stop(); stop = null; } };

  const seconds = (value) => (value.endsWith('ms') ? parseFloat(value) / 1000 : parseFloat(value));
  const timing = (name) => {
    const style = getComputedStyle(blade);
    const index = style.animationName.split(',').map((n) => n.trim()).indexOf(name);
    if (index < 0) return null;
    const pick = (list) => { const items = list.split(','); return seconds(items[index % items.length].trim()); };
    return { delay: pick(style.animationDelay), duration: pick(style.animationDuration) };
  };

  const noise = (length) => {
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * length), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  };

  const play = (igniteFor, fadeFrom, fadeTo) => {
    const t0 = ctx.currentTime;
    const end = t0 + fadeTo;
    const sources = [];
    const master = ctx.createGain();
    master.gain.setValueAtTime(0, t0);
    master.gain.linearRampToValueAtTime(0.3, t0 + 0.04);
    // A gradual fade: (1 - x)² of the level over the bleed (a quarter by halfway, a sixteenth by three quarters),
    // silent as it finishes.
    const fade = new Float32Array(64).map((_, i) => 0.3 * (1 - i / 63) ** 2);
    master.gain.setValueCurveAtTime(fade, t0 + fadeFrom, fadeTo - fadeFrom);
    master.connect(ctx.destination);

    // The crackle as it catches, and a whoosh that rises as the blade shoots out.
    const snap = ctx.createBufferSource(); snap.buffer = noise(0.08);
    const snapGain = ctx.createGain(); snapGain.gain.setValueAtTime(0.7, t0); snapGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.08);
    snap.connect(snapGain).connect(master); snap.start(t0); sources.push(snap);
    const whoosh = ctx.createBufferSource(); whoosh.buffer = noise(igniteFor + 0.3);
    const band = ctx.createBiquadFilter(); band.type = 'bandpass'; band.Q.value = 1.4;
    band.frequency.setValueAtTime(350, t0); band.frequency.exponentialRampToValueAtTime(2800, t0 + igniteFor);
    const whooshGain = ctx.createGain();
    whooshGain.gain.setValueAtTime(0, t0); whooshGain.gain.linearRampToValueAtTime(0.45, t0 + igniteFor * 0.3);
    whooshGain.gain.exponentialRampToValueAtTime(0.001, t0 + igniteFor + 0.3);
    whoosh.connect(band).connect(whooshGain).connect(master); whoosh.start(t0); sources.push(whoosh);

    // The hum: two slightly detuned saws and an octave, low-passed, rising in pitch as the blade extends,
    // with a slow wobble.
    const hum = ctx.createGain();
    hum.gain.setValueAtTime(0, t0); hum.gain.linearRampToValueAtTime(0.5, t0 + igniteFor);
    const low = ctx.createBiquadFilter(); low.type = 'lowpass'; low.frequency.value = 650;
    hum.connect(low).connect(master);
    [[88, 'sawtooth', 0.5], [90.5, 'sawtooth', 0.5], [176, 'sine', 0.35]].forEach(([freq, type, level]) => {
      const osc = ctx.createOscillator(); osc.type = type;
      osc.frequency.setValueAtTime(freq * 0.6, t0); osc.frequency.exponentialRampToValueAtTime(freq, t0 + igniteFor);
      const gain = ctx.createGain(); gain.gain.value = level;
      osc.connect(gain).connect(hum); osc.start(t0); sources.push(osc);
    });
    const wobble = ctx.createOscillator(); wobble.frequency.value = 0.7;
    const depth = ctx.createGain(); depth.gain.value = 0.08;
    wobble.connect(depth).connect(hum.gain); wobble.start(t0); sources.push(wobble);

    sources.forEach((source) => source.stop(end + 0.05));
    return () => {
      const now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(master.gain.value, now);
      master.gain.linearRampToValueAtTime(0, now + 0.08);
      sources.forEach((source) => { try { source.stop(now + 0.1); } catch { /* already stopped */ } });
    };
  };

  // Start the audio on the visitor's first click or tap (choosing Dark is one), so it is ready, not starting up,
  // when the blade ignites.
  const warm = () => { ctx = ctx || new AudioCtx(); if (ctx.state === 'suspended') ctx.resume().catch(() => {}); };
  document.addEventListener('pointerdown', warm, { once: true, capture: true });
  document.addEventListener('keydown', warm, { once: true, capture: true });

  // animationstart fires when the ignition begins (after its delay), each time the blade is shown.
  blade.addEventListener('animationstart', (event) => {
    if (event.target !== blade || event.animationName !== 'saber-ignite') return;
    silence();
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
    const ignite = timing('saber-ignite');
    const bleed = timing('saber-bleed');
    if (!ignite || !bleed) return;
    const started = performance.now();
    ctx = ctx || new AudioCtx();
    const go = () => {
      const late = (performance.now() - started) / 1000;
      const fadeFrom = bleed.delay - ignite.delay - late;
      const fadeTo = fadeFrom + bleed.duration;
      if (fadeTo > 0.2) stop = play(ignite.duration, Math.max(fadeFrom, 0.05), fadeTo);
    };
    if (ctx.state === 'running') go();
    else ctx.resume().then(go, () => { /* not allowed to sound */ });
  });
  // Leaving Dark hides the blade and cancels its animations: stop the sound with them.
  blade.addEventListener('animationcancel', (event) => {
    if (event.target === blade && event.animationName === 'saber-ignite') silence();
  });
  // Clicking the hilt opens its video in a pop-up (partials/body.html): stop the hum, so only the video is heard and
  // nothing sounds on after the pop-up closes.
  document.querySelector('a.hero-saber-hilt')?.addEventListener('click', silence);
}
