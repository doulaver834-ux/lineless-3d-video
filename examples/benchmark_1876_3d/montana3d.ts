import * as THREE from 'three';
import {NOINK} from '../vendor/templates/bridge/ink';
import {ctex as rawCtex, rep as rawRep} from '../vendor/templates/bridge/paint';
import {twoTone, untone as rawUntone} from '../vendor/templates/bridge/shade';

let _monTexSeq = 0;
function ctex(
  w: number,
  h: number,
  draw: (g: CanvasRenderingContext2D, r: () => number) => void
): THREE.CanvasTexture {
  return rawCtex(`mon_${++_monTexSeq}_${w}x${h}`, w, h, draw);
}
function rep(t: THREE.Texture, x: number, y: number): THREE.CanvasTexture {
  return rawRep(t, x, y) as THREE.CanvasTexture;
}
function untone<T extends THREE.Material>(matOrCol: T): T;
function untone(matOrCol: THREE.ColorRepresentation): THREE.MeshBasicMaterial;
function untone(matOrCol: THREE.Material | THREE.ColorRepresentation): THREE.Material {
  if (matOrCol instanceof THREE.Material) return matOrCol;
  return new THREE.MeshBasicMaterial({color: rawUntone(matOrCol), side: THREE.DoubleSide});
}

export interface MontanaState {
  visible: boolean;
  t: number;
}

export interface MontanaWorld {
  root: THREE.Group;
  getTrailHeight: (x: number, z: number) => number;
  update: (state: MontanaState) => void;
}

// ---------------------------------------------------------------------------
// Deterministic Math & Seeded PRNG (Zero Math.random / NaN-safe)
// ---------------------------------------------------------------------------

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothstep(e0: number, e1: number, x: number): number {
  const span = Math.abs(e1 - e0) < 1e-6 ? 1e-6 : e1 - e0;
  const t = clamp01((x - e0) / span);
  return t * t * (3 - 2 * t);
}

function safePow(base: number, exp: number): number {
  return Math.pow(Math.max(0, base), exp);
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function valueNoise2D(x: number, z: number): number {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = zf * zf * (3 - 2 * zf);

  const hash = (ix: number, iz: number): number => {
    let h = Math.imul(ix, 374761393) + Math.imul(iz, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };

  const n00 = hash(xi, zi);
  const n10 = hash(xi + 1, zi);
  const n01 = hash(xi, zi + 1);
  const n11 = hash(xi + 1, zi + 1);
  return lerp(lerp(n00, n10, u), lerp(n01, n11, u), v);
}

// ---------------------------------------------------------------------------
// Analytical Little Bighorn River & Bluff Elevation Profile
// ---------------------------------------------------------------------------

export function riverCenterZ(x: number): number {
  return -34 + 9.5 * Math.sin(x * 0.045) + 4.0 * Math.cos(x * 0.09);
}

function riverSlopeZ(x: number): number {
  return 9.5 * 0.045 * Math.cos(x * 0.045) - 4.0 * 0.09 * Math.sin(x * 0.09);
}

function riverCurvatureZ(x: number): number {
  return -9.5 * 0.045 * 0.045 * Math.sin(x * 0.045) - 4.0 * 0.09 * 0.09 * Math.cos(x * 0.09);
}

function riverHalfWidth(x: number): number {
  return 5.5 + 0.45 * Math.sin(x * 0.065 + 1.2);
}

function riverPerpSignedDist(x: number, z: number): number {
  const dz = z - riverCenterZ(x);
  const slope = riverSlopeZ(x);
  return dz / Math.sqrt(Math.max(1e-6, 1 + slope * slope));
}

function ridgeSpineY(x: number): number {
  // Exact foreground cavalry ridge plateau undulation (~4.5m along x = -25..+25m)
  const core = 4.5 + 0.18 * Math.sin(x * 0.11) + 0.06 * Math.cos(x * 0.27);
  // Subtle natural roll far outside the active cavalry corridor (|x| > 32m)
  const wing = smoothstep(32, 75, Math.abs(x)) * (0.28 * Math.sin(x * 0.055) - 0.22);
  return core + wing;
}

function trailRibbonLift(x: number, z: number): number {
  const centerOffset = 0.12 * Math.sin(x * 0.085);
  const dz = Math.abs(z - centerOffset);
  const across = 1 - smoothstep(0.85, 1.42, dz);
  const along = 1 - smoothstep(48, 62, Math.abs(x));
  return 0.015 * across * along;
}

function terrainHeight(x: number, z: number): number {
  const spine = ridgeSpineY(x);

  // 1. South of the ridge crest (z > +1.45m):
  // Smoothly rounds over z = +1.45..+2.5m and slopes gently DOWNWARD for z > 2.5m
  // Strictly <= 4.4 - (z - 2.5) * 0.08 everywhere for z > 2.5m so +Z cameras
  // (low-angle & crane at z = +5.2..+15.6m) have 100% unobstructed sightlines!
  if (z >= 1.45) {
    const crownAtEdge = spine - 0.015;
    const southSlope =
      4.31 -
      Math.max(0, z - 2.5) * 0.096 +
      0.045 * Math.sin(x * 0.12 + 0.4) * Math.exp(-Math.max(0, z - 2.5) * 0.09);
    if (z <= 2.5) {
      const t = smoothstep(1.45, 2.5, z);
      return lerp(crownAtEdge, southSlope, t);
    }
    const clampedUpper = 4.385 - (z - 2.5) * 0.082;
    return Math.min(clampedUpper, southSlope);
  }

  // 2. Elevated Sandstone Bluff Trail Plateau (z = -1.85m .. +1.45m):
  // Flat-ish packed sandy trail ribbon (~2.6m wide around z = 0)
  if (z >= -1.85) {
    const trailFlatness = smoothstep(1.15, 1.85, Math.abs(z));
    const microCrown = 0.012 * Math.cos(z * 1.1) * (1 - trailFlatness);
    const northLip = smoothstep(-1.35, -1.85, z) * 0.045;
    return spine + microCrown - northLip;
  }

  // 3. Valley Floor + Riverbed + Distant Foothills base elevation (z <= -12.0m, blended from -2.2m)
  const meadowWave =
    0.23 +
    0.09 * Math.sin(x * 0.052 + z * 0.058) +
    0.05 * Math.cos(x * 0.105 - z * 0.075) +
    (valueNoise2D(x * 0.08 + 13.7, z * 0.08 - 7.3) - 0.5) * 0.1;

  // Far valley foothills rising north of z = -72m to cradle the 3D mesas
  const foothillT = smoothstep(-72, -138, z);
  const foothillRise =
    safePow(foothillT, 1.45) *
    (4.6 + 1.35 * Math.sin(x * 0.048 + 0.8) + 0.85 * Math.cos(x * 0.095 - 0.5));

  // Carve winding Little Bighorn riverbed channel (width ~11m, water surface at y = 0.08m)
  const signedDist = riverPerpSignedDist(x, z);
  const absDist = Math.abs(signedDist);
  const halfW = riverHalfWidth(x);

  // Inside bends form shallower gentle point-bar sandbars
  const curv = riverCurvatureZ(x);
  const isInsideBend = signedDist * curv > 0 ? clamp01(Math.abs(curv) * 42) : 0;
  const bankFlatten = 1 - smoothstep(halfW + 0.2, halfW + 4.8, absDist);
  const bankTargetY = lerp(0.16, 0.125, isInsideBend);

  let valleyY = lerp(meadowWave, bankTargetY, bankFlatten * (1 - foothillT)) + foothillRise;

  if (absDist < halfW + 0.45) {
    const chT = 1 - smoothstep(halfW - 1.9, halfW + 0.4, absDist);
    const bedDepth = -0.38 + 0.08 * Math.cos((absDist / Math.max(1, halfW)) * Math.PI * 0.5);
    valleyY = lerp(valleyY, bedDepth, chT);
  }

  if (z <= -12.2) {
    return valleyY;
  }

  // 4. Bluff Lip & Steep Dramatic Sandstone Escarpment (z = -1.85m .. -12.2m)
  if (z > -2.22) {
    const lipT = smoothstep(-1.85, -2.22, z);
    return lerp(spine - 0.045, spine - 0.16, lipT);
  }

  const couleeShift = 0.42 * Math.sin(x * 0.17 + 0.6) + 0.22 * Math.cos(x * 0.31 - 1.1);
  const dropProgress = clamp01((-2.22 - z) / (12.2 - 2.22));

  // Two-stage badlands cliff profile: steep upper cliff + subtle mid sandstone bench + talus skirt
  const cliffCurve = safePow(dropProgress, 0.68);
  const midBench =
    Math.exp(-safePow((dropProgress - 0.46) / 0.16, 2)) *
    (0.26 + 0.1 * Math.sin(x * 0.21));
  const gullyCarve =
    Math.sin(dropProgress * Math.PI) * couleeShift * 0.28;

  const rimStart = spine - 0.16;
  const rawEscarpment = lerp(rimStart, valleyY, cliffCurve) + midBench * (1 - dropProgress) + gullyCarve * (1 - dropProgress * 0.5);
  const endBlend = smoothstep(-10.4, -12.2, z);
  return lerp(rawEscarpment, valleyY, endBlend);
}

// ---------------------------------------------------------------------------
// Lineless Storybook Procedural Canvas Textures (Zero Black Outlines)
// ---------------------------------------------------------------------------

function makeTerrainDetailTex(): THREE.CanvasTexture {
  const W = 512;
  const H = 512;
  const rnd = mulberry32(187601);
  const tex = ctex(W, H, (g) => {
    g.fillStyle = '#f6f1e6';
    g.fillRect(0, 0, W, H);

    // Broad painterly colour-block ground mottling (soft warm cream/sand/ivory tones)
    const tones = ['#efe7d6', '#faf6ed', '#e8dec9', '#f3ecde', '#ebe1cd'];
    for (let i = 0; i < 140; i++) {
      const cx = rnd() * W;
      const cy = rnd() * H;
      const rx = 22 + rnd() * 58;
      const ry = 10 + rnd() * 28;
      const col = tones[Math.floor(rnd() * tones.length)];
      g.fillStyle = col;
      // Tile seamlessly across boundaries
      for (let ox = -W; ox <= W; ox += W) {
        for (let oy = -H; oy <= H; oy += H) {
          if (cx + ox + rx < 0 || cx + ox - rx > W || cy + oy + ry < 0 || cy + oy - ry > H) continue;
          g.beginPath();
          g.ellipse(cx + ox, cy + oy, rx, ry, (rnd() - 0.5) * 0.35, 0, Math.PI * 2);
          g.fill();
        }
      }
    }

    // Subtle warm pebble & grass-tuft flecks
    const flecks = ['#e3d7be', '#fcf9f2', '#dfd2b7'];
    for (let i = 0; i < 220; i++) {
      const cx = rnd() * W;
      const cy = rnd() * H;
      const rx = 3 + rnd() * 8;
      const ry = 2 + rnd() * 4;
      g.fillStyle = flecks[i % flecks.length];
      g.beginPath();
      g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      g.fill();
    }
  });
  return rep(tex, 26, 24);
}

function makeSandyTrailTex(): THREE.CanvasTexture {
  const W = 512;
  const H = 256;
  const rnd = mulberry32(187602);
  const tex = ctex(W, H, (g) => {
    // Warm ochre-tan sandy trail base
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0.0, '#c89f66');
    grad.addColorStop(0.18, '#d4af7a');
    grad.addColorStop(0.5, '#dec08e');
    grad.addColorStop(0.82, '#d4af7a');
    grad.addColorStop(1.0, '#c49a62');
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);

    // Soft packed cavalry track ribbons along U
    g.fillStyle = '#cca46c';
    g.fillRect(0, H * 0.24, W, H * 0.13);
    g.fillRect(0, H * 0.63, W, H * 0.13);

    g.fillStyle = '#e3c798';
    g.fillRect(0, H * 0.43, W, H * 0.14);

    // Painterly tonal sand drifts & warm gravel specks
    const patches = ['#d8b582', '#c49a62', '#e5ca9c', '#bd925a'];
    for (let i = 0; i < 95; i++) {
      const x = rnd() * W;
      const y = 16 + rnd() * (H - 32);
      const rx = 14 + rnd() * 44;
      const ry = 4 + rnd() * 11;
      g.fillStyle = patches[i % patches.length];
      for (let ox = -W; ox <= W; ox += W) {
        g.beginPath();
        g.ellipse(x + ox, y, rx, ry, 0, 0, Math.PI * 2);
        g.fill();
      }
    }

    for (let i = 0; i < 120; i++) {
      const x = rnd() * W;
      const y = 20 + rnd() * (H - 40);
      g.fillStyle = i % 2 === 0 ? '#b68952' : '#ebd3a9';
      g.beginPath();
      g.ellipse(x, y, 2 + rnd() * 4.5, 1.5 + rnd() * 2.5, 0, 0, Math.PI * 2);
      g.fill();
    }
  });
  const configured = rep(tex, 18, 1);
  configured.wrapT = THREE.ClampToEdgeWrapping;
  return configured;
}

function makeSandstoneStrataTex(bands: string[], seed: number): THREE.CanvasTexture {
  const W = 256;
  const H = 256;
  const rnd = mulberry32(seed);
  const tex = ctex(W, H, (g) => {
    g.fillStyle = bands[0];
    g.fillRect(0, 0, W, H);

    // Stratified horizontal sedimentary bands with soft organic waviness
    let y = 0;
    let idx = 0;
    while (y < H) {
      const h = 14 + rnd() * 28;
      g.fillStyle = bands[idx % bands.length];
      g.beginPath();
      g.moveTo(0, y);
      const amp = 2 + rnd() * 4;
      const ph = rnd() * Math.PI * 2;
      for (let x = 0; x <= W; x += 16) {
        const wy = y + Math.sin((x / W) * Math.PI * 2 + ph) * amp;
        g.lineTo(x, wy);
      }
      g.lineTo(W, y + h + 12);
      g.lineTo(0, y + h + 12);
      g.closePath();
      g.fill();
      y += h;
      idx++;
    }

    // Subtle vertical erosional tonal blocks (no outlines)
    for (let i = 0; i < 28; i++) {
      const x = rnd() * W;
      const bw = 8 + rnd() * 22;
      const by = rnd() * H;
      const bh = 24 + rnd() * 64;
      g.globalAlpha = 0.16;
      g.fillStyle = bands[(i + 1) % bands.length];
      g.fillRect(x, by, bw, bh);
    }
    g.globalAlpha = 1.0;
  });
  return rep(tex, 2, 2);
}

function makeRiverWaterTex(): THREE.CanvasTexture {
  const W = 512;
  const H = 256;
  const rnd = mulberry32(187609);
  const tex = ctex(W, H, (g) => {
    // Cross-channel turquoise-cerulean gradient (shallow warm-aqua shores -> deep cerulean current)
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0.0, '#8ad0d1');
    grad.addColorStop(0.11, '#5cb4c9');
    grad.addColorStop(0.32, '#429bb5');
    grad.addColorStop(0.5, '#3b8fa8');
    grad.addColorStop(0.68, '#429bb5');
    grad.addColorStop(0.89, '#5cb4c9');
    grad.addColorStop(1.0, '#8ad0d1');
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);

    // Flowing lineless current ribbons (tileable horizontally across W)
    const ribbonCols = ['#5cb4c9', '#34829c', '#6bc2d4', '#49a3bd'];
    for (let i = 0; i < 36; i++) {
      const yBase = 24 + rnd() * (H - 48);
      const thick = 5 + rnd() * 12;
      const amp = 3 + rnd() * 7;
      const ph = rnd() * Math.PI * 2;
      const freq = 1 + Math.floor(rnd() * 2);
      g.fillStyle = ribbonCols[i % ribbonCols.length];
      g.globalAlpha = 0.45;
      g.beginPath();
      for (let x = 0; x <= W; x += 16) {
        const yy = yBase + Math.sin((x / W) * Math.PI * 2 * freq + ph) * amp;
        if (x === 0) g.moveTo(x, yy);
        else g.lineTo(x, yy);
      }
      for (let x = W; x >= 0; x -= 16) {
        const yy = yBase + thick + Math.sin((x / W) * Math.PI * 2 * freq + ph + 0.3) * amp;
        g.lineTo(x, yy);
      }
      g.closePath();
      g.fill();
    }

    // Sunlit cream-gold longitudinal water ripples
    g.globalAlpha = 0.72;
    for (let i = 0; i < 48; i++) {
      const cx = rnd() * W;
      const cy = 34 + rnd() * (H - 68);
      const rx = 14 + rnd() * 36;
      const ry = 1.8 + rnd() * 2.8;
      g.fillStyle = i % 3 === 0 ? '#fff6dc' : '#f4e6be';
      for (let ox = -W; ox <= W; ox += W) {
        g.beginPath();
        g.ellipse(cx + ox, cy, rx, ry, 0, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.globalAlpha = 1.0;
  });
  const configured = rep(tex, 14, 1);
  configured.wrapT = THREE.ClampToEdgeWrapping;
  return configured;
}

function makeRiverGlintTex(): THREE.CanvasTexture {
  const W = 512;
  const H = 128;
  const rnd = mulberry32(187610);
  const tex = ctex(W, H, (g) => {
    g.clearRect(0, 0, W, H);
    for (let i = 0; i < 42; i++) {
      const cx = rnd() * W;
      const cy = 24 + rnd() * (H - 48);
      const rx = 10 + rnd() * 28;
      const ry = 1.5 + rnd() * 2.4;
      g.fillStyle = i % 2 === 0 ? 'rgba(255, 249, 224, 0.85)' : 'rgba(245, 226, 179, 0.65)';
      for (let ox = -W; ox <= W; ox += W) {
        g.beginPath();
        g.ellipse(cx + ox, cy, rx, ry, 0, 0, Math.PI * 2);
        g.fill();
      }
    }
  });
  const configured = rep(tex, 19, 1);
  configured.wrapT = THREE.ClampToEdgeWrapping;
  return configured;
}

function makeBarkTex(mainHex: string, shadeHex: string, lightHex: string, seed: number): THREE.CanvasTexture {
  const W = 128;
  const H = 256;
  const rnd = mulberry32(seed);
  const tex = ctex(W, H, (g) => {
    g.fillStyle = mainHex;
    g.fillRect(0, 0, W, H);
    for (let i = 0; i < 36; i++) {
      const x = rnd() * W;
      const y = rnd() * H;
      const w = 5 + rnd() * 12;
      const h = 28 + rnd() * 68;
      g.fillStyle = i % 2 === 0 ? shadeHex : lightHex;
      for (let ox = -W; ox <= W; ox += W) {
        g.fillRect(x + ox, y, w, h);
      }
    }
  });
  return rep(tex, 1, 2);
}

function makeFoliageTex(mainHex: string, hiHex: string, shHex: string, seed: number): THREE.CanvasTexture {
  const W = 256;
  const H = 256;
  const rnd = mulberry32(seed);
  const tex = ctex(W, H, (g) => {
    g.fillStyle = mainHex;
    g.fillRect(0, 0, W, H);
    for (let i = 0; i < 55; i++) {
      const cx = rnd() * W;
      const cy = rnd() * H;
      const r = 14 + rnd() * 28;
      g.fillStyle = i % 3 === 0 ? shHex : hiHex;
      g.globalAlpha = 0.42;
      for (let ox = -W; ox <= W; ox += W) {
        for (let oy = -H; oy <= H; oy += H) {
          g.beginPath();
          g.arc(cx + ox, cy + oy, r, 0, Math.PI * 2);
          g.fill();
        }
      }
    }
    g.globalAlpha = 1.0;
  });
  return rep(tex, 1, 1);
}

function makeSkyDomeTex(): THREE.CanvasTexture {
  const W = 256;
  const H = 512;
  const tex = ctex(W, H, (g) => {
    // Sphere UV v=1 at top pole (zenith), v=0.5 at equator (horizon), v=0 at bottom
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0.0, '#5b8fb8');   // Zenith deep Western azure
    grad.addColorStop(0.24, '#6fa0c7');  // Upper afternoon sky
    grad.addColorStop(0.38, '#8cb8d9');  // Soft powder blue (cloud zone)
    grad.addColorStop(0.44, '#c7dce2');  // Soft sunlit horizon mist
    grad.addColorStop(0.485, '#f2d8b3'); // Warm apricot-cream horizon glow behind mesas
    grad.addColorStop(0.53, '#f0d3aa');  // Horizon base
    grad.addColorStop(1.0, '#d9ba91');   // Sub-horizon warm bounce
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);

    // Gentle warm western sunward horizon bloom (seamless across u=0..1 via cosine bell)
    for (let x = 0; x < W; x += 2) {
      const u = x / W;
      const sunBell = safePow(0.5 + 0.5 * Math.cos((u - 0.34) * Math.PI * 2), 3.2);
      if (sunBell > 0.01) {
        const hGrad = g.createLinearGradient(0, H * 0.34, 0, H * 0.56);
        hGrad.addColorStop(0.0, `rgba(255, 244, 214, 0)`);
        hGrad.addColorStop(0.68, `rgba(255, 238, 198, ${(0.34 * sunBell).toFixed(3)})`);
        hGrad.addColorStop(1.0, `rgba(246, 218, 174, 0)`);
        g.fillStyle = hGrad;
        g.fillRect(x, H * 0.34, 3, H * 0.22);
      }
    }
  });
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

function makeSunGlowTex(): THREE.CanvasTexture {
  const S = 256;
  const tex = ctex(S, S, (g) => {
    g.clearRect(0, 0, S, S);
    const half = S * 0.5;
    const rad = g.createRadialGradient(half, half, S * 0.04, half, half, half * 0.96);
    rad.addColorStop(0.0, 'rgba(255, 250, 230, 0.92)');
    rad.addColorStop(0.18, 'rgba(255, 242, 204, 0.72)');
    rad.addColorStop(0.48, 'rgba(248, 224, 178, 0.28)');
    rad.addColorStop(1.0, 'rgba(242, 216, 179, 0.0)');
    g.fillStyle = rad;
    g.fillRect(0, 0, S, S);
  });
  return tex;
}

function makeCloudBankTex(seed: number): THREE.CanvasTexture {
  const W = 512;
  const H = 256;
  const rnd = mulberry32(seed);

  const fillPill = (
    g: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number
  ): void => {
    const r = Math.min(w * 0.5, h * 0.5);
    g.beginPath();
    g.moveTo(x + r, y);
    g.lineTo(x + w - r, y);
    g.quadraticCurveTo(x + w, y, x + w, y + r);
    g.lineTo(x + w, y + h - r);
    g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    g.lineTo(x + r, y + h);
    g.quadraticCurveTo(x, y + h, x, y + h - r);
    g.lineTo(x, y + r);
    g.quadraticCurveTo(x, y, x + r, y);
    g.closePath();
    g.fill();
  };

  const tex = ctex(W, H, (g) => {
    g.clearRect(0, 0, W, H);
    const baseY = 188;

    // 1. Warm underside shadow shelf (#dfc9b8)
    g.fillStyle = '#dfc9b8';
    fillPill(g, 38, baseY - 34, W - 76, 40);
    fillPill(g, 82, baseY - 52, W - 164, 34);

    // 2. Mid warm transition belly (#efe0d2)
    g.fillStyle = '#efe0d2';
    fillPill(g, 48, baseY - 46, W - 96, 36);

    // 3. Billowing sunlit cream-ivory cumulus domes (#fffaf0)
    g.fillStyle = '#fffaf0';
    const puffCount = 5 + Math.floor(rnd() * 3);
    for (let i = 0; i < puffCount; i++) {
      const t = puffCount === 1 ? 0.5 : i / (puffCount - 1);
      const arch = Math.sin(t * Math.PI);
      const cx = lerp(104, W - 104, t) + (rnd() - 0.5) * 24;
      const rx = 44 + arch * 38 + rnd() * 14;
      const ry = 32 + arch * 42 + rnd() * 12;
      const cy = baseY - 40 - arch * 26;
      g.beginPath();
      g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      g.fill();
    }

    // Crisp sunlit top cap pill
    fillPill(g, 58, baseY - 50, W - 116, 30);

    // Re-reinforce clean flat-ish two-tone warm shadow strip along bottom edge
    g.globalCompositeOperation = 'source-atop';
    const shGrad = g.createLinearGradient(0, baseY - 26, 0, baseY + 8);
    shGrad.addColorStop(0.0, 'rgba(223, 201, 184, 0.0)');
    shGrad.addColorStop(0.38, 'rgba(223, 201, 184, 0.88)');
    shGrad.addColorStop(1.0, 'rgba(216, 191, 172, 1.0)');
    g.fillStyle = shGrad;
    g.fillRect(0, baseY - 26, W, 38);
    g.globalCompositeOperation = 'source-over';
  });
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

// ---------------------------------------------------------------------------
// Custom 3D Geological & Botanical Geometry Builders
// ---------------------------------------------------------------------------

function makeFacetedGeo(src: THREE.BufferGeometry): THREE.BufferGeometry {
  const nonIdx = src.index ? src.toNonIndexed() : src.clone();
  nonIdx.computeVertexNormals();
  nonIdx.computeBoundingSphere();
  return nonIdx;
}

function createSandstoneLedgeGeometry(
  width: number,
  height: number,
  depth: number,
  seed: number
): THREE.BufferGeometry {
  const rnd = mulberry32(seed);
  const segs = 8;
  const raw = new THREE.CylinderGeometry(0.52, 0.42, 1.0, segs, 3, false);
  const pos = raw.attributes.position;

  // Perturb rings deterministically to sculpt an angular, cantilevered sandstone rim slab
  const angleJitter: number[] = [];
  for (let s = 0; s <= segs; s++) {
    angleJitter.push(0.82 + rnd() * 0.36);
  }
  angleJitter[segs] = angleJitter[0];

  for (let i = 0; i < pos.count; i++) {
    let vx = pos.getX(i);
    let vy = pos.getY(i);
    let vz = pos.getZ(i);

    const r = Math.hypot(vx, vz);
    if (r > 1e-4) {
      const ang = Math.atan2(vz, vx);
      const bucket = Math.round(((ang + Math.PI) / (Math.PI * 2)) * segs) % segs;
      const jit = angleJitter[bucket];
      // Step-out upper cap, undercut lower cliff face toward -Z
      const tierScale = vy > 0.15 ? 1.12 : vy > -0.18 ? 0.96 : 0.72;
      const cantZ = vy > 0.05 && vz < 0 ? -0.14 : 0.0;
      vx = vx * jit * tierScale * width;
      vz = (vz * jit * tierScale + cantZ) * depth;
    }
    // Flatten top cap cleanly so ledges never spike upward
    if (vy > 0.42) {
      vy = 0.5 + (vy - 0.5) * 0.12;
    }
    pos.setXYZ(i, vx, vy * height, vz);
  }

  const faceted = makeFacetedGeo(raw);
  raw.dispose();
  return faceted;
}

function createBoulderGeometry(radius: number, seed: number): THREE.BufferGeometry {
  const rnd = mulberry32(seed);
  const raw = new THREE.DodecahedronGeometry(radius, 0);
  const pos = raw.attributes.position;

  // Deterministic vertex map so shared corners stay welded before faceting
  const map = new Map<string, [number, number, number]>();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const key = `${x.toFixed(3)}_${y.toFixed(3)}_${z.toFixed(3)}`;
    let displaced = map.get(key);
    if (!displaced) {
      const sx = x * (0.82 + rnd() * 0.38);
      const sy = (y < 0 ? y * 0.52 : y * (0.68 + rnd() * 0.28));
      const sz = z * (0.82 + rnd() * 0.38);
      displaced = [sx, sy, sz];
      map.set(key, displaced);
    }
    pos.setXYZ(i, displaced[0], displaced[1], displaced[2]);
  }

  const faceted = makeFacetedGeo(raw);
  raw.dispose();
  return faceted;
}

function createOrganicPuffGeometry(radius: number, seed: number): THREE.BufferGeometry {
  const rnd = mulberry32(seed);
  const geo = new THREE.IcosahedronGeometry(radius, 2);
  const pos = geo.attributes.position;
  const p1 = rnd() * 6.28;
  const p2 = rnd() * 6.28;
  const p3 = rnd() * 6.28;

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const len = Math.max(1e-5, Math.hypot(x, y, z));
    const nx = x / len;
    const ny = y / len;
    const nz = z / len;
    const lump =
      1.0 +
      0.11 * Math.sin(nx * 3.1 + p1) * Math.cos(nz * 2.7 + p2) +
      0.07 * Math.sin(ny * 3.6 + p3);
    const flatBottom = ny < -0.25 ? 0.84 : 1.0;
    pos.setXYZ(i, x * lump, y * lump * 0.8 * flatBottom, z * lump);
  }
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

function createSoftPineConeGeometry(radius: number, height: number, seed: number): THREE.BufferGeometry {
  const rnd = mulberry32(seed);
  const geo = new THREE.ConeGeometry(radius, height, 11, 3, false);
  const pos = geo.attributes.position;
  const phase = rnd() * Math.PI * 2;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const r = Math.hypot(x, z);
    if (r > 1e-4) {
      const ang = Math.atan2(z, x);
      const scallop = 1.0 + 0.1 * Math.sin(ang * 5 + phase);
      const droop = y < -height * 0.3 ? -0.06 * height * Math.cos(ang * 5 + phase) : 0;
      pos.setXYZ(i, x * scallop, y + droop, z * scallop);
    }
  }
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

interface MesaSpec {
  x: number;
  z: number;
  height: number;
  width: number;
  depth: number;
  tier: 0 | 1 | 2;
  seed: number;
  wingDir: number;
}

function createTerracedMesaGroup(
  spec: MesaSpec,
  capMat: THREE.Material,
  benchMat: THREE.Material,
  talusMat: THREE.Material
): THREE.Group {
  const group = new THREE.Group();
  const rnd = mulberry32(spec.seed);

  const buildTierPrism = (
    rTop: number,
    rBot: number,
    h: number,
    radSegs: number,
    fluteAmp: number,
    scaleX: number,
    scaleZ: number,
    tierSeed: number
  ): THREE.BufferGeometry => {
    const trnd = mulberry32(tierSeed);
    const raw = new THREE.CylinderGeometry(rTop, rBot, h, radSegs, 3, false);
    const pos = raw.attributes.position;

    const radialProfile: number[] = [];
    for (let s = 0; s <= radSegs; s++) {
      const a = (s / radSegs) * Math.PI * 2;
      const flute =
        1.0 +
        fluteAmp * Math.sin(a * 4 + trnd() * 0.8) +
        fluteAmp * 0.65 * Math.cos(a * 7 + trnd() * 1.2) +
        (trnd() - 0.5) * 0.12;
      radialProfile.push(flute);
    }
    radialProfile[radSegs] = radialProfile[0];

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const r = Math.hypot(x, z);
      if (r > 1e-4) {
        const ang = Math.atan2(z, x);
        const normA = ((ang % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        const idx = Math.min(radSegs - 1, Math.round((normA / (Math.PI * 2)) * radSegs));
        const prof = radialProfile[idx];
        // Slight inward cliff waist & crisp flat plateau table top
        const normY = clamp01((y + h * 0.5) / Math.max(1e-4, h));
        const flare = lerp(1.06, 0.97, safePow(normY, 0.75));
        pos.setXYZ(i, x * prof * flare * scaleX, y, z * prof * flare * scaleZ);
      }
    }
    const faceted = makeFacetedGeo(raw);
    raw.dispose();
    return faceted;
  };

  const H = spec.height;
  const sx = spec.width * 0.5;
  const sz = spec.depth * 0.5;

  // 1. Broad fluted badlands talus skirt (lower 44% of height)
  const talusH = H * 0.46;
  const talusGeo = buildTierPrism(0.76, 1.38, talusH, 16, 0.11, sx, sz, spec.seed + 11);
  const talusMesh = new THREE.Mesh(talusGeo, talusMat);
  talusMesh.position.y = talusH * 0.5 - 1.2;
  talusMesh.castShadow = spec.tier === 0;
  talusMesh.receiveShadow = true;
  group.add(talusMesh);

  // 2. Stepped mid sandstone terrace bench (middle 28% of height)
  const benchH = H * 0.30;
  const benchGeo = buildTierPrism(0.64, 0.82, benchH, 14, 0.09, sx, sz, spec.seed + 23);
  const benchMesh = new THREE.Mesh(benchGeo, benchMat);
  benchMesh.position.set((rnd() - 0.5) * 1.8, talusH - 1.5 + benchH * 0.5, (rnd() - 0.5) * 1.2);
  benchMesh.castShadow = spec.tier === 0;
  benchMesh.receiveShadow = true;
  group.add(benchMesh);

  // 3. Sheer flat-topped Montana caprock plateau (upper 34% of height)
  const capH = H * 0.35;
  const capGeo = buildTierPrism(0.56, 0.63, capH, 12, 0.08, sx, sz, spec.seed + 37);
  const capMesh = new THREE.Mesh(capGeo, capMat);
  capMesh.position.set(
    benchMesh.position.x + (rnd() - 0.5) * 1.2,
    talusH + benchH - 2.1 + capH * 0.5,
    benchMesh.position.z
  );
  capMesh.castShadow = spec.tier === 0;
  capMesh.receiveShadow = true;
  group.add(capMesh);

  // 4. Asymmetric flanking castle-butte shoulder wing for authentic Western silhouette
  if (spec.wingDir !== 0) {
    const wingH = H * (0.58 + rnd() * 0.14);
    const wingTalusH = wingH * 0.55;
    const wingCapH = wingH * 0.50;
    const wx = spec.wingDir * sx * (0.78 + rnd() * 0.16);
    const wz = (rnd() - 0.4) * sz * 0.35;

    const wTalusGeo = buildTierPrism(0.52, 0.98, wingTalusH, 11, 0.1, sx * 0.58, sz * 0.62, spec.seed + 51);
    const wTalus = new THREE.Mesh(wTalusGeo, talusMat);
    wTalus.position.set(wx, wingTalusH * 0.5 - 1.2, wz);
    wTalus.receiveShadow = true;
    group.add(wTalus);

    const wCapGeo = buildTierPrism(0.42, 0.5, wingCapH, 10, 0.09, sx * 0.54, sz * 0.56, spec.seed + 67);
    const wCap = new THREE.Mesh(wCapGeo, capMat);
    wCap.position.set(wx + spec.wingDir * 0.6, wingTalusH + wingCapH * 0.5 - 1.7, wz);
    wCap.receiveShadow = true;
    group.add(wCap);
  }

  const groundBase = terrainHeight(spec.x, clamp(spec.z, -136, 28));
  group.position.set(spec.x, groundBase - 0.6, spec.z);
  return group;
}

// ---------------------------------------------------------------------------
// Main Factory: createMontana3D()
// ---------------------------------------------------------------------------

export function createMontana3D(): MontanaWorld {
  const root = new THREE.Group();
  root.name = 'montana';

  // -------------------------------------------------------------------------
  // 1. Golden-Afternoon Sky Dome, Sun Halo & Drifting Two-Tone Clouds (NOINK)
  // -------------------------------------------------------------------------
  const skyTex = makeSkyDomeTex();
  const skyMat = untone(
    new THREE.MeshBasicMaterial({
      map: skyTex,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    })
  );
  // Ellipsoidal dome keeps back horizon around z = -148m (< 180m from any camera!)
  const skyGeo = new THREE.SphereGeometry(1, 48, 32);
  const skyDome = new THREE.Mesh(skyGeo, skyMat);
  skyDome.scale.set(168, 110, 118);
  skyDome.position.set(0, 4.5, -30);
  skyDome.renderOrder = -20;
  skyDome.layers.set(NOINK);
  root.add(skyDome);

  // Soft warm afternoon sun glow tucked in the upper-western sky
  const sunGlowTex = makeSunGlowTex();
  const sunGlowMat = untone(
    new THREE.MeshBasicMaterial({
      map: sunGlowTex,
      transparent: true,
      depthWrite: false,
      fog: false,
    })
  );
  const sunDisc = new THREE.Mesh(new THREE.PlaneGeometry(54, 54), sunGlowMat);
  sunDisc.position.set(-56, 36, -141);
  sunDisc.lookAt(0, 6, 8);
  sunDisc.renderOrder = -18;
  sunDisc.layers.set(NOINK);
  root.add(sunDisc);

  // 7 Sculpted Lineless Two-Tone Cloud Banks (#fffaf0 top, #dfc9b8 warm underside)
  interface CloudEntry {
    mesh: THREE.Mesh;
    baseX: number;
    baseY: number;
    speed: number;
    phase: number;
  }
  const clouds: CloudEntry[] = [];
  const cloudSpecs = [
    {x: -78, y: 31, z: -134, w: 46, h: 21, speed: 0.42, seed: 4101},
    {x: -34, y: 38, z: -128, w: 52, h: 24, speed: 0.36, seed: 4102},
    {x: 16, y: 34, z: -136, w: 48, h: 22, speed: 0.40, seed: 4103},
    {x: 68, y: 29, z: -132, w: 44, h: 20, speed: 0.38, seed: 4104},
    {x: -56, y: 25, z: -106, w: 36, h: 16, speed: 0.52, seed: 4105},
    {x: -4, y: 27, z: -112, w: 38, h: 17, speed: 0.48, seed: 4106},
    {x: 48, y: 24, z: -104, w: 34, h: 15, speed: 0.55, seed: 4107},
  ];
  for (let i = 0; i < cloudSpecs.length; i++) {
    const cs = cloudSpecs[i];
    const cTex = makeCloudBankTex(cs.seed);
    const cMat = untone(
      new THREE.MeshBasicMaterial({
        map: cTex,
        transparent: true,
        depthWrite: false,
        alphaTest: 0.02,
        fog: false,
      })
    );
    const cMesh = new THREE.Mesh(new THREE.PlaneGeometry(cs.w, cs.h), cMat);
    cMesh.position.set(cs.x, cs.y, cs.z);
    cMesh.renderOrder = -15 + i;
    cMesh.layers.set(NOINK);
    root.add(cMesh);
    clouds.push({
      mesh: cMesh,
      baseX: cs.x,
      baseY: cs.y,
      speed: cs.speed,
      phase: i * 1.37,
    });
  }

  // -------------------------------------------------------------------------
  // 2. High-Resolution 3D Displaced Badlands Ridge & Valley Terrain (180m x 170m)
  // -------------------------------------------------------------------------
  const TERRAIN_W = 180;
  const TERRAIN_D = 170; // z spans [-140m .. +30m], centered at z = -55m
  const Z_MIN = -140;
  const Z_MAX = 30;
  const SEG_X = 200;
  const SEG_Z = 200;

  const terrainGeo = new THREE.PlaneGeometry(TERRAIN_W, TERRAIN_D, SEG_X, SEG_Z);
  terrainGeo.rotateX(-Math.PI / 2);

  const tPos = terrainGeo.attributes.position;
  const tUv = terrainGeo.attributes.uv;
  const vColors = new Float32Array(tPos.count * 3);

  // Palette swatches (Three.js Color converts CSS hex from sRGB to working linear color space)
  const colTrailLight = new THREE.Color('#dfc08e');
  const colTrailMid = new THREE.Color('#d4af7a');
  const colGrassGold = new THREE.Color('#ccb064');
  const colGrassOlive = new THREE.Color('#ae944c');
  const colCliffBuff = new THREE.Color('#cf8b58');
  const colCliffTerra = new THREE.Color('#b86f46');
  const colCliffSienna = new THREE.Color('#9e5836');
  const colTalus = new THREE.Color('#b08d5e');
  const colMeadowLight = new THREE.Color('#83995b');
  const colMeadowDeep = new THREE.Color('#687d46');
  const colMeadowSun = new THREE.Color('#95a864');
  const colSandbar = new THREE.Color('#dfd0aa');
  const colGravel = new THREE.Color('#cdb68c');
  const colRiverBed = new THREE.Color('#47787c');
  const colFarHaze = new THREE.Color('#8e96a6');
  const tmpCol = new THREE.Color();
  const cliffCol = new THREE.Color();
  const valCol = new THREE.Color();

  // Concentrated Z-mapping gives ~0.34m precision across the ridge trail & steep bluff lip
  // while spanning the full 170m [-140m .. +30m] range smoothly!
  const mapGridZ = (vNorm: number): number => {
    // vNorm in [0..1] from Z_MIN (-140) to Z_MAX (+30); ridge z=0 is around vNorm = 0.8235
    const focus = 0.8235;
    const d = vNorm - focus;
    const warped = vNorm - 0.11 * Math.sin((d / 0.85) * Math.PI) * Math.exp(-d * d * 7.5);
    return lerp(Z_MIN, Z_MAX, clamp01(warped));
  };

  for (let i = 0; i < tPos.count; i++) {
    const rawX = tPos.getX(i);
    const rawZ = tPos.getZ(i); // [-85 .. +85]
    const vNorm = clamp01((rawZ + TERRAIN_D * 0.5) / TERRAIN_D);

    // Subtle lateral widening far down-valley so wide lenses never glimpse side borders
    const farWide = 1 + smoothstep(-35, -138, mapGridZ(vNorm)) * 0.42;
    const wx = rawX * farWide;
    const wz = mapGridZ(vNorm);
    const wy = terrainHeight(wx, wz);

    tPos.setXYZ(i, wx, wy, wz);
    tUv.setXY(i, (wx + 90) / 180, (wz - Z_MIN) / TERRAIN_D);

    // Compute cohesive Lineless Storybook multi-zone vertex color
    const patchN = valueNoise2D(wx * 0.09 + 5.1, wz * 0.09 + 2.7);
    const fineN = valueNoise2D(wx * 0.24 - 3.4, wz * 0.24 + 9.2);

    if (wz >= -1.9) {
      // Ridge plateau & south prairie grass slope
      tmpCol.lerpColors(colGrassOlive, colGrassGold, clamp01(patchN * 0.85 + fineN * 0.25));
      const trailCenter = 0.12 * Math.sin(wx * 0.085);
      const trailMask = 1 - smoothstep(1.05, 1.65, Math.abs(wz - trailCenter));
      if (trailMask > 0.001) {
        valCol.lerpColors(colTrailMid, colTrailLight, fineN);
        tmpCol.lerp(valCol, trailMask);
      }
    } else if (wz > -12.0) {
      // Steep stratified terracotta/ochre sandstone bluff face + talus transition
      const strataWave = wy + 0.14 * Math.sin(wx * 0.19) + (fineN - 0.5) * 0.18;
      if (strataWave > 3.55) {
        cliffCol.lerpColors(colCliffTerra, colCliffBuff, smoothstep(3.55, 4.2, strataWave));
      } else if (strataWave > 2.55) {
        cliffCol.lerpColors(colCliffSienna, colCliffTerra, smoothstep(2.55, 3.55, strataWave));
      } else if (strataWave > 1.55) {
        cliffCol.lerpColors(colCliffBuff, colCliffSienna, smoothstep(1.55, 2.55, strataWave));
      } else {
        cliffCol.lerpColors(colTalus, colCliffBuff, smoothstep(0.6, 1.55, strataWave));
      }
      // Blend top/bottom smoothly into ridge grass and valley meadow
      const topRimBlend = 1 - smoothstep(-1.9, -2.45, wz);
      const botMeadowBlend = smoothstep(-9.2, -12.0, wz);
      valCol.lerpColors(colMeadowDeep, colMeadowLight, patchN);
      tmpCol.copy(cliffCol);
      if (topRimBlend > 0) tmpCol.lerp(colGrassGold, topRimBlend * 0.75);
      if (botMeadowBlend > 0) tmpCol.lerp(valCol, botMeadowBlend);
    } else {
      // Wide Little Bighorn valley meadow, gravel sandbars & far atmospheric foothills
      tmpCol.lerpColors(colMeadowDeep, colMeadowLight, patchN);
      if (fineN > 0.58) {
        tmpCol.lerp(colMeadowSun, (fineN - 0.58) * 1.2);
      }

      // River sandbars & wet channel
      const absRiv = Math.abs(riverPerpSignedDist(wx, wz));
      const halfW = riverHalfWidth(wx);
      const bankMask = (1 - smoothstep(halfW + 0.4, halfW + 3.6, absRiv)) * (1 - smoothstep(-68, -78, wz));
      if (bankMask > 0.001) {
        valCol.lerpColors(colGravel, colSandbar, fineN);
        tmpCol.lerp(valCol, bankMask);
      }
      if (absRiv < halfW + 0.2) {
        const wetMask = 1 - smoothstep(halfW - 1.2, halfW + 0.2, absRiv);
        tmpCol.lerp(colRiverBed, wetMask);
      }

      // Atmospheric depth shift toward dusty blue-violet mesas in far foothills
      const hazeT = smoothstep(-74, -134, wz);
      if (hazeT > 0.001) {
        tmpCol.lerp(colFarHaze, hazeT * 0.72);
      }
    }

    vColors[i * 3] = tmpCol.r;
    vColors[i * 3 + 1] = tmpCol.g;
    vColors[i * 3 + 2] = tmpCol.b;
  }

  terrainGeo.setAttribute('color', new THREE.BufferAttribute(vColors, 3));
  terrainGeo.computeVertexNormals();
  terrainGeo.computeBoundingSphere();

  const terrainDetailTex = makeTerrainDetailTex();
  const terrainMat = twoTone(
    new THREE.MeshLambertMaterial({
      vertexColors: true,
      map: terrainDetailTex,
    })
  );
  const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
  terrainMesh.receiveShadow = true;
  // Escarpment casts subtle terrain shadow into valley floor without blocking ridge light
  terrainMesh.castShadow = false;
  root.add(terrainMesh);

  // Conformal 3D Packed Sandy Cavalry Trail Ribbon (~2.7m wide along z = 0)
  const TRAIL_LEN = 120;
  const TRAIL_W = 2.84;
  const trailGeo = new THREE.PlaneGeometry(TRAIL_LEN, TRAIL_W, 150, 12);
  trailGeo.rotateX(-Math.PI / 2);
  const trPos = trailGeo.attributes.position;
  for (let i = 0; i < trPos.count; i++) {
    const tx = trPos.getX(i);
    const localZ = trPos.getZ(i);
    const wz = localZ + 0.12 * Math.sin(tx * 0.085);
    const edgeDrop = smoothstep(1.0, 1.42, Math.abs(localZ)) * 0.022;
    const wy = terrainHeight(tx, wz) + trailRibbonLift(tx, wz) - edgeDrop;
    trPos.setXYZ(i, tx, wy, wz);
  }
  trailGeo.computeVertexNormals();
  trailGeo.computeBoundingSphere();

  const trailTex = makeSandyTrailTex();
  const trailMat = twoTone(
    new THREE.MeshLambertMaterial({
      map: trailTex,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -2,
    })
  );
  const trailMesh = new THREE.Mesh(trailGeo, trailMat);
  trailMesh.receiveShadow = true;
  root.add(trailMesh);

  // -------------------------------------------------------------------------
  // 3. Sculpted 3D Angular Sandstone Bluff Ledges & Outcrops (z = -2.4m .. -5.8m)
  // -------------------------------------------------------------------------
  const bluffSandstoneTex = makeSandstoneStrataTex(
    ['#cf8b58', '#b86f46', '#9e5836', '#dba06f', '#ab613c'],
    187603
  );
  const bluffRockMat = twoTone(
    new THREE.MeshLambertMaterial({
      map: bluffSandstoneTex,
    })
  );

  const ledgeGroup = new THREE.Group();
  const ledgeRng = mulberry32(187621);
  const ledgePrototypes = [
    createSandstoneLedgeGeometry(4.4, 1.55, 2.5, 501),
    createSandstoneLedgeGeometry(3.5, 1.35, 2.1, 502),
    createSandstoneLedgeGeometry(5.2, 1.75, 2.8, 503),
    createSandstoneLedgeGeometry(2.9, 1.15, 1.8, 504),
  ];

  // Upper rim cantilevered sandstone ledges & mid-cliff stepped outcrops
  for (let idx = 0; idx < 30; idx++) {
    const lx = lerp(-54, 54, (idx + 0.25 + ledgeRng() * 0.5) / 30);
    const isUpper = idx % 2 === 0;
    const lz = isUpper
      ? lerp(-2.55, -3.65, ledgeRng())
      : lerp(-3.9, -5.55, ledgeRng());

    const proto = ledgePrototypes[idx % ledgePrototypes.length];
    const ledge = new THREE.Mesh(proto, bluffRockMat);
    const sx = 0.85 + ledgeRng() * 0.48;
    const sy = 0.85 + ledgeRng() * 0.42;
    const sz = 0.85 + ledgeRng() * 0.35;
    ledge.scale.set(sx, sy, sz);

    const groundY = terrainHeight(lx, lz);
    const halfH = (1.45 * sy) * 0.5;
    // Strictly cap top surface BELOW ridge trail elevation so nothing blocks horses' hooves or vista
    const maxTopY = ridgeSpineY(lx) - (isUpper ? 0.16 : 0.72);
    const targetCenterY = Math.min(groundY + 0.18, maxTopY - halfH);

    ledge.position.set(lx, targetCenterY, lz);
    ledge.rotation.y = (ledgeRng() - 0.5) * 0.38;
    ledge.rotation.x = 0.04 + ledgeRng() * 0.08;
    ledge.rotation.z = (ledgeRng() - 0.5) * 0.08;
    ledge.castShadow = true;
    ledge.receiveShadow = true;
    ledgeGroup.add(ledge);
  }

  // Talus sandstone boulders scattered along lower bluff bench (z = -6.0m .. -10.8m)
  const boulderGeos = [
    createBoulderGeometry(0.65, 601),
    createBoulderGeometry(0.48, 602),
    createBoulderGeometry(0.82, 603),
  ];
  for (let i = 0; i < 28; i++) {
    const bx = lerp(-58, 58, ledgeRng());
    const bz = lerp(-5.8, -10.8, ledgeRng());
    const bMesh = new THREE.Mesh(boulderGeos[i % boulderGeos.length], bluffRockMat);
    const s = 0.65 + ledgeRng() * 0.85;
    bMesh.scale.set(s * (0.9 + ledgeRng() * 0.3), s * 0.72, s);
    bMesh.position.set(bx, terrainHeight(bx, bz) + 0.08 * s, bz);
    bMesh.rotation.set((ledgeRng() - 0.5) * 0.3, ledgeRng() * Math.PI * 2, (ledgeRng() - 0.5) * 0.3);
    bMesh.castShadow = true;
    bMesh.receiveShadow = true;
    ledgeGroup.add(bMesh);
  }
  root.add(ledgeGroup);

  // -------------------------------------------------------------------------
  // 4. Winding Little Bighorn River Ribbon (y = 0.08m, NOINK) & Sandbars
  // -------------------------------------------------------------------------
  const buildRiverRibbonGeo = (widthScale: number, yLevel: number): THREE.BufferGeometry => {
    const xMin = -124;
    const xMax = 124;
    const segU = 220;
    const segV = 8;
    const vertCount = (segU + 1) * (segV + 1);
    const positions = new Float32Array(vertCount * 3);
    const normals = new Float32Array(vertCount * 3);
    const uvs = new Float32Array(vertCount * 2);
    const indices: number[] = [];

    let pIdx = 0;
    let uvIdx = 0;
    for (let iu = 0; iu <= segU; iu++) {
      const u = iu / segU;
      const rx = lerp(xMin, xMax, u);
      const rz = riverCenterZ(rx);
      const slope = riverSlopeZ(rx);
      const invLen = 1 / Math.sqrt(Math.max(1e-6, 1 + slope * slope));
      // Unit normal perpendicular to river tangent in XZ plane
      const nx = -slope * invLen;
      const nz = invLen;
      const hw = riverHalfWidth(rx) * widthScale;

      for (let iv = 0; iv <= segV; iv++) {
        const v = iv / segV;
        const offset = (v - 0.5) * 2 * hw;
        positions[pIdx] = rx + nx * offset;
        positions[pIdx + 1] = yLevel;
        positions[pIdx + 2] = rz + nz * offset;
        normals[pIdx] = 0;
        normals[pIdx + 1] = 1;
        normals[pIdx + 2] = 0;
        pIdx += 3;

        uvs[uvIdx] = u;
        uvs[uvIdx + 1] = v;
        uvIdx += 2;
      }
    }

    const row = segV + 1;
    for (let iu = 0; iu < segU; iu++) {
      for (let iv = 0; iv < segV; iv++) {
        const a = iu * row + iv;
        const b = (iu + 1) * row + iv;
        const c = (iu + 1) * row + (iv + 1);
        const d = iu * row + (iv + 1);
        indices.push(a, d, b);
        indices.push(b, d, c);
      }
    }

    const rGeo = new THREE.BufferGeometry();
    rGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    rGeo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    rGeo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    rGeo.setIndex(indices);
    rGeo.computeBoundingSphere();
    return rGeo;
  };

  const waterTex = makeRiverWaterTex();
  const waterMat = untone(
    new THREE.MeshBasicMaterial({
      map: waterTex,
      side: THREE.DoubleSide,
      fog: false,
    })
  );
  const riverMesh = new THREE.Mesh(buildRiverRibbonGeo(1.02, 0.08), waterMat);
  riverMesh.layers.set(NOINK);
  root.add(riverMesh);

  // Shimmering cream-gold ripple glint layer at y = 0.092m
  const glintTex = makeRiverGlintTex();
  const glintMat = untone(
    new THREE.MeshBasicMaterial({
      map: glintTex,
      transparent: true,
      opacity: 0.52,
      side: THREE.DoubleSide,
      depthWrite: false,
      fog: false,
    })
  );
  const glintMesh = new THREE.Mesh(buildRiverRibbonGeo(0.76, 0.092), glintMat);
  glintMesh.layers.set(NOINK);
  root.add(glintMesh);

  // Sculpted gravel / sandbar point-bars (#d8c39a) along river bends
  const sandbarTex = ctex(256, 128, (g) => {
    g.fillStyle = '#d8c39a';
    g.fillRect(0, 0, 256, 128);
    const sbRnd = mulberry32(187644);
    const cols = ['#e3d1ac', '#ccb58a', '#dfd0aa'];
    for (let i = 0; i < 45; i++) {
      g.fillStyle = cols[i % cols.length];
      g.beginPath();
      g.ellipse(sbRnd() * 256, sbRnd() * 128, 12 + sbRnd() * 28, 4 + sbRnd() * 9, 0, 0, Math.PI * 2);
      g.fill();
    }
  });
  rep(sandbarTex, 3, 1);
  const sandbarMat = twoTone(
    new THREE.MeshLambertMaterial({
      map: sandbarTex,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    })
  );

  const sandbarGeo = new THREE.CylinderGeometry(1.0, 1.35, 0.09, 14, 1);
  sandbarGeo.scale(1.0, 1.0, 0.36);
  const sandbarGroup = new THREE.Group();
  for (let bx = -84; bx <= 84; bx += 14) {
    const curv = riverCurvatureZ(bx);
    if (Math.abs(curv) < 0.004) continue;
    const insideSign = curv > 0 ? 1 : -1;
    const slope = riverSlopeZ(bx);
    const invLen = 1 / Math.sqrt(Math.max(1e-6, 1 + slope * slope));
    const nx = -slope * invLen;
    const nz = invLen;
    const dist = riverHalfWidth(bx) + 0.55;

    const sb = new THREE.Mesh(sandbarGeo, sandbarMat);
    const barW = 5.4 + Math.abs(curv) * 140;
    sb.scale.set(barW, 1.0, 4.2);
    sb.position.set(bx + nx * insideSign * dist, 0.088, riverCenterZ(bx) + nz * insideSign * dist);
    sb.rotation.y = -Math.atan2(slope, 1);
    sb.receiveShadow = true;
    sandbarGroup.add(sb);
  }
  root.add(sandbarGroup);

  // -------------------------------------------------------------------------
  // 5. Valley Groves: Stylized 3D Cottonwood & Ponderosa Pine Trees (z = -15m .. -68m)
  // -------------------------------------------------------------------------
  const cottonBarkMat = twoTone(
    new THREE.MeshLambertMaterial({
      map: makeBarkTex('#6e5540', '#543f2f', '#826850', 7101),
    })
  );
  const pineBarkMat = twoTone(
    new THREE.MeshLambertMaterial({
      map: makeBarkTex('#6b4730', '#4f3321', '#80583e', 7102),
    })
  );

  const foliageDeepMat = twoTone(
    new THREE.MeshLambertMaterial({
      map: makeFoliageTex('#4e6e44', '#5c7f50', '#3d5935', 7201),
    })
  );
  const foliageMidMat = twoTone(
    new THREE.MeshLambertMaterial({
      map: makeFoliageTex('#628250', '#74965f', '#4f6b3f', 7202),
    })
  );
  const foliageGoldMat = twoTone(
    new THREE.MeshLambertMaterial({
      map: makeFoliageTex('#8ca15a', '#9eb468', '#738747', 7203),
    })
  );

  const treeShadowMat = twoTone(
    new THREE.MeshLambertMaterial({
      color: '#4b5c37',
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -2,
    })
  );
  const shadowDiscGeo = new THREE.CircleGeometry(1.0, 12);
  shadowDiscGeo.rotateX(-Math.PI / 2);

  // Shared tree part geometries
  const cottonTrunkGeo = new THREE.CylinderGeometry(0.16, 0.28, 2.2, 7);
  cottonTrunkGeo.translate(0, 1.1, 0);
  const cottonBranchGeo = new THREE.CylinderGeometry(0.09, 0.15, 1.4, 6);
  cottonBranchGeo.translate(0, 0.7, 0);

  const puffGeos = [
    createOrganicPuffGeometry(1.35, 801),
    createOrganicPuffGeometry(1.08, 802),
    createOrganicPuffGeometry(0.92, 803),
  ];

  const pineTrunkGeo = new THREE.CylinderGeometry(0.12, 0.24, 2.5, 7);
  pineTrunkGeo.translate(0, 1.25, 0);
  const pineConeBot = createSoftPineConeGeometry(1.35, 2.5, 901);
  const pineConeMid = createSoftPineConeGeometry(1.05, 2.2, 902);
  const pineConeTop = createSoftPineConeGeometry(0.74, 1.85, 903);

  const valleyTreesGroup = new THREE.Group();
  const swayCanopies: {obj: THREE.Object3D; phase: number; amp: number}[] = [];
  const treeRng = mulberry32(187655);

  const buildCottonwood = (tx: number, tz: number, scale: number, seedIdx: number): void => {
    const gy = terrainHeight(tx, tz);
    const grp = new THREE.Group();
    grp.position.set(tx, gy - 0.05, tz);
    grp.scale.setScalar(scale);

    const disc = new THREE.Mesh(shadowDiscGeo, treeShadowMat);
    disc.scale.set(1.75, 1, 1.55);
    disc.position.y = 0.07;
    grp.add(disc);

    const trunk = new THREE.Mesh(cottonTrunkGeo, cottonBarkMat);
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    grp.add(trunk);

    const b1 = new THREE.Mesh(cottonBranchGeo, cottonBarkMat);
    b1.position.set(0, 1.55, 0);
    b1.rotation.set(0.18, seedIdx * 1.1, 0.38);
    b1.castShadow = true;
    grp.add(b1);

    const b2 = new THREE.Mesh(cottonBranchGeo, cottonBarkMat);
    b2.position.set(0, 1.65, 0);
    b2.rotation.set(-0.2, seedIdx * 1.1 + 2.1, -0.34);
    b2.castShadow = true;
    grp.add(b2);

    const crown = new THREE.Group();
    crown.position.y = 2.75;
    const primaryMat = seedIdx % 3 === 0 ? foliageGoldMat : foliageMidMat;
    const accentMat = seedIdx % 2 === 0 ? foliageGoldMat : foliageDeepMat;

    const pMain = new THREE.Mesh(puffGeos[0], primaryMat);
    pMain.position.set(0, 0.35, 0);
    pMain.castShadow = true;
    pMain.receiveShadow = true;
    crown.add(pMain);

    const pLeft = new THREE.Mesh(puffGeos[1], accentMat);
    pLeft.position.set(-0.82, 0.05, 0.25);
    pLeft.castShadow = true;
    pLeft.receiveShadow = true;
    crown.add(pLeft);

    const pRight = new THREE.Mesh(puffGeos[2], foliageGoldMat);
    pRight.position.set(0.78, 0.18, -0.22);
    pRight.castShadow = true;
    pRight.receiveShadow = true;
    crown.add(pRight);

    const pTop = new THREE.Mesh(puffGeos[2], primaryMat);
    pTop.position.set(0.12, 0.92, 0.08);
    pTop.castShadow = true;
    pTop.receiveShadow = true;
    crown.add(pTop);

    crown.rotation.y = (seedIdx * 1.93) % (Math.PI * 2);
    grp.add(crown);
    valleyTreesGroup.add(grp);

    swayCanopies.push({obj: crown, phase: seedIdx * 0.83, amp: 0.016});
  };

  const buildPonderosaPine = (tx: number, tz: number, scale: number, seedIdx: number): void => {
    const gy = terrainHeight(tx, tz);
    const grp = new THREE.Group();
    grp.position.set(tx, gy - 0.05, tz);
    grp.scale.setScalar(scale);

    const disc = new THREE.Mesh(shadowDiscGeo, treeShadowMat);
    disc.scale.set(1.35, 1, 1.35);
    disc.position.y = 0.07;
    grp.add(disc);

    const trunk = new THREE.Mesh(pineTrunkGeo, pineBarkMat);
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    grp.add(trunk);

    const tiers = new THREE.Group();
    const matA = seedIdx % 3 === 0 ? foliageMidMat : foliageDeepMat;
    const matB = seedIdx % 2 === 0 ? foliageDeepMat : foliageMidMat;

    const c1 = new THREE.Mesh(pineConeBot, matA);
    c1.position.y = 2.45;
    c1.castShadow = true;
    c1.receiveShadow = true;
    tiers.add(c1);

    const c2 = new THREE.Mesh(pineConeMid, matB);
    c2.position.y = 3.75;
    c2.rotation.y = 0.6;
    c2.castShadow = true;
    c2.receiveShadow = true;
    tiers.add(c2);

    const c3 = new THREE.Mesh(pineConeTop, foliageMidMat);
    c3.position.y = 4.88;
    c3.rotation.y = 1.2;
    c3.castShadow = true;
    c3.receiveShadow = true;
    tiers.add(c3);

    grp.rotation.y = (seedIdx * 2.39) % (Math.PI * 2);
    grp.add(tiers);
    valleyTreesGroup.add(grp);

    swayCanopies.push({obj: tiers, phase: seedIdx * 1.17, amp: 0.01});
  };

  // Place 62 riparian cottonwoods in organic gallery groves along the Little Bighorn banks
  let placedTrees = 0;
  for (let attempt = 0; attempt < 180 && placedTrees < 62; attempt++) {
    const tx = lerp(-82, 82, treeRng());
    const side = treeRng() < 0.52 ? 1 : -1;
    const bankOffset = riverHalfWidth(tx) + 2.4 + safePow(treeRng(), 1.4) * 14.5;
    const tz = riverCenterZ(tx) + side * bankOffset;
    if (tz > -14.8 || tz < -68.5) continue;
    if (Math.abs(riverPerpSignedDist(tx, tz)) < riverHalfWidth(tx) + 1.8) continue;

    // Clump naturally via low-frequency grove density
    const groveMask = valueNoise2D(tx * 0.07 + 3.1, tz * 0.07 - 4.2);
    if (groveMask < 0.26 && treeRng() > 0.35) continue;

    const scale = 0.82 + treeRng() * 0.56;
    buildCottonwood(tx, tz, scale, placedTrees);
    placedTrees++;
  }

  // Place 44 ponderosa pines across valley benches, coulee mouths & foothills (z = -15m .. -68m)
  let placedPines = 0;
  for (let attempt = 0; attempt < 160 && placedPines < 44; attempt++) {
    const tx = lerp(-85, 85, treeRng());
    const tz = lerp(-15.0, -68.0, treeRng());
    const rDist = Math.abs(riverPerpSignedDist(tx, tz));
    if (rDist < riverHalfWidth(tx) + 3.2) continue;

    const scale = 0.8 + treeRng() * 0.62;
    buildPonderosaPine(tx, tz, scale, 100 + placedPines);
    placedPines++;
  }
  root.add(valleyTreesGroup);

  // -------------------------------------------------------------------------
  // 6. Layered 3D Montana Mesas & Terraced Badland Buttes (z = -78m .. -126m)
  // -------------------------------------------------------------------------
  // Near tier (z ~ -78m): warm sunlit terracotta-ochre sandstone
  const nearCapMat = twoTone(
    new THREE.MeshLambertMaterial({
      map: makeSandstoneStrataTex(['#cb8556', '#b86f46', '#d99968', '#a35c39'], 9101),
    })
  );
  const nearBenchMat = twoTone(
    new THREE.MeshLambertMaterial({
      map: makeSandstoneStrataTex(['#c2845a', '#ad6c47', '#cfa074'], 9102),
    })
  );
  const nearTalusMat = twoTone(
    new THREE.MeshLambertMaterial({
      color: '#b58d63',
    })
  );

  // Mid tier (z ~ -98m): golden-hazed rose-ochre & warm dusty sandstone
  const midCapMat = twoTone(
    new THREE.MeshLambertMaterial({
      map: makeSandstoneStrataTex(['#b68978', '#a4776b', '#c49b87', '#966c63'], 9201),
    })
  );
  const midBenchMat = twoTone(
    new THREE.MeshLambertMaterial({
      color: '#ab8679',
    })
  );
  const midTalusMat = twoTone(
    new THREE.MeshLambertMaterial({
      color: '#9e887e',
    })
  );

  // Far tier (z ~ -122m): dusty blue-violet distant Montana tablelands
  const farCapMat = twoTone(
    new THREE.MeshLambertMaterial({
      map: makeSandstoneStrataTex(['#8a92ad', '#7b84a1', '#9aa0b8', '#707996'], 9301),
    })
  );
  const farBenchMat = twoTone(
    new THREE.MeshLambertMaterial({
      color: '#848ca6',
    })
  );
  const farTalusMat = twoTone(
    new THREE.MeshLambertMaterial({
      color: '#9398ae',
    })
  );

  const mesaSpecs: MesaSpec[] = [
    // Near badland buttes (z = -78m .. -82m, heights 14.5m .. 19m)
    {x: -56, z: -78, height: 17.5, width: 28, depth: 20, tier: 0, seed: 301, wingDir: 1},
    {x: -11, z: -81, height: 14.8, width: 23, depth: 17, tier: 0, seed: 302, wingDir: -1},
    {x: 46, z: -79, height: 18.6, width: 30, depth: 21, tier: 0, seed: 303, wingDir: -1},

    // Mid terraced mesas (z = -97m .. -101m, heights 21m .. 25.5m)
    {x: -86, z: -98, height: 22.8, width: 38, depth: 25, tier: 1, seed: 304, wingDir: 1},
    {x: -34, z: -98, height: 24.6, width: 40, depth: 26, tier: 1, seed: 305, wingDir: 1},
    {x: 20, z: -100, height: 22.2, width: 36, depth: 24, tier: 1, seed: 306, wingDir: -1},
    {x: 78, z: -97, height: 25.2, width: 40, depth: 26, tier: 1, seed: 307, wingDir: -1},

    // Far monumental horizon mesas (z = -121m .. -125m, heights 29m .. 32m)
    {x: -54, z: -122, height: 30.6, width: 58, depth: 32, tier: 2, seed: 308, wingDir: 1},
    {x: 8, z: -124, height: 29.4, width: 54, depth: 30, tier: 2, seed: 309, wingDir: -1},
    {x: 68, z: -121, height: 31.8, width: 60, depth: 32, tier: 2, seed: 310, wingDir: -1},
  ];

  // Keep 9 staggered monumental mesas (3 near, 3 mid, 3 far) spanning full horizon cleanly
  const selectedMesas = [
    mesaSpecs[0],
    mesaSpecs[1],
    mesaSpecs[2],
    mesaSpecs[4],
    mesaSpecs[5],
    mesaSpecs[6],
    mesaSpecs[7],
    mesaSpecs[8],
    mesaSpecs[9],
  ];

  const mesasGroup = new THREE.Group();
  for (const ms of selectedMesas) {
    const cMat = ms.tier === 0 ? nearCapMat : ms.tier === 1 ? midCapMat : farCapMat;
    const bMat = ms.tier === 0 ? nearBenchMat : ms.tier === 1 ? midBenchMat : farBenchMat;
    const tMat = ms.tier === 0 ? nearTalusMat : ms.tier === 1 ? midTalusMat : farTalusMat;
    mesasGroup.add(createTerracedMesaGroup(ms, cMat, bMat, tMat));
  }
  root.add(mesasGroup);

  // Soft golden-hour atmospheric haze veils between mesa depth tiers (NOINK)
  const hazeTex = ctex(64, 256, (g) => {
    g.clearRect(0, 0, 64, 256);
    const hg = g.createLinearGradient(0, 0, 0, 256);
    hg.addColorStop(0.0, 'rgba(242, 216, 179, 0.0)');
    hg.addColorStop(0.45, 'rgba(242, 216, 179, 0.34)');
    hg.addColorStop(0.78, 'rgba(235, 208, 174, 0.46)');
    hg.addColorStop(1.0, 'rgba(226, 198, 166, 0.0)');
    g.fillStyle = hg;
    g.fillRect(0, 0, 64, 256);
  });
  const nearHazeMat = untone(
    new THREE.MeshBasicMaterial({
      map: hazeTex,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      fog: false,
    })
  );
  const farHazeMat = untone(
    new THREE.MeshBasicMaterial({
      map: hazeTex,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      fog: false,
    })
  );
  const hazeMidPlane = new THREE.Mesh(new THREE.PlaneGeometry(250, 16), nearHazeMat);
  hazeMidPlane.position.set(0, 7.2, -90);
  hazeMidPlane.layers.set(NOINK);
  root.add(hazeMidPlane);

  const hazeFarPlane = new THREE.Mesh(new THREE.PlaneGeometry(270, 22), farHazeMat);
  hazeFarPlane.position.set(0, 9.5, -113);
  hazeFarPlane.layers.set(NOINK);
  root.add(hazeFarPlane);

  // -------------------------------------------------------------------------
  // 7. Ridge-Side Foreground Details (Sagebrush, Grass Tufts & Sandstone Rocks)
  //    Strictly leaving x = -16.5..+14.5m, z = -1.75..+2.25m 100% CLEAR!
  // -------------------------------------------------------------------------
  const isInsideCavalryClearZone = (x: number, z: number): boolean => {
    return x > -16.5 && x < 14.5 && z > -1.75 && z < 2.25;
  };

  const sageLightMat = twoTone(new THREE.MeshLambertMaterial({color: '#7b8c62'}));
  const sageDarkMat = twoTone(new THREE.MeshLambertMaterial({color: '#61734b'}));
  const tuftGoldMat = twoTone(new THREE.MeshLambertMaterial({color: '#cfa95e'}));
  const tuftWarmMat = twoTone(new THREE.MeshLambertMaterial({color: '#b89148'}));
  const ridgeRockMat = twoTone(
    new THREE.MeshLambertMaterial({
      map: makeSandstoneStrataTex(['#bd7048', '#a35937', '#cf885a'], 9501),
    })
  );

  const sagePuffA = createOrganicPuffGeometry(0.32, 951);
  const sagePuffB = createOrganicPuffGeometry(0.23, 952);
  const bladeGeo = new THREE.ConeGeometry(0.038, 0.34, 4, 1);
  bladeGeo.translate(0, 0.17, 0);

  const ridgeDetailsGroup = new THREE.Group();
  const grassTufts: {obj: THREE.Object3D; baseZRot: number; phase: number}[] = [];
  const detailRng = mulberry32(187677);

  const addSageCluster = (sx: number, sz: number, scale: number): void => {
    if (isInsideCavalryClearZone(sx, sz)) return;
    const gy = terrainHeight(sx, sz);
    const grp = new THREE.Group();
    grp.position.set(sx, gy + 0.04 * scale, sz);
    grp.scale.setScalar(scale);

    const m1 = new THREE.Mesh(sagePuffA, sageDarkMat);
    m1.scale.set(1.15, 0.68, 1.05);
    m1.castShadow = true;
    m1.receiveShadow = true;
    grp.add(m1);

    const m2 = new THREE.Mesh(sagePuffB, sageLightMat);
    m2.position.set(-0.18, 0.08, 0.08);
    m2.scale.set(1.05, 0.72, 0.95);
    m2.castShadow = true;
    grp.add(m2);

    const m3 = new THREE.Mesh(sagePuffB, sageLightMat);
    m3.position.set(0.2, 0.05, -0.09);
    m3.scale.set(0.95, 0.66, 0.9);
    m3.castShadow = true;
    grp.add(m3);

    grp.rotation.y = detailRng() * Math.PI * 2;
    ridgeDetailsGroup.add(grp);
  };

  const addGrassTuft = (gx: number, gz: number, scale: number, idx: number): void => {
    if (isInsideCavalryClearZone(gx, gz)) return;
    const gy = terrainHeight(gx, gz);
    const grp = new THREE.Group();
    grp.position.set(gx, gy - 0.02, gz);
    grp.scale.setScalar(scale);

    const mat = idx % 2 === 0 ? tuftGoldMat : tuftWarmMat;
    for (let b = 0; b < 4; b++) {
      const blade = new THREE.Mesh(bladeGeo, mat);
      const ang = (b / 4) * Math.PI * 2 + detailRng() * 0.5;
      const tilt = 0.22 + detailRng() * 0.22;
      blade.rotation.set(Math.sin(ang) * tilt, ang, Math.cos(ang) * tilt);
      blade.scale.y = 0.78 + detailRng() * 0.42;
      grp.add(blade);
    }
    const baseZRot = (detailRng() - 0.5) * 0.08;
    grp.rotation.z = baseZRot;
    ridgeDetailsGroup.add(grp);
    grassTufts.push({obj: grp, baseZRot, phase: idx * 0.91});
  };

  const addRidgeBoulder = (rx: number, rz: number, scale: number, idx: number): void => {
    if (isInsideCavalryClearZone(rx, rz)) return;
    // Keep central +Z sightline free of tall rocks so camera never has foreground clutter on hooves
    if (rz > 0 && rx > -8.5 && rx < 8.5) return;
    const gy = terrainHeight(rx, rz);
    const rock = new THREE.Mesh(boulderGeos[idx % boulderGeos.length], ridgeRockMat);
    rock.scale.set(scale * 1.15, scale * 0.58, scale * 0.95);
    rock.position.set(rx, gy + 0.05 * scale, rz);
    rock.rotation.set((detailRng() - 0.5) * 0.2, detailRng() * Math.PI * 2, (detailRng() - 0.5) * 0.2);
    rock.castShadow = true;
    rock.receiveShadow = true;
    ridgeDetailsGroup.add(rock);
  };

  // Scatter tasteful low sagebrush, golden grass tufts & red-sandstone boulders along z ~ -2.2m and z ~ +2.4m..+9.5m
  for (let i = 0; i < 42; i++) {
    const northSide = i % 2 === 0;
    const sx = lerp(-34, 34, detailRng());
    const sz = northSide
      ? lerp(-1.95, -2.65, detailRng())
      : lerp(2.38, 8.2, safePow(detailRng(), 1.3));
    const scale = northSide ? 0.62 + detailRng() * 0.34 : 0.54 + detailRng() * 0.28;
    addSageCluster(sx, sz, scale);
  }

  for (let i = 0; i < 76; i++) {
    const northSide = i % 3 !== 0;
    const gx = lerp(-36, 36, detailRng());
    const gz = northSide
      ? lerp(-1.82, -2.55, detailRng())
      : lerp(2.32, 9.8, safePow(detailRng(), 1.25));
    const scale = 0.68 + detailRng() * 0.45;
    addGrassTuft(gx, gz, scale, i);
  }

  for (let i = 0; i < 24; i++) {
    const northSide = i % 3 !== 0;
    const rx = lerp(-32, 32, detailRng());
    const rz = northSide
      ? lerp(-2.05, -2.75, detailRng())
      : lerp(2.55, 6.8, detailRng());
    const scale = 0.36 + detailRng() * 0.34;
    addRidgeBoulder(rx, rz, scale, i);
  }
  root.add(ridgeDetailsGroup);

  // -------------------------------------------------------------------------
  // 8. Golden-Hour Western Sunlight Rig (Auto-harmonizes if host scene has lights)
  // -------------------------------------------------------------------------
  const lightRig = new THREE.Group();
  lightRig.name = 'montana-lights';

  const hemiLight = new THREE.HemisphereLight('#fff0d4', '#857052', 0.76);
  lightRig.add(hemiLight);

  const sunLight = new THREE.DirectionalLight('#ffe4b5', 1.18);
  sunLight.position.set(-48, 36, -24);
  sunLight.target.position.set(0, 2, -22);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.near = 8;
  sunLight.shadow.camera.far = 165;
  sunLight.shadow.camera.left = -72;
  sunLight.shadow.camera.right = 72;
  sunLight.shadow.camera.top = 56;
  sunLight.shadow.camera.bottom = -56;
  sunLight.shadow.bias = -0.0006;
  lightRig.add(sunLight);
  lightRig.add(sunLight.target);
  root.add(lightRig);

  let calibratedHostLighting = false;
  const calibrateLightingOnce = (): void => {
    if (calibratedHostLighting || !root.parent) return;
    calibratedHostLighting = true;

    let top: THREE.Object3D = root;
    while (top.parent) top = top.parent;

    let externalIntensity = 0;
    let externalShadowDir: THREE.DirectionalLight | null = null;
    const checkExternal = (node: THREE.Object3D): void => {
      if (node === root || !node.visible) return;
      if ((node as THREE.Light).isLight) {
        const l = node as THREE.Light;
        externalIntensity += l.intensity;
        if ((l as THREE.DirectionalLight).isDirectionalLight && l.castShadow) {
          externalShadowDir = l as THREE.DirectionalLight;
        }
      }
      for (const ch of node.children) {
        checkExternal(ch);
      }
    };
    checkExternal(top);

    // If the host stage already supplies full scene lighting, avoid double-exposing Lambert materials
    if (externalIntensity > 0.65) {
      hemiLight.intensity = 0.1;
      if (externalShadowDir) {
        sunLight.intensity = 0.14;
        sunLight.castShadow = false;
      } else {
        sunLight.intensity = 0.24;
      }
    }
  };

  // -------------------------------------------------------------------------
  // Public API: getTrailHeight & deterministic update(state)
  // -------------------------------------------------------------------------
  const getTrailHeight = (x: number, z: number): number => {
    return terrainHeight(x, z) + trailRibbonLift(x, z);
  };

  const update = (state: MontanaState): void => {
    root.visible = state.visible;
    if (!state.visible) return;

    calibrateLightingOnce();

    const t = state.t;

    // Gentle downstream UV scroll along the Little Bighorn S-curve
    waterTex.offset.x = -((t * 0.036) % 1);
    glintTex.offset.x = -((t * 0.062) % 1);
    glintMat.opacity = 0.46 + 0.09 * Math.sin(t * 1.35);

    // Slow deterministic drift on sculpted two-tone Western cloud banks
    const cloudSpan = 216;
    for (let i = 0; i < clouds.length; i++) {
      const c = clouds[i];
      const wrapped = (((c.baseX + t * c.speed + cloudSpan * 0.5) % cloudSpan) + cloudSpan) % cloudSpan - cloudSpan * 0.5;
      c.mesh.position.x = wrapped;
      c.mesh.position.y = c.baseY + Math.sin(t * 0.22 + c.phase) * 0.14;
    }

    // Subtle prairie wind on ridge dry grass tufts & valley tree canopies
    for (let i = 0; i < grassTufts.length; i++) {
      const gt = grassTufts[i];
      gt.obj.rotation.z = gt.baseZRot + Math.sin(t * 1.85 + gt.phase) * 0.042;
    }
    for (let i = 0; i < swayCanopies.length; i++) {
      const sc = swayCanopies[i];
      sc.obj.rotation.z = Math.sin(t * 0.95 + sc.phase) * sc.amp;
    }
  };

  return {
    root,
    getTrailHeight,
    update,
  };
}
