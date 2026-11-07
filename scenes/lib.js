/* STAY INSIDE — shared drawing library for the scene files.
 *
 * Every scene is drawn from scratch for a given time t (seconds from the scene's start),
 * so any frame can be rendered on its own:  frame n  ->  t = n / 30.
 *
 * Open a scene file in a browser to preview it (loops, no audio).
 * Add ?t=2.5 to show a single still at 2.5 seconds.
 * For rendering, call  await window.renderAt(t)  from a headless browser.
 */
const W = 1080, H = 1920, FPS = 30;
const NS = "http://www.w3.org/2000/svg";

const C = {
  bg: "#0a090b",
  wall: "#141117",
  floor: "#0d0b0d",
  ink: "#050505",            // stickman line color (bible: everyone is black...)
  rim: "#d8955a",            // ...with a warm rim of lamp light so black lines read on a dark room
  warm: "#ffb35c",
  yellow: "#ffd21f",
  red: "#e23b2e",
  zombie: "#8d938c",         // bible: zombies are grey
  cream: "#efe6d2",
  band: "#b8322a",           // your wrist band (left wrist)
  night: "#0c1220",
  screen: "#f4f6fb",
};

const UI_FONT = "Inter, 'DejaVu Sans', sans-serif";
const CAPTION_FONT = "Anton, Impact, sans-serif";
const HUD_FONT = "'Special Elite', 'Courier New', monospace";

/* ---------- small math helpers ---------- */
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const lerp = (a, b, k) => a + (b - a) * k;
const seg = (t, a, b) => clamp((t - a) / (b - a));           // 0 before a, 1 after b
const ease = (k) => k * k * (3 - 2 * k);                      // smoothstep
const easeOut = (k) => 1 - Math.pow(1 - k, 3);
const rnd = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const jitter = (t, amp, speed = 30, seed = 1) => [
  (rnd(Math.floor(t * speed) + seed) - 0.5) * 2 * amp,
  (rnd(Math.floor(t * speed) + seed + 99) - 0.5) * 2 * amp,
];
const rad = (d) => (d * Math.PI) / 180;

/* ---------- SVG helpers ---------- */
let _uid = 0;
const uid = (p = "id") => `${p}${++_uid}`;

function el(tag, attrs = {}, parent) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) if (attrs[k] !== undefined && attrs[k] !== null) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}
const g = (parent, transform, extra = {}) => el("g", { transform, ...extra }, parent);
function text(parent, str, attrs) { const e = el("text", attrs, parent); e.textContent = str; return e; }
function defs(root) { return root.querySelector("defs") || el("defs", {}, root); }

function radial(root, stops, attrs = {}) {
  const id = uid("rg");
  const gr = el("radialGradient", { id, ...attrs }, defs(root));
  for (const [off, color, op] of stops) el("stop", { offset: off, "stop-color": color, "stop-opacity": op }, gr);
  return `url(#${id})`;
}
function linear(root, stops, x1 = 0, y1 = 0, x2 = 0, y2 = 1) {
  const id = uid("lg");
  const gr = el("linearGradient", { id, x1, y1, x2, y2 }, defs(root));
  for (const [off, color, op] of stops) el("stop", { offset: off, "stop-color": color, "stop-opacity": op }, gr);
  return `url(#${id})`;
}
function clip(root, build) {
  const id = uid("cp");
  const cp = el("clipPath", { id }, defs(root));
  build(cp);
  return `url(#${id})`;
}
function blurFilter(root, sd) {
  const id = uid("bl");
  const f = el("filter", { id, x: "-50%", y: "-50%", width: "200%", height: "200%" }, defs(root));
  el("feGaussianBlur", { stdDeviation: sd }, f);
  return `url(#${id})`;
}

/* A black stick line with a warm rim light underneath (reads on dark backgrounds). */
function stick(parent, d, width = 13, rim = C.rim, rimOpacity = 0.55) {
  if (rim) el("path", { d, fill: "none", stroke: rim, "stroke-width": width + 10, "stroke-linecap": "round", "stroke-linejoin": "round", opacity: rimOpacity }, parent);
  return el("path", { d, fill: "none", stroke: C.ink, "stroke-width": width, "stroke-linecap": "round", "stroke-linejoin": "round" }, parent);
}

/* ---------- light ---------- */
function glow(root, parent, x, y, r, color = C.warm, opacity = 0.35) {
  el("circle", { cx: x, cy: y, r, fill: radial(root, [[0, color, opacity], [0.45, color, opacity * 0.35], [1, color, 0]]) }, parent);
}
function vignette(root, parent, strength = 0.85) {
  el("rect", { x: 0, y: 0, width: W, height: H, fill: radial(root, [[0.45, "#000", 0], [1, "#000", strength]], { cx: 0.5, cy: 0.45, r: 0.75 }) }, parent);
}

/* ---------- your hands (the only part of "you" we ever see) ----------
 * elbow: off-screen start of the forearm. wrist: where the hand starts.
 * dir: direction the fingers point (degrees, 0 = right, -90 = up).
 * pose: "grip" | "open" | "thumb" | "point" | "two" (index + middle) | "pinch"
 * band: true for the LEFT hand (bible: thin band on the left wrist).
 */
function hand(parent, { elbow, wrist, dir = -90, pose = "open", band = false, scale = 1, thumbReach = 1, rimOpacity = 0.55, fingerLen = 1 }) {
  const hg = g(parent);
  const [ex, ey] = elbow, [wx, wy] = wrist;
  const s = scale;
  const a = rad(dir);
  const palmLen = 46 * s;
  const px = wx + Math.cos(a) * palmLen, py = wy + Math.sin(a) * palmLen;
  const fingersBy = {
    open: [[-34, 70], [-12, 82], [10, 80], [32, 64]],
    grip: [[-30, 38], [-10, 44], [10, 42], [28, 34]],
    thumb: [[-26, 40], [-8, 46], [10, 44], [26, 36]],
    point: [[0, 92], [-18, 30], [-4, 28], [12, 24]],
    two: [[-8, 92], [10, 88], [26, 30], [40, 26]],
    pinch: [[-14, 60], [0, 30], [12, 28], [24, 24]],
  };
  const thumbBy = { open: [-70, 56], grip: [-62, 40], thumb: [-38, 96], point: [-60, 40], two: [-62, 40], pinch: [-28, 58] };
  // forearm + palm
  stick(hg, `M${ex},${ey} L${wx},${wy} L${px},${py}`, 15 * s, C.rim, rimOpacity);
  if (band) {
    // band sits on the forearm just below the wrist, across the arm
    const fx = ex - wx, fy = ey - wy, fl = Math.hypot(fx, fy) || 1;
    const bx = wx + (fx / fl) * 34 * s, by = wy + (fy / fl) * 34 * s;
    const nx = -fy / fl, ny = fx / fl;
    el("line", { x1: bx - nx * 17 * s, y1: by - ny * 17 * s, x2: bx + nx * 17 * s, y2: by + ny * 17 * s, stroke: C.band, "stroke-width": 9 * s, "stroke-linecap": "round" }, hg);
  }
  const fingers = fingersBy[pose] || fingersBy.open;
  for (const [off, len] of fingers) {
    const fa = a + rad(off * (pose === "open" ? 1 : 0.7));
    const L = len * s * fingerLen;
    stick(hg, `M${px},${py} L${px + Math.cos(fa) * L},${py + Math.sin(fa) * L}`, 10 * s, C.rim, rimOpacity);
  }
  const [toff, tlen] = thumbBy[pose] || thumbBy.open;
  const side = band ? 1 : -1; // thumb on the inner side of each hand
  const ta = a + rad(toff * side);
  const tx = wx + Math.cos(a) * 18 * s, ty = wy + Math.sin(a) * 18 * s;
  const tl = tlen * s * (pose === "thumb" ? thumbReach : 1);
  const tip = [tx + Math.cos(ta) * tl, ty + Math.sin(ta) * tl];
  stick(hg, `M${tx},${ty} L${tip[0]},${tip[1]}`, 11 * s, C.rim, rimOpacity);
  return { group: hg, palm: [px, py], thumbTip: tip };
}

/* A hand holding the phone by one side edge: palm along the edge, finger tips wrapped over
 * the bezel, thumb on the glass. side: "L" or "R". edgeX: x of that phone edge. gripY: where
 * the hand holds it. thumb: [x, y] the thumb tip points at (null = thumb rests on the edge).
 * band: true for the left hand (bible: thin band on the left wrist). */
function holdHand(parent, { side = "L", edgeX, gripY, thumb = null, band = side === "L", pressed = false, rimOpacity = 0.6 }) {
  const s = side === "L" ? -1 : 1; // outward direction
  const hg = g(parent);
  const wrist = [edgeX + s * 70, gripY + 120];
  const elbow = [edgeX + s * 300, H + 140];
  const palmTop = [edgeX + s * 34, gripY - 40];
  stick(hg, `M${elbow[0]},${elbow[1]} L${wrist[0]},${wrist[1]} L${palmTop[0]},${palmTop[1]}`, 16, C.rim, rimOpacity);
  // four finger tips curling over the edge onto the bezel
  for (let i = 0; i < 4; i++) {
    const by = gripY - 40 - i * 40;
    stick(hg, `M${edgeX + s * 34},${by + 24} L${edgeX + s * 22},${by} L${edgeX - s * 10},${by - 8}`, 11, C.rim, rimOpacity);
  }
  // thumb
  const base = [edgeX + s * 20, gripY + 40];
  const tip = thumb || [edgeX - s * 50, gripY - 30];
  const knuckle = [lerp(base[0], tip[0], 0.45) + s * 18, lerp(base[1], tip[1], 0.45) + 22];
  stick(hg, `M${wrist[0]},${wrist[1]} L${base[0]},${base[1]} Q${knuckle[0]},${knuckle[1]} ${tip[0]},${tip[1]}`, 14, C.rim, rimOpacity);
  if (band) {
    const fx = elbow[0] - wrist[0], fy = elbow[1] - wrist[1], fl = Math.hypot(fx, fy);
    const bx = wrist[0] + (fx / fl) * 46, by = wrist[1] + (fy / fl) * 46;
    const nx = -fy / fl, ny = fx / fl;
    el("line", { x1: bx - nx * 19, y1: by - ny * 19, x2: bx + nx * 19, y2: by + ny * 19, stroke: C.band, "stroke-width": 10, "stroke-linecap": "round" }, hg);
  }
  if (pressed) el("circle", { cx: tip[0], cy: tip[1], r: 34, fill: "none", stroke: "#fff", "stroke-width": 5, opacity: 0.7 }, hg);
  return { group: hg, thumbTip: tip };
}

/* ---------- the phone ----------
 * Bible: rounded rectangle, cracked top-right corner, battery icon always visible.
 */
function phone(root, parent, { x, y, w, h, rot = 0, screen, battery = 100, plug = false, clock = "7:42", screenGlow = "#cfe0ff", glowOpacity = 0.18, dark = false }) {
  const pg = g(parent, `translate(${x},${y}) rotate(${rot})`);
  const r = w * 0.11;
  if (glowOpacity > 0) glow(root, pg, 0, 0, Math.max(w, h) * 0.95, screenGlow, glowOpacity);
  el("rect", { x: -w / 2, y: -h / 2, width: w, height: h, rx: r, fill: "#16161a", stroke: "#000", "stroke-width": 6 }, pg);
  const inset = w * 0.045;
  const sx = -w / 2 + inset, sy = -h / 2 + inset, sw = w - 2 * inset, sh = h - 2 * inset;
  const cp = clip(root, (c) => el("rect", { x: sx, y: sy, width: sw, height: sh, rx: r * 0.75 }, c));
  const wrap = g(pg, null, { "clip-path": cp }); // clip in phone space, draw screen content offset inside it
  const sg = g(wrap, `translate(${sx},${sy})`);
  el("rect", { x: 0, y: 0, width: sw, height: sh, fill: dark ? "#050506" : C.screen }, sg);
  if (screen) screen(sg, sw, sh);
  // status bar: clock + battery (always visible)
  const fs = sw * 0.045;
  const ink = dark ? "#000" : (screen && screen.statusInk) || "#111";
  if (!dark) {
    text(sg, clock, { x: sw * 0.07, y: fs * 1.6, "font-family": UI_FONT, "font-weight": 700, "font-size": fs, fill: ink });
    const bw = fs * 1.9, bh = fs * 0.95, bx = sw * 0.72, by = fs * 0.75;
    el("rect", { x: bx, y: by, width: bw, height: bh, rx: bh * 0.25, fill: "none", stroke: ink, "stroke-width": fs * 0.12 }, sg);
    el("rect", { x: bx + bw, y: by + bh * 0.3, width: fs * 0.14, height: bh * 0.4, fill: ink }, sg);
    el("rect", { x: bx + fs * 0.14, y: by + fs * 0.14, width: (bw - fs * 0.28) * (battery / 100), height: bh - fs * 0.28, fill: battery <= 20 ? C.red : ink }, sg);
    text(sg, `${battery}%`, { x: bx - fs * 0.3, y: by + bh * 0.88, "text-anchor": "end", "font-family": UI_FONT, "font-weight": 700, "font-size": fs * 0.8, fill: ink });
    if (plug) text(sg, "⚡", { x: bx + bw * 0.5, y: by + bh * 0.85, "text-anchor": "middle", "font-family": UI_FONT, "font-size": fs * 0.75, fill: dark ? "#000" : "#fff" });
  }
  // cracked top-right corner (over the glass)
  const cx = w / 2 - inset - w * 0.02, cy = -h / 2 + inset + w * 0.02;
  const crack = g(pg);
  const k = w / 500;
  for (const d of [
    `M${cx},${cy + 10 * k} l${-60 * k},${30 * k} l${-30 * k},${45 * k}`,
    `M${cx - 20 * k},${cy} l${-25 * k},${55 * k} l${10 * k},${40 * k}`,
    `M${cx},${cy + 40 * k} l${-45 * k},${10 * k}`,
    `M${cx - 60 * k},${cy + 40 * k} l${-35 * k},${-20 * k}`,
  ]) {
    el("path", { d, fill: "none", stroke: "#fff", "stroke-width": 2.4 * k, opacity: 0.75 }, crack);
    el("path", { d, fill: "none", stroke: "#000", "stroke-width": 1.2 * k, opacity: 0.5, transform: `translate(${1.5 * k},${1.5 * k})` }, crack);
  }
  return { group: pg, screen: { x: sx, y: sy, w: sw, h: sh } };
}

/* Short arcs that pulse out from an object: phone buzzing / ringing. */
function soundWaves(parent, x, y, t, { color = "#fff", spread = 1, count = 3, side = "both", size = 1 } = {}) {
  const wg = g(parent);
  for (let i = 0; i < count; i++) {
    const k = ((t * 1.8 + i / count) % 1);
    const r = (60 + k * 120) * size;
    const op = (1 - k) * 0.8;
    for (const s of side === "both" ? [-1, 1] : side === "left" ? [-1] : [1]) {
      const a0 = rad(s > 0 ? -35 : 145), a1 = rad(s > 0 ? 35 : 215);
      el("path", {
        d: `M${x + Math.cos(a0) * r * spread},${y + Math.sin(a0) * r} A${r * spread},${r} 0 0 1 ${x + Math.cos(a1) * r * spread},${y + Math.sin(a1) * r}`,
        fill: "none", stroke: color, "stroke-width": 7 * size, "stroke-linecap": "round", opacity: op,
      }, wg);
    }
  }
  return wg;
}

/* Buzz marks: little zigzags beside a vibrating object. */
function buzzMarks(parent, x, y, h, t, color = "#fff") {
  const on = Math.floor(t * 8) % 2 === 0;
  if (!on) return;
  for (const s of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const yy = y - h * 0.25 + i * h * 0.25;
      el("path", { d: `M${x + s * 20},${yy - 18} l${s * 16},12 l${-s * 16},12 l${s * 16},12`, fill: "none", stroke: color, "stroke-width": 6, "stroke-linecap": "round", opacity: 0.8 }, parent);
    }
  }
}

/* ---------- the Slow One (zombie) ----------
 * Bible: grey stickman, slumped posture, one arm hanging lower, X eyes.
 * walk: 0..1 walk-cycle phase. headUp: 0 (hanging) .. 1 (lifted). face: 0 profile (walking right) .. 1 facing you.
 */
function zombie(parent, { x, ground, scale = 1, walk = 0, moving = false, headUp = 0, face = 0, mouth = 0 }) {
  const zg = g(parent, `translate(${x},${ground}) scale(${scale})`);
  const col = C.zombie;
  const sw = 9;
  const line = (d, w = sw) => el("path", { d, fill: "none", stroke: col, "stroke-width": w, "stroke-linecap": "round", "stroke-linejoin": "round" }, zg);
  const ph = walk * Math.PI * 2;
  const stride = moving ? 1 : 0;
  // legs: front leg steps, back leg drags its toe
  const hipX = 0, hipY = -150;
  const legA = Math.sin(ph) * 34 * stride;
  line(`M${hipX},${hipY} L${hipX + 8 + legA * 0.5},-78 L${hipX + 14 + legA},0`);
  line(`M${hipX},${hipY} L${hipX - 18 - legA * 0.3},-70 L${hipX - 46 - legA * 0.5},-4 l-14,4`); // dragging foot
  // slumped torso leaning forward
  const lean = 26 - face * 18;
  const shX = hipX + lean, shY = -280;
  line(`M${hipX},${hipY} Q${hipX + lean * 0.3},-220 ${shX},${shY}`, 10);
  // arms: one hangs low past the knee, the other half-raised
  const sway = Math.sin(ph + 1) * 8 * stride;
  line(`M${shX},${shY + 6} L${shX + 10 + sway},-190 L${shX + 6 + sway},-96`); // long hanging arm
  line(`M${shX},${shY + 6} L${shX + 42},-218 L${shX + 78 - face * 30},-226`);  // reaching arm
  // head: hangs forward when down
  const hx = shX + lerp(30, 6, headUp) - face * 6;
  const hy = shY - lerp(14, 52, headUp);
  el("circle", { cx: hx, cy: hy, r: 38, fill: "#1b1d1b", stroke: col, "stroke-width": sw }, zg);
  if (headUp > 0.35) {
    const op = clamp((headUp - 0.35) / 0.3);
    const ex = lerp(16, 0, face); // eyes shift to centre as it turns to you
    for (const dx of [-13, 13]) {
      const cx = hx + ex + dx * lerp(0.6, 1, face), cy = hy - 4;
      el("path", { d: `M${cx - 7},${cy - 7} L${cx + 7},${cy + 7} M${cx + 7},${cy - 7} L${cx - 7},${cy + 7}`, stroke: "#d9ddd6", "stroke-width": 4.5, "stroke-linecap": "round", opacity: op }, zg);
    }
    if (mouth > 0) el("ellipse", { cx: hx + ex, cy: hy + 18, rx: 9, ry: 4 + mouth * 7, fill: "#050505", opacity: op }, zg);
  }
  return zg;
}

/* ---------- the street seen through the blinds ---------- */
function street(root, parent, { zombie: z = null, lightFlicker = 0 } = {}) {
  // world: 1080 x 520, ground line at y = 430
  const sg = g(parent);
  el("rect", { x: -200, y: -200, width: 1480, height: 920, fill: C.night }, sg);
  // building across the street
  el("rect", { x: 520, y: 20, width: 600, height: 360, fill: "#0f131c" }, sg);
  el("rect", { x: -200, y: 80, width: 470, height: 300, fill: "#0e121a" }, sg);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) {
    el("rect", { x: 580 + i * 120, y: 70 + j * 130, width: 64, height: 80, fill: "#151a24" }, sg);
  }
  for (let i = 0; i < 3; i++) el("rect", { x: -120 + i * 130, y: 140, width: 60, height: 76, fill: "#141923" }, sg);
  // Mrs. Okafor's lit window (she isn't shown until Ep 3)
  glow(root, sg, 852, 240, 120, "#ffc76b", 0.35);
  el("rect", { x: 820, y: 200, width: 64, height: 80, fill: "#f2c46b" }, sg);
  el("line", { x1: 852, y1: 200, x2: 852, y2: 280, stroke: "#c08f3e", "stroke-width": 4 }, sg);
  // ground
  el("rect", { x: -200, y: 380, width: 1480, height: 30, fill: "#151821" }, sg); // far sidewalk
  el("rect", { x: -200, y: 410, width: 1480, height: 300, fill: "#0d1016" }, sg); // road
  for (let i = -1; i < 9; i++) el("rect", { x: i * 150 + 20, y: 470, width: 70, height: 6, fill: "#2a2e36" }, sg);
  // streetlight
  const lx = 560;
  const lightOn = 1 - lightFlicker;
  el("path", { d: `M${lx - 60},${60} L${lx - 210},430 L${lx + 90},430 Z`, fill: "#f4e3a1", opacity: 0.09 * lightOn }, sg);
  el("ellipse", { cx: lx - 60, cy: 430, rx: 190, ry: 26, fill: "#f4e3a1", opacity: 0.16 * lightOn }, sg);
  el("path", { d: `M${lx},430 L${lx},50 Q${lx},30 ${lx - 30},30 L${lx - 60},30`, fill: "none", stroke: "#05070a", "stroke-width": 12 }, sg);
  glow(root, sg, lx - 62, 44, 80, "#fff1c0", 0.5 * lightOn);
  el("rect", { x: lx - 84, y: 32, width: 44, height: 16, rx: 6, fill: "#fff3cc", opacity: lightOn }, sg);
  // parked cars
  for (const [cx, flip] of [[150, 1], [930, -1]]) {
    const cg = g(sg, `translate(${cx},${428}) scale(${flip},1)`);
    el("path", { d: "M-130,-10 L-130,-56 Q-120,-70 -90,-72 L-60,-110 L50,-110 L90,-72 L125,-66 Q135,-60 135,-40 L135,-10 Z", fill: "#07090d" }, cg);
    el("path", { d: "M-50,-102 L40,-102 L70,-74 L-74,-74 Z", fill: "#121826" }, cg);
    el("circle", { cx: -80, cy: -8, r: 24, fill: "#030405" }, cg);
    el("circle", { cx: 85, cy: -8, r: 24, fill: "#030405" }, cg);
  }
  if (z) zombie(sg, z);
  return sg;
}

/* The gap between two pulled-apart blind slats, with the street inside it.
 * top/bottom: y of the gap edges at the middle of the frame. bend: how far the slats are pulled.
 * view: { zoom, cx, cy } camera inside the street world. */
function blindsGap(root, parent, { top = 700, bottom = 1200, bend = 60, view = { zoom: 1, cx: 540, cy: 260 }, streetOpts = {}, fingers = true, press = 0, phoneLight = 0 }) {
  const gg = g(parent);
  el("rect", { x: 0, y: 0, width: W, height: H, fill: "#060506" }, gg);
  const topEdge = `M0,${top + bend * 0.25} Q${W / 2},${top - bend} ${W},${top + bend * 0.25}`;
  const botEdge = `L${W},${bottom - bend * 0.25} Q${W / 2},${bottom + bend} 0,${bottom - bend * 0.25} Z`;
  const cp = clip(root, (c) => el("path", { d: `${topEdge} ${botEdge}` }, c));
  const inner = g(gg);
  inner.setAttribute("clip-path", cp);
  const gapH = bottom - top + bend * 1.5;
  const sc = (gapH / 520) * 1.25 * view.zoom;
  const sw = g(inner, `translate(${W / 2},${(top + bottom) / 2}) scale(${sc}) translate(${-view.cx},${-view.cy})`);
  street(root, sw, streetOpts);
  // slats above and below the gap (dark, lit warm on the room side)
  const slats = g(gg);
  for (let i = 0; i < 9; i++) {
    const yT = top - 30 - i * 64, yB = bottom + 30 + i * 64;
    const bT = bend * Math.max(0, 1 - i * 0.35), bB = bend * Math.max(0, 1 - i * 0.35);
    for (const [y, b, s] of [[yT, bT, -1], [yB, bB, 1]]) {
      el("path", { d: `M0,${y + s * -b * -0.25} Q${W / 2},${y + s * b} ${W},${y + s * -b * -0.25}`, fill: "none", stroke: "#1e1a17", "stroke-width": 50 }, slats);
      el("path", { d: `M0,${y - 24 + s * -b * -0.25} Q${W / 2},${y - 24 + s * b} ${W},${y - 24 + s * -b * -0.25}`, fill: "none", stroke: "#3a2a1c", "stroke-width": 3, opacity: 0.8 }, slats);
    }
  }
  // the two slats you're holding apart
  el("path", { d: topEdge, fill: "none", stroke: "#2b231c", "stroke-width": 26 }, gg);
  el("path", { d: `M0,${bottom - bend * 0.25} Q${W / 2},${bottom + bend} ${W},${bottom - bend * 0.25}`, fill: "none", stroke: "#2b231c", "stroke-width": 26 }, gg);
  if (phoneLight > 0) {
    el("rect", { x: 0, y: bottom, width: W, height: H - bottom, fill: radial(root, [[0, "#cfe0ff", 0.35 * phoneLight], [1, "#cfe0ff", 0]], { cx: 0.5, cy: 1, r: 0.9 }) }, gg);
  }
  if (fingers) {
    // index finger lifts the top slat, middle finger presses the bottom slat (right hand, from below)
    const fx = W * 0.84;
    const tipTop = top - bend - 6 - press * 10, tipBot = bottom + bend + 6 + press * 10;
    const wx = fx + 120, wy = H + 40;
    stick(gg, `M${Math.min(wx, W + 60)},${wy} L${fx + 60},${tipBot + 120}`, 16);
    stick(gg, `M${fx + 60},${tipBot + 120} L${fx + 10},${tipBot}`, 12);
    stick(gg, `M${fx + 60},${tipBot + 120} L${fx - 10},${tipBot + 40} L${fx - 18},${tipTop}`, 11, C.rim, 0.35);
  }
  return gg;
}

/* ---------- HUD (top-left, small typewriter text) ---------- */
function hud(parent, t, globalT, { day = "DAY 1", time = "7:42 PM", status = "", statusAt = 0, statusColor = C.cream, countdown = null, countdownAt = null }) {
  const hg = g(parent);
  const x = 50, y = 84;
  const blinkOn = Math.floor(globalT * 2) % 2 === 0;
  el("circle", { cx: x + 14, cy: y - 13, r: 13, fill: C.red, opacity: blinkOn ? 1 : 0.25 }, hg);
  const base = { "font-family": HUD_FONT, fill: C.cream, style: "paint-order: stroke", stroke: "#000", "stroke-width": 6, "stroke-linejoin": "round" };
  text(hg, `REC  ${day}`, { ...base, x: x + 42, y, "font-size": 40 });
  text(hg, time, { ...base, x: x + 42, y: y + 48, "font-size": 34, opacity: 0.85 });
  if (status) {
    const n = Math.max(0, Math.floor((t - statusAt) * 32));
    const shown = status.slice(0, n);
    const cursor = n < status.length || Math.floor(globalT * 3) % 2 === 0 ? "_" : "";
    text(hg, `> ${shown}${cursor}`, { ...base, fill: statusColor, x: x + 4, y: y + 96, "font-size": 30 });
  }
  if (countdown && countdownAt !== null && t >= countdownAt) {
    const k = easeOut(seg(t, countdownAt, countdownAt + 0.45));
    const cg = g(hg, `translate(${lerp(-760, 0, k)},0)`);
    el("rect", { x: x - 6, y: y + 114, width: 720, height: 50, rx: 6, fill: "#000", opacity: 0.55 }, cg);
    text(cg, countdown, { ...base, fill: C.yellow, x: x + 6, y: y + 148, "font-size": 30 });
  }
  return hg;
}

/* ---------- captions (bottom, big bold all-caps, key word yellow) ---------- */
let _measure = null;
function measureWord(str, size) {
  if (!_measure) {
    const svg = el("svg", { id: "measure" }, document.body);
    _measure = text(svg, "", { "font-family": CAPTION_FONT, "font-size": 100 });
  }
  _measure.textContent = str;
  return _measure.getComputedTextLength() * (size / 100);
}
function caption(parent, t, lines, { y = 1700, size = 118, maxWidth = 960, hideAfter = Infinity } = {}) {
  // lines: [{ at, text, key }] — each shows from its time until the next one starts
  let cur = null;
  for (const l of lines) if (t >= l.at && t < hideAfter) cur = l;
  if (!cur) return;
  const words = cur.text.toUpperCase().split(/\s+/);
  const keys = (cur.key || "").toUpperCase().split(/\s+/).filter(Boolean);
  const space = size * 0.26;
  // word wrap
  const rows = [[]];
  let rowW = 0;
  for (const w of words) {
    const ww = measureWord(w, size);
    if (rows[rows.length - 1].length && rowW + space + ww > maxWidth) { rows.push([]); rowW = 0; }
    rows[rows.length - 1].push({ w, ww });
    rowW += (rowW ? space : 0) + ww;
  }
  const pop = 0.82 + 0.18 * easeOut(seg(t, cur.at, cur.at + 0.14));
  const cg = g(parent, `translate(${W / 2},${y}) scale(${pop}) translate(${-W / 2},${-y})`);
  const lineH = size * 1.08;
  rows.forEach((row, ri) => {
    const total = row.reduce((s, r) => s + r.ww, 0) + space * (row.length - 1);
    let x = W / 2 - total / 2;
    const yy = y - (rows.length - 1 - ri) * lineH;
    for (const { w, ww } of row) {
      const bare = w.replace(/[^A-Z0-9']/g, "");
      const isKey = keys.some((k) => bare === k.replace(/[^A-Z0-9']/g, ""));
      text(cg, w, {
        x, y: yy, "font-family": CAPTION_FONT, "font-size": size, fill: isKey ? C.yellow : "#fff",
        stroke: "#000", "stroke-width": 16, "stroke-linejoin": "round", style: "paint-order: stroke",
      });
      x += ww + space;
    }
  });
}

/* ---------- scene runner ---------- */
function SCENE(spec) {
  const stage = document.getElementById("stage");
  stage.setAttribute("viewBox", `0 0 ${W} ${H}`);
  const render = (t) => {
    _uid = 0;
    while (stage.firstChild) stage.removeChild(stage.firstChild);
    el("defs", {}, stage);
    el("rect", { x: 0, y: 0, width: W, height: H, fill: C.bg }, stage);
    const world = g(stage);
    const info = spec.draw(stage, world, t) || {};
    if (spec.hud && !info.hideHud) hud(stage, t, spec.start + t, typeof spec.hud === "function" ? spec.hud(t) : spec.hud);
    if (spec.captions && !info.hideCaptions) caption(stage, t, spec.captions, spec.captionOpts || {});
  };
  window.sceneInfo = { number: spec.number, title: spec.title, start: spec.start, duration: spec.duration, fps: FPS, frames: Math.round(spec.duration * FPS) };
  window.renderAt = async (t) => { await document.fonts.ready; render(t); };
  window.renderFrame = (n) => window.renderAt(n / FPS);
  document.title = `Ep1 Scene ${spec.number} — ${spec.title}`;
  const params = new URLSearchParams(location.search);
  document.fonts.ready.then(() => {
    // load both custom fonts before the first frame
    return Promise.all([document.fonts.load(`100px Anton`), document.fonts.load(`40px "Special Elite"`)]);
  }).then(() => {
    window.sceneReady = true;
    if (params.has("t")) { render(parseFloat(params.get("t"))); return; }
    if (params.has("capture")) return;
    const t0 = performance.now();
    const loop = () => { render(((performance.now() - t0) / 1000) % spec.duration); requestAnimationFrame(loop); };
    loop();
  });
}
