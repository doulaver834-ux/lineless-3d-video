// Authentic Style 2 Lineless Character & Horse-Rider Rig packaged as a pure offscreen ES module.
// Preserves 100% of the rounded capsule head, soft warm-cream eyes, sculpted cuff+thumb hands,
// tailored two-tone historical kits, 24 props, word-gated lip sync, and full-back OTS figures.

let g = null;
let _CUR_T = 0;
let _T = 0;
let DEAD = 0;
let TINT = null;
const _cc = new Map();

const INK = '#2a2230';
const GOLD = '#c9a23f';
const GOLD_SH = '#a38024';
const CREAM = '#faf5e8';
const SOCK = '#f1e6d2';
const HIP = 176;

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const prog = (t, a, b) => clamp((t - a) / Math.max(1e-6, b - a));
const eio = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const back = (x) => 1 + 2.5 * Math.pow(x - 1, 3) + 1.5 * Math.pow(x - 1, 2);

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let r = Math.imul(s ^ (s >>> 15), 1 | s);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
function mix(a, b, t) {
  const A = hex(a),
    B = hex(b);
  return (
    '#' +
    A.map((v, i) =>
      Math.round(clamp(lerp(v, B[i], t), 0, 255))
        .toString(16)
        .padStart(2, '0')
    ).join('')
  );
}
function grey(c, k) {
  const [r, gg, b] = hex(c),
    l = Math.round(0.3 * r + 0.59 * gg + 0.11 * b);
  const lg =
    '#' +
    [l, l, l]
      .map((v) =>
        Math.round(lerp(v, 196, 0.35))
          .toString(16)
          .padStart(2, '0')
      )
      .join('');
  return mix(c, lg, k);
}

function C(c) {
  if (Array.isArray(c)) c = c[0];
  if (!c || typeof c !== 'string' || c[0] !== '#') return c || '#888888';
  const q = Math.round(DEAD * 20);
  if (!q && !TINT) return c;
  const k = c + q + (TINT ? TINT[0] + TINT[1] : '');
  let v = _cc.get(k);
  if (!v) {
    v = TINT ? mix(c, TINT[0], TINT[1]) : c;
    if (q) v = grey(v, q / 20);
    _cc.set(k, v);
  }
  return v;
}

// ---- Shapes -------------------------------------------------------------
function curve(pts, closed = true, k = 0.5) {
  const n = pts.length,
    P = (i) => pts[closed ? (i + n) % n : clamp(i, 0, n - 1)];
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const p0 = P(i - 1),
      p1 = P(i),
      p2 = P(i + 1),
      p3 = P(i + 2);
    g.bezierCurveTo(
      p1[0] + ((p2[0] - p0[0]) * k) / 3,
      p1[1] + ((p2[1] - p0[1]) * k) / 3,
      p2[0] - ((p3[0] - p1[0]) * k) / 3,
      p2[1] - ((p3[1] - p1[1]) * k) / 3,
      p2[0],
      p2[1]
    );
  }
  if (closed) g.closePath();
}
function blob(pts, fill, k) {
  g.beginPath();
  curve(pts, true, k);
  g.fillStyle = fill;
  g.fill();
}
function poly(pts, fill) {
  g.beginPath();
  pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
  g.closePath();
  g.fillStyle = fill;
  g.fill();
}
function ell(x, y, rx, ry, fill, rot = 0) {
  g.beginPath();
  g.ellipse(x, y, Math.max(0, rx), Math.max(0, ry), rot, 0, Math.PI * 2);
  g.fillStyle = fill;
  g.fill();
}
function rr(x, y, w, h, r, fill) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
  g.fillStyle = fill;
  g.fill();
}
function limb(x1, y1, x2, y2, w1, w2, fill) {
  const a = Math.atan2(y2 - y1, x2 - x1),
    s = Math.sin(a),
    c = Math.cos(a);
  g.beginPath();
  g.moveTo(x1 + s * w1, y1 - c * w1);
  g.lineTo(x2 + s * w2, y2 - c * w2);
  g.arc(x2, y2, Math.max(0.1, w2), a - Math.PI / 2, a + Math.PI / 2);
  g.lineTo(x1 - s * w1, y1 + c * w1);
  g.arc(x1, y1, Math.max(0.1, w1), a + Math.PI / 2, a + Math.PI * 1.5);
  g.closePath();
  g.fillStyle = fill;
  g.fill();
}
function form(pathFn, base, shade) {
  g.save();
  g.beginPath();
  pathFn();
  g.fillStyle = base;
  g.fill();
  if (shade) {
    g.clip();
    shade();
  }
  g.restore();
}
function at(x, y, s, fn, rot = 0, flip = false) {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.scale(flip ? -s : s, s);
  fn();
  g.restore();
}

// ---- Word-exact lip-sync gate -------------------------------------------
let _WORDS = [];
// Brand accent used by lanyards/badges (kit.badge), 'day1_badge', 'pc_box' and 'protest_sign'.
let ACCENT = '#3f8fd0';
let ACCENT_SH = '#2c6ea6';
export function setStyle2Accent(base, shade) {
  ACCENT = base;
  ACCENT_SH = shade || grey(base, 0.72);
}

export function setStyle2Words(arr) {
  _WORDS = Array.isArray(arr) ? arr : [];
}
export function speechOpen(t = _CUR_T) {
  const n = _WORDS.length;
  if (!n) return 1;
  let lo = 0,
    hi = n - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const w = _WORDS[mid];
    if (t < w[0] - 0.02) hi = mid - 1;
    else if (t > w[1] + 0.03) lo = mid + 1;
    else {
      const u = clamp((t - w[0]) / Math.max(0.08, w[1] - w[0]));
      const env =
        Math.sin(clamp(u * 6, 0, 1) * Math.PI * 0.5) *
        Math.sin(clamp((1 - u) * 5, 0, 1) * Math.PI * 0.5);
      const pulse = 0.38 + 0.62 * Math.abs(Math.sin(u * Math.PI * (w[2] || 1)));
      return clamp(env * pulse * 0.88, 0, 0.85);
    }
  }
  return 0;
}

// ---- Costumes, Horse Coats & IK -----------------------------------------
export const COAT = {
  chestnut: {b: '#b9592c', s: '#8e3f22', m: '#4f2618', h: '#33201c'},
  sorrel: {b: '#b9592c', s: '#8e3f22', m: '#4f2618', h: '#33201c'},
  bay: {b: '#6b3f2c', s: '#4c2b21', m: '#241718', h: '#1c1416'},
  brown: {b: '#6b3f2c', s: '#4c2b21', m: '#241718', h: '#1c1416'},
  buck: {b: '#cfa160', s: '#a67a44', m: '#4a3324', h: '#33241c'},
  dun: {b: '#cfa160', s: '#a67a44', m: '#4a3324', h: '#33241c'},
  grey: {b: '#8d8a92', s: '#6a6772', m: '#3d3a45', h: '#2a2830'},
  black: {b: '#3d3942', s: '#2b2830', m: '#1c1920', h: '#141218'},
};

export const KIT = {
  frontier_buckskin: {
    trim: 'fringe', coat: '#d9b377', coatSh: '#b48a52', shirt: '#23395d',
    pants: '#5878a0', pantsSh: '#3f5a7d', hat: '#ead9b0', hatSh: '#c9b384', band: '#6e4e32',
    skin: '#f0b98f', skinSh: '#d4946c', hair: '#e2a93b', hairSh: '#b57b1e',
    scarf: '#d8352a', scarfSh: '#a62219', boot: '#2e2328', bootSh: '#1e161a',
    curls: true, stache: true,
  },
  officer_dress: {
    trim: 'buttons', coat: '#243b63', coatSh: '#172744', shirt: '#f5efe4',
    pants: '#4c6d96', pantsSh: '#375275', hat: '#ead9b0', hatSh: '#c9b384', band: '#c9a23f',
    skin: '#f0b98f', skinSh: '#d4946c', hair: '#4a3324', hairSh: '#332116',
    scarf: '#c9a23f', boot: '#241d22', bootSh: '#161115',
  },
  trooper: {
    trim: 'buttons', coat: '#34507e', coatSh: '#243a60', shirt: '#e6dfd3',
    pants: '#6f8fb5', pantsSh: '#516f94', hat: '#2b2a35', hatSh: '#1d1c26', band: '#c9a23f',
    skin: '#e8ad84', skinSh: '#c98a64', hair: '#4a3324', hairSh: '#332116',
    scarf: '#c9a23f', boot: '#231c22', bootSh: '#161116',
  },
  scout: {
    trim: 'fringe', coat: '#9e7449', coatSh: '#7a5632', shirt: '#3a4a5e',
    pants: '#54463c', pantsSh: '#3d322a', hat: '#4f3b2b', hatSh: '#38281c', band: '#8c6239',
    skin: '#d4956a', skinSh: '#b3744c', hair: '#2a2024', hairSh: '#1a1417',
    scarf: '#b87638', boot: '#3b2b20', bootSh: '#291d15',
  },
  civilian_suit: {
    trim: 'suit', coat: '#8a6b52', coatSh: '#6a4f3c', shirt: '#f2ece0', tie: '#3b302a',
    pants: '#4a4652', pantsSh: '#35323b', hat: '#5a4636', hatSh: '#40301f', band: '#2e2328',
    skin: '#f0b98f', skinSh: '#d4946c', hair: '#4a3324', hairSh: '#332116',
    boot: '#2e2328', bootSh: '#1e161a',
  },
  clerk: {
    trim: 'suit', coat: '#4e544b', coatSh: '#383d36', shirt: '#f5efe4', tie: '#2c3038',
    pants: '#3c3942', pantsSh: '#2a282e', hat: 'none', band: '#2e2328',
    skin: '#f0b98f', skinSh: '#d4946c', hair: '#9c9690', hairSh: '#75706b',
    boot: '#262024', bootSh: '#171316',
  },
  senator: {
    trim: 'suit', coat: '#3d3942', coatSh: '#29262e', shirt: '#f5f1e8', tie: '#4a3c52',
    pants: '#45414a', pantsSh: '#312e36', hat: 'none', band: '#2e2328',
    skin: '#f0b98f', skinSh: '#d4946c', hair: '#aeb3bd', hairSh: '#848a96',
    boot: '#221e24', bootSh: '#161318',
  },
  senator_warm: {
    trim: 'suit', coat: '#524038', coatSh: '#3b2c26', shirt: '#f5f1e8', tie: '#6e342d',
    pants: '#443a38', pantsSh: '#302827', hat: 'none', band: '#2e2328',
    skin: '#e8ad84', skinSh: '#c98a64', hair: '#6e5849', hairSh: '#4f3e33',
    boot: '#221e24', bootSh: '#161318',
  },
  officer: {
    trim: 'buttons', coat: '#283d63', coatSh: '#1b2b48', shirt: '#f2ece0',
    pants: '#4d688f', pantsSh: '#374d6e', hat: '#23222c', hatSh: '#16151d', band: '#c9a23f',
    skin: '#e8ad84', skinSh: '#c98a64', hair: '#9e9892', hairSh: '#78736e',
    scarf: '#c9a23f', boot: '#211b20', bootSh: '#141014',
  },
  statesman_dark: {
    trim: 'suit', coat: '#262a36', coatSh: '#181b24', shirt: '#f7f4ec', tie: '#181a22',
    pants: '#323746', pantsSh: '#222632', hat: 'none', band: '#c9a23f',
    skin: '#e8ad84', skinSh: '#c98a64', hair: '#5c4230', hairSh: '#3f2c1f',
    boot: '#1c181c', bootSh: '#110e11',
    beard: true,
  },
  general_coat: {
    trim: 'buttons', coat: '#243a5e', coatSh: '#172742', shirt: '#f4efe4',
    pants: '#4a668c', pantsSh: '#354c6b', hat: '#262530', hatSh: '#181720', band: '#c9a23f',
    skin: '#f0b98f', skinSh: '#d4946c', hair: '#9aa0ab', hairSh: '#737985',
    scarf: '#c9a23f', boot: '#211b20', bootSh: '#141014',
    beard: true,
  },
  merchant_vest: {
    trim: 'suit', coat: '#7896ab', coatSh: '#5a768a', shirt: '#f5efe4', tie: '#495c73',
    pants: '#495c73', pantsSh: '#354457', hat: '#dfd0ab', hatSh: '#bfb088', band: '#5c4934',
    skin: '#e8ad84', skinSh: '#c98a64', hair: '#4a3324', hairSh: '#332116',
    boot: '#4a3828', bootSh: '#33261a',
  },
  explorer_coat: {
    trim: 'buttons', coat: '#2b4470', coatSh: '#1c2f52', shirt: '#f0eae0',
    pants: '#5878a0', pantsSh: '#3f5a7d', hat: '#4a3a2c', hatSh: '#33271d', band: '#c9a23f',
    skin: '#f0b98f', skinSh: '#d4946c', hair: '#aeb3bd', hairSh: '#848a96',
    scarf: '#3f5a7d', boot: '#221c21', bootSh: '#151115',
  },
  // ---- Modern Office / Tech Campus Cast Kits ------------------------------
  exec_founder: {
    trim: 'zip_jacket', coat: '#202b42', coatSh: '#141c2e', shirt: '#1a1d24',
    pants: '#191b22', pantsSh: '#111318', hat: 'none',
    skin: '#eeb892', skinSh: '#d1956e', hair: '#e6eaef', hairSh: '#b8c0cd',
    boot: '#1e2028', bootSh: '#13151b',
    hairStyle: 'swept_silver', glasses: true, halfRim: true, whiteSole: true, silverBuckle: true, modernBelt: true,
  },
  modern_fleece: {
    trim: 'zip_jacket', coat: '#2d323c', coatSh: '#1e222a', shirt: '#f2f0ea',
    pants: '#45648a', pantsSh: '#314968', hat: 'none',
    skin: '#e2a67d', skinSh: '#c2855e', hair: '#262126', hairSh: '#181418',
    boot: '#f0eee8', bootSh: '#cfc9be',
    badge: true, modernBelt: true,
  },
  modern_vest: {
    trim: 'vest', coat: '#2c3038', coatSh: '#1d2026', sleeve: '#f4f2ec', shirt: '#f4f2ec',
    pants: '#4a505c', pantsSh: '#353a44', hat: 'none',
    skin: '#f0be98', skinSh: '#d29b75', hair: '#2a2428', hairSh: '#191518',
    boot: '#3c4048', bootSh: '#282b32',
    glasses: true, badge: true, whiteSole: true, modernBelt: true,
  },
  modern_red_hoodie: {
    trim: 'hoodie', coat: '#a62c32', coatSh: '#7d1e24', shirt: '#23262e',
    pants: '#4c6b91', pantsSh: '#364f6e', hat: 'none',
    skin: '#dfa37a', skinSh: '#be825b', hair: '#241f24', hairSh: '#161316',
    boot: '#e8e5dc', bootSh: '#c8c3b6',
    glasses: true, badge: true, modernBelt: true,
  },
  modern_tee: {
    trim: 'tee', coat: '#282c34', coatSh: '#1b1e24', shirt: '#282c34',
    pants: '#7c7d63', pantsSh: '#5d5e48', hat: 'none',
    skin: '#cf926b', skinSh: '#ad724d', hair: '#221d22', hairSh: '#141114',
    boot: '#24262c', bootSh: '#17181d',
    glasses: true, badge: true, modernBelt: true,
  },
  modern_woman_jacket: {
    trim: 'zip_jacket', coat: '#252932', coatSh: '#181b22', shirt: '#3a404d',
    pants: '#1e2128', pantsSh: '#14161b', hat: 'none',
    skin: '#f2c29e', skinSh: '#d49f7a', hair: '#6b4730', hairSh: '#4d311f',
    boot: '#202228', bootSh: '#14151a',
    hairStyle: 'long', badge: true, modernBelt: true,
  },
  modern_hoodie: {
    trim: 'hoodie', coat: '#465264', coatSh: '#313a48', shirt: '#e8e6de',
    pants: '#2c303a', pantsSh: '#1e2128', hat: 'none',
    skin: '#ebb48d', skinSh: '#cc936c', hair: '#3d2b20', hairSh: '#291c14',
    boot: '#ece9e0', bootSh: '#cac5b8',
    badge: true, modernBelt: true,
  },
  modern_navy_jacket: {
    trim: 'zip_jacket', coat: '#324668', coatSh: '#22314b', shirt: '#22252d',
    pants: '#7a756c', pantsSh: '#5c5850', hat: 'none',
    skin: '#f0be98', skinSh: '#d19b74', hair: '#2b2428', hairSh: '#1a1518',
    boot: '#2a2d34', bootSh: '#1b1d22',
    glasses: true, badge: true, whiteSole: true, modernBelt: true,
  },
  modern_it_vest: {
    trim: 'vest', coat: '#253329', coatSh: '#18221b', sleeve: '#eef2ec', shirt: '#eef2ec',
    pants: '#363b45', pantsSh: '#252930', hat: 'none',
    skin: '#eeb892', skinSh: '#cf956e', hair: '#3a291f', hairSh: '#261a13',
    boot: '#262930', bootSh: '#181a1f',
    glasses: true, badge: true, whiteSole: true, modernBelt: true,
  },
  modern_tee_woman: {
    trim: 'tee', coat: '#23262e', coatSh: '#16181e', shirt: '#23262e',
    pants: '#1c1e25', pantsSh: '#121419', hat: 'none',
    skin: '#f5c7a4', skinSh: '#d7a27d', hair: '#d2ad6d', hairSh: '#aa8548',
    boot: '#22252c', bootSh: '#15171c',
    modernBelt: true,
  },
  // ---- Executive Boardroom Cast Kits --------------------------------------
  board_chair: {
    trim: 'suit', coat: '#242834', coatSh: '#171a22', shirt: '#f6f3eb', tie: '#8c2828',
    pants: '#202430', pantsSh: '#151820', hat: 'none',
    skin: '#f0b98f', skinSh: '#d4946c', hair: '#b8bec9', hairSh: '#8d94a2',
    boot: '#181a20', bootSh: '#101216',
    glasses: true, modernBelt: true,
  },
  board_suit: {
    trim: 'suit', coat: '#363b48', coatSh: '#252933', shirt: '#f4f1e8', tie: '#2c486e',
    pants: '#2e323d', pantsSh: '#1f222a', hat: 'none',
    skin: '#e6a982', skinSh: '#c58762', hair: '#4a382b', hairSh: '#33251c',
    boot: '#1c1e24', bootSh: '#121318',
    modernBelt: true,
  },
  board_woman: {
    trim: 'suit', coat: '#4a3540', coatSh: '#33232c', shirt: '#f7f3eb', tie: '#4a3540',
    pants: '#2b2832', pantsSh: '#1d1b22', hat: 'none',
    skin: '#f2c29e', skinSh: '#d49f7a', hair: '#2c2226', hairSh: '#1a1417',
    boot: '#1e1c24', bootSh: '#131118',
    hairStyle: 'long', modernBelt: true,
  },
};

export const EX = {
  smug: {eyes: 'open', lid: 0.3, brow: 0.65, mouth: 'grin', tilt: -0.07},
  cocky: {eyes: 'open', lid: 0.26, brow: 0.75, mouth: 'smirk', tilt: -0.09},
  charge: {eyes: 'wide', brow: -0.85, mouth: 'shout', lean: 0.14, tilt: -0.05},
  panic: {eyes: 'pin', brow: 0.9, mouth: 'jaw', sweat: 1, shiver: 0.5, lean: -0.1, tilt: 0.07},
  shock: {eyes: 'pin', brow: 0.85, mouth: 'shout', shockLines: 1, sweat: 0.7, lean: -0.09},
  grit: {eyes: 'squint', brow: -0.85, mouth: 'grit', sweat: 0.5},
  furious: {eyes: 'squint', brow: -0.95, mouth: 'shout', steam: 1, shiver: 0.35, lean: 0.12},
  laugh: {eyes: 'laugh', brow: 0.55, mouth: 'grin', blush: 0.5, tilt: -0.08},
  eyeroll: {eyes: 'roll', lid: 0.36, brow: 0.45, mouth: 'frown', tilt: 0.05},
  dread: {eyes: 'pin', brow: 0.75, mouth: 'wobble', pale: 0.7, sweat: 1, shiver: 0.4},
  gloom: {eyes: 'open', lid: 0.54, brow: 0.65, mouth: 'frown', pale: 0.45, lean: 0.12, tilt: 0.1},
  solemn: {eyes: 'open', lid: 0.18, brow: -0.2, mouth: 'frown'},
  starry: {eyes: 'wide', brow: 0.65, mouth: 'grin', blush: 0.4, tilt: -0.08},
  beg: {eyes: 'teary', brow: 0.9, mouth: 'plead', sweat: 0.6, shiver: 0.35, tilt: -0.08},
  skeptic: {eyes: 'skeptical', brow: 0.55, mouth: 'frown', tilt: 0.05},
  innocent: {eyes: 'roll', brow: 0.7, mouth: 'whistle', blush: 0.6, tilt: -0.09},
  haughty: {eyes: 'shut', brow: 0.75, mouth: 'scoff', tilt: -0.14, stance: 'strut'},
  exhausted: {eyes: 'bags', lid: 0.46, brow: 0.5, mouth: 'wobble', sweat: 0.85},
};

function ik(sx, sy, hx, hy, l1, l2, dir = 1) {
  const dx = hx - sx,
    dy = hy - sy,
    d = clamp(Math.hypot(dx, dy), Math.abs(l1 - l2) + 1, l1 + l2 - 0.5);
  const a = Math.atan2(dy, dx),
    b = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
  return [
    sx + Math.cos(a + dir * b) * l1,
    sy + Math.sin(a + dir * b) * l1,
    sx + Math.cos(a) * d,
    sy + Math.sin(a) * d,
  ];
}

const _NUM_KEYS = [
  'lean', 'tilt', 'look', 'lookY', 'brow', 'lid', 'jump', 'sweat', 'pale', 'blush',
  'steam', 'shockLines', 'shiver', 'walk', 'nod', 'squash', 'rear', 'tired', 'emptyPockets', 'hatLift',
];

export function act(t, beats, defaultDur = 0.42) {
  _T = t;
  let cur = {...beats[0][1]},
    sq = 0;
  for (let i = 1; i < beats.length; i++) {
    const [t0, target, dOpt] = beats[i],
      dur = dOpt || defaultDur;
    if (t < t0) break;
    const raw = prog(t, t0, t0 + dur),
      p = back(raw);
    const next = {...cur, ...target};
    for (const k of _NUM_KEYS) {
      if (cur[k] != null || target[k] != null) next[k] = lerp(cur[k] || 0, target[k] ?? (cur[k] || 0), p);
    }
    for (const hk of ['hand', 'hand2']) {
      if (cur[hk] && target[hk]) {
        next[hk] = [lerp(cur[hk][0], target[hk][0], p), lerp(cur[hk][1], target[hk][1], p)];
      }
    }
    for (const sk of ['eyes', 'mouth', 'prop', 'prop2', 'handKind', 'hand2Kind', 'noReins', 'stance', 'view']) {
      if (target[sk] !== undefined) next[sk] = raw < 0.25 && cur[sk] !== undefined ? cur[sk] : target[sk];
    }
    if (raw > 0 && raw < 1) {
      const amp = target.amp ?? 0.2;
      sq += Math.sin(raw * Math.PI * 2) * amp * (1 - raw * 0.5);
    }
    cur = next;
  }
  const w1 = Math.sin(t * 3.2),
    w2 = Math.cos(t * 2.7);
  cur.squash = (cur.squash || 0) + sq + Math.sin(t * 3.0) * 0.018;
  cur.lean = (cur.lean || 0) + w1 * 0.018;
  cur.tilt = (cur.tilt || 0) + w2 * 0.02;
  if (cur.hand) cur.hand = [cur.hand[0] + w1 * 5, cur.hand[1] + w2 * 6];
  if (cur.hand2) cur.hand2 = [cur.hand2[0] - w2 * 4, cur.hand2[1] + w1 * 5];
  return cur;
}

function _blinkShape(d, close, hold, open) {
  if (d < 0 || d > close + hold + open) return 0;
  if (d < close) return eio(d / close);
  if (d < close + hold) return 1;
  return 1 - eio((d - close - hold) / open);
}
function blinkLid(t, seed = 0) {
  const P = 3.7,
    off = seed * 1.37,
    n = Math.floor((t + off) / P);
  let lid = 0;
  for (const m of [n - 1, n]) {
    const tb = m * P - off + rng(m * 131 + seed * 977 + 7)() * (P - 0.6);
    lid = Math.max(lid, _blinkShape(t - tb, 0.06, 0.04, 0.1));
  }
  return lid;
}

export function perform(t, beats, o = {}) {
  const sorted = [beats[0], ...beats.slice(1).sort((a, b) => a[0] - b[0])];
  const pose = act(t, sorted, o.dur);
  const life = 1 - clamp(o.still || 0);
  if (life < 1) {
    const w1 = Math.sin(t * 3.2),
      w2 = Math.cos(t * 2.7),
      k = 1 - life;
    pose.squash -= Math.sin(t * 3.0) * 0.018 * k;
    pose.lean -= w1 * 0.018 * k;
    pose.tilt -= w2 * 0.02 * k;
    if (pose.hand) pose.hand = [pose.hand[0] - w1 * 5 * k, pose.hand[1] - w2 * 6 * k];
    if (pose.hand2) pose.hand2 = [pose.hand2[0] + w2 * 4 * k, pose.hand2[1] - w1 * 5 * k];
  }
  const closedAlready = ['shut', 'laugh', 'happy'].includes(pose.eyes);
  if (!closedAlready) {
    let lid = o.blink === false ? 0 : blinkLid(t, o.seed || 0);
    for (const b of o.blinks || []) lid = Math.max(lid, _blinkShape(t - b, 0.06, 0.04, 0.1));
    for (const b of o.slow || []) lid = Math.max(lid, _blinkShape(t - b, 0.16, 0.22, 0.2));
    if (lid > (pose.lid || 0)) pose.lid = lid;
  }
  return pose;
}

export const V = {
  doubleTake: (t, o = {}) => [
    [t - 0.34, {look: -0.7 * (o.dir || 1), lid: 0.28, tilt: 0.03}, 0.16],
    [
      t,
      {
        eyes: 'pin', brow: 0.9, mouth: 'jaw', look: 0.9 * (o.dir || 1),
        lean: -0.13, tilt: -0.04, shockLines: 1, hatLift: 16, lid: 0, amp: 0.6,
      },
      0.13,
    ],
    [t + (o.hold ?? 0.8), {shockLines: 0, hatLift: 0, lean: -0.03, eyes: 'wide', mouth: 'open', amp: 0.15}, 0.4],
  ],
  slump: (t, o = {}) => [
    [t - 0.1, {squash: 0.07, lean: -0.03}, 0.1],
    [
      t,
      {
        lean: 0.17 * (o.k || 1), tilt: 0.15, brow: 0.6, lid: 0.5,
        eyes: 'open', mouth: 'frown', squash: -0.08, hand: [22, -150], amp: 0.3,
      },
      0.5,
    ],
  ],
  recoil: (t, o = {}) => [
    [t - 0.08, {lean: 0.06}, 0.08],
    [
      t,
      {
        lean: -0.22, tilt: -0.06, eyes: 'pin', brow: 0.9, mouth: 'jaw', sweat: 1, stance: 'recoil',
        hand: [70, -330], hand2: [10, -320], handKind: 'open', hand2Kind: 'open', amp: 0.7,
      },
      0.14,
    ],
    [t + (o.hold ?? 0.7), {lean: -0.08, sweat: 0.4, mouth: 'wobble', hand: [50, -250], hand2: [0, -230], amp: 0.2}, 0.4],
  ],
  puffUp: (t) => [
    [t - 0.12, {lean: 0.06, squash: -0.07}, 0.12],
    [
      t,
      {
        lean: -0.12, tilt: -0.13, squash: 0.09, eyes: 'shut', brow: 0.75, mouth: 'grin', stance: 'strut',
        hand: [34, -196], hand2: [-30, -196], handKind: 'fist', hand2Kind: 'fist', amp: 0.45,
      },
      0.24,
    ],
  ],
  point: (t, o = {}) => [
    [t - 0.12, {hand: [10, -250], handKind: 'fist', lean: -0.04}, 0.12],
    [t, {hand: o.to || [170, -320], handKind: 'point', lean: 0.1, brow: o.brow ?? -0.3, amp: 0.45}, 0.15],
  ],
  shrug: (t, o = {}) => [
    [
      t,
      {
        hand: [96, -252], hand2: [-70, -252], handKind: 'open', hand2Kind: 'open',
        brow: 0.7, mouth: 'frown', tilt: 0.08, squash: 0.07, amp: 0.3,
      },
      0.2,
    ],
    [t + (o.hold ?? 0.7), {hand: [40, -180], hand2: [-10, -180], tilt: 0, squash: 0, amp: 0.15}, 0.35],
  ],
  nod: (t) => [
    [t, {tilt: 0.12, squash: -0.04}, 0.1],
    [t + 0.14, {tilt: -0.02, squash: 0}, 0.18],
  ],
};

// ---- Body, Eyes, Hands, Props -------------------------------------------
const SKINS = [
  ['#f0b98f', '#d4946c'],
  ['#e6a982', '#c58762'],
  ['#cf9670', '#ab7450'],
  ['#f3c6a2', '#d9a17c'],
];
const HAIRS = ['#4a3324', '#2a2024', '#8a5a2e', '#a9a29a'];

function eye(x, y, rx, ry, lk, lid, skin, mode = 'open', isFar = false, lkY = 0) {
  if (mode === 'laugh' || mode === 'happy') {
    g.beginPath();
    g.moveTo(x - rx, y + 3);
    g.quadraticCurveTo(x, y - ry * 1.05, x + rx, y + 3);
    g.strokeStyle = C(INK);
    g.lineWidth = 4.0;
    g.lineCap = 'round';
    g.stroke();
    return;
  }
  if (mode === 'bags') ell(x, y + ry * 0.58, rx * 1.16, ry * 0.62, C('#7d5e58'));
  const skep = mode === 'skeptical';
  const sc =
    mode === 'pin' ? 1.32 : mode === 'wide' || mode === 'teary' ? 1.22 : skep ? (isFar ? 1.24 : 0.88) : mode === 'squint' ? 0.92 : 1;
  const ry2 = ry * (mode === 'squint' ? 0.62 : skep && !isFar ? 0.68 : sc),
    rx2 = rx * sc;

  form(
    () => g.ellipse(x, y, rx2, ry2, 0, 0, Math.PI * 2),
    C('#fffaf0'),
    () => {
      const px = x + 2 + lk * 4.2;
      const py = mode === 'roll' ? y - ry2 * 0.45 : y + 1 + lkY * 3.5;
      const pr = mode === 'pin' ? 0.28 : 0.52;
      ell(px, py, rx * pr, ry * pr, C(INK));
      if (mode !== 'pin') ell(px - rx * 0.14, py - ry * 0.16, rx * 0.13, ry * 0.13, C('#fffaf0'));
      const effLid =
        mode === 'squint' ? Math.max(lid, 0.42) : skep && !isFar ? 0.45 : mode === 'bags' ? Math.max(lid, 0.46) : lid;
      if (effLid) {
        g.fillStyle = skin;
        g.fillRect(x - rx2 - 2, y - ry2 - 2, rx2 * 2 + 4, (ry2 * 2 + 2) * effLid);
      }
      if (mode === 'squint') {
        g.fillStyle = skin;
        g.fillRect(x - rx2 - 2, y + ry2 * 0.45, rx2 * 2 + 4, ry2);
      }
    }
  );
}

function droplet(x, y, s = 1, rot = 0) {
  at(
    x,
    y,
    s,
    () => {
      form(
        () => {
          g.moveTo(0, -13);
          g.bezierCurveTo(8, -2, 9, 8, 0, 11);
          g.bezierCurveTo(-9, 8, -8, -2, 0, -13);
          g.closePath();
        },
        C('#8ad4f5'),
        () => {
          ell(3, 3, 6.5, 8, C('#5eb2db'));
        }
      );
    },
    rot
  );
}

function fringe(x1, y1, x2, y2, n, len, col) {
  const L = Math.hypot(x2 - x1, y2 - y1) || 1,
    ux = (x2 - x1) / L,
    uy = (y2 - y1) / L;
  let nx = -uy,
    ny = ux;
  if (ny < 0) {
    nx = -nx;
    ny = -ny;
  }
  for (let i = 0; i < n; i++) {
    const f = (i + 0.5) / n,
      px = lerp(x1, x2, f),
      py = lerp(y1, y2, f);
    poly(
      [
        [px - ux * 5, py - uy * 5],
        [px + ux * 5, py + uy * 5],
        [px + nx * len, py + ny * len],
      ],
      col
    );
  }
}

function kitOf(o) {
  const kitName = o.kit || 'trooper';
  const k = {...(KIT[kitName] || KIT.trooper), kit: kitName};
  if (o.skin != null && typeof o.skin === 'number') [k.skin, k.skinSh] = SKINS[o.skin % 4];
  if (o.hair != null && typeof o.hair === 'number') {
    k.hair = HAIRS[o.hair % 4];
    k.hairSh = mix(k.hair, '#141016', 0.28);
  }
  k.hairSh = k.hairSh || mix(k.hair || '#4a3324', '#141016', 0.28);
  k.pantsSh = k.pantsSh || mix(k.pants || '#4a4652', '#141016', 0.24);
  k.bootSh = k.bootSh || mix(k.boot || '#261e22', '#100c12', 0.28);
  return k;
}

function drawHandShape(kind = 'open', skin, skinSh, ang = 0) {
  g.save();
  g.rotate(ang);
  if (kind === 'point') {
    rr(-6, -6, 19, 17, 6, skinSh);
    limb(-3, -7, 32, -7, 6.0, 4.6, skin);
    limb(-5, -2, 10, -15, 5.0, 4.0, skin);
    ell(0, 2, 11.5, 10.5, skin);
  } else if (kind === 'beckon') {
    form(
      () => {
        g.moveTo(-13, 4);
        g.quadraticCurveTo(-2, 15, 21, 9);
        g.quadraticCurveTo(36, 3, 34, -6);
        g.quadraticCurveTo(16, -8, -8, -8);
        g.closePath();
      },
      skin,
      () => {
        g.fillStyle = skinSh;
        g.fillRect(-13, 4, 48, 11);
      }
    );
    limb(-5, -6, 9, -19, 5.0, 4.0, skin);
  } else if (kind === 'open') {
    form(
      () => {
        g.moveTo(-11, -8);
        g.lineTo(17, -11);
        g.quadraticCurveTo(28, -9, 26, 2);
        g.quadraticCurveTo(24, 12, 7, 12);
        g.lineTo(-11, 8);
        g.closePath();
      },
      skin,
      () => {
        g.fillStyle = skinSh;
        g.fillRect(-11, 3, 39, 10);
      }
    );
    limb(-4, -7, 9, -19, 4.8, 3.8, skin);
  } else {
    form(
      () => g.roundRect(-11, -12, 24, 23, 8),
      skin,
      () => {
        g.fillStyle = skinSh;
        g.fillRect(-11, 2, 24, 11);
      }
    );
    limb(-4, -8, 9, -4, 4.8, 4.2, skin);
  }
  g.restore();
}

function drawProp(kind, ph = 0) {
  if (!kind) return;
  g.save();
  if (kind === 'sabre') {
    g.rotate(-0.55 + Math.sin(ph * 2) * 0.05);
    form(
      () => {
        g.moveTo(0, -10);
        g.quadraticCurveTo(85, -32, 165, -18);
        g.quadraticCurveTo(85, -12, 0, 4);
        g.closePath();
      },
      C('#eef3f7'),
      () => {
        g.fillStyle = C('#b8c7d4');
        g.fillRect(0, -8, 170, 12);
      }
    );
    rr(-18, -8, 22, 12, 3, C('#4a3324'));
    rr(-4, -18, 9, 32, 4, C(GOLD));
    ell(-2, 4, 14, 10, C(GOLD));
  } else if (kind === 'spyglass') {
    rr(-10, -14, 52, 22, 5, C('#38322e'));
    rr(30, -17, 28, 28, 5, C(GOLD));
    ell(58, -3, 6, 12, C('#9ad4ea'));
  } else if (kind === 'note') {
    g.rotate(-0.14 + Math.sin(ph * 3) * 0.04);
    form(
      () => g.roundRect(-44, -34, 96, 68, 5),
      C('#fbf6ea'),
      () => {
        g.fillStyle = C('#e0d7c3');
        g.fillRect(-44, 14, 96, 22);
      }
    );
    for (let i = 0; i < 3; i++) rr(-32, -18 + i * 15, 68 - (i % 2) * 14, 5, 2, C('#5e554d'));
  } else if (kind === 'blank_paper') {
    // Blank accusation sheets in Congress ("that he couldn't prove")
    g.rotate(-0.16 + Math.sin(ph * 3.5) * 0.05);
    rr(-48, -38, 92, 68, 4, C('#e5dcc8'));
    form(
      () => g.roundRect(-42, -32, 94, 68, 4),
      C('#fcf8ef'),
      () => {
        g.fillStyle = C('#e6decb');
        g.fillRect(-42, 18, 94, 18);
      }
    );
    // Faint empty dotted header only — visibly blank underneath!
    rr(-28, -20, 44, 4, 2, C('#cbbba2'));
  } else if (kind === 'sealed_order') {
    g.rotate(-0.12);
    form(
      () => g.roundRect(-36, -46, 72, 86, 4),
      C('#fcf7eb'),
      () => {
        g.fillStyle = C('#e3dac6');
        g.fillRect(-36, 18, 72, 22);
      }
    );
    rr(-24, -32, 48, 7, 2, C('#2b4066'));
    rr(-24, -18, 42, 4, 2, C('#8c8275'));
    rr(-24, -8, 34, 4, 2, C('#8c8275'));
    ell(14, 12, 11, 11, C('#d8352a'));
  } else if (kind === 'ledger' || kind === 'playbook') {
    const col = kind === 'playbook' ? '#8c352b' : '#6e4832';
    const colSh = kind === 'playbook' ? '#6b241c' : '#4f3220';
    g.rotate(-0.1);
    form(
      () => g.roundRect(-38, -44, 78, 88, 6),
      C(col),
      () => {
        g.fillStyle = C(colSh);
        g.fillRect(-38, -44, 24, 88);
      }
    );
    rr(-24, -26, 50, 24, 3, C(CREAM));
    rr(-18, -18, 38, 5, 2, C(INK));
    rr(-14, -10, 28, 4, 2, C('#8c352b'));
    rr(-20, 12, 42, 5, 2, C(GOLD));
  } else if (kind === 'dossier') {
    g.rotate(-0.2);
    form(
      () => g.roundRect(-20, -42, 58, 74, 4),
      C('#fbf6ea'),
      () => {
        g.fillStyle = C('#dfd5c0');
        g.fillRect(-20, 14, 58, 20);
      }
    );
    rr(-10, -28, 38, 6, 2, C('#3a4c6b'));
    for (let i = 0; i < 3; i++) rr(-10, -14 + i * 11, 34 - (i % 2) * 8, 4, 2, C('#8c8275'));
  } else if (kind === 'gavel') {
    limb(-14, 10, 52, -24, 6.5, 5.5, C('#694127'));
    g.save();
    g.translate(50, -24);
    g.rotate(-0.45);
    form(
      () => g.roundRect(-20, -32, 40, 64, 6),
      C('#4d2d18'),
      () => {
        g.fillStyle = C('#331c0e');
        g.fillRect(-20, 4, 40, 30);
      }
    );
    rr(-21, -7, 42, 14, 2, C(GOLD));
    g.restore();
  } else if (kind === 'hanky') {
    poly(
      [
        [-10, -4],
        [22, 8],
        [8, 50],
        [-20, 36],
      ],
      C('#faf7f0')
    );
    poly(
      [
        [2, 4],
        [22, 8],
        [8, 50],
        [-4, 42],
      ],
      C('#dfd8ca')
    );
  } else if (kind === 'probation') {
    g.rotate(-0.08);
    rr(-42, -32, 88, 64, 4, C('#fbf6ea'));
    rr(-30, -18, 64, 14, 2, C('#d8352a'));
    rr(-30, 4, 52, 5, 2, C('#6e655c'));
    rr(-30, 14, 40, 5, 2, C('#6e655c'));
  } else if (kind === 'carbine' || kind === 'winchester') {
    const isWin = kind === 'winchester';
    limb(-12, 82, 4, -145, 7, 5, C('#694328'));
    limb(0, -65, 8, -205, 4.5, 4, C('#505866'));
    rr(-4, -68, 12, 26, 2, C(isWin ? GOLD : '#7d8594'));
  } else if (kind === 'guidon') {
    // 7th Cavalry swallowtail Stars & Stripes / company guidon!
    limb(-4, 120, 6, -240, 4.8, 4.0, C('#6b482e'));
    ell(6, -244, 6.5, 6.5, C(GOLD));
    const wave = Math.sin(ph * 3.2) * 8;
    poly(
      [
        [6, -236],
        [106, -228 + wave],
        [82, -196 + wave * 0.6],
        [106, -164 + wave],
        [4, -168],
      ],
      C('#c9342b')
    );
    poly(
      [
        [5, -202],
        [92, -196 + wave * 0.7],
        [106, -164 + wave],
        [4, -168],
      ],
      C('#f4efe4')
    );
    rr(5, -236, 42, 36, 2, C('#243b63'));
  } else if (kind === 'phone_rec') {
    g.rotate(-0.08);
    rr(-16, -42, 32, 58, 6, C('#1b1e26'));
    rr(-13, -37, 26, 48, 4, C('#8cd4e8'));
    ell(0, -28, 4, 4, C('#e03b32'));
  } else if (kind === 'laptop_open') {
    g.rotate(-0.06);
    rr(-54, -4, 108, 9, 3, C('#505664'));
    poly(
      [
        [-48, -4],
        [-58, -68],
        [40, -68],
        [48, -4],
      ],
      C('#262a33')
    );
    ell(-6, -36, 8, 8, C('#aeb6c4'));
  } else if (kind === 'pc_box') {
    g.rotate(-0.04);
    form(
      () => g.roundRect(-66, -54, 132, 98, 6),
      C('#c99e67'),
      () => {
        g.fillStyle = C('#a87e4b');
        g.fillRect(-66, -54, 42, 98);
      }
    );
    rr(-66, -12, 132, 12, 0, C(ACCENT));
    rr(-44, 10, 88, 22, 3, C('#faf6ec'));
    rr(-34, 17, 68, 6, 2, C('#282c34'));
  } else if (kind === 'day1_badge') {
    limb(0, -10, 0, 26, 3.5, 3.5, C(ACCENT));
    rr(-24, 22, 48, 62, 5, C('#fbf9f2'));
    rr(-24, 22, 48, 16, 4, C(ACCENT));
    ell(0, 50, 9, 9, C('#202b42'));
    rr(-15, 66, 30, 6, 2, C('#282c34'));
  } else if (kind === 'resignation_folder') {
    // Crimson-burgundy executive dossier folder (#8c242b / #66181e) with cream page edge & gold seal tab
    g.rotate(-0.12 + Math.sin(ph * 2.4) * 0.025);
    rr(-42, -44, 38, 12, [4, 4, 0, 0], C('#66181e'));
    rr(-38, -38, 84, 66, 3, C('#faf5e8'));
    rr(38, -36, 8, 62, 2, C('#dfd6c3'));
    form(
      () => g.roundRect(-44, -34, 86, 68, 5),
      C('#8c242b'),
      () => {
        g.fillStyle = C('#66181e');
        g.fillRect(-44, -34, 24, 68);
        g.fillRect(-44, 18, 86, 18);
      }
    );
    rr(-24, -18, 48, 13, 2.5, C('#faf5e8'));
    rr(-18, -13, 36, 4, 1.5, C('#242834'));
    rr(25, -2, 19, 11, 2.5, C(GOLD));
    ell(14, 10, 8.5, 8.5, C(GOLD));
    ell(14, 10, 4.8, 4.8, C(GOLD_SH));
  } else if (kind === 'protest_sign') {
    // Handheld employee rally placard on short wooden stick (#fbf8f0 card, ACCENT top band, clean dark bars)
    g.rotate(-0.05 + Math.sin(ph * 3.6) * 0.045);
    limb(0, 46, 0, -142, 5.4, 4.8, C('#c48f5a'));
    limb(-2.2, 46, -2.2, -142, 2.4, 2.2, C('#916337'));
    rr(-70, -194, 140, 94, 6, C('#d6cfc0'));
    form(
      () => g.roundRect(-68, -196, 136, 92, 6),
      C('#fbf8f0'),
      () => {
        g.fillStyle = C('#eae3d2');
        g.fillRect(-68, -124, 136, 22);
      }
    );
    rr(-68, -196, 136, 24, [6, 6, 0, 0], C(ACCENT));
    rr(-68, -196, 36, 24, [6, 0, 0, 0], C(ACCENT_SH));
    rr(-22, -187, 44, 6, 2.5, C('#fbf8f0'));
    rr(-48, -158, 96, 11, 3, C('#202632'));
    rr(-36, -139, 72, 8, 2.5, C('#3a4252'));
    rr(-24, -122, 48, 5, 2, C(ACCENT));
  }
  g.restore();
}

function upper(o, k, ph, hx, hy) {
  const c = (n) => C(k[n]),
    cus = k.trim === 'fringe',
    btn = k.trim === 'buttons',
    isFront = o.view === 'front';
  const sq = o.squash || 0,
    shv = o.shiver ? Math.sin(ph * 14) * 2.5 * o.shiver : 0;
  g.save();
  g.translate(shv, 0);
  if (sq) g.scale(1 - sq * 0.35, 1 + sq * 0.45);

  const cuffCol =
    k.trim === 'suit' || k.trim === 'apron'
      ? k.shirt || '#f5efe4'
      : k.modernBelt
        ? k.sleeve || k.coat
        : cus
          ? '#ead9b0'
          : GOLD;

  const drawArm = (sx, sy, tx, ty, sleeveC, handKind, propKind, bendDir, castShadow) => {
    let effSx = sx,
      effSy = sy,
      effTx = tx,
      effTy = ty,
      l1 = 66,
      l2 = 64,
      effBend = bendDir;
    const isPaperProp =
      propKind === 'note' ||
      propKind === 'blank_paper' ||
      propKind === 'dossier' ||
      propKind === 'resignation_folder' ||
      propKind === 'sealed_order' ||
      propKind === 'probation' ||
      propKind === 'playbook';
    if (!isFront && propKind === 'sabre') {
      const upAmt = clamp((-125 - ty) / 95, 0, 1);
      effSx = sx + lerp(10, 20, upAmt);
      effSy = sy - lerp(2, 12, upAmt);
      effTx = lerp(Math.max(tx, 140), Math.max(tx, 160), upAmt);
      effTy = upAmt > 0.05 ? Math.max(ty, -288) : ty;
      l1 = lerp(86, 130, upAmt);
      l2 = lerp(84, 136, upAmt);
      effBend = 1;
    } else if (!isFront && isPaperProp && ty < -135 && ty > -245) {
      effSx = sx + 8;
      effTx = Math.max(tx, 132);
      effTy = Math.max(ty, -148);
      l1 = 82;
      l2 = 80;
    } else if (ty < -185) {
      const reachBoost = clamp((-185 - ty) / 130, 0, 1);
      effSy = sy - reachBoost * 18;
      l1 = lerp(66, 96, reachBoost);
      l2 = lerp(64, 94, reachBoost);
    }
    const [ex, ey, fx, fy] = ik(effSx, effSy, effTx, effTy, l1, l2, effBend);
    if (castShadow) {
      g.save();
      g.globalAlpha = 0.22;
      limb(effSx + 5, effSy + 8, ex + 5, ey + 8, 22, 17, '#16101e');
      limb(ex + 5, ey + 8, fx + 5, fy + 8, 17, 14, '#16101e');
      g.restore();
    }
    const sleeveBase = k.sleeve || sleeveC;
    const sleeveSh = k.sleeve ? mix(k.sleeve, '#1c2028', 0.16) : k.coatSh;
    limb(effSx, effSy + 2, ex, ey + 2, 21.5, 17, C(sleeveSh));
    limb(effSx, effSy, ex, ey, 20.5, 16, C(sleeveBase));
    if (cus) fringe(ex, ey, fx, fy, 5, 13, c('coatSh'));
    limb(ex, ey + 1.5, fx, fy + 1.5, 17, 14, C(sleeveSh));
    limb(ex, ey, fx, fy, 16, 13, C(sleeveBase));
    const ang = Math.atan2(fy - ey, fx - ex);
    limb(fx - Math.cos(ang) * 7, fy - Math.sin(ang) * 7, fx, fy, 15, 14.5, C(cuffCol));
    if (propKind) at(fx, fy, 1, () => drawProp(propKind, ph));
    at(fx, fy, 1, () => drawHandShape(handKind || (propKind ? 'fist' : 'open'), c('skin'), c('skinSh'), ang));
    return [fx, fy];
  };

  if (!isFront && o.hand2) {
    drawArm(-12, -120, o.hand2[0], o.hand2[1], k.coatSh, o.hand2Kind, o.prop2, 1, false);
  }

  form(
    () => {
      curve(
        [
          [-50, -16],
          [52, -16],
          [62, 28],
          [14, 30],
          [4, 8],
          [-6, 30],
          [-58, 28],
        ],
        true
      );
    },
    c('coat'),
    () => {
      g.fillStyle = c('coatSh');
      g.fillRect(-64, -18, 50, 52);
    }
  );
  if (cus) fringe(-50, 24, 54, 24, 9, 14, c('coatSh'));

  form(
    () => {
      curve(
        [
          [-56, -138],
          [0, -152],
          [58, -138],
          [48, -12],
          [-46, -12],
        ],
        true
      );
    },
    c('coat'),
    () => {
      poly(
        [
          [-62, -156],
          [-10, -156],
          [-16, -8],
          [-62, -8],
        ],
        c('coatSh')
      );
    }
  );

  const cx = isFront ? 0 : 14;
  if (cus) {
    if (k.shirt)
      poly(
        [
          [cx - 22, -146],
          [cx + 24, -146],
          [cx + 18, -22],
          [cx - 16, -22],
        ],
        C(k.shirt)
      );
    for (let i = 0; i < 3; i++) {
      ell(cx - 9, -106 + i * 26, 3, 3, C('#dce2ec'));
      ell(cx + 11, -106 + i * 26, 3, 3, C('#dce2ec'));
    }
  } else if (btn) {
    rr(cx - 18, -150, 38, 11, 4, c('coatSh'));
    for (let i = 0; i < 4; i++) {
      ell(cx - 11, -122 + i * 26, 4.2, 4.2, C(GOLD));
      ell(cx + 15, -122 + i * 26, 4.2, 4.2, C(GOLD));
    }
    rr(-54, -145, 28, 9, 4, C(GOLD_SH));
    rr(26, -145, 28, 9, 4, C(GOLD));
  } else if (k.trim === 'suit') {
    poly(
      [
        [cx - 17, -146],
        [cx + 17, -146],
        [cx + 2, -74],
      ],
      C(k.shirt || '#f5efe4')
    );
    poly(
      [
        [cx - 6, -138],
        [cx + 6, -138],
        [cx + 8, -84],
        [cx, -74],
        [cx - 8, -84],
      ],
      C(k.tie || '#28242e')
    );
    poly(
      [
        [cx - 17, -146],
        [cx - 32, -122],
        [cx - 22, -98],
        [cx - 2, -74],
      ],
      c('coatSh')
    );
    poly(
      [
        [cx + 17, -146],
        [cx + 32, -122],
        [cx + 22, -98],
        [cx + 2, -74],
      ],
      C(mix(k.coat, '#141018', 0.2))
    );
  } else if (k.trim === 'zip_jacket' || k.trim === 'vest') {
    poly(
      [
        [cx - 16, -148],
        [cx + 16, -148],
        [cx + 13, -14],
        [cx - 13, -14],
      ],
      C(k.shirt || '#1a1d24')
    );
    limb(cx - 14, -144, cx - 12, -14, 2.2, 2.2, C('#7d8799'));
    poly(
      [
        [cx - 16, -148],
        [cx - 38, -124],
        [cx - 22, -116],
      ],
      c('coatSh')
    );
    poly(
      [
        [cx + 16, -148],
        [cx + 38, -124],
        [cx + 22, -116],
      ],
      c('coat')
    );
  } else if (k.trim === 'hoodie') {
    ell(cx, -144, 26, 12, c('coatSh'));
    limb(cx - 9, -138, cx - 9, -104, 2.5, 2.5, C('#ece9e0'));
    limb(cx + 9, -138, cx + 9, -104, 2.5, 2.5, C('#ece9e0'));
  }

  if (k.badge) {
    limb(cx - 14, -144, cx - 2, -88, 3.2, 3.2, C(ACCENT));
    limb(cx + 14, -144, cx + 2, -88, 3.2, 3.2, C(ACCENT));
    rr(cx - 11, -88, 22, 30, 3, C('#faf8f2'));
    rr(cx - 11, -88, 22, 8, 2, C(ACCENT));
  }

  if (k.modernBelt) {
    rr(-49, -16, 98, 11, 4, C('#161820'));
    if (k.silverBuckle) rr(cx - 6, -17, 13, 13, 2.5, C('#aeb6c4'));
  } else {
    rr(-51, -18, 104, 14, 4, C(INK));
    rr(cx - 8, -20, 17, 18, 3, C(GOLD));
  }

  if (o.emptyPockets > 0.05) {
    const pk = o.emptyPockets;
    for (const sgn of [-1, 1]) {
      const px = sgn * 48;
      form(
        () => {
          curve(
            [
              [px - sgn * 4, -8],
              [px + sgn * 28 * pk, 6 * pk],
              [px + sgn * 30 * pk, 46 * pk],
              [px + sgn * 10 * pk, 50 * pk],
              [px - sgn * 6, 22 * pk],
            ],
            true
          );
        },
        C('#faf6ec'),
        () => {
          ell(px + sgn * 8 * pk, 26 * pk, 11 * pk, 18 * pk, C('#dcd3c0'));
        }
      );
    }
  }

  if (k.scarf) {
    poly(
      [
        [cx - 24, -150],
        [cx + 26, -150],
        [cx + 4, -102],
      ],
      c('scarf')
    );
    limb(cx + 2, -120, cx - 10 - Math.sin(ph * 1.8) * 5, -86, 7.5, 4, c('scarf'));
  }

  // Classic Rounded Capsule Head
  rr(isFront ? -14 : -8, -164, 28, 24, 6, c('skinSh'));
  g.save();
  g.translate(isFront ? 0 : 8, -148);
  g.rotate(o.tilt || 0);
  g.scale(1.42 * (1 - sq * 0.16), 1.42 * (1 + sq * 0.2));

  if (o.curls ?? k.curls) {
    if (isFront) {
      [
        [-46, -30, 24],
        [-52, -6, 21],
        [-42, 14, 18],
        [46, -30, 24],
        [52, -6, 21],
        [42, 14, 18],
      ].forEach((q) => ell(q[0], q[1], q[2], q[2], C(q[0] < 0 ? k.hairSh : k.hair)));
    } else {
      [
        [-44, -30, 26],
        [-52, -8, 22],
        [-40, 12, 20],
      ].forEach((q) => ell(q[0], q[1], q[2], q[2], c('hair')));
    }
  } else if (!isFront) {
    ell(-38, -48, 17, 28, c('hair'));
  }

  if (isFront) {
    ell(-54, -44, 9, 13, c('skinSh'));
    ell(54, -44, 9, 13, c('skin'));
    form(
      () => {
        g.roundRect(-52, -106, 104, 112, [52, 52, 46, 46]);
      },
      c('skin'),
      () => {
        ell(-48, -40, 38, 76, c('skinSh'));
        if (o.pale) {
          g.globalAlpha = 0.42 * o.pale;
          g.fillStyle = C('#6a8299');
          g.fillRect(-54, -110, 112, 68);
          g.globalAlpha = 1;
        }
      }
    );
    ell(0, -40, 9.5, 7.5, c('skinSh'));
  } else {
    form(
      () => {
        g.roundRect(-48, -106, 104, 112, [52, 52, 46, 46]);
        g.ellipse(58, -42, 12, 10, 0, 0, Math.PI * 2);
      },
      c('skin'),
      () => {
        ell(-46, -40, 42, 76, c('skinSh'));
        if (o.pale) {
          g.globalAlpha = 0.42 * o.pale;
          g.fillStyle = C('#6a8299');
          g.fillRect(-52, -110, 120, 68);
          g.globalAlpha = 1;
        }
      }
    );
    ell(-8, -44, 9, 13, c('skinSh'));
  }

  g.globalAlpha = 0.28 + (o.blush || 0) * 0.42;
  if (isFront) {
    ell(-30, -30, 12, 6.5, C('#e0604a'));
    ell(30, -30, 12, 6.5, C('#e0604a'));
  } else {
    ell(28, -30, 13 + (o.blush || 0) * 4, 7 + (o.blush || 0) * 2.5, C('#e0604a'));
  }
  g.globalAlpha = 1;

  const ey = -56,
    br = o.brow || 0,
    lk = o.look || 0,
    lkY = o.lookY || 0;
  if (o.eyes === 'shut') {
    if (isFront) {
      limb(-28, ey + 2, -10, ey + 2, 3.5, 3.5, C(INK));
      limb(10, ey + 2, 28, ey + 2, 3.5, 3.5, C(INK));
    } else {
      limb(10, ey, 28, ey + 3, 3.5, 3.5, C(INK));
      limb(36, ey + 3, 52, ey, 3.5, 3.5, C(INK));
    }
  } else if (isFront) {
    eye(-19, ey, 10, 12.5, lk, o.lid || 0, c('skin'), o.eyes || 'open', false, lkY);
    eye(19, ey, 10, 12.5, lk, o.lid || 0, c('skin'), o.eyes || 'open', false, lkY);
  } else {
    eye(19, ey, 10, 12.5, lk, o.lid || 0, c('skin'), o.eyes || 'open', false, lkY);
    eye(44, ey, 9, 12.5, lk, o.lid || 0, c('skin'), o.eyes || 'open', true, lkY);
  }

  const skep = o.eyes === 'skeptical';
  const browCol = k.hairStyle === 'swept_silver' ? C('#7d8594') : c('hair');
  if (isFront) {
    limb(-32, ey - 19 + br * 6, -8, ey - 21 - br * 9, 4.6, 5.0, browCol);
    limb(32, ey - 19 + br * 6, 8, ey - 21 - br * 9, 4.6, 5.0, browCol);
  } else {
    limb(5, ey - 20 + (skep ? 4 : br * 6), 29, ey - 21 - (skep ? -6 : br * 9), 4.8, 4.4, browCol);
    limb(35, ey - 21 - (skep ? 10 : br * 9), 58, ey - 20 + (skep ? -12 : br * 6), 4.4, 4.8, browCol);
  }

  // Modern Eyeglasses (gunmetal half-rim frames via kit.halfRim, or full-rim)
  if (o.glasses ?? k.glasses) {
    const gc = C('#2a303c');
    g.save();
    g.strokeStyle = gc;
    g.lineWidth = k.halfRim ? 2.6 : 2.3;
    if (isFront) {
      g.beginPath();
      g.roundRect(-33, ey - 8, 28, 19, 5);
      g.stroke();
      g.beginPath();
      g.roundRect(5, ey - 8, 28, 19, 5);
      g.stroke();
      limb(-5, ey - 2, 5, ey - 2, 2.4, 2.4, gc);
      limb(-49, ey - 2, -33, ey - 2, 2.2, 2.2, gc);
      limb(33, ey - 2, 49, ey - 2, 2.2, 2.2, gc);
      if (k.halfRim) {
        rr(-34, ey - 9.5, 30, 3.6, 1.5, gc);
        rr(4, ey - 9.5, 30, 3.6, 1.5, gc);
      }
    } else {
      g.beginPath();
      g.roundRect(6, ey - 8, 26, 19, 5);
      g.stroke();
      g.beginPath();
      g.roundRect(35, ey - 8, 21, 19, 5);
      g.stroke();
      limb(32, ey - 2, 35, ey - 2, 2.4, 2.4, gc);
      limb(-6, ey - 2, 6, ey - 1, 2.2, 2.2, gc);
      if (k.halfRim) {
        rr(5, ey - 9.5, 28, 3.6, 1.5, gc);
        rr(34, ey - 9.5, 23, 3.6, 1.5, gc);
      }
    }
    g.restore();
  }

  if (o.beard ?? k.beard) {
    if (isFront)
      blob(
        [
          [-46, -28],
          [0, -18],
          [46, -28],
          [42, 8],
          [0, 18],
          [-42, 8],
        ],
        c('hair')
      );
    else
      blob(
        [
          [-12, -34],
          [22, -24],
          [62, -32],
          [58, -2],
          [30, 14],
          [-2, 4],
        ],
        c('hair')
      );
  }

  const mc = C('#5e1f22'),
    teeth = C('#fffaf0'),
    tongue = C('#d96862');
  const mx = isFront ? 0 : 38,
    m = o.mouth;
  if (m === 'open' || m === 'talk') {
    const gate = m === 'talk' && _WORDS.length > 0 ? speechOpen(_T || _CUR_T) : 1;
    if (m === 'talk' && gate < 0.08) {
      g.beginPath();
      g.moveTo(mx - 12, -12);
      g.quadraticCurveTo(mx, -11, mx + 12, -14);
      g.strokeStyle = mc;
      g.lineWidth = 3.6;
      g.lineCap = 'round';
      g.stroke();
    } else {
      const oh = m === 'talk' ? 4.2 + gate * 8.6 : 10.5;
      form(
        () => g.roundRect(mx - 12, -17, 24, oh + 6, 7),
        mc,
        () => {
          if (oh > 5.8) {
            g.fillStyle = teeth;
            g.fillRect(mx - 12, -17, 24, 4.6);
          }
          ell(mx, -10 + oh, 8.5, 4.6, tongue);
        }
      );
    }
  } else if (m === 'plead') {
    g.beginPath();
    g.moveTo(mx - 14, -5);
    g.quadraticCurveTo(mx, -19, mx + 14, -6);
    g.strokeStyle = mc;
    g.lineWidth = 4.0;
    g.lineCap = 'round';
    g.stroke();
  } else if (m === 'scoff') {
    g.beginPath();
    g.moveTo(mx - 15, -16);
    g.quadraticCurveTo(mx, -6, mx + 14, -19);
    g.strokeStyle = mc;
    g.lineWidth = 4.0;
    g.lineCap = 'round';
    g.stroke();
  } else if (m === 'shout') {
    form(
      () => g.roundRect(mx - 18, -23, 36, 26, 9),
      mc,
      () => {
        g.fillStyle = teeth;
        g.fillRect(mx - 18, -23, 36, 8);
        ell(mx, 1, 13, 8, tongue);
      }
    );
  } else if (m === 'jaw') {
    ell(mx - 1, -2, 17, 20, c('skin'));
    form(
      () => g.roundRect(mx - 17, -23, 34, 35, 11),
      mc,
      () => {
        g.fillStyle = teeth;
        g.fillRect(mx - 17, -23, 34, 8);
        ell(mx, 9, 13, 9, tongue);
      }
    );
  } else if (m === 'grin') {
    form(
      () => {
        g.moveTo(mx - 22, -18);
        g.quadraticCurveTo(mx, -14, mx + 20, -20);
        g.quadraticCurveTo(mx + 2, 7, mx - 22, -18);
      },
      teeth,
      () => {
        limb(mx - 20, -9, mx + 16, -11, 1.8, 1.8, C('#c9bfb0'));
      }
    );
  } else if (m === 'grit') {
    form(
      () => g.roundRect(mx - 18, -19, 36, 14, 5),
      teeth,
      () => {
        limb(mx - 18, -12, mx + 18, -12, 2, 2, C(INK));
        for (let tx = mx - 10; tx <= mx + 10; tx += 7) limb(tx, -19, tx, -5, 1.8, 1.8, C('#b8afa2'));
      }
    );
  } else if (m === 'smirk') {
    g.beginPath();
    g.moveTo(mx - 16, -10);
    g.quadraticCurveTo(mx, -9, mx + 16, -21);
    g.strokeStyle = mc;
    g.lineWidth = 4.2;
    g.lineCap = 'round';
    g.stroke();
  } else if (m === 'wobble') {
    g.beginPath();
    g.moveTo(mx - 18, -10);
    g.bezierCurveTo(mx - 8, -19, mx, -3, mx + 8, -15);
    g.quadraticCurveTo(mx + 14, -19, mx + 18, -9);
    g.strokeStyle = mc;
    g.lineWidth = 3.8;
    g.lineCap = 'round';
    g.stroke();
  } else if (m) {
    const d = m === 'smile' ? 8 : -7;
    g.beginPath();
    g.moveTo(mx - 14, -13 - d * 0.3);
    g.quadraticCurveTo(mx, -13 + d, mx + 15, -15 - d * 0.3);
    g.strokeStyle = mc;
    g.lineWidth = 3.8;
    g.lineCap = 'round';
    g.stroke();
  }

  if (o.stache ?? k.stache) {
    const lift = m === 'shout' || m === 'jaw' || m === 'grin' ? -4 : 0;
    limb(mx - 2, -27 + lift, mx - 30, -13 + lift * 0.5, 9.5, 3.8, c('hair'));
    limb(mx - 2, -27 + lift, mx + 28, -14 + lift * 0.5, 9.5, 3.8, c('hair'));
  }
  if (o.cigar) {
    limb(mx + 4, -12, mx + 38, -17, 4.5, 4, C('#7d4a28'));
    ell(mx + 39, -17, 3.5, 4.2, C('#f06d2f'));
  }

  if (o.eyes === 'teary') {
    const tp = (Math.abs(ph) * 0.35) % 1;
    droplet((isFront ? -22 : 12) - tp * 6, ey + 15 + tp * 18, 0.65 * (1 - tp * 0.3), 0.15);
    const tp2 = (Math.abs(ph) * 0.35 + 0.5) % 1;
    droplet((isFront ? 22 : 48) + tp2 * 6, ey + 15 + tp2 * 16, 0.58 * (1 - tp2 * 0.3), -0.15);
  }
  if (o.sweat) {
    const sp = (Math.abs(ph) * 0.35) % 1;
    g.globalAlpha = clamp(o.sweat) * (1 - sp * 0.5);
    droplet(isFront ? -38 : -24, -72 + sp * 16, 0.7);
    g.globalAlpha = 1;
  }
  if (o.shockLines) {
    g.globalAlpha = clamp(o.shockLines);
    [
      [-58, -115, -76, -134],
      [4, -144, 4, -170],
      [66, -115, 84, -134],
    ].forEach(([x1, y1, x2, y2]) => limb(x1, y1, x2, y2, 3.8, 1.5, C(GOLD)));
    g.globalAlpha = 1;
  }

  // Hats & Signature Hair Crowns
  g.save();
  g.translate(0, -(o.hatLift || 0));
  const hatType = o.hat || (k.hat === 'none' ? 'none' : 'slouch');
  if (hatType === 'none') {
    if (k.hairStyle === 'swept_silver') {
      if (isFront) {
        form(
          () => {
            curve(
              [
                [-53, -72],
                [-50, -108],
                [-16, -120],
                [24, -118],
                [52, -104],
                [53, -72],
                [44, -84],
                [12, -93],
                [-28, -91],
                [-45, -82],
              ],
              true
            );
          },
          c('hair'),
          () => {
            poly(
              [
                [-56, -122],
                [-14, -122],
                [-22, -70],
                [-56, -70],
              ],
              c('hairSh')
            );
          }
        );
        rr(-52, -76, 9, 26, 4, c('hairSh'));
        rr(43, -76, 9, 26, 4, c('hair'));
      } else {
        form(
          () => {
            curve(
              [
                [-48, -62],
                [-48, -104],
                [-12, -120],
                [32, -116],
                [52, -96],
                [42, -84],
                [10, -92],
                [-22, -84],
                [-34, -62],
              ],
              true
            );
          },
          c('hair'),
          () => {
            poly(
              [
                [-52, -122],
                [-4, -122],
                [-14, -58],
                [-52, -58],
              ],
              c('hairSh')
            );
          }
        );
        rr(-16, -76, 11, 28, 5, c('hairSh'));
      }
    } else if (k.hairStyle === 'long') {
      g.beginPath();
      g.roundRect(-51, -110, 104, 40, [48, 48, 6, 6]);
      g.fillStyle = c('hair');
      g.fill();
      if (isFront) {
        rr(-54, -84, 15, 76, 7, c('hairSh'));
        rr(39, -84, 15, 76, 7, c('hair'));
      } else {
        rr(-46, -84, 26, 78, 10, c('hair'));
      }
    } else {
      g.beginPath();
      g.roundRect(-50, -110, 104, 42, [50, 50, 6, 6]);
      g.fillStyle = c('hair');
      g.fill();
    }
  } else if (hatType === 'kepi') {
    form(
      () => g.roundRect(-42, -128, 84, 50, [10, 16, 4, 4]),
      c('hat'),
      () => {
        g.fillStyle = c('hatSh');
        g.fillRect(-44, -130, 28, 60);
      }
    );
    rr(-42, -88, 84, 9, 2, c('band'));
    if (isFront) ell(0, -80, 42, 8, C('#181720'));
    else ell(50, -80, 30, 8, c('hatSh'), 0.12);
  } else {
    ell(isFront ? 0 : 6, -82, 102, 16, c('hatSh'), isFront ? 0 : -0.05);
    ell(isFront ? 0 : 6, -86, 98, 14, c('hat'), isFront ? 0 : -0.05);
    form(
      () => g.roundRect(-40, -146, 86, 62, [28, 28, 4, 4]),
      c('hat'),
      () => {
        g.fillStyle = c('hatSh');
        g.fillRect(-42, -148, 30, 68);
      }
    );
    rr(-40, -98, 86, 10, 2, c('band'));
  }
  g.restore();
  g.restore();

  let retHand;
  if (isFront) {
    const h2 = o.hand2 || [-68, -4];
    const leftBend = h2[1] < -122 ? -1 : 1;
    const rightBend = hy < -122 ? 1 : -1;
    drawArm(-50, -122, h2[0], h2[1], k.coatSh, o.hand2Kind, o.prop2, leftBend, true);
    retHand = drawArm(50, -122, hx, hy, k.coat, o.handKind, o.prop, rightBend, true);
  } else {
    retHand = drawArm(12, -120, hx, hy, k.coat, o.handKind, o.prop, 1, true);
  }

  g.restore();
  return retHand;
}

// ---- Person (Side, Front, and Full-Length True Rear OTS) ----------------
function footLeg(hx, ph, walk, pants, boot, a1Off = 0, bendOff = 0, toeDir = 28, whiteSole = false, silverBuckle = false) {
  const a = Math.sin(ph) * 0.42 * walk + a1Off;
  const bend = Math.max(0, Math.cos(ph)) * 0.68 * walk + bendOff;
  const kx = hx + Math.sin(a) * 86,
    ky = Math.cos(a) * 86;
  const fx = kx + Math.sin(a - bend) * 86,
    fy = ky + Math.cos(a - bend) * 86;
  limb(hx, 0, kx, ky, 28, 21, pants);
  limb(kx, ky, fx, fy, 21, 17, pants);
  limb(lerp(kx, fx, 0.48), lerp(ky, fy, 0.48), fx, fy, 19, 17.5, boot);
  limb(fx - 3, fy + 2, fx + toeDir, fy + 3, 13.5, 10, boot);
  if (whiteSole) {
    limb(fx - 5, fy + 10, fx + toeDir, fy + 10.5, 4.2, 3.8, C('#f4f2ec'));
  }
  if (silverBuckle) {
    const sgn = toeDir >= 0 ? 1 : -1;
    rr(fx + sgn * 6 - 5, fy - 5, 10, 5, 1.5, C('#cfd6e2'));
  }
}

function standingBack(x, y, s, o = {}) {
  const k = kitOf(o),
    c = (n) => C(k[n]);
  const ph = o.ph ?? (_T * 4.2 + x * 0.01);
  const breathe = Math.sin(ph * 0.6) * 2.5;
  // Grounded at y = 0 (feet), matching side/front person() height!
  at(x, y, s, () => {
    // Full-length rear legs so 3D camera height never exposes a cropped waist!
    footLeg(-26, 0, 0, C(k.pantsSh), C(k.bootSh), -0.03, 0, -16);
    footLeg(26, 0, 0, c('pants'), c('boot'), 0.03, 0, 16);

    g.save();
    g.translate(0, -255 + breathe);
    form(
      () => {
        curve(
          [
            [-84, 112],
            [-80, -82],
            [-42, -112],
            [42, -112],
            [80, -82],
            [84, 112],
          ],
          true
        );
      },
      c('coat'),
      () => {
        poly(
          [
            [-90, -118],
            [-6, -118],
            [-12, 118],
            [-90, 118],
          ],
          c('coatSh')
        );
      }
    );
    limb(0, -106, 0, 106, 2.5, 2.5, C(mix(k.coatSh, '#120e18', 0.28)));
    rr(-34, -118, 68, 12, 5, C(k.modernBelt ? k.coatSh : '#ece6da'));
    if (k.trim === 'buttons') {
      rr(-78, -98, 36, 11, 4, C(GOLD_SH));
      rr(42, -98, 36, 11, 4, C(GOLD));
    } else if (k.trim === 'fringe') {
      fringe(-76, -58, 76, -58, 11, 16, c('coatSh'));
    }

    rr(-20, -144, 40, 28, 7, c('skinSh'));
    ell(-58, -188, 10, 15, c('skinSh'));
    ell(58, -188, 10, 15, c('skin'));
    form(
      () => g.roundRect(-56, -252, 112, 116, [52, 52, 42, 42]),
      c('hair'),
      () => {
        poly(
          [
            [-60, -256],
            [-4, -256],
            [-10, -134],
            [-60, -134],
          ],
          C(k.hairSh)
        );
      }
    );

    const hatType = o.hat || (k.hat === 'none' ? 'none' : 'slouch');
    if (hatType === 'kepi') {
      form(
        () => g.ellipse(0, -234, 62, 38, 0, 0, Math.PI * 2),
        c('hat'),
        () => {
          poly(
            [
              [-66, -276],
              [-4, -276],
              [-8, -190],
              [-66, -190],
            ],
            c('hatSh')
          );
        }
      );
      rr(-56, -204, 112, 10, 4, C('#16151e'));
      rr(-54, -210, 108, 6, 2, c('band'));
    } else if (hatType !== 'none' && hatType !== 'headband') {
      ell(0, -208, 108, 19, c('hatSh'));
      ell(0, -212, 104, 16, c('hat'));
      form(
        () => g.roundRect(-46, -272, 92, 62, [30, 30, 6, 6]),
        c('hat'),
        () => {
          g.fillStyle = c('hatSh');
          g.fillRect(-48, -274, 34, 66);
        }
      );
      rr(-46, -220, 92, 10, 3, c('band'));
    }
    g.restore();
  });
}

function person(o, seedX = 0) {
  const k = kitOf(o),
    ph = o.ph ?? (_T * 5.2 + seedX * 0.015),
    walk = o.walk || 0;
  const c = (n) => C(k[n]),
    st = o.stance || 'stand',
    isFront = o.view === 'front';
  const jmp = Math.max(0, o.jump || 0);
  const hipDrop = st === 'kneel' ? 78 : st === 'crouch' ? 24 : st === 'lunge' ? 20 : 0;
  const stLean =
    st === 'strut' ? -0.14 : st === 'lunge' ? 0.17 : st === 'crouch' ? 0.14 : st === 'recoil' ? -0.18 : st === 'kneel' ? 0.12 : 0;

  if (!o.noShadow) {
    g.globalAlpha = 0.2 * clamp(1 - jmp / 140, 0.28, 1);
    ell(4, 6, 76 * clamp(1 - jmp / 220, 0.5, 1), 11, C('#1d1226'));
    g.globalAlpha = 1;
  }

  g.save();
  const idleBob = Math.sin(ph * 0.9) * 3.0 * (1 - walk);
  g.translate(0, -HIP + hipDrop - jmp - Math.abs(Math.sin(ph)) * 10 * walk + idleBob);

  const farPants = C(k.pantsSh),
    farBoot = C(k.bootSh);
  const kneeSw = Math.sin(ph * 0.9) * 0.03 * (1 - walk);

  if (st === 'kneel') {
    footLeg(-10, 0, 0, farPants, farBoot, -0.2, 1.4, -14);
    footLeg(14, 0, 0, c('pants'), c('boot'), 0.98, 1.06, 26);
  } else if (st === 'leap') {
    footLeg(-14, 0, 0, farPants, farBoot, -0.42, 0.82, 22);
    footLeg(14, 0, 0, c('pants'), c('boot'), 0.56, 0.76, 26);
  } else if (st === 'lunge') {
    footLeg(-10, ph + Math.PI, walk * 0.5, farPants, farBoot, -0.44 + kneeSw, 0.08);
    footLeg(14, ph, walk * 0.5, c('pants'), c('boot'), 0.54 - kneeSw, 0.6);
  } else if (st === 'strut') {
    footLeg(-8, ph + Math.PI, Math.max(walk, 0.18), farPants, farBoot, -0.16, 0.05);
    footLeg(10, ph, Math.max(walk, 0.18), c('pants'), c('boot'), 0.3, 0);
  } else if (st === 'crouch') {
    footLeg(-6, ph + Math.PI, Math.max(walk, 0.14), farPants, farBoot, 0.26, 0.54);
    footLeg(8, ph, Math.max(walk, 0.14), c('pants'), c('boot'), 0.36, 0.58);
  } else if (st === 'recoil') {
    footLeg(-10, 0, 0, farPants, farBoot, -0.24 + kneeSw, 0.34);
    footLeg(12, 0, 0, c('pants'), c('boot'), 0.5 - kneeSw, 0.24);
  } else if (isFront) {
    footLeg(-19, ph + Math.PI, walk, farPants, farBoot, -0.04, 0, -16, k.whiteSole, k.silverBuckle);
    footLeg(19, ph, walk, c('pants'), c('boot'), 0.04, 0, 16, k.whiteSole, k.silverBuckle);
  } else {
    footLeg(-7, ph + Math.PI, walk, farPants, farBoot, kneeSw, 0, 28, k.whiteSole, k.silverBuckle);
    footLeg(9, ph, walk, c('pants'), c('boot'), -kneeSw, 0, 28, k.whiteSole, k.silverBuckle);
  }

  g.rotate((o.lean || 0) + stLean + Math.sin(ph * 0.8) * 0.016);
  const sw = Math.sin(ph) * 30 * walk + Math.sin(ph * 1.1) * 4 * (1 - walk);
  const hand = o.hand ? [o.hand[0], o.hand[1] + HIP] : isFront ? [66, -4] : [36 - sw, -2];
  const far = o.hand2 ? [o.hand2[0], o.hand2[1] + HIP] : isFront ? [-66, -4] : [-6 + sw, -2];
  const h = upper({...o, ph, hand2: far}, k, ph, hand[0], hand[1]);
  g.restore();
  return {hand: [h[0], h[1] - HIP + hipDrop - jmp]};
}

export function standing(x, y, s, o = {}, flip = false) {
  if (o.view === 'back') {
    standingBack(x, y, s, o);
    return {hand: [0, 0]};
  }
  let r;
  at(x, y, s, () => {
    r = person(o, x);
  }, 0, flip);
  return r;
}

/**
 * Two-person standing embrace with matched Style 2 head scale (~1.32-1.40x) and full-length proportions.
 * Person A (kitA, default 'exec_founder') stands slightly right-rear, eyes closed and smiling over B's shoulder;
 * Person B (kitB, default 'modern_tee_woman') stands closer foreground-left, rear 3/4 view with a low bun,
 * both arms wrapping A while A's two sleeves wrap across B's upper back. Colours come from the two kits.
 */
export function standingHug(x, y, s, t = _T, kitA = 'exec_founder', kitB = 'modern_tee_woman') {
  const kA = KIT[kitA] || KIT.exec_founder;
  const kB = KIT[kitB] || KIT.modern_tee_woman;
  const sway = Math.sin(t * 2.0) * 0.018;
  const pat = Math.sin(t * 4.8) * 3.5;

  at(x, y, s, () => {
    g.save();
    g.rotate(sway);

    // 1. Person A legs & shoes (slightly right-rear)
    g.save();
    g.translate(26, -HIP);
    footLeg(-16, 0, 0, C(kA.pantsSh), C(kA.bootSh), -0.03, 0, -12, !!kA.whiteSole, !!kA.silverBuckle);
    footLeg(22, 0, 0, C(kA.pants), C(kA.boot), 0.05, 0, 22, !!kA.whiteSole, !!kA.silverBuckle);

    // Person A jacket torso
    form(
      () =>
        curve(
          [
            [-54, -140],
            [0, -154],
            [58, -140],
            [52, 16],
            [-48, 16],
          ],
          true
        ),
      C(kA.coat),
      () => {
        g.fillStyle = C(kA.coatSh);
        g.fillRect(-58, -156, 48, 174);
      }
    );

    // Person A 1.40x Style 2 head tilted inward, eyes closed, smiling
    rr(-12, -166, 28, 24, 6, C(kA.skinSh));
    g.save();
    g.translate(8, -152);
    g.rotate(-0.07);
    g.scale(1.4, 1.4);
    ell(-54, -44, 9, 13, C(kA.skinSh));
    ell(54, -44, 9, 13, C(kA.skin));
    form(
      () => g.roundRect(-52, -106, 104, 112, [52, 52, 46, 46]),
      C(kA.skin),
      () => {
        ell(-48, -40, 38, 76, C(kA.skinSh));
      }
    );
    ell(0, -40, 9.5, 7.5, C(kA.skinSh));
    g.globalAlpha = 0.34;
    ell(-30, -30, 12, 6, C('#e0604a'));
    ell(30, -30, 12, 6, C('#e0604a'));
    g.globalAlpha = 1;

    // Peaceful closed smiling eyes + gunmetal half-rim glasses + warm smile
    const ey = -56;
    limb(-28, ey + 2, -10, ey + 2, 3.4, 3.4, C(INK));
    limb(10, ey + 2, 28, ey + 2, 3.4, 3.4, C(INK));
    limb(-30, ey - 17, -8, ey - 20, 4.2, 4.6, C('#7d8594'));
    limb(30, ey - 17, 8, ey - 20, 4.2, 4.6, C('#7d8594'));
    g.save();
    g.strokeStyle = C('#2a303c');
    g.lineWidth = 2.6;
    g.beginPath();
    g.roundRect(-33, ey - 8, 28, 19, 5);
    g.stroke();
    g.beginPath();
    g.roundRect(5, ey - 8, 28, 19, 5);
    g.stroke();
    limb(-5, ey - 2, 5, ey - 2, 2.4, 2.4, C('#2a303c'));
    rr(-34, ey - 9.5, 30, 3.5, 1.5, C('#2a303c'));
    rr(4, ey - 9.5, 30, 3.5, 1.5, C('#2a303c'));
    g.restore();

    g.beginPath();
    g.moveTo(-15, -14);
    g.quadraticCurveTo(0, -5, 16, -14);
    g.strokeStyle = C('#5e1f22');
    g.lineWidth = 3.8;
    g.lineCap = 'round';
    g.stroke();

    // Person A hair crown
    form(
      () => {
        curve(
          [
            [-53, -72],
            [-50, -108],
            [-16, -120],
            [24, -118],
            [52, -104],
            [53, -72],
            [44, -84],
            [12, -93],
            [-28, -91],
            [-45, -82],
          ],
          true
        );
      },
      C(kA.hair),
      () => {
        poly(
          [
            [-56, -122],
            [-14, -122],
            [-22, -70],
            [-56, -70],
          ],
          C(kA.hairSh)
        );
      }
    );
    rr(-52, -76, 9, 26, 4, C(kA.hairSh));
    rr(43, -76, 9, 26, 4, C(kA.hair));
    g.restore();
    g.restore();

    // 2. Person B (foreground-left, 0.94 stature, matched Style 2 head scale)
    g.save();
    g.translate(-26, -HIP + 12);
    footLeg(-18, 0, 0, C(kB.pantsSh), C(kB.bootSh), -0.02, 0, -10, false, false);
    footLeg(18, 0, 0, C(kB.pants), C(kB.boot), 0.04, 0, 14, false, false);

    // Full-proportioned black T-shirt back torso
    form(
      () =>
        curve(
          [
            [-54, -126],
            [0, -138],
            [56, -126],
            [50, 22],
            [-48, 22],
          ],
          true
        ),
      C(kB.coat),
      () => {
        poly(
          [
            [-58, -140],
            [-6, -140],
            [-12, 24],
            [-58, 24],
          ],
          C(kB.coatSh)
        );
      }
    );

    // Person B right arm onto A's outer shoulder (keeps A's chin & collar clear)
    limb(42, -112, 86, -124, 19, 15, C(kB.coat));
    at(90, -126, 0.95, () => drawHandShape('open', C(kB.skin), C(kB.skinSh), -0.25));
    // Person B left arm around A's ribcage
    limb(-44, -112, -56, -136, 18, 14, C(kB.coatSh));

    // Person B 1.32x Style 2 rear-3/4 head + low bun, left of A's face
    rr(-18, -152, 32, 24, 6, C(kB.skinSh));
    g.save();
    g.translate(-34, -136);
    g.rotate(0.14);
    g.scale(1.32, 1.32);
    // Warm right cheek & ear peeking on right edge (3/4 rear view)
    ell(44, -44, 14, 24, C(kB.skin));
    ell(49, -42, 8, 12, C(kB.skinSh));
    // Full rounded capsule blonde hair crown
    form(
      () => g.roundRect(-48, -102, 96, 104, [46, 46, 38, 38]),
      C(kB.hair),
      () => {
        poly(
          [
            [-52, -106],
            [-6, -106],
            [-12, 6],
            [-52, 6],
          ],
          C(kB.hairSh)
        );
      }
    );
    // Hair tie + low bun on back-left
    rr(-42, -56, 12, 26, 5, C(kB.coat));
    ell(-54, -43, 22, 20, C(kB.hair));
    ell(-59, -39, 13, 14, C(kB.hairSh));
    g.restore();
    g.restore();

    // 3. OVERLAY: Person A sleeves & open hands across B's back
    g.save();
    g.translate(26, -HIP);
    // A's right arm (screen-left) around B's back
    limb(-50, -120, -94, -76, 20, 16.5, C(kA.coatSh));
    limb(-94, -76, -62, -68 + pat * 0.4, 16, 14, C(kA.coat));
    at(-56, -68 + pat * 0.4, 1.05, () => drawHandShape('open', C(kA.skin), C(kA.skinSh), 0.04));

    // A's left arm (screen-right) across B's shoulder blades
    limb(52, -120, 62, -80, 20, 16.5, C(kA.coat));
    limb(62, -80, -18, -86 - pat, 16.5, 14, C(kA.coat));
    at(-24, -86 - pat, 1.05, () => drawHandShape('open', C(kA.skin), C(kA.skinSh), Math.PI - 0.06));
    g.restore();

    g.restore();
  });
}

// ---- Horse + Mounted Rider ----------------------------------------------
function horseLeg(hx, hy, ph, col, hoof, front, sock) {
  const sw = Math.sin(ph),
    lift = Math.max(0, Math.cos(ph));
  const a1 = sw * 0.36 + (front ? 0.04 : -0.06);
  const kx = hx + Math.sin(a1) * 95,
    ky = hy + Math.cos(a1) * 95;
  const a2 = a1 - lift * (front ? 0.85 : 0.6) + (front ? 0 : 0.16);
  const fx = kx + Math.sin(a2) * 100,
    fy = ky + Math.cos(a2) * 100;
  limb(hx, hy, kx, ky, 25, 15, col);
  limb(kx, ky, fx, fy, 14, 11, col);
  if (sock) limb(lerp(kx, fx, 0.55), lerp(ky, fy, 0.55), fx, fy, 12, 11, sock);
  limb(fx, fy, fx + 5, fy + 13, 12, 14, hoof);
}

function dust(ph, col) {
  for (let k = 0; k < 3; k++) {
    const p = (Math.abs(ph) / 6.283 + k / 3) % 1;
    g.globalAlpha = (1 - p) * 0.55;
    ell(-150 - p * 150, -12 - p * 34, 16 + p * 30, 12 + p * 22, col);
    g.globalAlpha = 1;
  }
}

function horse(o) {
  const p = COAT[o.coat || 'chestnut'] || COAT.chestnut,
    ph = o.ph || 0,
    trd = o.tired || 0,
    rrAmt = o.rear || 0;
  const nod = (o.nod || 0) + trd * 34 + Math.sin(ph * 2) * 5;
  const b = C(p.b),
    s = C(p.s),
    m = C(p.m),
    h = C(p.h),
    sk = o.socks ? C(SOCK) : null;
  if (!o.noShadow) {
    g.globalAlpha = 0.2;
    ell(10, 6, 200, 15, C('#1d1226'));
    g.globalAlpha = 1;
  }
  if (o.dust) dust(ph, C(o.dust));
  g.save();
  if (rrAmt) {
    g.translate(-95, 0);
    g.rotate(-0.34 * rrAmt);
    g.translate(95, 0);
  }
  g.translate(trd ? Math.sin(ph * 18) * 2.5 * trd : 0, Math.sin(ph * 2 + 1) * 4);
  const sway = Math.sin(ph) * 12;
  limb(-140, -262, -190 - sway, -150, 19, 9, m);
  limb(-150, -250, -208 - sway * 1.4, -118, 12, 3, m);
  horseLeg(-98, -212, ph + Math.PI, s, h, false, null);
  horseLeg(104, -212, ph + Math.PI * 1.5, s, h, true, null);
  form(
    () =>
      curve([
        [-150, -250],
        [-110, -300],
        [20, -302],
        [120, -292],
        [150, -240],
        [110, -178],
        [-20, -166],
        [-120, -178],
      ]),
    b,
    () => {
      ell(-10, -150, 190, 52, s);
      ell(-150, -200, 46, 70, s);
    }
  );
  if (o.blanket) {
    form(
      () => g.roundRect(-80, -306, 122, 78, 12),
      C(o.blanket),
      () => {
        g.fillStyle = C('#c9a23f');
        g.fillRect(-80, -240, 122, 7);
      }
    );
    form(
      () => g.roundRect(-58, -318, 86, 30, [16, 16, 8, 8]),
      C('#6b3f26'),
      () => {
        g.fillStyle = C('#4f2c1b');
        g.fillRect(-58, -300, 86, 14);
      }
    );
    limb(-4, -292, 2, -214, 4, 4, C('#4f2c1b'));
  }
  horseLeg(-112, -212, ph, b, h, false, sk);
  horseLeg(92, -212, ph + Math.PI * 0.5, b, h, true, sk);
  const px = 196,
    py = -392 + nod,
    mx = 286,
    my = -322 + nod * 1.4;
  limb(112, -258, px - 6, py + 10, 60, 34, b);
  for (let i = 0; i < 5; i++) {
    const f = i / 4;
    ell(lerp(90, px - 26, f), lerp(-296, py - 4, f) + Math.sin(ph * 2 + i) * 2, 21 - f * 4, 15, m, -0.9);
  }
  poly(
    [
      [px - 18, py - 20],
      [px - 6, py - 64],
      [px + 10, py - 22],
    ],
    m
  );
  poly(
    [
      [px - 2, py - 22],
      [px + 12, py - 58],
      [px + 22, py - 18],
    ],
    b
  );
  limb(px, py, mx, my, 34, 21, b);
  ell(mx + 4, my + 2, 22, 19, s);
  if (o.blaze) limb(px + 22, py + 2, mx - 4, my - 10, 8, 6, C(SOCK));
  ell(px + 4, py - 20, 15, 11, m, -0.5);
  ell(px + 30, py + 14, 6.5, 7.5, C(INK));
  ell(px + 32, py + 12, 2, 2, C('#fffaf0'));
  ell(mx + 14, my, 3, 4, C(p.h));
  const tk = C('#3a2218');
  limb(px + 2, py + 10, mx - 16, my + 12, 2.6, 2.6, tk);
  limb(mx - 22, my - 16, mx - 12, my + 16, 2.8, 2.8, tk);
  limb(px + 14, py - 14, px + 30, py + 30, 2.4, 2.4, tk);
  g.restore();
  return {mouth: [mx - 10, my + 14 + Math.sin(ph * 2 + 1) * 4]};
}

function rider(o) {
  const k = kitOf(o),
    ph = o.ph ?? _T * 5.2,
    c = (n) => C(k[n]);
  g.save();
  g.translate(0, Math.sin(ph * 2 + 1) * 5 + Math.sin(ph * 2 + 2.2) * 3.5);
  limb(-15, -290, 40, -262, 30, 24, c('pants'));
  limb(40, -262, 48, -176, 22, 17, c('pants'));
  if (k.trim === 'buttons') limb(46, -256, 53, -184, 3, 3, C(GOLD));
  limb(48, -176, 48, -150, 18, 18, c('boot'));
  limb(46, -146, 80, -144, 13, 10, c('boot'));
  g.translate(-15, -292);
  g.rotate((o.lean || 0) + Math.sin(ph * 1.4) * 0.03);
  const hx = (o.hand ? o.hand[0] + Math.sin(ph * 2) * 6 : 95) + 15,
    hy = (o.hand ? o.hand[1] + Math.cos(ph * 2) * 6 : -312) + 292;
  upper({...o, ph}, k, ph, hx, hy);
  g.restore();
  return {hand: [hx - 15, hy - 292]};
}

export function mounted(x, y, s, o = {}, flip = false) {
  const o2 = {...o, ph: o.ph ?? (_T * 5.2 + x * 0.012)};
  at(
    x,
    y,
    s,
    () => {
      const h = horse(o2),
        r = rider(o2);
      if (!o2.noReins) {
        g.beginPath();
        g.moveTo(r.hand[0], r.hand[1] + 4);
        g.quadraticCurveTo(
          (r.hand[0] + h.mouth[0]) / 2,
          h.mouth[1] + 40,
          h.mouth[0],
          h.mouth[1]
        );
        g.strokeStyle = C('#3a2218');
        g.lineWidth = 5;
        g.stroke();
      }
    },
    0,
    flip
  );
}

// ---- Scoped Offscreen Draw Entrypoint -----------------------------------
export function withStyle2Context(ctx, t, tint, fn) {
  const prevG = g;
  const prevT = _T;
  const prevCur = _CUR_T;
  const prevTint = TINT;
  g = ctx;
  _T = t;
  _CUR_T = t;
  TINT = tint || null;
  try {
    fn();
  } finally {
    g = prevG;
    _T = prevT;
    _CUR_T = prevCur;
    TINT = prevTint;
  }
}
