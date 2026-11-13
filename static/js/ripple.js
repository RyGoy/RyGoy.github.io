// Water ripples on the page background (archive.css, .bg-ripple). Moving the pointer over the page (or touching it)
// drops ripples into a height field (the classic two-buffer water simulation), which spread and fade; each ring is
// drawn as faint light and shade on a canvas fixed behind everything else (z-index -1, no pointer events), so text,
// cards, the sidebar and pictures stay still and clickable, and the ripple shows only where the background does.
// Light and shade both, so it shows on dark and light themes alike. It runs only while ripples are moving, and is
// left out under reduced motion.
(() => {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const CELL = 6;          // CSS pixels per simulation cell (the canvas is scaled up, smoothly, to the screen)
  const DAMPING = 0.97;    // the share of a ripple left after each step: lower fades sooner
  const DROP = 2.5;        // the depth of a drop where the pointer moves
  const STRENGTH = 0.1;    // the most a ring lightens or darkens the background (opacity)
  const GAIN = 0.6;        // slope to light and shade
  const canvas = document.createElement('canvas');
  canvas.className = 'bg-ripple';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.prepend(canvas);
  const ctx = canvas.getContext('2d');
  let cols, rows, cur, prev, image, frame = 0, drops = [];

  const resize = () => {
    cols = Math.max(3, Math.ceil(innerWidth / CELL));
    rows = Math.max(3, Math.ceil(innerHeight / CELL));
    canvas.width = cols; canvas.height = rows;
    cur = new Float32Array(cols * rows); prev = new Float32Array(cols * rows);
    image = ctx.createImageData(cols, rows);
  };

  const drop = (x, y, depth) => {
    const cx = Math.round(x / CELL), cy = Math.round(y / CELL);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const px = cx + dx, py = cy + dy;
      if (px > 0 && py > 0 && px < cols - 1 && py < rows - 1) cur[py * cols + px] -= depth * (dx || dy ? 0.5 : 1);
    }
  };

  const step = () => {
    frame = 0;
    for (const [x, y, depth] of drops) drop(x, y, depth);
    drops = [];
    // Each cell moves toward the average of its neighbours, overshooting (that is the wave), and loses a little.
    for (let y = 1; y < rows - 1; y++) for (let x = 1, i = y * cols + 1; x < cols - 1; x++, i++) {
      prev[i] = ((cur[i - 1] + cur[i + 1] + cur[i - cols] + cur[i + cols]) * 0.5 - prev[i]) * DAMPING;
    }
    [cur, prev] = [prev, cur];
    // Light from the top left: a slope facing it is lightened, one facing away darkened.
    const px = image.data;
    let moving = false;
    for (let y = 1; y < rows - 1; y++) for (let x = 1, i = y * cols + 1; x < cols - 1; x++, i++) {
      const shade = Math.max(-1, Math.min(1, (cur[i - 1] - cur[i + 1] + cur[i - cols] - cur[i + cols]) * GAIN));
      const o = i * 4, v = shade > 0 ? 255 : 0;
      px[o] = px[o + 1] = px[o + 2] = v;
      px[o + 3] = Math.abs(shade) * STRENGTH * 255;
      if (!moving && Math.abs(cur[i]) > 0.02) moving = true;
    }
    ctx.putImageData(image, 0, 0);
    if (moving) frame = requestAnimationFrame(step);
    else { cur.fill(0); prev.fill(0); ctx.clearRect(0, 0, cols, rows); }
  };
  const start = () => { if (!frame) frame = requestAnimationFrame(step); };

  // A drop each time the pointer moves (deeper the faster it moves) and a deeper one where it presses.
  let last = null;
  addEventListener('pointermove', (e) => {
    const moved = last ? Math.hypot(e.clientX - last[0], e.clientY - last[1]) : 0;
    last = [e.clientX, e.clientY];
    if (moved < 2) return;
    drops.push([e.clientX, e.clientY, DROP * Math.min(1, moved / 24)]);
    start();
  }, { passive: true });
  addEventListener('pointerdown', (e) => { drops.push([e.clientX, e.clientY, DROP * 2]); start(); }, { passive: true });
  addEventListener('resize', () => { cancelAnimationFrame(frame); frame = 0; resize(); });
  resize();
})();
