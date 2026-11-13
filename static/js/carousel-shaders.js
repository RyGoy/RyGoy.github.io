// Animated backgrounds behind the home page carousel's frames (partials/carousel.html, .carousel-shader in
// archive.css), one per theme: Dark has "Ashfall" (embers glowing through drifting noise, with dark ash zooming past),
// Light has the plasma grid (lines weaving across, drawn in the theme's brass on its own parchment), and Sepia metal hexagons (at the
// end, with three.js). Dark's and Light's are fragment shaders drawn on a canvas under the frames with plain WebGL; the canvas
// follows the theme switch, draws only while the carousel is on screen, and under reduced motion shows a still frame.
// Without WebGL (or JavaScript) the carousel keeps its own background.
//
// Ashfall: Liam Egan, https://codepen.io/shubniggurath/pen/oPGyQw (a public CodePen, so MIT). Its noise came from a
// noise texture on CodePen's server; here a hash computed in the shader takes its place, and three.js (used only to
// draw one rectangle) is left out. Its clock starts at 50, not the pen's -10000.
// Plasma grid: "Shader Background" by Le Thanh, https://21st.dev/@minhxthanh/components/shader-background. Its own
// dark blue-to-purple ground and purple lines are replaced by the theme's colours: the carousel's background
// (u_ground) and --brass (u_ink), read from the stylesheet, so the lines move over the page's own parchment.
(() => {
  const VERTEX = 'attribute vec2 position; void main() { gl_Position = vec4(position, 0.0, 1.0); }';

  const ASHFALL = `
    precision highp float;
    uniform vec2 u_resolution;
    uniform float u_time;
    const float multiplier = 15.5;
    const float zoomSpeed = 10.;
    const int layers = 10;
    const int octaves = 5;
    // Dave Hoskins' "hash without sine": the same on every GPU, where sin() of large numbers is not.
    vec2 hash2(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973));
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.xx + p3.yz) * p3.zy);
    }
    float hash(vec2 p) { return hash2(p).x; }
    mat2 rotate2d(float a) { return mat2(cos(a), sin(a), -sin(a), cos(a)); }
    float noise(vec2 uv) {
      vec2 id = floor(uv), subuv = fract(uv);
      vec2 u = subuv * subuv * (3. - 2. * subuv);
      float a = hash(id), b = hash(id + vec2(1., 0.)), c = hash(id + vec2(0., 1.)), d = hash(id + vec2(1., 1.));
      return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
    }
    float fbm(vec2 uv) {
      float s = 0., m = 0., a = .5;
      for (int i = 0; i < octaves; i++) { s += a * noise(uv); m += a; a *= .5; uv *= 2.; }
      return s / m;
    }
    vec3 render(vec2 uv, float scale) {
      vec2 id = floor(uv), subuv = fract(uv);
      vec2 rand = hash2(id);
      float bokeh = abs(scale);
      float particle = 0.;
      if (length(rand) > 1.3) {
        float field = length(subuv - .5);
        particle = smoothstep(.3, 0., field);
        particle += smoothstep(.4 * bokeh, .34 * bokeh, field);
      }
      return vec3(particle * 2.);
    }
    vec3 renderLayer(int layer, vec2 uv, inout float opacity) {
      float scale = mod((u_time + zoomSpeed / float(layers) * float(layer)) / zoomSpeed, -1.);
      uv *= 20.;
      uv *= scale * scale;
      uv = rotate2d(u_time / 10.) * uv;
      uv += vec2(25. + sin(u_time * .1)) * float(layer);
      vec3 pass = render(uv * multiplier, scale) * .2;
      opacity = 1. + scale;
      float _opacity = opacity;
      float endOpacity = smoothstep(0., .4, scale * -1.);
      opacity += endOpacity;
      return pass * _opacity * endOpacity;
    }
    void main() {
      vec2 uv = gl_FragCoord.xy - .5 * u_resolution;
      uv /= min(u_resolution.x, u_resolution.y);
      float n = fbm((uv + vec2(sin(u_time * .1), u_time * .1)) * 2. - 2.);
      vec3 colour = n * mix(vec3(0., .5, 1.5) * -1.5, clamp(vec3(1., .5, .25) * 2., 0., 1.), n);
      float opacity = 1., opacitySum = 1.;
      for (int i = 1; i <= layers; i++) {
        colour -= renderLayer(i, uv, opacity);
        opacitySum += opacity;
      }
      colour /= opacitySum;
      gl_FragColor = vec4(clamp(colour * 20., 0., 1.), 1.);
    }`;

  const PLASMA = `
    precision highp float;
    uniform vec2 u_resolution;
    uniform float u_time;
    uniform vec3 u_ground;
    uniform vec3 u_ink;
    const float overallSpeed = 0.2;
    const float gridSmoothWidth = 0.015;
    const float scale = 5.0;
    const float minLineWidth = 0.01;
    const float maxLineWidth = 0.2;
    const float lineSpeed = 1.0 * overallSpeed;
    const float lineAmplitude = 1.0;
    const float lineFrequency = 0.2;
    const float warpSpeed = 0.2 * overallSpeed;
    const float warpFrequency = 0.5;
    const float warpAmplitude = 1.0;
    const float offsetFrequency = 0.5;
    const float offsetSpeed = 1.33 * overallSpeed;
    const float minOffsetSpread = 0.6;
    const float maxOffsetSpread = 2.0;
    const int linesPerGroup = 16;
    #define drawCircle(pos, radius, coord) smoothstep(radius + gridSmoothWidth, radius, length(coord - (pos)))
    #define drawSmoothLine(pos, halfWidth, t) smoothstep(halfWidth, 0.0, abs(pos - (t)))
    #define drawCrispLine(pos, halfWidth, t) smoothstep(halfWidth + gridSmoothWidth, halfWidth, abs(pos - (t)))
    float random(float t) { return (cos(t) + cos(t * 1.3 + 1.3) + cos(t * 1.4 + 1.4)) / 3.0; }
    float getPlasmaY(float x, float horizontalFade, float offset) {
      return random(x * lineFrequency + u_time * lineSpeed) * horizontalFade * lineAmplitude + offset;
    }
    void main() {
      vec2 uv = gl_FragCoord.xy / u_resolution;
      vec2 space = (gl_FragCoord.xy - u_resolution / 2.0) / u_resolution.x * 2.0 * scale;
      float horizontalFade = 1.0 - (cos(uv.x * 6.28) * 0.5 + 0.5);
      space.y += random(space.x * warpFrequency + u_time * warpSpeed) * warpAmplitude * (0.5 + horizontalFade);
      space.x += random(space.y * warpFrequency + u_time * warpSpeed + 2.0) * warpAmplitude * horizontalFade;
      float lines = 0.0;
      for (int l = 0; l < linesPerGroup; l++) {
        float normalizedLineIndex = float(l) / float(linesPerGroup);
        float offsetTime = u_time * offsetSpeed;
        float offsetPosition = float(l) + space.x * offsetFrequency;
        float rand = random(offsetPosition + offsetTime) * 0.5 + 0.5;
        float halfWidth = mix(minLineWidth, maxLineWidth, rand * horizontalFade) / 2.0;
        float offset = random(offsetPosition + offsetTime * (1.0 + normalizedLineIndex)) * mix(minOffsetSpread, maxOffsetSpread, horizontalFade);
        float linePosition = getPlasmaY(space.x, horizontalFade, offset);
        float line = drawSmoothLine(linePosition, halfWidth, space.y) / 2.0 + drawCrispLine(linePosition, halfWidth * 0.15, space.y);
        float circleX = mod(float(l) + u_time * lineSpeed, 25.0) - 12.0;
        vec2 circlePosition = vec2(circleX, getPlasmaY(circleX, horizontalFade, offset));
        line += drawCircle(circlePosition, 0.01, space) * 4.0;
        lines += line * rand;
      }
      gl_FragColor = vec4(mix(u_ground, u_ink, clamp(lines * 0.8, 0.0, 1.0)), 1.0);
    }`;

  // Each theme's shader and its clock: seconds since the page opened, in the units the shader was written for.
  const SHADERS = {
    dark: { source: ASHFALL, time: (s) => 50 + s * 0.5 },  // a small clock: weaker GPUs lose precision on large ones
    light: { source: PLASMA, time: (s) => s },
  };
  const still = matchMedia('(prefers-reduced-motion: reduce)');

  for (const carousel of document.querySelectorAll('.carousel')) {
    const canvas = document.createElement('canvas');
    canvas.className = 'carousel-shader';
    canvas.setAttribute('aria-hidden', 'true');
    const gl = canvas.getContext('webgl', { antialias: false, alpha: false, preserveDrawingBuffer: false });
    if (!gl) continue;

    const compile = (type, source) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
      console.warn('carousel shader:', gl.getShaderInfoLog(shader));
      return null;
    };
    const vertex = compile(gl.VERTEX_SHADER, VERTEX);
    const programs = {};
    for (const [theme, { source }] of Object.entries(SHADERS)) {
      const fragment = compile(gl.FRAGMENT_SHADER, source);
      if (!vertex || !fragment) continue;
      const program = gl.createProgram();
      gl.attachShader(program, vertex); gl.attachShader(program, fragment);
      gl.bindAttribLocation(program, 0, 'position');
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) continue;
      const at = (name) => gl.getUniformLocation(program, name);
      programs[theme] = { program, resolution: at('u_resolution'), time: at('u_time'), ground: at('u_ground'), ink: at('u_ink') };
    }
    if (!Object.keys(programs).length) continue;

    // One rectangle covering the canvas.
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    carousel.prepend(canvas);

    let theme = null, onScreen = false, frame = 0, ground = [0, 0, 0], ink = [1, 1, 1];
    // A CSS colour as 0-1 RGB: a 2D canvas writes any colour back as #rrggbb.
    const paint = document.createElement('canvas').getContext('2d');
    const rgb = (css) => {
      paint.fillStyle = '#000'; paint.fillStyle = css.trim() || '#000';
      const hex = /^#[0-9a-f]{6}$/i.test(paint.fillStyle) ? paint.fillStyle : '#000000';
      return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    };
    const draw = (now) => {
      frame = 0;
      const p = programs[theme];
      if (!p) return;
      const ratio = Math.min(devicePixelRatio || 1, 1.5);
      const w = Math.round(canvas.clientWidth * ratio), h = Math.round(canvas.clientHeight * ratio);
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      gl.viewport(0, 0, w, h);
      gl.useProgram(p.program);
      gl.uniform2f(p.resolution, w, h);
      gl.uniform1f(p.time, SHADERS[theme].time((still.matches ? 20000 : now) / 1000));
      if (p.ground) gl.uniform3f(p.ground, ...ground);
      if (p.ink) gl.uniform3f(p.ink, ...ink);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (onScreen && !still.matches) frame = requestAnimationFrame(draw);
    };
    const update = () => {
      theme = document.documentElement.getAttribute('data-theme');
      canvas.hidden = !programs[theme];
      const css = getComputedStyle(carousel);
      ground = rgb(css.backgroundColor); ink = rgb(css.getPropertyValue('--brass'));
      cancelAnimationFrame(frame); frame = 0;
      if (programs[theme] && onScreen) frame = requestAnimationFrame(draw);
    };
    new MutationObserver(update).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    new IntersectionObserver(([entry]) => { onScreen = entry.isIntersecting; update(); }).observe(carousel);
    still.addEventListener('change', update);
    addEventListener('resize', () => { if (onScreen && still.matches) update(); });
    update();
  }

  // Sepia: Kevin Levron's hexagonal grid (threejs-components, ISC; https://codepen.io/soju22/pen/MYgbRwg): metal
  // hexagons bobbing in and out, lit by two lights that follow the pointer. Here each hexagon is one of five colours
  // (black, grey, patina gold, two reds; the library's own colours blend into in-between shades). It loads (three.js with it, from jsDelivr) only once Sepia is shown
  // with the carousel near the screen, and draws only while its canvas is on screen (the library's own observer;
  // archive.css hides the canvas in the other themes). Under reduced motion the hexagons hold still.
  const HEX_GRID = 'https://cdn.jsdelivr.net/npm/threejs-components@0.0.16/build/backgrounds/grid1.cdn.min.js';
  const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.170.0/+esm';  // the three.js grid1 imports, so it loads once
  // Each hexagon's colour, with its share in twentieths: black, red and dark red a fifth each; grey and patina gold
  // where white was (three quarters grey, a quarter gold), so grey 7 and gold 1.
  const HEX_COLOURS = [[0x0b0b0b, 4], [0x6e6e6e, 7], [0x8f7d3a, 1], [0xb3121f, 4], [0x5c0a10, 4]].flatMap(([c, n]) => Array(n).fill(c));
  
  const startHexes = async (canvas) => {
    const [{ default: Grid }, THREE] = await Promise.all([import(HEX_GRID), import(THREE_URL)]);
    const bg = Grid(canvas, { timeCoef: still.matches ? 0 : 1 });
    bg.three.maxPixelRatio = 1.5;
    bg.three.resize();
    const { grid } = bg;
    const colour = new THREE.Color();
    for (let i = 0; i < grid.count; i++) {
      grid.setColorAt(i, colour.set(HEX_COLOURS[Math.floor(Math.random() * HEX_COLOURS.length)]));
    }
    grid.instanceColor.needsUpdate = true;
  };

  for (const carousel of document.querySelectorAll('.carousel')) {
    const canvas = document.createElement('canvas');
    canvas.className = 'carousel-hex';
    canvas.setAttribute('aria-hidden', 'true');
    carousel.prepend(canvas);
    let near = false, started = false;
    const check = () => {
      if (started || !near || document.documentElement.hasAttribute('data-theme')) return;
      started = true;
      startHexes(canvas).catch((error) => { console.warn('carousel hexagons:', error); canvas.remove(); });
    };
    new MutationObserver(check).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    new IntersectionObserver(([entry]) => { near = entry.isIntersecting; check(); }, { rootMargin: '300px' }).observe(carousel);
  }
})();
