// Timber Town: a portrait pixel-art learning game for fugio.co/timber/. Foxino the lumberjack chops trees (three right
// answers fell a tree), carries the logs to the building plot, builds a wooden house (one right answer = one more part of
// the house) and sells it to a badger for coins. Every house sold raises the town level: more trees, a bigger house,
// more coins. Questions: the A0–A2 gap-fill packages (packages.js, as in the other Fugio games) and the shared package
// browser (/shared/pack-picker.js).
// Art: the processed ChatGPT pictures in art/ (listed in art/manifest.js, written by "Foxino/Timber Town/build_art.py");
// whatever is not there yet is drawn here as placeholder pixel art. Test hooks: window.TT.
(() => {
'use strict';

// ---------- small helpers
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const pick1 = (a) => a[Math.floor(Math.random() * a.length)];
const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const E = {
  inQ: (t) => t * t, outQ: (t) => 1 - (1 - t) * (1 - t), inOut: (t) => t < .5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2,
  outBack: (t) => { const c = 1.9; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; },
};
const REDUCED = matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
// localStorage can be missing or throw (private windows): the game then simply doesn't remember
const store = {
  get(k, d) { try { const v = localStorage.getItem('timber.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('timber.' + k, JSON.stringify(v)); } catch {} },
};
const save = Object.assign({name: '', coins: 0, level: 1, sold: [], packs: [], muted: false}, store.get('save', {}) || {});
if (!Array.isArray(save.sold)) save.sold = [];
save.level = Math.max(1, save.level | 0); save.coins = Math.max(0, save.coins | 0);
const persist = () => store.set('save', save);

// ---------- the houses: level 1 = 3 trees, 5 building questions, 100 coins; then 4 / 6 / 180 and 5 / 7 / 300; after that
// the lodge again for 60 coins more each time
function levelInfo(lv) {
  const k = clamp(lv, 1, 3);
  return {lv, house: k, trees: [3, 4, 5][k - 1], build: [5, 6, 7][k - 1], price: [100, 180, 300][k - 1] + Math.max(0, lv - 3) * 60};
}
const bonusFor = (price, mistakes) => Math.round(price * (mistakes === 0 ? .5 : mistakes <= 2 ? .25 : mistakes <= 4 ? .1 : 0));
const starsFor = (mistakes) => mistakes <= 1 ? 3 : mistakes <= 4 ? 2 : 1;

// ---------- questions: gap-fill sentences "text [right|wrong|wrong] (hint) text", as in Hop Rush and Lantern Sky
const PACKS = window.FugioPacks ? FugioPacks.sort(window.GUMMY_PACKAGES || []) : (window.GUMMY_PACKAGES || []);
save.packs = (save.packs || []).filter((id) => PACKS.some((p) => p.id === id));
if (!save.packs.length && PACKS.length) save.packs = [PACKS[0].id];
const packNow = () => (window.FugioPacks ? FugioPacks.merge(PACKS, save.packs) : PACKS[0]) || PACKS[0];
const SLOT = new Set(['do', 'does', "don't", "doesn't", 'did', "didn't", 'was', 'were', "wasn't", "weren't", 'is', 'are', 'am',
  "isn't", "aren't", 'a', 'an', 'the', 'more', 'most', 'less', 'least', 'because', 'so', 'and', 'but', 'or', 'have', 'has', 'not']);
const slotKey = (t) => t.toLowerCase().replace(/[^a-z' ]/g, '').split(/\s+/).filter(Boolean).map((w) => SLOT.has(w) ? w : '_').join(' ');
function mixComparisons(q) {
  const m = q.match(/^(.*)\[([^|\]]+)\|(the [^|\]]+)\]( \([^)]*\)) than [^.?!]*([.?!])$/);
  return m && Math.random() < .5 ? `${m[1]}[${m[3]}|${m[2]}]${m[4]} of all${m[5]}` : q;
}
function fillChoices(q) {
  const m = q.match(/\[([^\]]+)\]/);
  const [right, ...wrong] = m[1].split('|');
  const words = [{text: right, ok: true}, ...shuffle(wrong).slice(0, 2).map((t) => ({text: t, ok: false}))];
  words.sort((x, y) => slotKey(x.text).localeCompare(slotKey(y.text)) || x.text.localeCompare(y.text));
  words.before = q.slice(0, m.index); words.after = q.slice(m.index + m[0].length); words.right = right;
  return words;
}
const usedQ = new Set();
// town level 1 asks the package's easy third, level 2 the middle third, level 3 and up the hardest
function pickSentence(lv) {
  const pk = packNow(); if (!pk) return null;
  const r = clamp(lv - 1, 0, 2), mine = pk.rounds[r] || [], rest = pk.rounds.filter((_, i) => i !== r).flat();
  const free = (l) => l.filter((q) => !usedQ.has(q));
  let pool = free(mine); if (!pool.length) pool = free(rest);
  if (!pool.length) { usedQ.clear(); pool = mine.length ? mine : rest; }
  const q = pick1(pool); usedQ.add(q); return mixComparisons(q);
}
const hints = (t) => esc(t).replace(/\(([^)]*)\)/g, '<i>($1)</i>');

// ---------- sound: little 8-bit noises made in code (Web Audio)
let actx = null, master = null, noiseBuf = null;
function audio() {
  if (!actx) {
    actx = new (window.AudioContext || window.webkitAudioContext)({latencyHint: 'interactive'});
    master = actx.createGain(); master.gain.value = save.muted ? 0 : .8; master.connect(actx.destination);
  }
  if (actx.state !== 'running') actx.resume().catch(() => {});
  return actx;
}
['pointerdown', 'keydown'].forEach((ev) => addEventListener(ev, () => { try { if (!save.muted) audio(); } catch {} }, true));
function tone(f, dur, type = 'square', vol = .07, delay = 0, f2 = 0) {
  if (save.muted || !actx) return;
  try {
    const a = actx, t = a.currentTime + .02 + delay, o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.setValueAtTime(vol, t + dur * .7); g.gain.exponentialRampToValueAtTime(.001, t + dur);
    o.connect(g).connect(master); o.start(t); o.stop(t + dur + .02);
  } catch {}
}
function noise(dur, vol = .2, f0 = 1200, f1 = f0, delay = 0, type = 'bandpass') {
  if (save.muted || !actx) return;
  try {
    const a = actx, t = a.currentTime + .02 + delay;
    if (!noiseBuf) { const n = a.sampleRate; noiseBuf = a.createBuffer(1, n, a.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; }
    const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
    s.buffer = noiseBuf; s.loop = true; f.type = type; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
    s.connect(f).connect(g).connect(master); s.start(t); s.stop(t + dur + .02);
  } catch {}
}
const N = (n) => 440 * Math.pow(2, (n - 69) / 12);
const sfx = {
  click() { tone(N(84), .05, 'square', .04); },
  swish() { noise(.12, .12, 700, 2600); },
  chop() { noise(.16, .45, 1700, 380); tone(170, .14, 'square', .1, 0, 70); tone(N(81), .05, 'square', .03, .01); },
  clang() { tone(1320, .3, 'square', .045, 0, 1000); tone(1980, .28, 'triangle', .05); noise(.08, .18, 5000, 3000, 0, 'highpass'); },
  dizzy() { tone(N(84), .16, 'triangle', .06, .05, N(76)); tone(N(81), .16, 'triangle', .06, .22, N(72)); tone(N(79), .22, 'triangle', .06, .39, N(67)); },
  creak() { tone(140, .75, 'sawtooth', .03, 0, 85); tone(152, .75, 'sawtooth', .02, .06, 92); },
  whoosh() { noise(.55, .2, 300, 2600); },
  crash() { noise(1, .5, 1100, 60, 0, 'lowpass'); tone(80, .6, 'sine', .3, 0, 35); noise(.35, .22, 3000, 700, .04); },
  log() { tone(300, .1, 'triangle', .12, 0, 170); noise(.08, .18, 800, 300); },
  hammer() { tone(N(96), .04, 'square', .05); noise(.07, .3, 3000, 1500); tone(240, .09, 'square', .06, 0, 130); },
  ouch() { tone(N(91), .08, 'square', .06); tone(N(86), .35, 'triangle', .08, .08, N(64)); },
  rise() { [0, 4, 7].forEach((s, i) => tone(N(74 + s), .07, 'triangle', .05, i * .05)); },
  right() { [0, 4, 7, 12].forEach((s, i) => tone(N(76 + s), .08, 'square', .045, i * .06)); sfx.bells(.05, 3); },
  wrong() { tone(N(67), .13, 'triangle', .09); tone(N(62), .26, 'triangle', .08, .12, N(60)); },
  step() { noise(.04, .06, 700, 300, 0, 'lowpass'); },
  coin(n = 0) { n = Math.min(n, 12); tone(N(88 + n), .06, 'square', .04); tone(N(95 + n), .1, 'square', .04, .06); },
  pop() { noise(.12, .2, 2000, 5000, 0, 'highpass'); tone(N(84), .08, 'square', .04, .02, N(96)); },
  sold() { [72, 76, 79, 84, 79, 84, 88, 91].forEach((n, i) => tone(N(n), i === 7 ? .5 : .12, 'square', .055, i * .11)); [48, 55, 60].forEach((n, i) => tone(N(n), .3, 'triangle', .1, i * .33)); sfx.bells(0, 12); },
  done() { [67, 72, 76, 79, 84].forEach((n, i) => tone(N(n), .1, 'square', .05, i * .07)); sfx.bells(.1, 8); },
  // sleigh bells: quick shimmery shakes with a high bell ping in each
  bells(d = 0, n = 6) { for (let i = 0; i < n; i++) { const t = d + i * .075 + (i & 1) * .02; noise(.09, .05, 9000, 6000, t, 'highpass'); tone(N(98 + [0, 4, 2][i % 3]), .09, 'sine', .022, t); } },
};
const SPK_ON = '<svg viewBox="0 0 12 12" fill="currentColor" shape-rendering="crispEdges"><path d="M1 4h2l3-3h1v10H6L3 8H1z"/><path d="M8 4h1v4H8zM10 2h1v8h-1z"/></svg>';
const SPK_OFF = '<svg viewBox="0 0 12 12" fill="currentColor" shape-rendering="crispEdges"><path d="M1 4h2l3-3h1v10H6L3 8H1z"/><path d="M8 4h1v1h1V4h1v1h-1v2h1v1h-1V7H9v1H8V7h1V5H8z"/></svg>';
function renderMute() {
  $('muteBtn').innerHTML = save.muted ? SPK_OFF : SPK_ON;
  $('sndBtn').innerHTML = `${save.muted ? SPK_OFF : SPK_ON}<span>SOUND<br>${save.muted ? 'OFF' : 'ON'}</span>`;
  $('pSndBtn').textContent = save.muted ? 'SOUND: OFF' : 'SOUND: ON';
}
function toggleMute() {
  save.muted = !save.muted; persist();
  if (master) master.gain.value = save.muted ? 0 : .8;
  if (!save.muted) { try { audio(); } catch {} sfx.click(); }
  renderMute();
}

// ---------- the clock: game time, and the sleeps and tweens of the house being played (cancelled together when it ends)
let gameT = 0, timeScale = 1, paused = false, flow = 0, timers = [], tweens = [], asking = null, tapWait = null;
const sleep = (sec) => new Promise((res) => timers.push({at: gameT + sec, res}));
const tween = (dur, fn, ez = (t) => t) => new Promise((res) => { fn(ez(0)); tweens.push({t0: gameT, dur: Math.max(.001, dur), fn, ez, res}); });
function cancelFlow() { flow++; timers = []; tweens = []; asking = null; tapWait = null; }
function tick(dt) {
  gameT += dt;
  if (timers.length) {
    const due = timers.filter((t) => t.at <= gameT);
    if (due.length) { timers = timers.filter((t) => t.at > gameT); due.forEach((t) => t.res()); }
  }
  if (tweens.length) {
    const tw = tweens, fin = [];
    for (const t of tw) { const p = clamp((gameT - t.t0) / t.dur, 0, 1); t.fn(t.ez(p)); if (p >= 1) fin.push(t); }
    if (fin.length) { tweens = tweens.filter((t) => !fin.includes(t)); fin.forEach((t) => t.res()); }
  }
}
// wait a while, or until the player taps the card ("TAP TO GO ON")
function waitTap(sec) {
  return new Promise((res) => {
    const w = {res, done: false}; tapWait = w; $('card').classList.add('waiting');
    sleep(sec).then(() => goOn(w));
  });
}
function goOn(w = tapWait) {
  if (!w || w.done) return;
  w.done = true; if (tapWait === w) tapWait = null; $('card').classList.remove('waiting'); w.res();
}

// ---------- the world: 1 unit = 1 pixel of the 1024×1536 background pictures
const WB = 1024;
const GROUND = 1229;             // where the trees stand (80 % down the background)
const FOX_H = 300;               // Foxino from his boots to the top of his head
const TREE_H = 930, TREE_GAP = WB;
let TREE_X0 = 640;                // set in setupForest so that the camera at tree 1 is centred on the background picture
const HOUSE_W = [0, 450, 520, 570];
const BUYER_H = 300, SITE_X = 712;   // (the camera at the plot then sits near the middle of the background picture)

// ---------- placeholder pixel art (simple shapes painted on small canvases; the outline pass makes them look like sprites)
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function paint(w, h, fn) {
  const c = canvas(w, h), x = c.getContext('2d');
  const r = (a, b, ww, hh, col) => { x.fillStyle = col; x.fillRect(Math.round(a), Math.round(b), Math.round(ww), Math.round(hh)); };
  const disc = (cx, cy, rx, ry, col) => {
    ry = ry ?? rx;
    for (let y = -Math.floor(ry); y <= Math.floor(ry); y++) { const hw = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry)))); r(cx - hw, cy + y, hw * 2 + 1, 1, col); }
  };
  const line = (x0, y0, x1, y1, col, t = 1) => {
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
    for (let i = 0; i <= n; i++) r(Math.round(x0 + (x1 - x0) * i / n - (t - 1) / 2), Math.round(y0 + (y1 - y0) * i / n - (t - 1) / 2), t, t, col);
  };
  const poly = (pts, col) => {
    const ys = pts.map((p) => p[1]);
    for (let y = Math.floor(Math.min(...ys)); y < Math.ceil(Math.max(...ys)); y++) {
      const yc = y + .5, xs = [];
      for (let i = 0; i < pts.length; i++) {
        const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
        if ((ay <= yc && by > yc) || (by <= yc && ay > yc)) xs.push(ax + (yc - ay) / (by - ay) * (bx - ax));
      }
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2) { const a = Math.round(xs[i]), b = Math.round(xs[i + 1]); if (b > a) r(a, y, b - a, 1, col); }
    }
  };
  fn({r, disc, line, poly, x});
  return c;
}
// a 1-pixel dark outline around everything opaque
function outline(c, col = '#1e120a') {
  const x = c.getContext('2d'), w = c.width, h = c.height, im = x.getImageData(0, 0, w, h), d = im.data;   // (one read per canvas)
  const a = new Uint8Array(w * h); for (let i = 0; i < w * h; i++) a[i] = d[i * 4 + 3] > 0 ? 1 : 0;
  const [R, G, B] = [1, 3, 5].map((i) => parseInt(col.slice(i, i + 2), 16));
  for (let y = 0; y < h; y++) for (let X = 0; X < w; X++) {
    const i = y * w + X; if (a[i]) continue;
    if ((X > 0 && a[i - 1]) || (X < w - 1 && a[i + 1]) || (y > 0 && a[i - w]) || (y < h - 1 && a[i + w])) { d[i * 4] = R; d[i * 4 + 1] = G; d[i * 4 + 2] = B; d[i * 4 + 3] = 255; }
  }
  x.putImageData(im, 0, 0); c.pixels = im; return c;
}
const crop = (src, sx, sy, w, h) => { const c = canvas(w, h); c.getContext('2d').drawImage(src, sx, sy, w, h, 0, 0, w, h); return c; };
// the right-most opaque pixel of a picture region (where the axe or the hammer hits)
function tipOf(im, fx, fw, fh) {
  const d = im.data, w = im.width;
  for (let X = fw - 1; X >= 0; X--) { const ys = []; for (let y = 0; y < fh; y++) if (d[(y * w + fx + X) * 4 + 3] > 0) ys.push(y); if (ys.length) return {x: X, y: ys[ys.length >> 1]}; }
  return {x: fw / 2, y: fh / 2};
}

const FC = {P: '#8a52d1', Pd: '#6b3fb0', O: '#f28a2e', C: '#fff1dc', Y: '#ffd23a', Yd: '#e8b420', OS: '#f07a1f', OSd: '#c85a14', GE: '#3fbf6a', K: '#2b1b2e',
  R: '#d23b2f', Rd: '#7a1a18', B: '#6b4226', Bd: '#3f2614', st: '#a9b4c0', stL: '#eef3f8', stD: '#5c6670', wd: '#b07a3e', wdD: '#7a4e22', wdL: '#f2cf94'};
const FOX_FRAMES = ['idle', 'windup', 'chop', 'cheer', 'hamUp', 'hamDown', 'carry', 'dizzy'];
// the poses: where the front hand is, the angle of the tool (0 = pointing right, -90 = up), the face
const POSES = {
  idle: {hand: [37, -27], a: -62, tool: 'axe', L: 20, face: 'smile'},
  windup: {hand: [24, -47], a: -150, tool: 'axe', L: 20, face: 'focus', lean: -1},
  chop: {hand: [44, -30], a: 0, tool: 'axe', L: 20, face: 'focus', lean: 1},
  cheer: {hand: [37, -50], a: -95, tool: 'axe', L: 20, face: 'open'},
  hamUp: {hand: [35, -46], a: -115, tool: 'hammer', L: 13, face: 'focus'},
  hamDown: {hand: [42, -26], a: 35, tool: 'hammer', L: 13, face: 'focus', lean: 1},
  carry: {tool: 'log', face: 'smile', step: true},
  dizzy: {hand: [38, -22], a: 100, tool: 'axe', L: 18, face: 'dizzy'},
};
function plaid(p, x, y, w, h) {
  p.r(x, y, w, h, FC.R);
  for (let i = 0; i < w; i++) if (i % 3 === 1) p.r(x + i, y, 1, h, FC.Rd);
  for (let j = 0; j < h; j++) if (j % 3 === 1) p.r(x, y + j, w, 1, FC.Rd);
}
function foxTool(p, hx, hy, deg, kind, L) {
  const a = deg * Math.PI / 180, dx = Math.cos(a), dy = Math.sin(a), nx = -dy, ny = dx;
  const at = (u, w) => [hx + dx * (L + u) + nx * w, hy + dy * (L + u) + ny * w];
  p.line(hx - dx * 4, hy - dy * 4, hx + dx * L, hy + dy * L, FC.wd, 2);
  if (kind === 'axe') {
    p.poly([at(-4, -2), at(1, -2), at(3, 7), at(-6, 7)], FC.st);
    p.line(...at(2, 6), ...at(-5, 6), FC.stL, 1);
    p.poly([at(-4, -2), at(1, -2), at(1, 1), at(-4, 1)], FC.stD);
  } else {
    p.poly([at(-2, -3), at(2, -3), at(2, 5), at(-2, 5)], FC.stD);
    p.line(...at(2, -3), ...at(2, 5), FC.st, 1);
  }
}
function drawFoxPose(p, pose, ox) {
  const P = POSES[pose], B = 73, cx = ox + 30 + (P.lean || 0), st = P.step ? 3 : 0;
  // tail
  p.disc(cx - 15, B - 22, 6, 9, FC.P); p.disc(cx - 17, B - 16, 4, 4, FC.O); p.disc(cx - 18, B - 13, 3, 3, FC.C);
  // the back arm (behind the body)
  if (P.hand) { const a = P.a * Math.PI / 180; p.line(cx - 6, B - 30, ox + P.hand[0] - Math.cos(a) * 5, B + P.hand[1] - Math.sin(a) * 5, FC.Rd, 3); p.disc(ox + P.hand[0] - Math.cos(a) * 5, B + P.hand[1] - Math.sin(a) * 5, 2, 2, FC.Pd); }
  // legs, boots, shorts
  p.r(cx - 6 - st, B - 10, 4, 5, FC.P); p.r(cx + 1 + st, B - 10, 4, 5, FC.P);
  p.r(cx - 8 - st, B - 5, 7, 5, FC.B); p.r(cx + st, B - 5, 9, 5, FC.B); p.r(cx - 8 - st, B - 1, 7, 1, FC.Bd); p.r(cx + st, B - 1, 9, 1, FC.Bd);
  p.r(cx - 8, B - 17, 15, 7, FC.OS); p.r(cx - 8, B - 11, 15, 1, FC.OSd); p.r(cx - 1, B - 12, 1, 2, FC.OSd);
  // the yellow T-shirt under the open plaid flannel shirt
  p.r(cx - 7, B - 31, 13, 15, FC.Y); p.r(cx - 7, B - 18, 13, 1, FC.Yd);
  plaid(p, cx - 9, B - 32, 4, 16); plaid(p, cx + 4, B - 32, 4, 16); p.r(cx - 5, B - 32, 9, 1, FC.Yd);
  // carrying a log on the shoulders
  if (P.tool === 'log') {
    p.r(cx - 22, B - 38, 44, 8, FC.wd); p.r(cx - 22, B - 38, 44, 1, '#c99050'); p.r(cx - 22, B - 31, 44, 1, FC.wdD);
    for (const lx of [-14, -3, 9]) p.r(cx + lx, B - 36, 5, 1, FC.wdD);
    p.disc(cx + 22, B - 34, 2, 4, FC.wdL); p.r(cx + 22, B - 34, 1, 1, FC.wd);
  }
  // the head: purple, orange face, cream snout, green eye
  p.disc(cx, B - 43, 11, 10, FC.P); p.disc(cx - 3, B - 47, 5, 4, '#9a66de');
  p.disc(cx + 5, B - 39, 6, 5, FC.O);
  p.r(cx + 7, B - 42, 6, 4, FC.C); p.r(cx + 12, B - 42, 2, 2, FC.K);
  if (P.face === 'open') {
    for (const [ex, ey] of [[3, 45], [4, 46], [5, 47], [6, 46], [7, 45]]) p.r(cx + ex, B - ey, 1, 1, FC.K);
    p.r(cx + 7, B - 39, 5, 3, FC.K); p.r(cx + 8, B - 38, 3, 1, '#ff7a8a');
  } else if (P.face === 'dizzy') {
    p.line(cx + 3, B - 48, cx + 7, B - 44, FC.K); p.line(cx + 7, B - 48, cx + 3, B - 44, FC.K);
    p.r(cx + 7, B - 38, 1, 1, FC.K); p.r(cx + 8, B - 37, 1, 1, FC.K); p.r(cx + 9, B - 38, 1, 1, FC.K); p.r(cx + 10, B - 37, 1, 1, FC.K);
  } else {
    p.r(cx + 3, B - 48, 4, 5, '#ffffff'); p.r(cx + 4, B - 48, 3, 5, FC.GE); p.r(cx + 5, B - 47, 2, 3, FC.K); p.r(cx + 4, B - 48, 1, 1, '#ffffff');
    if (P.face === 'focus') p.r(cx + 2, B - 50, 6, 1, FC.Pd);
    p.r(cx + 7, B - 38, 4, 1, FC.K); p.r(cx + 6, B - 39, 1, 1, FC.K);
  }
  // ears through the red lumberjack cap
  p.poly([[cx - 10, B - 50], [cx - 8, B - 63], [cx - 2, B - 52]], FC.P); p.poly([[cx - 8, B - 52], [cx - 7, B - 59], [cx - 4, B - 53]], FC.O);
  p.poly([[cx + 1, B - 53], [cx + 7, B - 64], [cx + 10, B - 51]], FC.P); p.poly([[cx + 3, B - 53], [cx + 7, B - 60], [cx + 8, B - 53]], FC.O);
  for (let y = 0; y < 6; y++) { const hw = Math.round(11 * Math.sqrt(Math.max(0, 1 - ((6 - y) / 6.6) ** 2))); p.r(cx - hw, B - 57 + y, hw * 2 + 1, 1, FC.R); }
  p.r(cx - 11, B - 52, 23, 2, FC.Rd); p.r(cx + 6, B - 52, 10, 2, FC.Rd); p.r(cx - 4, B - 56, 3, 1, '#ff7060');
  // the tool and the front arm
  if (P.hand) {
    const hx = ox + P.hand[0], hy = B + P.hand[1];
    foxTool(p, hx, hy, P.a, P.tool, P.L);
    p.line(cx + 4, B - 30, hx, hy, FC.R, 3); p.disc(hx, hy, 2, 2, FC.P);
  } else { p.disc(cx + 9, B - 33, 2, 2, FC.P); p.disc(cx - 9, B - 33, 2, 2, FC.Pd); }
  if (P.face === 'dizzy') for (const [sx, sy] of [[-9, 67], [2, 70], [12, 66]]) { p.r(cx + sx, B - sy - 1, 1, 3, FC.Y); p.r(cx + sx - 1, B - sy, 3, 1, FC.Y); }
}
function placeholderFox() {
  const FW = 70, FH = 76;
  const strip = paint(FW * FOX_FRAMES.length, FH, (p) => FOX_FRAMES.forEach((f, i) => drawFoxPose(p, f, i * FW)));
  outline(strip);
  const chop = FOX_FRAMES.indexOf('chop'), ham = FOX_FRAMES.indexOf('hamDown');
  const im = strip.pixels, at = tipOf(im, chop * FW, FW, FH), ht = tipOf(im, ham * FW, FW, FH);
  return {img: strip, w: strip.width, h: FH, fw: FW, fh: FH, ax: 30, ay: 73, frames: FOX_FRAMES.slice(), figH: 60,
    axeTip: {x: at.x - 30, y: at.y - 73}, hamTip: {x: ht.x - 30, y: ht.y - 73}, face: crop(strip, 12, 6, 36, 36)};
}

const TP = {bark: '#7a4e2a', barkD: '#4f3018', barkL: '#9a6a3a', l1: '#2f7a3c', l2: '#3f9446', l3: '#5cb85a', l4: '#7fd06a', g1: '#d9a531', g2: '#f0c850'};
function placeholderTree(level) {
  const W = 150, H = 160, cx = 75, base = 157, ny = 135;
  const c = paint(W, H, (p) => {
    // trunk with roots and bark
    p.r(cx - 9, 96, 18, base - 96 + 1, TP.bark); p.r(cx - 8, 96, 3, base - 96 + 1, TP.barkL);
    p.r(cx - 13, base - 4, 26, 5, TP.bark); p.r(cx - 15, base - 1, 30, 2, TP.bark);
    for (const [bx, by, bh] of [[-3, 104, 9], [3, 118, 11], [-1, 140, 8], [5, 100, 6], [-5, 126, 7]]) p.r(cx + bx, by, 1, bh, TP.barkD);
    // the round crown: dark under-layer, middle, light tops, a few golden leaves
    const blobs = [[75, 62, 46, 40], [38, 76, 27, 22], [112, 76, 27, 22], [55, 34, 27, 24], [95, 34, 27, 24], [75, 22, 22, 18], [75, 90, 30, 14]];
    blobs.forEach(([x, y, rx, ry]) => p.disc(x + 2, y + 3, rx, ry, TP.l1));
    blobs.forEach(([x, y, rx, ry]) => p.disc(x, y, rx - 2, ry - 2, TP.l2));
    blobs.forEach(([x, y, rx, ry]) => p.disc(x - rx * .25, y - ry * .3, rx * .55, ry * .5, TP.l3));
    blobs.forEach(([x, y, rx, ry]) => p.disc(x - rx * .35, y - ry * .45, rx * .22, ry * .2, TP.l4));
    for (const [gx, gy] of [[42, 60], [100, 48], [70, 86], [118, 82], [58, 24], [88, 72], [30, 82], [110, 30], [64, 50]]) { p.r(gx, gy, 3, 2, TP.g1); p.r(gx + 2, gy - 2, 2, 2, TP.g2); p.r(gx - 2, gy + 1, 2, 2, TP.g2); p.r(gx + 1, gy + 2, 2, 1, TP.g1); }
    // the notch on the left of the trunk (the side Foxino stands on) and wood chips on the ground
    const depth = [0, 4, 11][level];
    if (depth) {
      for (let y = -6; y <= 6; y++) { const w = Math.round(depth * (1 - Math.abs(y) / 7)); if (w > 0) { p.r(cx - 9, ny + y, w, 1, FC.wdL); p.r(cx - 9 + w - 1, ny + y, 1, 1, '#c8955a'); } }
      const chips = level === 1 ? [[-24, 3], [-19, 2]] : [[-28, 3], [-22, 2], [-18, 4], [-33, 2], [-14, 2]];
      for (const [x, w] of chips) p.r(cx + x, base - 1, w, 2, FC.wdL);
    }
  });
  return outline(c);
}
function placeholderStump() {
  return outline(paint(34, 22, (p) => {
    p.r(8, 6, 18, 14, TP.bark); p.r(9, 6, 3, 14, TP.barkL); p.r(5, 17, 24, 4, TP.bark); p.r(20, 9, 1, 6, TP.barkD);
    p.disc(17, 6, 9, 3, FC.wdL); p.disc(17, 6, 6, 2, '#e0b070'); p.disc(17, 6, 3, 1, FC.wdL); p.r(17, 6, 1, 1, '#c8955a');
  }));
}
function placeholderLog() {
  return outline(paint(78, 22, (p) => {
    p.r(8, 3, 64, 16, TP.bark); p.r(8, 4, 64, 3, TP.barkL); p.r(8, 16, 64, 2, TP.barkD);
    for (const [x, y] of [[20, 9], [34, 12], [47, 8], [60, 11]]) p.r(x, y, 7, 1, TP.barkD);
    p.disc(8, 11, 5, 8, FC.wdL); p.disc(8, 11, 3, 5, '#e0b070'); p.disc(8, 11, 1, 2, FC.wdL);
    p.disc(72, 11, 3, 8, '#c8955a');
  }));
}
function placeholderPile() {
  return outline(paint(54, 40, (p) => {
    for (const [x, y] of [[13, 32], [27, 32], [41, 32], [20, 20], [34, 20], [27, 8]]) {
      p.disc(x, y, 7, 7, TP.bark); p.disc(x, y, 5, 5, FC.wdL); p.disc(x, y, 3, 3, '#e0b070'); p.r(x, y, 1, 1, '#c8955a');
    }
  }));
}
function placeholderPlot() {
  return outline(paint(132, 40, (p) => {
    p.poly([[18, 6], [114, 6], [128, 36], [4, 36]], '#a8743f');
    p.poly([[22, 6], [110, 6], [114, 12], [18, 12]], '#8f5f30');
    const R = rng(7); for (let i = 0; i < 60; i++) p.r(10 + R() * 112, 8 + R() * 27, 2, 1, R() < .5 ? '#8f5f30' : '#c08850');
    for (const [x, y, h] of [[16, 0, 9], [114, 0, 9], [3, 26, 13], [126, 26, 13]]) p.r(x, y, 3, h, FC.wd);
    p.line(17, 1, 115, 1, '#f4f0e0'); p.line(4, 27, 17, 1, '#f4f0e0'); p.line(127, 27, 115, 1, '#f4f0e0'); p.line(4, 27, 127, 27, '#f4f0e0');
    for (const [x, y] of [[92, 22], [100, 22], [96, 18], [30, 26]]) { p.r(x, y, 8, 4, '#c0483a'); p.r(x, y, 8, 1, '#e06a5a'); }
  }));
}
const HP = {a: '#b8763c', b: '#9e6230', line: '#6e4220', end: '#e8c48a', roof: '#d8402f', roofD: '#a8302a', trim: '#7a2420', stone: '#9a948c', stoneD: '#6e6860',
  door: '#6b3f1f', glass: '#9fe0ff', glassL: '#d8f4ff', frame: '#f3e2c0', box: '#8a5528'};
function logWall(p, x, y, w, h) {
  for (let j = 0; j < h; j++) p.r(x, y + j, w, 1, j % 5 === 4 ? HP.line : (Math.floor(j / 5) % 2 ? HP.b : HP.a));
  for (let j = 0; j + 4 <= h; j += 5) { p.disc(x - 1, y + j + 2, 2, 2, HP.end); p.disc(x + w, y + j + 2, 2, 2, HP.end); }
}
function roof(p, x0, x1, yb, ya) {
  const mx = (x0 + x1) / 2;
  p.poly([[x0, yb], [x1, yb], [mx, ya]], HP.roof);
  for (let y = ya + 5; y < yb; y += 5) { const t = (y - ya) / (yb - ya), hw = (x1 - x0) / 2 * t; p.r(mx - hw + 1, y, hw * 2 - 2, 1, HP.roofD); }
  p.r(x0 - 1, yb, x1 - x0 + 2, 3, HP.trim);
}
function win(p, x, y, w = 11, h = 10, box = true) {
  p.r(x, y, w, h, HP.frame); p.r(x + 1, y + 1, w - 2, h - 2, HP.glass); p.r(x + 2, y + 2, 2, 2, HP.glassL);
  p.r(x + (w >> 1), y + 1, 1, h - 2, HP.frame); p.r(x + 1, y + (h >> 1), w - 2, 1, HP.frame);
  if (box) { p.r(x - 1, y + h, w + 2, 3, HP.box); for (let i = 0; i < w; i += 3) p.r(x + i, y + h - 1, 2, 2, i % 2 ? '#ff6a8a' : '#ffd23f'); }
}
function door(p, x, y, w, h) {
  p.r(x, y, w, h, HP.door); for (let i = 3; i < w; i += 4) p.r(x + i, y + 1, 1, h - 1, '#56301a'); p.r(x + w - 3, y + (h >> 1), 2, 2, '#ffd23f');
  p.r(x - 2, y + h - 2, w + 4, 2, HP.stone);
}
function chimney(p, x, y, h) { p.r(x, y, 8, h, HP.stone); for (let j = 2; j < h; j += 4) p.r(x + (j % 8 ? 1 : 4), y + j, 3, 1, HP.stoneD); p.r(x - 1, y - 2, 10, 3, HP.stoneD); }
function placeholderHouse(n) {
  if (n === 1) return outline(paint(84, 78, (p) => {
    chimney(p, 58, 12, 20); logWall(p, 10, 40, 64, 37); roof(p, 3, 81, 40, 10);
    win(p, 15, 48); win(p, 58, 48); door(p, 36, 53, 12, 24);
  }));
  if (n === 2) return outline(paint(106, 90, (p) => {
    chimney(p, 76, 10, 22); logWall(p, 10, 46, 86, 43); roof(p, 2, 104, 46, 8);
    p.disc(53, 30, 5, 5, HP.frame); p.disc(53, 30, 3, 3, HP.glass);
    win(p, 15, 56); win(p, 80, 56);
    door(p, 46, 63, 14, 26);
    p.r(28, 52, 50, 4, HP.roof); p.r(28, 56, 50, 1, HP.trim); p.r(30, 57, 3, 32, FC.wd); p.r(73, 57, 3, 32, FC.wd);
    p.r(30, 74, 13, 2, FC.wd); p.r(63, 74, 13, 2, FC.wd); for (let i = 33; i < 44; i += 3) p.r(i, 76, 1, 12, FC.wdD); for (let i = 63; i < 74; i += 3) p.r(i, 76, 1, 12, FC.wdD);
  }));
  return outline(paint(114, 120, (p) => {
    chimney(p, 84, 8, 30); logWall(p, 14, 40, 86, 34); logWall(p, 10, 74, 94, 45); roof(p, 4, 110, 42, 4);
    p.disc(57, 28, 6, 6, HP.frame); p.disc(57, 28, 4, 4, HP.glass);
    win(p, 22, 48, 11, 12, false); win(p, 52, 48, 11, 12, false); win(p, 81, 48, 11, 12, false);
    p.r(8, 68, 98, 4, FC.wd); p.r(8, 60, 98, 2, FC.wd); for (let i = 9; i < 106; i += 5) p.r(i, 62, 1, 6, FC.wdD);
    win(p, 20, 84); win(p, 83, 84); door(p, 50, 92, 15, 27);
  }));
}
function placeholderScaffold() {
  return outline(paint(94, 86, (p) => {
    const pl = '#d9a55a', pd = '#a8743a';
    for (const y of [22, 49, 76]) { p.r(0, y, 94, 3, pl); p.r(0, y + 2, 94, 1, pd); }
    p.line(6, 25, 44, 49, pd, 2); p.line(48, 25, 86, 49, pd, 2); p.line(44, 52, 6, 76, pd, 2);
    for (const x of [3, 45, 87]) { p.r(x, 0, 4, 86, pl); p.r(x + 3, 0, 1, 86, pd); }
    p.r(64, 8, 2, 78, '#c48a48'); p.r(73, 8, 2, 78, '#c48a48'); for (let y = 12; y < 86; y += 6) p.r(64, y, 11, 1, '#c48a48');
  }));
}
function placeholderBuyer() {
  return outline(paint(54, 66, (p) => {
    const g = '#9a9aa4', gd = '#6a6a74', wh = '#f4f4f4', bk = '#26262c', vest = '#2f7a52';
    p.r(15, 61, 9, 4, bk); p.r(29, 61, 9, 4, bk); p.r(17, 52, 6, 9, gd); p.r(30, 52, 6, 9, gd);
    p.disc(26, 42, 13, 13, g); p.r(21, 31, 11, 22, wh); p.poly([[13, 33], [22, 33], [26, 54], [13, 50]], vest); p.poly([[31, 33], [40, 33], [40, 50], [27, 54]], vest);
    for (const y of [38, 43, 48]) { p.r(22, y, 2, 2, '#ffd23f'); p.r(29, y, 2, 2, '#ffd23f'); }
    p.line(13, 36, 8, 48, g, 4); p.line(39, 36, 42, 44, g, 4);
    p.disc(44, 48, 7, 8, '#a87a48'); p.r(41, 39, 6, 3, '#7a5228'); p.disc(44, 50, 3, 3, '#ffd23f'); p.r(44, 49, 1, 2, '#c99000');
    p.disc(26, 20, 12, 11, '#d8d8de'); p.r(20, 10, 4, 15, bk); p.r(29, 10, 4, 15, bk); p.r(24, 9, 5, 20, wh);
    p.r(21, 18, 2, 2, wh); p.r(30, 18, 2, 2, wh); p.r(21, 18, 1, 1, bk); p.r(31, 18, 1, 1, bk);
    p.r(25, 25, 3, 2, bk); p.r(24, 28, 1, 1, bk); p.r(25, 29, 3, 1, bk); p.r(28, 28, 1, 1, bk);
    p.disc(15, 11, 3, 3, gd); p.disc(37, 11, 3, 3, gd);
    p.r(14, 9, 25, 2, '#5a3a22'); p.disc(26, 7, 8, 5, '#6b4226'); p.r(18, 8, 17, 1, '#d8402f');
  }));
}
function cloud(p, x, y, s) { p.disc(x, y, 9 * s, 4 * s, '#d8eefa'); p.disc(x - 1, y - 1, 8 * s, 3 * s, '#ffffff'); p.disc(x - 5 * s, y - 3 * s, 4 * s, 3 * s, '#ffffff'); p.disc(x + 3 * s, y - 4 * s, 5 * s, 4 * s, '#ffffff'); }
function skyAndHills(p, R) {
  ['#5db6ee', '#6fc0f2', '#83cbf5', '#99d6f8', '#b3e2fa', '#cdeefc'].forEach((c, i) => p.r(0, i * 17, 128, 17, c));
  p.disc(102, 26, 10, 10, '#fff7c8'); p.disc(102, 26, 7, 7, '#ffe27a');
  cloud(p, 22, 34, 1.2); cloud(p, 74, 18, 1); cloud(p, 56, 58, .8); cloud(p, 116, 50, .9);
  for (let x = 0; x < 128; x++) { const h = Math.round(78 + 5 * Math.sin(x * .06) + 3 * Math.sin(x * .17 + 1)); p.r(x, h, 1, 104 - h, '#8cc9a2'); p.r(x, h, 1, 1, '#a8dbb8'); }
}
function grass(p, R, y0) {
  p.r(0, y0, 128, 192 - y0, '#83cc55'); p.r(0, y0, 128, 6, '#6db446'); p.r(0, y0 + 6, 128, 10, '#76c04c');
  for (let i = 0; i < 90; i++) { const x = R() * 128, y = y0 + 12 + R() * 70; p.r(x, y, 1, 2, '#64ae40'); p.r(x + 1, y - 1, 1, 3, '#64ae40'); }
  for (let i = 0; i < 24; i++) { const x = R() * 126, y = 178 + R() * 12, c = pick1(['#ffffff', '#ffd23f', '#ff8ab0', '#c8a0ff']); p.r(x, y + 1, 1, 2, '#4f9a38'); p.r(x - 1, y, 3, 1, c); p.r(x, y - 1, 1, 3, c); p.r(x, y, 1, 1, '#ffb030'); }
  for (let i = 0; i < 6; i++) { const x = R() * 124, y = 182 + R() * 8; p.r(x, y, 4, 2, '#9a948c'); p.r(x, y, 3, 1, '#c8c2b8'); }
}
function placeholderBgForest() {
  const R = rng(11);
  return paint(128, 192, (p) => {
    skyAndHills(p, R);
    for (let i = -1; i < 17; i++) { const x = i * 8 + 3, y = 90 + Math.round(R() * 3); p.disc(x, y, 6, 8, '#3c8a4a'); p.disc(x - 1, y - 2, 4, 5, '#4f9e55'); }
    for (let i = -1; i < 14; i++) {
      const x = i * 10 + 6, y = 96 + Math.round(R() * 3), gold = R() < .25;
      p.r(x - 1, y + 6, 3, 6, '#5a3a22'); p.disc(x, y, 7, 9, gold ? '#c98d22' : '#2f7a3c'); p.disc(x - 2, y - 3, 4, 5, gold ? '#e8b83a' : '#3f9446'); p.disc(x - 3, y - 5, 1, 2, gold ? '#f5d070' : '#5cb85a');
    }
    grass(p, R, 104);
  });
}
function placeholderBgSite() {
  const R = rng(23);
  return paint(128, 192, (p) => {
    skyAndHills(p, R);
    for (let x = 0; x < 128; x++) { const h = Math.round(90 + 3 * Math.sin(x * .09 + 2)); p.r(x, h, 1, 104 - h, '#79bb86'); }
    for (const [x, w, h, rc] of [[8, 12, 8, '#d8402f'], [26, 10, 7, '#c0603a'], [50, 13, 9, '#d8402f'], [70, 9, 6, '#a84a8a'], [104, 12, 8, '#c0603a']]) {
      p.r(x, 101 - h, w, h, '#f3e2c0'); p.poly([[x - 1, 101 - h], [x + w + 1, 101 - h], [x + w / 2, 101 - h - 6]], rc);
      p.r(x + 2, 103 - h, 2, 2, '#5a6a8a'); p.r(x + w - 4, 103 - h, 2, 2, '#5a6a8a');
    }
    p.r(88, 72, 9, 30, '#e8dcc8'); p.poly([[87, 72], [98, 72], [92.5, 58]], '#5a6a8a'); p.r(92, 53, 1, 6, '#ffd23f'); p.r(90, 55, 5, 1, '#ffd23f'); p.r(91, 80, 3, 4, '#5a6a8a');
    for (const x of [0, 40, 64, 84, 122]) { p.disc(x, 97, 5, 7, '#2f7a3c'); p.disc(x - 1, 95, 3, 4, '#3f9446'); }
    grass(p, R, 104);
    for (let x = 0; x < 128; x += 6) { p.r(x, 104, 2, 7, '#c48a48'); }
    p.r(0, 106, 128, 1, '#a8743a'); p.r(0, 109, 128, 1, '#a8743a');
  });
}

// ---------- the sprites: real pictures where art/manifest.js lists them, the placeholders above for the rest
// A sprite: {img or imgs (one picture per frame), fw, fh (frame size in its pixels), ax, ay (the anchor: feet / trunk base),
// k (world units per picture pixel, set by scaleArt), plus whatever the art script measured}
const ART = (window.TT_ART && window.TT_ART.assets) || {}, ARTV = (window.TT_ART && window.TT_ART.v) || 0;
const SPR = {};
let faceURL = '', artUsed = [];
function sprite(img, o = {}) { return Object.assign({img, w: img.width, h: img.height, fw: img.width, fh: img.height, ax: img.width / 2, ay: img.height}, o); }
function avgColor(img, y) {
  const c = canvas(img.width, 1), x = c.getContext('2d'); x.drawImage(img, 0, y, img.width, 1, 0, 0, img.width, 1);
  const d = x.getImageData(0, 0, img.width, 1).data; let r = 0, g = 0, b = 0;
  for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
  const n = d.length / 4; return `rgb(${Math.round(r / n)},${Math.round(g / n)},${Math.round(b / n)})`;
}
function makePlaceholders() {
  const fox = placeholderFox();
  SPR.fox = sprite(fox.img, fox); SPR.face = sprite(fox.face);
  const trees = [0, 1, 2].map(placeholderTree);
  SPR.tree = sprite(trees[0], {imgs: trees, ax: 75, ay: 157, trunkW: 18, notch: {x: -9 + 3, y: 135 - 157, edge: -9}, flip: false});
  SPR.stump = sprite(placeholderStump(), {ax: 17, ay: 20, trunkW: 18});
  SPR.log = sprite(placeholderLog(), {ay: 19, thick: 16});
  SPR.logpile = sprite(placeholderPile(), {ay: 39});
  SPR.plot = sprite(placeholderPlot(), {ax: 66, ay: 22});
  [1, 2, 3].forEach((n) => { SPR['house' + n] = sprite(placeholderHouse(n), {}); });
  SPR.scaffold = sprite(placeholderScaffold());
  SPR.buyer = sprite(placeholderBuyer(), {ay: 65});
  SPR.bgForest = sprite(placeholderBgForest(), {horizon: 104 / 192, par: .5, sky: '#5db6ee', ground: '#83cc55'});
  SPR.bgSite = sprite(placeholderBgSite(), {horizon: 104 / 192, par: .5, sky: '#5db6ee', ground: '#83cc55'});
}
const loadImg = (f) => new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = 'art/' + f + '?v=' + ARTV; });
async function loadArt() {
  makePlaceholders();
  await Promise.all(Object.entries(ART).map(async ([key, a]) => {
    if (!SPR[key]) return;
    const files = a.files || [a.file];
    const imgs = await Promise.all(files.map(loadImg));
    if (!imgs.length || imgs.some((x) => !x)) return;
    const s = sprite(imgs[0], Object.assign({}, a, {real: true}));
    if (a.files) s.imgs = imgs;
    if (key.startsWith('bg')) { s.sky = a.sky || avgColor(imgs[0], 0); s.ground = a.ground || avgColor(imgs[0], imgs[0].height - 1); s.horizon = a.horizon ?? .55; s.par = a.par ?? 1; }
    SPR[key] = s; artUsed.push(key);
  }));
  // a real Foxino sheet with only some of the poses: the missing ones borrow the nearest pose (never placeholder frames)
  faceURL = SPR.face.real ? 'art/' + ART.face.file + '?v=' + ARTV : SPR.face.img.toDataURL();
  for (const n of [1, 2, 3]) SPR['house' + n].ghost = ghostOf(SPR['house' + n]);
  scaleArt();
}
// the house's pale blue "blueprint" shown before it is built
function ghostOf(s) {
  const c = canvas(s.w, s.h), x = c.getContext('2d');
  x.drawImage(s.img, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = '#d8eeff'; x.fillRect(0, 0, s.w, s.h);
  x.globalCompositeOperation = 'source-over';
  const out = canvas(s.w + 2, s.h + 2), o = out.getContext('2d'); o.drawImage(c, 1, 1); outline(out, '#5a8ad0');
  return crop(out, 1, 1, s.w, s.h);
}
function scaleArt() {
  const F = SPR.fox, T = SPR.tree;
  F.k = FOX_H / F.figH;
  T.k = TREE_H / T.h;
  // the axe should meet the notch: the tree a little bigger or smaller (within limits) when the pictures disagree
  const axeH = -F.axeTip.y * F.k, notchH = -T.notch.y * T.k;
  if (notchH > 20 && axeH > 20) T.k *= clamp(axeH / notchH, .7, 1.25);
  T.trunkWW = T.trunkW * T.k;
  SPR.stump.k = T.trunkWW / SPR.stump.trunkW;
  SPR.log.k = T.trunkWW * 1.05 / SPR.log.thick;
  SPR.logpile.k = 300 / SPR.logpile.w;
  SPR.buyer.k = BUYER_H / SPR.buyer.h;
  for (const n of [1, 2, 3]) SPR['house' + n].k = HOUSE_W[n] / SPR['house' + n].w;
  SPR.bgForest.k = WB / SPR.bgForest.w; SPR.bgSite.k = WB / SPR.bgSite.w;
}
const FALLBACK = {hamUp: 'windup', hamDown: 'chop', carry: 'idle', dizzy: 'idle', windup: 'idle', chop: 'idle', cheer: 'idle'};
function fi(name) { const fr = SPR.fox.frames; let n = name; while (n && !fr.includes(n)) n = FALLBACK[n]; return Math.max(0, fr.indexOf(n || 'idle')); }
const notchDx = () => { const T = SPR.tree; return (T.flip ? -T.notch.x : T.notch.x) * T.k; };   // the notch, from the trunk's middle (left = negative)
const notchY = () => GROUND + SPR.tree.notch.y * SPR.tree.k;
const treeX = (i) => TREE_X0 + i * TREE_GAP;
// Foxino's feet when his axe just reaches into the trunk at the notch
const chopX = (i) => { const T = SPR.tree, e = T.notch.edge ?? T.notch.x; return treeX(i) + (T.flip ? -e : e) * T.k + 22 - SPR.fox.axeTip.x * SPR.fox.k; };
const houseW = () => HOUSE_W[site.house.k];
const hammerX = () => SITE_X - houseW() / 2 + 40 - SPR.fox.hamTip.x * SPR.fox.k;
const pileX = () => SITE_X - houseW() / 2 - 400;
const buyerX = () => SITE_X + houseW() / 2 + 150;
// the camera at the plot: the pile, Foxino and the house; with the buyer too once he is there
function siteCam(withBuyer) {
  const hs = SPR['house' + site.house.k], left = pileX() - 170, right = withBuyer ? buyerX() + 130 : SITE_X + houseW() / 2 + 70;
  Object.assign(site.cam, {cx: (left + right) / 2, w: right - left + 40, top: GROUND - Math.max(700, hs.h * hs.k + 240), bottom: GROUND + 130});
}

// ---------- canvas, layout, cameras
const cv = $('cv'), ctx = cv.getContext('2d');
let W = innerWidth, H = innerHeight, dpr = 1, side = false, mode = 'lobby', area = {x0: 0, y0: 0, x1: W, y1: H};
function newFox() { return {x: 0, y: 0, frame: 'idle', flip: false, walking: false, wt: 0, bob: 0, dizzy: 0, hop: 0, dy: 14}; }
const forest = {key: 'forest', cam: {cx: 0, top: GROUND - TREE_H - 50, bottom: GROUND + 120, w: 1000}, v: null, trees: [], fox: newFox(), parts: [], follow: true, camDx: 0};
const site = {key: 'site', cam: {cx: SITE_X - 30, top: GROUND - 760, bottom: GROUND + 130, w: 1120}, v: null, fox: Object.assign(newFox(), {dy: 46}), parts: [],
  house: {k: 1, reveal: 0, done: false}, scaff: {a: 0, dy: 0}, pile: {s: 0}, buyer: {x: 0, on: false, walking: false, wt: 0, bob: 0}};
let cur = forest, slide = 0, trauma = 0, flashA = 0;
function relayout() {
  W = innerWidth; H = innerHeight; dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  side = W / H > 1.15; document.body.classList.toggle('side', side);
  measureArea(); snapView(forest); snapView(site);
  fitQuestion();
}
// the scene fills the screen above the lobby's dock, or below the HUD and beside / above the question card (also while
// the card is away, so the camera does not jump)
let geo = null;
function measureArea() {
  const c = $('card'), cs = getComputedStyle(c), d = $('dock').getBoundingClientRect(), t = document.querySelector('.lb-title h1').getBoundingClientRect();
  const hudWasHidden = $('hud').hidden; $('hud').hidden = false; const hb = $('hud').getBoundingClientRect().bottom; $('hud').hidden = hudWasHidden;
  geo = {lobbyTop: mode === 'lobby' || !geo ? t.bottom + 8 : geo.lobbyTop, dockTop: d.top > 0 ? d.top - 4 : (geo ? geo.dockTop : H * .75), hud: hb + 4,
    cardLeft: W - parseFloat(cs.right) - c.offsetWidth - 6, cardTop: H - parseFloat(cs.bottom) - c.offsetHeight - 6};
  areaNow();
}
function areaNow() {
  if (!geo) return;
  if (mode === 'lobby') area = {x0: 0, y0: geo.lobbyTop, x1: W, y1: geo.dockTop};
  else if (side) area = {x0: 0, y0: geo.hud, x1: geo.cardLeft, y1: H};
  else area = {x0: 0, y0: geo.hud, x1: W, y1: geo.cardTop};
  if (area.y1 - area.y0 < 90) area.y0 = area.y1 - 90;
}
function computeView(cam) {
  const aw = area.x1 - area.x0, ah = area.y1 - area.y0;
  let s = Math.min(aw / cam.w, ah / (cam.bottom - cam.top));
  const need = area.y1 / cam.bottom;   // the top of the picture should reach the top of the screen (above it: plain sky)
  if (s < need) s = Math.min(need, s * 1.08);
  return {s, ox: (area.x0 + area.x1) / 2 - cam.cx * s, oy: area.y1 - cam.bottom * s, cx: cam.cx};
}
function snapView(sc) { if (sc === forest && forest.follow) forest.cam.cx = forest.fox.x + forest.camDx; sc.v = computeView(sc.cam); }
function updateView(sc, dt) {
  if (sc === forest && forest.follow) forest.cam.cx = forest.fox.x + forest.camDx;
  const t = computeView(sc.cam);
  if (!sc.v) { sc.v = t; return; }
  const k = 1 - Math.exp(-dt * 5);
  for (const key of ['s', 'ox', 'oy', 'cx']) sc.v[key] = lerp(sc.v[key], t[key], k);
}
const toScreen = (sc, wx, wy) => { const v = sc.v || computeView(sc.cam); return {x: wx * v.s + v.ox, y: wy * v.s + v.oy}; };
function shake(a) { if (!REDUCED) trauma = Math.min(1, trauma + a); }
function flash(a = .5) { flashA = Math.max(flashA, a); }

// ---------- drawing
function drawSprite(v, spr, wx, wy, o = {}) {
  if (!spr) return;
  const img = o.img || (spr.imgs ? spr.imgs[Math.min(spr.imgs.length - 1, o.frame || 0)] : spr.img);
  const f = spr.imgs || o.img ? 0 : (o.frame || 0), fw = spr.fw, fh = spr.fh;
  const kx = (o.kx || o.k || spr.k) * v.s, ky = (o.ky || o.k || spr.k) * v.s;
  let sy = 0, sh = fh;
  if (o.reveal != null) { sh = Math.round(fh * clamp(o.reveal, 0, 1)); sy = fh - sh; }
  if (o.clipTop != null) sh = clamp(Math.round(o.clipTop), 0, fh);
  if (sh <= 0) return;
  ctx.save();
  if (o.alpha != null) ctx.globalAlpha = clamp(o.alpha, 0, 1);
  ctx.translate(Math.round(wx * v.s + v.ox), Math.round(wy * v.s + v.oy));
  if (o.rot) { const px = (o.px || 0) * v.s, py = (o.py || 0) * v.s; ctx.translate(px, py); ctx.rotate(o.rot); ctx.translate(-px, -py); }
  if (o.flip) ctx.scale(-1, 1);
  const dx = Math.round(-spr.ax * kx), dy = Math.round((sy - spr.ay) * ky);
  ctx.drawImage(img, f * fw, sy, fw, sh, dx, dy, Math.max(1, Math.round(fw * kx)), Math.max(1, Math.round(sh * ky)));
  ctx.restore();
}
// the background picture: repeated (mirrored every other copy) to the sides; the sky part can move slower (parallax)
function drawBg(v, spr) {
  const img = spr.img, s = v.s * spr.k, tw = img.width * s, top = v.oy, th = img.height * s;
  ctx.fillStyle = spr.sky; ctx.fillRect(0, 0, W, Math.ceil(top) + 2);
  const hz = Math.round(img.height * spr.horizon);
  const bands = spr.par < 1 ? [[0, hz, spr.par], [hz, img.height, 1]] : [[0, img.height, 1]];
  for (const [y0, y1, p] of bands) {
    const oxp = v.ox + v.cx * v.s * (1 - p), dy0 = Math.round(top + y0 * s), dh = Math.round(top + y1 * s) - dy0;
    for (let i = Math.floor(-oxp / tw) - 1; ; i++) {
      const x0 = Math.round(oxp + i * tw), x1 = Math.round(oxp + (i + 1) * tw);
      if (x0 > W) break; if (x1 < 0) continue;
      ctx.save();
      if (i & 1) { ctx.translate(x1, 0); ctx.scale(-1, 1); ctx.drawImage(img, 0, y0, img.width, y1 - y0, 0, dy0, x1 - x0, dh); }
      else ctx.drawImage(img, 0, y0, img.width, y1 - y0, x0, dy0, x1 - x0, dh);
      ctx.restore();
      // below the picture: a band of its open grass, repeated (every other copy upside down, so the joins match)
      if (y1 === img.height && top + th < H) {
        const g0 = Math.round(img.height * .64), g1 = Math.round(img.height * .78), gh = (g1 - g0) * s;
        for (let k = 0, y = top + th; y < H && k < 40; k++, y += gh) {
          const a = Math.round(y), b = Math.round(y + gh);
          ctx.save();
          if (!(k & 1)) { ctx.translate(0, a + b); ctx.scale(1, -1); }
          if (i & 1) { ctx.translate(x1, 0); ctx.scale(-1, 1); }
          ctx.drawImage(img, 0, g0, img.width, g1 - g0, i & 1 ? 0 : x0, a, x1 - x0, b - a);
          ctx.restore();
        }
      }
    }
  }
}
function drawFoxActor(v, a) {
  const F = SPR.fox;
  drawSprite(v, F, a.x, GROUND + a.dy - a.bob - a.hop, {frame: fi(a.frame), flip: a.flip});
  if (a.dizzy > 0) {   // three little stars circling his head
    const cx = a.x, cy = GROUND + a.dy - FOX_H - 30 - a.hop, sz = Math.max(3, Math.round(10 * v.s));
    for (let i = 0; i < 3; i++) {
      const ang = gameT * 7 + i * 2.1, x = (cx + Math.cos(ang) * 80) * v.s + v.ox, y = (cy + Math.sin(ang) * 22) * v.s + v.oy;
      ctx.globalAlpha = clamp(a.dizzy * 2, 0, 1); ctx.fillStyle = '#ffd23f';
      ctx.fillRect(Math.round(x - sz * 1.5), Math.round(y - sz / 2), sz * 3, sz); ctx.fillRect(Math.round(x - sz / 2), Math.round(y - sz * 1.5), sz, sz * 3);
      ctx.globalAlpha = 1;
    }
  }
}
function drawTree(v, t) {
  const T = SPR.tree, frame = Math.min(2, t.hits);
  if (t.fall > 0) {   // the part above the notch falls, hinged on the far side of the trunk
    drawSprite(v, T, t.x, GROUND, {frame, flip: T.flip, rot: t.fall, px: T.trunkWW / 2, py: T.notch.y * T.k, clipTop: T.ay + T.notch.y + 2});
  } else drawSprite(v, T, t.x, GROUND, {frame, flip: T.flip, rot: t.wob, px: 0, py: 0});
}
function drawForest(v) {
  drawBg(v, SPR.bgForest); drawSnow(v, [0]);
  const T = SPR.tree, L = SPR.log;
  for (const t of forest.trees) if (t.stump) drawSprite(v, SPR.stump, t.x, GROUND + 4, {flip: T.flip});
  for (const t of forest.trees) if (t.log > 0) drawSprite(v, L, t.x + T.trunkWW / 2 + 40 + L.w * L.k / 2, GROUND + 26, {alpha: t.log});
  for (const t of forest.trees) if (!t.gone && !t.fall) drawTree(v, t);
  for (const t of forest.trees) if (!t.gone && t.fall) drawTree(v, t);
  drawFoxActor(v, forest.fox);
  drawParts(v, forest.parts);
}
function drawSite(v) {
  drawBg(v, SPR.bgSite); drawSnow(v, [0]);
  const Hs = site.house, hs = SPR['house' + Hs.k], hw = houseW(), hy = GROUND + 22;
  drawSprite(v, SPR.plot, SITE_X, GROUND - 4, {k: hw * 1.34 / SPR.plot.w});
  if (site.pile.s > 0) { const k = SPR.logpile.k * site.pile.s; drawSprite(v, SPR.logpile, pileX(), GROUND - 30, {kx: k, ky: k}); }
  if (!Hs.done) drawSprite(v, hs, SITE_X, hy, {img: hs.ghost, alpha: .5});
  if (Hs.reveal > 0) drawSprite(v, hs, SITE_X, hy, {reveal: Hs.reveal});
  if (site.scaff.a > 0) { const S = SPR.scaffold; drawSprite(v, S, SITE_X, hy + 2 + site.scaff.dy, {kx: hw * 1.1 / S.w, ky: hs.h * hs.k * 1.04 / S.h, alpha: site.scaff.a}); }
  drawFoxActor(v, site.fox);
  if (site.buyer.on) drawSprite(v, SPR.buyer, site.buyer.x, GROUND + 40 - site.buyer.bob, {});
  drawParts(v, site.parts);
}
function drawScene(sc, dx, clip) {
  if (clip) { ctx.save(); ctx.beginPath(); ctx.rect(clip[0], 0, clip[1] - clip[0], H); ctx.clip(); }
  const v0 = sc.v || computeView(sc.cam), sh = trauma * trauma, v = {s: v0.s, cx: v0.cx, ox: v0.ox + dx + (sh ? rand(-1, 1) * sh * 16 : 0), oy: v0.oy + (sh ? rand(-1, 1) * sh * 12 : 0)};
  sc.vd = v;
  if (sc === forest) drawForest(v); else drawSite(v);
  if (clip) ctx.restore();
}
function render() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.imageSmoothingEnabled = false;
  if (slide > 0 && slide < 1) { const x = Math.round((1 - slide) * W); drawScene(forest, -slide * W, [0, x]); drawScene(site, (1 - slide) * W, [x, W]); }
  else drawScene(cur, 0);
  drawSnow(cur.vd, [1, 2]);
  if (flashA > 0) { ctx.fillStyle = `rgba(255,255,255,${flashA})`; ctx.fillRect(0, 0, W, H); }
}

// ---------- particles: wood chips, leaves, dust, sparks, confetti (world units, drawn as little squares)
function addParts(sc, n, o) {
  for (let i = 0; i < n; i++) {
    const p = {x: o.x + rand(-(o.sx || 0), o.sx || 0), y: o.y + rand(-(o.sy || 0), o.sy || 0), vx: rand(...o.vx), vy: rand(...o.vy), g: o.g ?? 2400, life: 0, max: rand(...(o.life || [.8, 1.4])),
      size: rand(...(o.size || [14, 22])), col: pick1(o.cols), kind: o.kind || 'chip', floor: o.floor ?? GROUND + rand(0, 50), spin: rand(0, 6)};
    sc.parts.push(p);
  }
}
function stepParts(sc, dt) {
  const ps = sc.parts;
  for (const p of ps) {
    p.life += dt;
    if (p.kind === 'dust') { p.vx *= Math.exp(-dt * 3); p.vy *= Math.exp(-dt * 3); p.size += dt * 60; }
    else if (p.kind === 'leaf') { p.vy = Math.min(p.vy + p.g * dt, 160); p.vx = Math.sin(p.life * 3 + p.spin) * 120; }
    else if (p.kind === 'confetti') { p.vy = Math.min(p.vy + p.g * dt, 380); p.vx *= Math.exp(-dt * 1.5); }
    else p.vy += p.g * dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    if ((p.kind === 'chip') && p.y > p.floor) { p.y = p.floor; p.vy *= -.3; p.vx *= .55; }
  }
  sc.parts = ps.filter((p) => p.life < p.max);
}
function drawParts(v, ps) {
  for (const p of ps) {
    const fade = clamp((p.max - p.life) / .35, 0, 1), x = p.x * v.s + v.ox, y = p.y * v.s + v.oy;
    let s = Math.max(2, Math.round(p.size * v.s));
    ctx.globalAlpha = p.kind === 'dust' ? .7 * fade : fade; ctx.fillStyle = p.col;
    if (p.kind === 'dust') { ctx.fillRect(Math.round(x - s / 2), Math.round(y - s / 4), s, Math.round(s / 2)); ctx.fillRect(Math.round(x - s / 4), Math.round(y - s / 2), Math.round(s / 2), s); }
    else if (p.kind === 'spark') { ctx.fillRect(Math.round(x - s), Math.round(y - s / 4), s * 2, Math.max(2, Math.round(s / 2))); ctx.fillRect(Math.round(x - s / 4), Math.round(y - s), Math.max(2, Math.round(s / 2)), s * 2); }
    else if (p.kind === 'confetti') { const w = Math.max(2, Math.round(s * Math.abs(Math.cos(p.life * 9 + p.spin)))); ctx.fillRect(Math.round(x - w / 2), Math.round(y - s / 2), w, s); }
    else ctx.fillRect(Math.round(x - s / 2), Math.round(y - s / 2), s, Math.max(2, Math.round(s * (p.kind === 'chip' ? .6 : 1))));
  }
  ctx.globalAlpha = 1;
}
// winter: LEAF is snow lumps and a few fir needles, DUST is powder snow, the confetti is in Christmas colours
const CHIP = ['#f2cf94', '#e0b070', '#c8955a', '#fff0c8'], LEAF = ['#ffffff', '#f2f8ff', '#dcebf8', '#ffffff', '#2f6b45'], DUST = ['#ffffff', '#eef5fd', '#d8e8f6'],
  SNOW = ['#ffffff', '#f4f9ff', '#dcebf8'], SPARK = ['#ffffff', '#ffd23f', '#fff3a0'], CONF = ['#e63946', '#ffffff', '#2fbf6c', '#ffd23f', '#e63946', '#1f8a4c', '#9fe0ff'];

// ---------- the snowfall: pixel flakes in three layers over the whole screen. The far ones (small, slow, dim) fall
// behind the trees and Foxino, the near ones (bigger, a little plus shape) in front of everything. They drift with a
// slow gusty wind and move a little against the camera, so the snow feels deep.
const FLAKES = [], FD = [.35, .62, 1];
for (let i = 0, n = REDUCED ? 45 : 120; i < n; i++) FLAKES.push({x: Math.random(), y: Math.random(), z: i % 5 < 2 ? 0 : i % 5 < 4 ? 1 : 2, ph: rand(0, 6.3), sp: rand(.75, 1.25)});
let windT = 0;
function stepSnow(dt) {
  windT += dt;
  const wind = Math.sin(windT * .23) * .55 + Math.sin(windT * .71 + 1) * .25;
  for (const f of FLAKES) {
    const d = FD[f.z];
    f.y += dt * (.03 + .065 * d) * f.sp * (REDUCED ? .5 : 1);
    f.x += dt * (wind * .035 * d + Math.sin(windT * 1.4 + f.ph) * .014 * d);
    if (f.y > 1) { f.y -= 1; f.x = Math.random(); }
    f.x -= Math.floor(f.x);
  }
}
function drawSnow(v, layers) {
  const u = Math.max(2, Math.round(Math.min(W, H) / 230)), span = W + 60, camX = v ? v.cx * v.s : 0;
  ctx.fillStyle = '#ffffff';
  for (const f of FLAKES) {
    if (!layers.includes(f.z)) continue;
    const d = FD[f.z];
    let x = (f.x * span - camX * d * .3) % span; if (x < 0) x += span;
    x = Math.round(x - 30); const y = Math.round(f.y * (H + 60) - 30);
    ctx.globalAlpha = f.z === 0 ? .55 : f.z === 1 ? .8 : .95;
    if (f.z === 2) { ctx.fillRect(x + u, y, u, u * 3); ctx.fillRect(x, y + u, u * 3, u); }
    else { const s = u * (f.z + 1); ctx.fillRect(x, y, s, s); }
  }
  ctx.globalAlpha = 1;
}

// ---------- the DOM pop-ups: CHOP!, TIMBER!, OUCH!, the speech bubble, the flying coins
function burst(sc, text, wx, wy, cls = '') {
  const p = toScreen(sc, wx, wy), el = document.createElement('div');
  el.className = 'burst ' + cls; el.textContent = text;
  $('fx').appendChild(el);
  const hw = el.offsetWidth * .6 + 8, x0 = area.x0 + hw, x1 = area.x1 - hw;
  el.style.left = (x1 > x0 ? clamp(p.x, x0, x1) : (area.x0 + area.x1) / 2) + 'px'; el.style.top = clamp(p.y, area.y0 + 30, area.y1 - 20) + 'px';
  setTimeout(() => el.remove(), 1600);
}
function stamp(text, x, y) { const el = document.createElement('div'); el.className = 'stamp'; el.textContent = text; el.style.left = x + 'px'; el.style.top = y + 'px'; $('fx').appendChild(el); return el; }
let bubble = null;
function say(html, sc, wx, wy) {
  unsay();
  const el = document.createElement('div'); el.className = 'bubble'; el.innerHTML = html; $('fx').appendChild(el);
  bubble = {el, sc, wx, wy}; placeBubble();
}
function unsay() { if (bubble) { bubble.el.remove(); bubble = null; } }
function placeBubble() {
  if (!bubble) return;
  const p = toScreen(bubble.sc, bubble.wx, bubble.wy), r = bubble.el.offsetWidth / 2 + 8;
  bubble.el.style.left = clamp(p.x, r, W - r) + 'px'; bubble.el.style.top = Math.max(bubble.el.offsetHeight + 8, p.y) + 'px';
}
let flyers = [], coinShown = save.coins;
function renderCoins() { $('coinN').textContent = Math.round(coinShown); }
// coins fly from a point on the screen into the coin counter, each one adding its share
function flyCoins(n, total, x0, y0) {
  const per = total / n, chip = $('coinChip').getBoundingClientRect(), tx = chip.left + 22, ty = chip.top + chip.height / 2;
  for (let i = 0; i < n; i++) {
    const el = document.createElement('div'); el.className = 'flyc'; el.innerHTML = '<i class="gc" style="width:20px;height:20px;display:block"></i>';
    $('fx').appendChild(el);
    flyers.push({el, t: -i * .07, dur: .7, x0: x0 + rand(-20, 20), y0: y0 + rand(-10, 10), cx: lerp(x0, tx, .5) + rand(-80, 80), cy: Math.min(y0, ty) - rand(60, 160), tx, ty, per, i});
  }
  return sleep(n * .07 + .75);
}
function stepFlyers(dt) {
  for (const f of flyers) {
    f.t += dt; const t = clamp(f.t / f.dur, 0, 1), e = E.inQ(t);
    if (f.t < 0) { f.el.style.opacity = 0; continue; }
    f.el.style.opacity = 1;
    const x = (1 - e) ** 2 * f.x0 + 2 * (1 - e) * e * f.cx + e * e * f.tx, y = (1 - e) ** 2 * f.y0 + 2 * (1 - e) * e * f.cy + e * e * f.ty;
    f.el.style.transform = `translate(${x}px,${y}px) scale(${1 + Math.sin(t * Math.PI) * .4})`;
    if (t >= 1 && !f.done) {
      f.done = true; f.el.remove(); coinShown += f.per; renderCoins(); sfx.coin(f.i);
      const c = $('coinChip'); c.classList.remove('bump'); void c.offsetWidth; c.classList.add('bump');
    }
  }
  flyers = flyers.filter((f) => !f.done);
}

// ---------- the main loop
let last = performance.now(), lobbyLeafT = 0;
function frame(now) {
  const rdt = Math.min(.05, (now - last) / 1000); last = now;
  const dt = paused ? 0 : rdt * timeScale;
  tick(dt);
  update(dt);
  render();
  requestAnimationFrame(frame);
}
function stepActor(a, dt) {
  if (a.walking) { a.wt += dt; const b = Math.abs(Math.sin(a.wt * 10)); if (a.lastB != null && b > a.lastB && a.falling) sfx.step(); a.falling = b < (a.lastB ?? 0); a.lastB = b; a.bob = b * 16; }
  else { a.bob *= Math.exp(-dt * 14); a.wt = 0; }
  if (a.dizzy > 0) a.dizzy = Math.max(0, a.dizzy - dt * .8);
}
function update(dt) {
  areaNow();
  trauma = Math.max(0, trauma - dt * 2.4); flashA = Math.max(0, flashA - dt * 3); stepSnow(dt);
  for (const sc of [forest, site]) { updateView(sc, dt); stepParts(sc, dt); }
  stepActor(forest.fox, dt); stepActor(site.fox, dt);
  const b = site.buyer; if (b.walking) { b.wt += dt; b.bob = Math.abs(Math.sin(b.wt * 9)) * 14; } else b.bob *= Math.exp(-dt * 14);
  for (const t of forest.trees) { if (t.wobA > 0) { t.wobA = Math.max(0, t.wobA - dt * 2.5); t.wob = Math.sin(gameT * 38) * .022 * t.wobA; } else t.wob = 0; }
  // the lobby: now and then a lump of snow drops from the fir's branches
  if (mode === 'lobby' && forest.trees[0]) {
    lobbyLeafT -= dt;
    if (lobbyLeafT <= 0) { lobbyLeafT = rand(.6, 1.6); const t = forest.trees[0]; addParts(forest, 3, {x: t.x + rand(-220, 220), y: GROUND - TREE_H * rand(.35, .75), sx: 20, sy: 10, vx: [-20, 20], vy: [20, 60], g: 160, life: [2.5, 3.5], size: [8, 14], cols: SNOW, kind: 'leaf'}); }
  }
  stepFlyers(dt); placeBubble();
}

// ---------- the scenes
function setupForest(n) {
  // frame Foxino (from his tail) and the whole crown, a little margin on both sides, around the middle of the picture
  TREE_X0 = 0;
  const T = SPR.tree, right = treeX(0) + (T.flip ? T.ax : T.fw - T.ax) * T.k, left = chopX(0) - FOX_H * .5;
  TREE_X0 = WB / 2 - (left + right) / 2;
  forest.cam.w = Math.max(900, right - left + 180);
  forest.cam.top = GROUND - T.ay * T.k - 80;
  forest.camDx = WB / 2 - chopX(0);
  forest.trees = Array.from({length: n}, (_, i) => ({x: treeX(i), hits: 0, fall: 0, stump: false, log: 0, gone: false, wob: 0, wobA: 0}));
  forest.parts = []; forest.follow = true;
  Object.assign(forest.fox, newFox(), {x: chopX(0)});
  cur = forest; slide = 0; snapView(forest);
}
function setupSite(k) {
  site.house = {k, reveal: 0, done: false}; site.scaff = {a: 1, dy: 0}; site.pile = {s: 0}; site.parts = [];
  site.buyer = {x: SITE_X + 1400, on: false, walking: false, wt: 0, bob: 0};
  siteCam(false);
  Object.assign(site.fox, newFox(), {dy: 46, x: SITE_X - 1500});
  snapView(site);
}
async function walk(sc, a, x, speed = 400) {
  const x0 = a.x, d = Math.abs(x - x0); if (d < 2) return;
  a.walking = true; a.flip = x < x0;
  await tween(d / speed, (t) => { a.x = lerp(x0, x, t); });
  a.walking = false; a.flip = false;
}

// ---------- the question card
function renderCard(q, kick, pips, on) {
  $('qKick').textContent = kick;
  $('qPips').innerHTML = Array.from({length: pips}, (_, i) => `<i class="${i < on ? 'on' : ''}"></i>`).join('');
  $('qText').innerHTML = `${hints(q.before)}<span class="gap">?</span>${hints(q.after)}`;
  $('qAns').innerHTML = q.map((c, i) => `<button class="pbtn ans" data-i="${i}"><span class="k">${i + 1}</span>${esc(c.text)}</button>`).join('');
  const card = $('card'); card.classList.remove('away', 'waiting');
  fitQuestion();
}
function fitQuestion() {
  const t = $('qText'), box = t.parentElement; if (!t.textContent) return;
  t.style.fontSize = ''; let fs = Math.round(parseFloat(getComputedStyle(t).fontSize) * (box.clientHeight > 260 ? 1.6 : box.clientHeight > 180 ? 1.25 : 1));
  t.style.fontSize = fs + 'px';
  while ((t.scrollHeight > box.clientHeight - 12 || t.scrollWidth > box.clientWidth) && fs > 13) { fs -= 1; t.style.fontSize = fs + 'px'; }
}
function ask() {
  const q = fillChoices(pickSentence(G.lv));
  G.asked++;
  if (G.phase === 'chop') { const t = forest.trees[G.tree]; renderCard(q, `TREE ${G.tree + 1} OF ${G.info.trees} · CHOP!`, 3, t.hits); }
  else renderCard(q, 'BUILD THE HOUSE', G.info.build, G.built);
  return new Promise((res) => { asking = {q, res}; });
}
function answer(i) {
  if (!asking || paused) return;
  const {q, res} = asking, c = q[i]; if (!c) return;
  asking = null;
  const btns = [...$('qAns').children];
  btns.forEach((b) => { b.disabled = true; });
  const gap = $('qText').querySelector('.gap');
  gap.textContent = q.right; gap.classList.add(c.ok ? 'ok' : 'no');
  if (c.ok) { btns[i].classList.add('right'); btns.forEach((b, k) => { if (k !== i) b.classList.add('dim'); }); G.right++; }
  else {
    btns[i].classList.add('wrong'); const k = q.findIndex((x) => x.ok); btns[k].classList.add('reveal');
    btns.forEach((b, j) => { if (j !== i && j !== k) b.classList.add('dim'); });
    G.mistakes++; G.wrong.push({before: q.before, after: q.after, right: q.right, pick: c.text});
  }
  res({ok: c.ok, i});
}
$('qAns').addEventListener('click', (e) => { const b = e.target.closest('.ans'); if (b && !b.disabled) answer(+b.dataset.i); });
$('card').addEventListener('click', () => { if (tapWait) goOn(); });
function hideCard() { $('card').classList.add('away'); }

// ---------- the HUD
function renderGoal() {
  if (!G) return;
  const g = $('goal');
  if (G.phase === 'build') {
    g.innerHTML = `<span class="gl">HOUSE</span><span class="gi">${Array.from({length: G.info.build}, (_, i) => `<i class="b${i < G.built ? ' on' : ''}"></i>`).join('')}</span><span class="gn">${G.built}/${G.info.build}</span>`;
  } else if (G.phase === 'sell' || G.phase === 'done') {
    g.innerHTML = `<span class="gl">HOUSE</span><span class="gn">READY!</span>`;
  } else {
    g.innerHTML = `<span class="gl">LOGS</span><span class="gi">${Array.from({length: G.info.trees}, (_, i) => `<i class="${i < G.logs ? 'on' : ''}"></i>`).join('')}</span><span class="gn">${G.logs}/${G.info.trees}</span>`;
  }
}

// ---------- one house: chop the trees, carry the logs, build, sell
let G = null;
async function playHouse() {
  cancelFlow(); const me = flow;
  const lv = save.level, info = levelInfo(lv);
  G = {lv, info, phase: 'chop', tree: 0, logs: 0, built: 0, mistakes: 0, wrong: [], asked: 0, right: 0, skipTo: null};
  paused = false; mode = 'play';
  $('lobby').hidden = true; $('end').hidden = true; $('hud').hidden = false; closeSheets();
  coinShown = save.coins; renderCoins(); renderGoal();
  setupForest(info.trees); measureArea(); snapView(forest);
  site.house.k = info.house;
  await fade(false);
  burst(forest, "LET'S CHOP!", forest.fox.x + 120, GROUND - FOX_H - 120, 'hi');
  await sleep(.55); if (me !== flow) return;
  // the trees
  for (let i = 0; i < info.trees && !G.skipTo; i++) {
    G.tree = i; G.phase = 'chop';
    if (i > 0) { hideCard(); forest.fox.frame = 'idle'; await walk(forest, forest.fox, chopX(i), 430); if (me !== flow) return; }
    while (forest.trees[i].hits < 3 && !G.skipTo) {
      const r = await ask(); if (me !== flow) return; if (G.skipTo) break;
      if (r.ok) await chopRight(i); else await chopWrong(i);
      if (me !== flow) return;
    }
    if (G.skipTo) break;
    G.phase = 'fell'; hideCard();
    await fell(i); if (me !== flow) return;
  }
  if (G.skipTo) {   // (test hook) every tree is down at once
    forest.trees.forEach((t) => Object.assign(t, {hits: 3, fall: 0, stump: true, gone: true, log: 1}));
    G.logs = info.trees; G.tree = info.trees - 1; renderGoal();
  }
  // the logs go to the building plot
  G.phase = 'travel'; hideCard();
  await travel(); if (me !== flow) return;
  // building
  G.phase = 'build'; renderGoal();
  if (G.skipTo === 'build') G.skipTo = null;
  while (G.built < info.build && G.skipTo !== 'sell') {
    const r = await ask(); if (me !== flow) return; if (G.skipTo === 'sell') break;
    if (r.ok) await hammerRight(); else await hammerWrong();
    if (me !== flow) return;
  }
  if (G.skipTo === 'sell') { G.built = info.build; site.house.reveal = 1; renderGoal(); }
  G.phase = 'sell'; hideCard();
  await finishHouse(); if (me !== flow) return;
  await sellHouse(); if (me !== flow) return;
  G.phase = 'done';
  showEnd();
}
async function chopRight(i) {
  const fox = forest.fox, t = forest.trees[i];
  fox.frame = 'windup'; sfx.swish(); await sleep(.17);
  fox.frame = 'chop'; t.hits++; t.wobA = 1;
  sfx.chop(); shake(.38);
  const nx = t.x + notchDx(), ny = notchY();
  addParts(forest, 16, {x: nx, y: ny, sy: 20, vx: [-760, -120], vy: [-950, -250], cols: CHIP, size: [14, 26]});
  addParts(forest, 4, {x: nx, y: ny, vx: [-200, 200], vy: [-200, 0], g: 0, life: [.3, .5], cols: DUST, kind: 'dust', size: [30, 50]});
  addParts(forest, 12, {x: t.x, y: GROUND - TREE_H * .6, sx: 230, sy: TREE_H * .28, vx: [-70, 70], vy: [0, 140], g: 420, life: [1.1, 1.7], cols: SNOW, kind: 'leaf', size: [10, 20]});
  burst(forest, pick1(['CHOP!', 'CHOP!', 'THWACK!']), nx - 40, ny - 200, 'hi');
  const pips = $('qPips').children; if (pips[t.hits - 1]) pips[t.hits - 1].classList.add('on');
  sfx.right();
  await sleep(.5);
  fox.frame = 'idle'; await sleep(.12);
}
async function chopWrong(i) {
  const fox = forest.fox, t = forest.trees[i], x0 = fox.x;
  sfx.wrong();
  fox.frame = 'windup'; await sleep(.17);
  fox.frame = 'chop'; sfx.clang(); t.wobA = .5; shake(.22);
  const nx = t.x + notchDx(), ny = notchY();
  addParts(forest, 10, {x: nx, y: ny, vx: [-500, 100], vy: [-600, -100], g: 1200, life: [.2, .4], cols: SPARK, kind: 'spark', size: [10, 16]});
  burst(forest, 'BOING!', nx - 30, ny - 220, 'no');
  // the axe bounces off and Foxino tumbles back, dizzy
  fox.frame = 'dizzy'; fox.dizzy = 1.4; sfx.dizzy();
  await tween(.35, (p) => { fox.x = x0 - 60 * E.outQ(p); fox.hop = Math.sin(p * Math.PI) * 50; });
  fox.hop = 0;
  await waitTap(2.1);
  fox.dizzy = 0; fox.frame = 'idle';
  await tween(.25, (p) => { fox.x = lerp(x0 - 60, x0, p); });
}
async function fell(i) {
  const fox = forest.fox, t = forest.trees[i], T = SPR.tree;
  fox.frame = 'cheer'; sfx.creak(); sfx.right();
  burst(forest, 'TIMBER!', t.x + 140, GROUND - TREE_H * .8, 'hi big');
  t.stump = true;
  // a little shiver, then it falls faster and faster
  await tween(.35, (p) => { t.fall = .001 + .06 * Math.sin(p * Math.PI * .5); });
  sfx.whoosh();
  await tween(.75, (p) => { t.fall = .06 + (Math.PI / 2 - .06) * E.inQ(p); });
  sfx.crash(); shake(.75); flash(.25);
  const len = TREE_H - (-T.notch.y * T.k);
  addParts(forest, 22, {x: t.x + T.trunkWW / 2 + len * .5, y: GROUND - 10, sx: len * .5, vx: [-180, 180], vy: [-320, -60], g: 0, life: [.7, 1.2], cols: DUST, kind: 'dust', size: [40, 80]});
  addParts(forest, 26, {x: t.x + len * .85, y: GROUND - 120, sx: 220, sy: 80, vx: [-300, 300], vy: [-700, -200], g: 500, life: [1.2, 2.2], cols: LEAF, kind: 'leaf', size: [16, 22]});
  await tween(.22, (p) => { t.fall = Math.PI / 2 - .07 * Math.sin(p * Math.PI); });
  await sleep(.3);
  // the crown goes poof: a log is left lying by the stump
  addParts(forest, 30, {x: t.x + len * .75, y: GROUND - 160, sx: 260, sy: 120, vx: [-200, 200], vy: [-500, -100], g: 300, life: [1, 1.8], cols: LEAF, kind: 'leaf', size: [16, 24]});
  sfx.pop();
  t.gone = true; t.fall = 0;
  await tween(.25, (p) => { t.log = p; });
  G.logs++; renderGoal(); sfx.log();
  burst(forest, '+1 LOG', t.x + 400, GROUND - 260, 'ok');
  await sleep(.7);
  fox.frame = 'idle';
}
async function travel() {
  const fox = forest.fox, last = forest.trees[forest.trees.length - 1];
  // Foxino picks up the last log and walks off to the right, then the scene slides to the building plot
  forest.follow = false;
  fox.frame = 'idle';
  await walk(forest, fox, last.x + 300, 430);
  last.log = 0; fox.frame = 'carry'; sfx.log();
  await sleep(.25);
  const v = forest.v, rightEdge = (W - v.ox) / v.s;
  walk(forest, fox, rightEdge + 300, 430);
  await sleep(Math.max(.6, (rightEdge + 300 - fox.x) / 430 - .5));
  setupSite(G.info.house);
  site.fox.frame = 'carry';
  await tween(.85, (p) => { slide = p; }, E.inOut);
  slide = 0; cur = site; forest.fox.walking = false;
  // into the building plot: the logs drop onto the pile, the hammer comes out
  const sv = site.v; site.fox.x = (-sv.ox) / sv.s - 260;
  await walk(site, site.fox, pileX() + 150, 430);
  site.fox.frame = 'idle'; sfx.log(); shake(.2);
  addParts(site, 8, {x: pileX(), y: GROUND - 30, sx: 120, vx: [-120, 120], vy: [-120, -20], g: 0, life: [.5, .8], cols: DUST, kind: 'dust', size: [30, 50]});
  await tween(.4, (p) => { site.pile.s = E.outBack(p); });
  site.fox.frame = 'hamUp';
  await walk(site, site.fox, hammerX(), 400);
  site.fox.frame = 'hamUp';
  burst(site, 'BUILD TIME!', SITE_X, GROUND - 600, 'hi');
  await sleep(.5);
}
async function hammerRight() {
  const fox = site.fox, hs = SPR['house' + site.house.k], hh = hs.h * hs.k;
  fox.frame = 'hamUp'; await sleep(.12);
  fox.frame = 'hamDown'; sfx.hammer(); shake(.25); sfx.right();
  const tx = fox.x + SPR.fox.hamTip.x * SPR.fox.k, ty = GROUND + fox.dy + SPR.fox.hamTip.y * SPR.fox.k;
  addParts(site, 8, {x: tx, y: ty, vx: [-400, 400], vy: [-500, -50], g: 1000, life: [.25, .45], cols: SPARK, kind: 'spark', size: [10, 16]});
  G.built++; renderGoal();
  const pips = $('qPips').children; if (pips[G.built - 1]) pips[G.built - 1].classList.add('on');
  const r0 = site.house.reveal, r1 = G.built / G.info.build;
  sfx.rise();
  burst(site, pick1(['BANG!', 'NICE!', 'TAP TAP!', 'GREAT!']), SITE_X, GROUND + 22 - hh * r1 - 60, 'hi');
  await tween(.4, (p) => { site.house.reveal = lerp(r0, r1, E.outQ(p)); });
  const ly = GROUND + 22 - hh * r1;
  addParts(site, 10, {x: SITE_X, y: ly, sx: houseW() / 2, vx: [-160, 160], vy: [-140, -20], g: 0, life: [.5, .8], cols: DUST, kind: 'dust', size: [30, 50]});
  addParts(site, 10, {x: SITE_X, y: ly, sx: houseW() / 2, sy: 30, vx: [-80, 80], vy: [-260, -80], g: 200, life: [.4, .8], cols: SPARK, kind: 'spark', size: [10, 14]});
  await sleep(.25);
  fox.frame = 'hamUp';
}
async function hammerWrong() {
  const fox = site.fox;
  sfx.wrong();
  fox.frame = 'hamUp'; await sleep(.12);
  fox.frame = 'hamDown'; sfx.hammer(); await sleep(.08);
  // ...right on his thumb
  sfx.ouch(); shake(.3);
  const tx = fox.x + SPR.fox.hamTip.x * SPR.fox.k * .6, ty = GROUND + fox.dy - FOX_H * .45;
  addParts(site, 8, {x: tx, y: ty, vx: [-300, 300], vy: [-500, -150], g: 900, life: [.3, .5], cols: ['#ff4d6d', '#ffd23f', '#ffffff'], kind: 'spark', size: [10, 16]});
  burst(site, 'OUCH!', fox.x, GROUND - FOX_H - 160, 'no');
  fox.frame = 'dizzy'; fox.dizzy = 1.2;
  await tween(.5, (p) => { fox.hop = Math.abs(Math.sin(p * Math.PI * 2)) * 60 * (1 - p); });
  fox.hop = 0;
  await waitTap(1.9);
  fox.dizzy = 0; fox.frame = 'hamUp';
}
async function finishHouse() {
  const hs = SPR['house' + site.house.k], hh = hs.h * hs.k;
  site.house.reveal = 1; site.house.done = true;
  // the scaffolding comes down
  sfx.whoosh();
  await tween(.5, (p) => { site.scaff.dy = 900 * E.inQ(p); site.scaff.a = 1 - p; });
  site.scaff.a = 0;
  sfx.done(); sfx.pop(); flash(.35); shake(.2);
  addParts(site, 70, {x: SITE_X, y: GROUND - hh - 200, sx: houseW() * .7, sy: 120, vx: [-400, 400], vy: [-900, -300], g: 900, life: [2.2, 3.4], cols: CONF, kind: 'confetti', size: [14, 20]});
  burst(site, 'FINISHED!', SITE_X, GROUND - hh - 80, 'hi big');
  site.fox.frame = 'cheer'; site.fox.hop = 0;
  await tween(.5, (p) => { site.fox.hop = Math.abs(Math.sin(p * Math.PI * 2)) * 70 * (1 - p * .5); });
  site.fox.hop = 0;
  await sleep(.5);
}
async function sellHouse() {
  const info = G.info, b = site.buyer;
  siteCam(true);
  b.on = true; b.x = (W - site.v.ox) / site.v.s + 260; b.walking = true;
  const bx = buyerX();
  await tween(Math.abs(b.x - bx) / 360, ((x0) => (p) => { b.x = lerp(x0, bx, p); })(b.x));
  b.walking = false;
  say(`Merry Christmas! What a cosy house! I'll buy it for <b><i class="gc"></i>${info.price}</b>`, site, bx, GROUND + 40 - BUYER_H - 30);
  sfx.click();
  await sleep(1.9);
  unsay();
  const sp = toScreen(site, (SITE_X + bx) / 2, GROUND - 380);
  const st = stamp('SOLD!', clamp(sp.x, 120, W - 120), clamp(sp.y, 120, H - 120));
  sfx.sold(); shake(.3);
  addParts(site, 50, {x: SITE_X, y: GROUND - 900, sx: 500, sy: 60, vx: [-300, 300], vy: [-300, 100], g: 700, life: [2.5, 3.5], cols: CONF, kind: 'confetti', size: [14, 20]});
  site.fox.frame = 'cheer';
  // the money: base price, plus a bonus for few mistakes; saved straight away
  const bonus = bonusFor(info.price, G.mistakes), total = info.price + bonus;
  G.result = {price: info.price, bonus, total, mistakes: G.mistakes, stars: starsFor(G.mistakes), lv: G.lv, house: info.house};
  save.coins += total; save.level = G.lv + 1; save.sold.push({lv: G.lv, house: info.house, coins: total, at: Date.now()}); persist();
  await sleep(.6);
  const bag = toScreen(site, bx + 60, GROUND - 120);
  await flyCoins(Math.min(14, Math.round(info.price / 10)), info.price, bag.x, bag.y);
  st.remove();
  if (bonus) {
    say(`Very few mistakes? Here's a bonus: <b>+<i class="gc"></i>${bonus}</b>`, site, bx, GROUND + 40 - BUYER_H - 30);
    await sleep(1.2);
    await flyCoins(Math.min(8, Math.max(3, Math.round(bonus / 10))), bonus, bag.x, bag.y);
    await sleep(.5); unsay();
  }
  coinShown = save.coins; renderCoins();
  await sleep(.6);
}

// ---------- the end screen: coins, mistakes, stars, the words to practise
function thumb(spr, maxW, maxH) {
  const sc = Math.max(1, Math.min(maxW / spr.w, maxH / spr.h)), c = canvas(Math.round(spr.w * sc), Math.round(spr.h * sc)), x = c.getContext('2d');
  x.imageSmoothingEnabled = false; x.drawImage(spr.img, 0, 0, spr.w, spr.h, 0, 0, c.width, c.height);
  c.style.width = Math.round(Math.min(maxW, spr.w * maxH / spr.h)) + 'px';
  return c;
}
function showEnd() {
  const r = G.result; mode = 'end';
  $('endTitle').textContent = r.mistakes === 0 ? 'PERFECT SALE!' : 'HOUSE SOLD!';
  const old = $('endHouse'), th = thumb(SPR['house' + r.house], 130, 110); th.id = 'endHouse'; old.replaceWith(th);
  $('endStars').innerHTML = [0, 1, 2].map((i) => `<span class="${i < r.stars ? 'on' : ''}">&#9733;</span>`).join('');
  const nx = levelInfo(save.level);
  $('endRows').innerHTML = `<div><span>House price</span><b><i class="gc"></i>${r.price}</b></div>`
    + `<div><span>Bonus for few mistakes</span><b>${r.bonus ? `+<i class="gc"></i>${r.bonus}` : '–'}</b></div>`
    + `<div><span>Mistakes</span><b>${r.mistakes}</b></div>`
    + `<div class="tot"><span>Your coins</span><b><i class="gc"></i>${save.coins}</b></div>`
    + `<div class="tot"><span>Town level</span><b>${save.level - 1} &#9654; ${save.level}</b></div>`;
  $('endReview').innerHTML = G.wrong.length
    ? `<h4>WORDS TO PRACTISE</h4><ol>${G.wrong.map((q) => `<li>${hints(q.before)}<span class="r">${esc(q.right)}</span> <span class="w">${esc(q.pick)}</span>${hints(q.after)}</li>`).join('')}</ol>`
    : '<div class="perfect">NO MISTAKES!<br>EVERY ANSWER WAS RIGHT.</div>';
  $('nextBtn').innerHTML = `BUILD NEXT HOUSE &#9654;`;
  $('nextBtn').title = `Level ${nx.lv}: ${nx.trees} trees, ${nx.price} coins`;
  $('end').hidden = false; $('hud').hidden = false;
}
$('nextBtn').onclick = async () => { sfx.click(); await fade(true); $('end').hidden = true; playHouse(); };
$('toLobbyBtn').onclick = async () => { sfx.click(); await fade(true); toLobby(); await fade(false); };
function fade(on) { $('fade').classList.toggle('on', on); return new Promise((r) => setTimeout(r, on ? 320 : 10)); }

// ---------- the lobby
const LVC = {A0: '#5ee08a', A1: '#4fb4ff', A2: '#b57bff'};
function toLobby() {
  cancelFlow(); G = null; mode = 'lobby'; paused = false; unsay(); flyers.forEach((f) => f.el.remove()); flyers = [];
  $('fx').querySelectorAll('.burst,.stamp').forEach((e) => e.remove());
  $('lobby').hidden = false; $('hud').hidden = true; $('end').hidden = true; hideCard(); closeSheets();
  setupForest(1);
  renderLobby(); measureArea(); snapView(forest);
}
function renderLobby() {
  const info = levelInfo(save.level), name = save.name || 'Foxino';
  $('pfBtn').innerHTML = `<span class="av"><img src="${faceURL}" alt=""></span><span class="nm"><b>${esc(name)}</b><span><em>TOWN LV ${save.level}</em><i class="gc"></i><span class="cn">${save.coins}</span></span></span><span class="ed">&#9998;</span>`;
  const sum = window.FugioPacks ? FugioPacks.summary(PACKS, save.packs) : {title: 'Questions', sub: '', level: '–'};
  $('qcard').innerHTML = `<span class="lv" style="--c:${LVC[sum.level] || '#ffb357'}">${esc(sum.level)}</span>
    <span class="t"><span class="lab">QUESTIONS</span><b>${esc(sum.title)}</b><small>${esc(sum.sub)}</small></span><span class="go">CHANGE &#9654;</span>`;
  $('playBtn').innerHTML = `BUILD A HOUSE &#9654;<small>LEVEL ${info.lv} · ${info.trees} TREES · <i class="gc"></i>${info.price}</small>`;
  renderMute();
}
const closeSheets = () => document.querySelectorAll('.sheet.open').forEach((s) => s.classList.remove('open'));
function openProfile() {
  $('pfAv').innerHTML = `<img src="${faceURL}" alt="">`; $('nameIn').value = save.name;
  $('pfStats').innerHTML = `<div><b>${save.level}</b><small>TOWN LEVEL</small></div><div><b><i class="gc"></i>${save.coins}</b><small>COINS</small></div><div><b>${save.sold.length}</b><small>HOUSES SOLD</small></div>`;
  $('pfSheet').classList.add('open');
}
function openTown() {
  const row = $('townRow'); row.innerHTML = '';
  if (!save.sold.length) row.innerHTML = '<div class="none">NO HOUSES YET.<br>BUILD YOUR FIRST ONE!</div>';
  save.sold.forEach((h, i) => {
    const d = document.createElement('div'); d.className = 'h';
    const k = clamp(h.house || h.lv || 1, 1, 3), c = thumb(SPR['house' + k], 70 + k * 12, 56 + k * 14);
    d.appendChild(c); d.insertAdjacentHTML('beforeend', `<span>#${i + 1} · ${h.coins}</span>`); row.appendChild(d);
  });
  const earned = save.sold.reduce((s, h) => s + (h.coins || 0), 0);
  $('townStats').innerHTML = `<div><b>${save.sold.length}</b><small>HOUSES</small></div><div><b><i class="gc"></i>${earned}</b><small>EARNED</small></div><div><b>${save.level}</b><small>TOWN LEVEL</small></div>`;
  $('townSheet').classList.add('open');
  requestAnimationFrame(() => { row.scrollLeft = row.scrollWidth; });
}
$('pfBtn').onclick = () => { sfx.click(); openProfile(); };
$('townBtn').onclick = () => { sfx.click(); openTown(); };
$('sndBtn').onclick = toggleMute; $('muteBtn').onclick = toggleMute; $('pSndBtn').onclick = toggleMute;
$('nameIn').addEventListener('input', () => { save.name = $('nameIn').value.trim().slice(0, 14); persist(); });
document.querySelectorAll('#lobby .sheet').forEach((s) => s.addEventListener('click', (e) => { if (e.target === s || e.target.closest('[data-close]')) { sfx.click(); closeSheets(); renderLobby(); } }));
$('qcard').onclick = async () => {
  if (!window.FugioPacks) return; sfx.click();
  const ids = await FugioPacks.open(PACKS, save.packs, {theme: 'pixel', kicker: 'PICK YOUR QUESTIONS'});
  if (ids && ids.length) { save.packs = ids; persist(); usedQ.clear(); renderLobby(); }
};
$('playBtn').onclick = () => { sfx.click(); playHouse(); };
// LEAVE: back to the Fugio library (it closes the player), or to fugio.co when the game is open on its own
$('leaveBtn').onclick = () => { sfx.click(); if (window.parent !== window) window.parent.postMessage({fugio: 'leave'}, '*'); else location.href = '/'; };
// the pause menu
function pause(on) {
  if (mode !== 'play') return;
  paused = on; $('pauseSheet').classList.toggle('open', on); renderMute();
}
$('menuBtn').onclick = () => { sfx.click(); pause(true); };
$('resumeBtn').onclick = () => { sfx.click(); pause(false); };
$('pauseSheet').addEventListener('click', (e) => { if (e.target === $('pauseSheet')) pause(false); });
$('quitBtn').onclick = async () => { sfx.click(); pause(false); await fade(true); toLobby(); await fade(false); };
addEventListener('keydown', (e) => {
  if (e.target && e.target.tagName === 'INPUT') { if (e.key === 'Enter' || e.key === 'Escape') { closeSheets(); renderLobby(); } return; }
  if (e.key === 'Escape') { if (document.querySelector('.sheet.open')) { if (paused) pause(false); else { closeSheets(); renderLobby(); } } else if (mode === 'play') pause(true); return; }
  if (paused) return;
  if (mode === 'play' && asking && /^[1-4]$/.test(e.key)) { const i = +e.key - 1; if (asking.q[i]) answer(i); }
  else if ((e.key === ' ' || e.key === 'Enter') && tapWait) { e.preventDefault(); goOn(); }
});
document.addEventListener('visibilitychange', () => { if (document.hidden && mode === 'play' && !paused) pause(true); });
addEventListener('resize', relayout);
addEventListener('orientationchange', () => setTimeout(relayout, 200));

// ---------- test hooks (Foxino/Timber Town/tests)
window.TT = {
  state: () => ({
    mode, scene: slide > 0 && slide < 1 ? 'slide' : cur.key, phase: G && G.phase, paused, level: save.level, coins: save.coins, sold: save.sold.length,
    tree: G && G.tree, trees: G && G.info.trees, hits: G && forest.trees[G.tree] ? forest.trees[G.tree].hits : null, logs: G && G.logs,
    built: G && G.built, buildN: G && G.info.build, mistakes: G && G.mistakes, asking: !!asking, waiting: !!tapWait,
    question: asking ? {text: asking.q.before + '___' + asking.q.after, right: asking.q.right, choices: asking.q.map((c) => c.text)} : null,
    result: G && G.result || null, art: artUsed.slice(),
  }),
  answer(right = true) { if (!asking) return false; const i = asking.q.findIndex((c) => c.ok === right); if (i < 0) return false; $('qAns').children[i].click(); return true; },
  goOn() { goOn(); },
  skipToBuild() { if (!G || G.phase !== 'chop') return false; G.skipTo = 'build'; if (asking) { const a = asking; asking = null; a.res({skip: true}); } return true; },
  skipToSell() { if (!G || !['chop', 'build'].includes(G.phase)) return false; G.skipTo = 'sell'; if (asking) { const a = asking; asking = null; a.res({skip: true}); } return true; },
  speed(x) { timeScale = x; },
  play() { if (mode === 'lobby') $('playBtn').click(); },
  reset() { try { localStorage.removeItem('timber.save'); } catch {} Object.assign(save, {name: '', coins: 0, level: 1, sold: []}); persist(); coinShown = 0; toLobby(); },
  view: () => ({area, side, forest: forest.v, site: site.v}),
  ready: false,
};

// ---------- start
(async () => {
  await loadArt();
  relayout(); toLobby(); renderCoins();
  $('loading').hidden = true;
  window.TT.ready = true;
  requestAnimationFrame((t) => { last = t; frame(t); });
  // the Google fonts change the card and dock sizes once they arrive
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { measureArea(); snapView(forest); snapView(site); fitQuestion(); });
})();
})();
