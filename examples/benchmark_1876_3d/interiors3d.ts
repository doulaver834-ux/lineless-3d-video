import * as THREE from 'three';
import {NOINK} from '../vendor/templates/bridge/ink';
import {ctex as rawCtex, rep as rawRep} from '../vendor/templates/bridge/paint';
import {twoTone, untone as rawUntone} from '../vendor/templates/bridge/shade';

let _intTexSeq = 0;
function ctex(
  w: number,
  h: number,
  draw: (g: CanvasRenderingContext2D, r: () => number) => void
): THREE.CanvasTexture {
  return rawCtex(`int_${++_intTexSeq}_${w}x${h}`, w, h, draw);
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

export type InteriorMode = 'none' | 'congress' | 'study' | 'cabin';

export interface InteriorsState {
  mode: InteriorMode;
  t: number;
  gavelStrike?: number;     // 0..1 animation progress around Grant's gavel strike in 'study' (0 = raised/ready, 1 = struck desk)
  paperFlutter?: number;    // 0..1 loose accusation sheets fluttering on witness table in 'congress'
  probationSlide?: number;  // 0..1 document placed on campaign table in 'cabin'
}

export interface InteriorsWorld {
  root: THREE.Group;
  update: (state: InteriorsState) => void;
}

// ============================================================================
// DETERMINISTIC MATH & MATERIAL HELPERS (SEEK-SAFE, NA-SAFE, LINELESS)
// ============================================================================

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function safePow(base: number, exp: number): number {
  return Math.pow(Math.max(0, base), exp);
}

function easeOutCubic(t: number): number {
  const u = 1 - clamp01(t);
  return 1 - u * u * u;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function lambert(opts: THREE.MeshLambertMaterialParameters): THREE.MeshLambertMaterial {
  return twoTone(new THREE.MeshLambertMaterial(opts));
}

function brassMat(color: string = '#d4a63f', shininess: number = 24): THREE.MeshPhongMaterial {
  return twoTone(
    new THREE.MeshPhongMaterial({
      color,
      specular: '#fff0c4',
      shininess,
    })
  );
}

function setShadow(
  obj: THREE.Object3D,
  cast: boolean,
  receive: boolean
): THREE.Object3D {
  obj.castShadow = cast;
  obj.receiveShadow = receive;
  return obj;
}

function makeBox(
  w: number,
  h: number,
  d: number,
  mat: THREE.Material,
  x: number,
  y: number,
  z: number,
  cast: boolean = true,
  receive: boolean = true
): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

function addAOStrip(
  parent: THREE.Object3D,
  w: number,
  d: number,
  x: number,
  y: number,
  z: number,
  rotY: number = 0,
  opacity: number = 0.28
): THREE.Mesh {
  const mat = new THREE.MeshBasicMaterial({
    color: '#2a1e18',
    transparent: true,
    opacity,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -2,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
  m.rotation.order = 'YXZ';
  m.rotation.y = rotY;
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, y + 0.004, z);
  m.castShadow = false;
  m.receiveShadow = false;
  m.layers.set(NOINK);
  parent.add(m);
  return m;
}

// Soft vertical + transverse gradient alpha texture for lineless volumetric sunbeams
let _beamAlphaTex: THREE.CanvasTexture | null = null;
function getBeamAlphaTex(): THREE.CanvasTexture {
  if (_beamAlphaTex) return _beamAlphaTex;
  const W = 128;
  const H = 256;
  _beamAlphaTex = ctex(W, H, (ctx) => {
    ctx.clearRect(0, 0, W, H);
    const img = ctx.createImageData(W, H);
    const data = img.data;
    for (let py = 0; py < H; py++) {
      const v = py / (H - 1); // 0 = window top, 1 = floor end
      const fadeEnds = Math.sin(Math.min(1, v * 5.0) * (Math.PI * 0.5)) * safePow(1 - v * 0.72, 1.35);
      for (let px = 0; px < W; px++) {
        const u = (px / (W - 1)) * 2 - 1;
        const edge = safePow(Math.max(0, 1 - u * u), 1.6);
        const val = Math.round(clamp01(fadeEnds * edge) * 255);
        const idx = (py * W + px) * 4;
        data[idx] = val;
        data[idx + 1] = val;
        data[idx + 2] = val;
        data[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  });
  return _beamAlphaTex;
}

let _poolAlphaTex: THREE.CanvasTexture | null = null;
function getPoolAlphaTex(): THREE.CanvasTexture {
  if (_poolAlphaTex) return _poolAlphaTex;
  const S = 128;
  _poolAlphaTex = ctex(S, S, (ctx) => {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, S, S);
    const grd = ctx.createRadialGradient(S * 0.5, S * 0.5, S * 0.06, S * 0.5, S * 0.5, S * 0.48);
    grd.addColorStop(0, '#ffffff');
    grd.addColorStop(0.55, '#b8b8b8');
    grd.addColorStop(1, '#000000');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, S, S);
  });
  return _poolAlphaTex;
}

function addVolumetricSunbeam(
  parent: THREE.Object3D,
  from: THREE.Vector3,
  to: THREE.Vector3,
  topRadius: number,
  botRadius: number,
  opacity: number = 0.11,
  color: string = '#fff1c9'
): THREE.Group {
  const grp = new THREE.Group();
  const dir = new THREE.Vector3().subVectors(to, from);
  const len = Math.max(0.1, dir.length());
  const mid = new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5);

  const mat = new THREE.MeshBasicMaterial({
    color,
    alphaMap: getBeamAlphaTex(),
    transparent: true,
    opacity,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  // Open-ended soft cone + crossed soft ribbon planes for rich all-angle volume
  const coneGeo = new THREE.CylinderGeometry(topRadius, botRadius, len, 20, 1, true);
  const cone = new THREE.Mesh(coneGeo, mat);
  cone.castShadow = false;
  cone.receiveShadow = false;
  cone.layers.set(NOINK);
  grp.add(cone);

  const slabMat = new THREE.MeshBasicMaterial({
    color,
    alphaMap: getBeamAlphaTex(),
    transparent: true,
    opacity: opacity * 0.55,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  for (const ang of [0, Math.PI * 0.5]) {
    const slab = new THREE.Mesh(new THREE.PlaneGeometry((topRadius + botRadius) * 0.95, len), slabMat);
    slab.rotation.y = ang;
    slab.castShadow = false;
    slab.receiveShadow = false;
    slab.layers.set(NOINK);
    grp.add(slab);
  }

  grp.position.copy(mid);
  const up = new THREE.Vector3(0, -1, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(up, dir.clone().normalize());
  grp.quaternion.copy(q);

  parent.add(grp);
  return grp;
}

function addSunPool(
  parent: THREE.Object3D,
  w: number,
  d: number,
  x: number,
  y: number,
  z: number,
  rotY: number = 0,
  opacity: number = 0.14,
  color: string = '#fff3cc'
): THREE.Mesh {
  const mat = new THREE.MeshBasicMaterial({
    color,
    alphaMap: getPoolAlphaTex(),
    transparent: true,
    opacity,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -3,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
  m.rotation.order = 'YXZ';
  m.rotation.y = rotY;
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, y + 0.008, z);
  m.castShadow = false;
  m.receiveShadow = false;
  m.layers.set(NOINK);
  parent.add(m);
  return m;
}

interface DustMoteField {
  group: THREE.Group;
  update: (t: number) => void;
}

function createDustMotes(
  seed: number,
  count: number,
  boundsMin: THREE.Vector3,
  boundsMax: THREE.Vector3,
  color: string = '#fff5d6'
): DustMoteField {
  const rand = mulberry32(seed);
  const group = new THREE.Group();
  const geo = new THREE.SphereGeometry(0.007, 6, 6);
  const mat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.24,
    depthWrite: false,
  });

  const bases: THREE.Vector3[] = [];
  const phases: number[] = [];
  const speeds: number[] = [];
  const meshes: THREE.Mesh[] = [];

  for (let i = 0; i < count; i++) {
    const bx = boundsMin.x + rand() * (boundsMax.x - boundsMin.x);
    const by = boundsMin.y + rand() * (boundsMax.y - boundsMin.y);
    const bz = boundsMin.z + rand() * (boundsMax.z - boundsMin.z);
    bases.push(new THREE.Vector3(bx, by, bz));
    phases.push(rand() * Math.PI * 2);
    speeds.push(0.35 + rand() * 0.55);

    const m = new THREE.Mesh(geo, mat);
    const sc = 0.65 + rand() * 0.85;
    m.scale.setScalar(sc);
    m.position.set(bx, by, bz);
    m.castShadow = false;
    m.receiveShadow = false;
    m.layers.set(NOINK);
    group.add(m);
    meshes.push(m);
  }

  return {
    group,
    update: (t: number): void => {
      for (let i = 0; i < meshes.length; i++) {
        const m = meshes[i];
        const b = bases[i];
        const ph = phases[i] ?? 0;
        const sp = speeds[i] ?? 0.5;
        if (!m || !b) continue;
        m.position.set(
          b.x + Math.sin(t * sp + ph) * 0.14,
          b.y + Math.sin(t * (sp * 0.75) + ph * 1.7) * 0.11,
          b.z + Math.cos(t * (sp * 0.85) + ph * 0.9) * 0.14
        );
      }
    },
  };
}

// ============================================================================
// PROCEDURAL LINELESS STORYBOOK TEXTURES (ZERO BLACK INK OUTLINES!)
// ============================================================================

function makeWoodPlankTex(
  seed: number,
  pal: readonly string[],
  plankCount: number = 8,
  grainWarmth: string = '#6b4428'
): THREE.CanvasTexture {
  const W = 512;
  const H = 512;
  return ctex(W, H, (ctx) => {
    const rand = mulberry32(seed);
    ctx.fillStyle = pal[0] ?? '#8d623f';
    ctx.fillRect(0, 0, W, H);
    const pw = W / plankCount;

    for (let i = 0; i < plankCount; i++) {
      const col = pal[i % pal.length] ?? '#8d623f';
      const x0 = i * pw;
      ctx.fillStyle = col;
      ctx.fillRect(x0, 0, pw + 1, H);

      // Soft warm plank bevel strip (never black!)
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = grainWarmth;
      ctx.fillRect(x0, 0, 3, H);

      // Cross-plank stagger joint
      const jointY = Math.floor(((i * 0.37 + rand() * 0.28) % 1) * H);
      ctx.fillRect(x0, jointY, pw, 3);

      // Broad soft tonal wood grain ribbons
      ctx.globalAlpha = 0.09;
      for (let g = 0; g < 4; g++) {
        const gx = x0 + 6 + rand() * Math.max(4, pw - 14);
        const gw = 3 + rand() * 7;
        ctx.fillRect(gx, 0, gw, H);
      }
      ctx.globalAlpha = 1;
    }
  });
}

function makeSoftPlasterTex(seed: number, topCol: string, botCol: string, mottling: string): THREE.CanvasTexture {
  const W = 512;
  const H = 512;
  return ctex(W, H, (ctx) => {
    const rand = mulberry32(seed);
    const gr = ctx.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, topCol);
    gr.addColorStop(1, botCol);
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, W, H);

    ctx.globalAlpha = 0.07;
    ctx.fillStyle = mottling;
    for (let i = 0; i < 28; i++) {
      const cx = rand() * W;
      const cy = rand() * H;
      const rx = 28 + rand() * 68;
      const ry = 22 + rand() * 54;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  });
}

function makeFlutedStoneTex(): THREE.CanvasTexture {
  const W = 256;
  const H = 256;
  return ctex(W, H, (ctx) => {
    ctx.fillStyle = '#e5dcc8';
    ctx.fillRect(0, 0, W, H);
    const flutes = 12;
    const fw = W / flutes;
    for (let i = 0; i < flutes; i++) {
      const gr = ctx.createLinearGradient(i * fw, 0, (i + 1) * fw, 0);
      gr.addColorStop(0, '#dfd5be');
      gr.addColorStop(0.32, '#cfc3ab');
      gr.addColorStop(0.7, '#ece4d2');
      gr.addColorStop(1, '#dfd5be');
      ctx.fillStyle = gr;
      ctx.fillRect(i * fw, 0, fw + 0.5, H);
    }
  });
}

function makeCongressRunnerTex(): THREE.CanvasTexture {
  const W = 512;
  const H = 1024;
  return ctex(W, H, (ctx) => {
    // Rich crimson woven base
    ctx.fillStyle = '#8c2d29';
    ctx.fillRect(0, 0, W, H);

    // Subtle tonal crimson weave bands
    ctx.fillStyle = '#7c2522';
    for (let y = 0; y < H; y += 32) {
      ctx.fillRect(68, y, W - 136, 12);
    }

    // Outer deep burgundy selvedge
    ctx.fillStyle = '#6e201d';
    ctx.fillRect(0, 0, 26, H);
    ctx.fillRect(W - 26, 0, 26, H);

    // Woven gold neoclassical border stripes
    ctx.fillStyle = '#cfa446';
    ctx.fillRect(28, 18, 22, H - 36);
    ctx.fillRect(W - 50, 18, 22, H - 36);
    ctx.fillRect(28, 18, W - 56, 22);
    ctx.fillRect(28, H - 40, W - 56, 22);

    ctx.fillStyle = '#dfc06e';
    ctx.fillRect(58, 48, 7, H - 96);
    ctx.fillRect(W - 65, 48, 7, H - 96);
    ctx.fillRect(58, 48, W - 116, 7);
    ctx.fillRect(58, H - 55, W - 116, 7);

    // Subtle gold corner & repeating lozenge motifs along border
    ctx.fillStyle = '#b88b32';
    for (let y = 44; y < H - 44; y += 48) {
      ctx.fillRect(33, y, 12, 18);
      ctx.fillRect(W - 45, y, 12, 18);
    }
  });
}

function makePersianCarpetTex(): THREE.CanvasTexture {
  const W = 1024;
  const H = 1024;
  return ctex(W, H, (ctx) => {
    // Deep Victorian navy outer guard
    ctx.fillStyle = '#1f2f4a';
    ctx.fillRect(0, 0, W, H);

    // Gold & cream border frames
    ctx.fillStyle = '#cfa349';
    ctx.fillRect(28, 28, W - 56, H - 56);
    ctx.fillStyle = '#6e2226';
    ctx.fillRect(44, 44, W - 88, H - 88);
    ctx.fillStyle = '#253959';
    ctx.fillRect(62, 62, W - 124, H - 124);
    ctx.fillStyle = '#d9b562';
    ctx.fillRect(114, 114, W - 228, H - 228);

    // Rich burgundy inner field
    ctx.fillStyle = '#752328';
    ctx.fillRect(128, 128, W - 256, H - 256);

    // Repeating geometric floral blocks in navy border band
    for (let i = 88; i <= W - 112; i += 64) {
      ctx.fillStyle = '#cfa349';
      ctx.beginPath();
      ctx.arc(i + 12, 88, 14, 0, Math.PI * 2);
      ctx.arc(i + 12, H - 88, 14, 0, Math.PI * 2);
      ctx.arc(88, i + 12, 14, 0, Math.PI * 2);
      ctx.arc(W - 88, i + 12, 14, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#8c2d30';
      ctx.beginPath();
      ctx.arc(i + 12, 88, 6, 0, Math.PI * 2);
      ctx.arc(i + 12, H - 88, 6, 0, Math.PI * 2);
      ctx.arc(88, i + 12, 6, 0, Math.PI * 2);
      ctx.arc(W - 88, i + 12, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    // Navy & cream corner spandrels inside burgundy field
    ctx.save();
    ctx.beginPath();
    ctx.rect(128, 128, W - 256, H - 256);
    ctx.clip();
    for (const [cx, cy] of [
      [128, 128],
      [W - 128, 128],
      [128, H - 128],
      [W - 128, H - 128],
    ]) {
      ctx.fillStyle = '#dfd3b6';
      ctx.beginPath();
      ctx.arc(cx, cy, 168, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#223654';
      ctx.beginPath();
      ctx.arc(cx, cy, 148, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#cfa349';
      ctx.beginPath();
      ctx.arc(cx, cy, 86, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Central lobed Persian medallion
    const mx = W * 0.5;
    const my = H * 0.5;
    ctx.fillStyle = '#e3d6b8';
    ctx.beginPath();
    ctx.ellipse(mx, my, 245, 295, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#1f3252';
    ctx.beginPath();
    ctx.ellipse(mx, my, 224, 272, 0, 0, Math.PI * 2);
    ctx.fill();

    // 8 radial gold & burgundy petals inside central medallion
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4;
      const px = mx + Math.cos(a) * 128;
      const py = my + Math.sin(a) * 156;
      ctx.fillStyle = '#cfa349';
      ctx.beginPath();
      ctx.ellipse(px, py, 44, 28, a, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#85282c';
      ctx.beginPath();
      ctx.ellipse(px, py, 24, 15, a, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = '#cfa349';
    ctx.beginPath();
    ctx.ellipse(mx, my, 92, 112, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#6e2226';
    ctx.beginPath();
    ctx.ellipse(mx, my, 66, 82, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#e8dcc0';
    ctx.beginPath();
    ctx.ellipse(mx, my, 26, 32, 0, 0, Math.PI * 2);
    ctx.fill();
  });
}

function makeFrontierRugTex(): THREE.CanvasTexture {
  const W = 512;
  const H = 512;
  return ctex(W, H, (ctx) => {
    ctx.fillStyle = '#9e7e56';
    ctx.fillRect(0, 0, W, H);
    const bands: ReadonlyArray<readonly [number, number, string]> = [
      [0, 28, '#6e4c30'],
      [28, 22, '#cfc1a3'],
      [50, 34, '#8c4636'],
      [84, 18, '#dfd3b8'],
      [102, 46, '#4f6650'],
      [148, 216, '#9e7e56'],
      [364, 46, '#4f6650'],
      [410, 18, '#dfd3b8'],
      [428, 34, '#8c4636'],
      [462, 22, '#cfc1a3'],
      [484, 28, '#6e4c30'],
    ];
    for (const [y0, bh, col] of bands) {
      ctx.fillStyle = col;
      ctx.fillRect(0, y0, W, bh);
    }
    // Woven diamond geometric center band
    for (let cx = 64; cx <= W - 64; cx += 96) {
      ctx.fillStyle = '#dfd3b8';
      ctx.beginPath();
      ctx.moveTo(cx, 206);
      ctx.lineTo(cx + 38, 256);
      ctx.lineTo(cx, 306);
      ctx.lineTo(cx - 38, 256);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#8c4636';
      ctx.beginPath();
      ctx.moveTo(cx, 226);
      ctx.lineTo(cx + 20, 256);
      ctx.lineTo(cx, 286);
      ctx.lineTo(cx - 20, 256);
      ctx.closePath();
      ctx.fill();
    }
  });
}

function makeDocumentSheetTex(headerCol: string = '#4a3d31', hasSeal: boolean = false): THREE.CanvasTexture {
  const W = 256;
  const H = 320;
  return ctex(W, H, (ctx) => {
    const gr = ctx.createLinearGradient(0, 0, W, H);
    gr.addColorStop(0, '#fcf7e8');
    gr.addColorStop(1, '#ede1c5');
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, W, H);

    // Official soft header block & ruled text bars (no black lines)
    ctx.fillStyle = headerCol;
    ctx.fillRect(34, 34, W - 68, 14);
    ctx.fillStyle = '#8c7d68';
    ctx.fillRect(56, 56, W - 112, 7);

    ctx.fillStyle = '#b5a68e';
    for (let y = 84; y < H - 68; y += 19) {
      const wLine = y % 38 === 0 ? W - 88 : W - 68;
      ctx.fillRect(34, y, wLine, 6);
    }

    if (hasSeal) {
      // Blue ribbon + crimson wax seal
      ctx.fillStyle = '#2d4b73';
      ctx.fillRect(W - 80, H - 72, 12, 46);
      ctx.fillRect(W - 64, H - 72, 12, 42);
      ctx.fillStyle = '#b03028';
      ctx.beginPath();
      ctx.arc(W - 66, H - 68, 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#cf4c42';
      ctx.beginPath();
      ctx.arc(W - 70, H - 72, 11, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

function makeUSFlagTex(): THREE.CanvasTexture {
  const W = 512;
  const H = 320;
  return ctex(W, H, (ctx) => {
    const stripeH = H / 13;
    for (let s = 0; s < 13; s++) {
      ctx.fillStyle = s % 2 === 0 ? '#9c2b2d' : '#f2ead8';
      ctx.fillRect(0, s * stripeH, W, stripeH + 1);
    }
    const cw = W * 0.42;
    const ch = stripeH * 7;
    ctx.fillStyle = '#23395d';
    ctx.fillRect(0, 0, cw, ch);

    // 1876 Centennial 37/38-star pattern in warm cream
    ctx.fillStyle = '#f5eedc';
    const rows = 6;
    const cols = 6;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const sx = 20 + c * ((cw - 40) / (cols - 1));
        const sy = 16 + r * ((ch - 32) / (rows - 1));
        ctx.beginPath();
        ctx.arc(sx, sy, 4.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  });
}

function makeMontanaMapTex(): THREE.CanvasTexture {
  const W = 1024;
  const H = 640;
  return ctex(W, H, (ctx) => {
    // Aged parchment base matching Style 2 unified map bible
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#f3e7cb');
    bg.addColorStop(1, '#e4d3af');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Soft tonal parchment corner warmth
    ctx.fillStyle = '#dcc79c';
    ctx.beginPath();
    ctx.ellipse(900, 560, 210, 140, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#eadbc0';
    ctx.beginPath();
    ctx.ellipse(120, 95, 180, 120, 0, 0, Math.PI * 2);
    ctx.fill();

    // Cartographic warm brown double border (no black ink!)
    ctx.strokeStyle = '#6e553b';
    ctx.lineWidth = 5;
    ctx.strokeRect(24, 24, W - 48, H - 48);
    ctx.strokeStyle = '#9c8262';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(36, 36, W - 72, H - 72);

    // Subtle topographic contour rings
    ctx.strokeStyle = '#d4c29c';
    ctx.lineWidth = 2.5;
    for (let k = 0; k < 4; k++) {
      ctx.beginPath();
      ctx.ellipse(540, 360, 390 - k * 72, 185 - k * 32, -0.14, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Mountain hachure ridges (Bighorn Mtns, Wolf Mtns, Black Hills)
    const drawRidge = (pts: ReadonlyArray<readonly [number, number]>, width: number): void => {
      if (pts.length < 2) return;
      const first = pts[0];
      if (!first) return;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(first[0], first[1]);
      for (let i = 1; i < pts.length; i++) {
        const pt = pts[i];
        if (pt) ctx.lineTo(pt[0], pt[1]);
      }
      ctx.strokeStyle = '#c7b289';
      ctx.lineWidth = width + 12;
      ctx.stroke();

      ctx.strokeStyle = '#d9c7a0';
      ctx.lineWidth = width;
      ctx.stroke();

      // Warm hachure ticks
      ctx.strokeStyle = '#a8926a';
      ctx.lineWidth = 3;
      for (let i = 0; i < pts.length - 1; i++) {
        const p1 = pts[i];
        const p2 = pts[i + 1];
        if (!p1 || !p2) continue;
        const ang = Math.atan2(p2[1] - p1[1], p2[0] - p1[0]) + Math.PI * 0.5;
        for (const f of [0.25, 0.5, 0.75]) {
          const mx = p1[0] + (p2[0] - p1[0]) * f;
          const my = p1[1] + (p2[1] - p1[1]) * f;
          ctx.beginPath();
          ctx.moveTo(mx - Math.cos(ang) * (width * 0.52), my - Math.sin(ang) * (width * 0.52));
          ctx.lineTo(mx + Math.cos(ang) * (width * 0.52), my + Math.sin(ang) * (width * 0.52));
          ctx.stroke();
        }
      }
      ctx.restore();
    };

    drawRidge(
      [
        [330, 480],
        [395, 535],
        [465, 575],
      ],
      28
    ); // Bighorn Mountains
    drawRidge(
      [
        [525, 435],
        [555, 495],
        [580, 548],
      ],
      22
    ); // Wolf Mountains
    drawRidge(
      [
        [810, 445],
        [845, 505],
        [825, 560],
      ],
      32
    ); // Black Hills

    // Winding Yellowstone, Bighorn, Little Bighorn, Rosebud, Tongue & Powder rivers
    const drawRiver = (pts: ReadonlyArray<readonly [number, number]>, w: number): void => {
      if (pts.length < 2) return;
      const first = pts[0];
      if (!first) return;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const trace = (): void => {
        ctx.beginPath();
        ctx.moveTo(first[0], first[1]);
        for (let i = 1; i < pts.length; i++) {
          const pt = pts[i];
          if (pt) ctx.lineTo(pt[0], pt[1]);
        }
      };
      trace();
      ctx.strokeStyle = '#5b9cb8';
      ctx.lineWidth = w + 7;
      ctx.stroke();
      trace();
      ctx.strokeStyle = '#7cc0dc';
      ctx.lineWidth = w;
      ctx.stroke();
      ctx.restore();
    };

    // Yellowstone River (west to northeast)
    drawRiver(
      [
        [88, 392],
        [215, 368],
        [370, 344],
        [520, 308],
        [685, 258],
        [855, 205],
        [950, 185],
      ],
      16
    );
    // Bighorn & Little Bighorn fork
    drawRiver(
      [
        [395, 340],
        [412, 415],
        [402, 498],
        [378, 565],
      ],
      11
    );
    drawRiver(
      [
        [412, 415],
        [458, 455],
        [488, 512],
        [508, 562],
      ],
      9
    );
    // Rosebud & Powder rivers
    drawRiver(
      [
        [548, 302],
        [566, 385],
        [585, 465],
      ],
      8
    );
    drawRiver(
      [
        [690, 256],
        [705, 358],
        [692, 468],
        [678, 558],
      ],
      9
    );

    // Dashed crimson 1876 three-column convergence march arrows
    const drawMarchArrow = (pts: ReadonlyArray<readonly [number, number]>): void => {
      if (pts.length < 2) return;
      const first = pts[0];
      const last = pts[pts.length - 1];
      const prev = pts[pts.length - 2];
      if (!first || !last || !prev) return;
      ctx.save();
      ctx.strokeStyle = '#c8372d';
      ctx.lineWidth = 7;
      ctx.lineCap = 'round';
      ctx.setLineDash([18, 14]);
      ctx.beginPath();
      ctx.moveTo(first[0], first[1]);
      for (let i = 1; i < pts.length; i++) {
        const pt = pts[i];
        if (pt) ctx.lineTo(pt[0], pt[1]);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      const ang = Math.atan2(last[1] - prev[1], last[0] - prev[0]);
      ctx.fillStyle = '#c8372d';
      ctx.beginPath();
      ctx.moveTo(last[0] + Math.cos(ang) * 10, last[1] + Math.sin(ang) * 10);
      ctx.lineTo(last[0] - Math.cos(ang - 0.55) * 22, last[1] - Math.sin(ang - 0.55) * 22);
      ctx.lineTo(last[0] - Math.cos(ang + 0.55) * 22, last[1] - Math.sin(ang + 0.55) * 22);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    };

    // Dakota Column (Terry & Custer from Fort Abraham Lincoln in east)
    drawMarchArrow([
      [938, 255],
      [810, 268],
      [660, 305],
      [565, 365],
      [492, 452],
    ]);
    // Montana Column (Gibbon from west)
    drawMarchArrow([
      [135, 338],
      [268, 332],
      [392, 365],
      [445, 432],
    ]);
    // Wyoming Column (Crook from south)
    drawMarchArrow([
      [565, 585],
      [538, 535],
      [502, 488],
    ]);

    // Target X / encampment ring on Little Bighorn
    ctx.strokeStyle = '#b32c24';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(472, 466, 22, 0, Math.PI * 2);
    ctx.stroke();

    // Fort square symbol at eastern start
    ctx.fillStyle = '#283d63';
    ctx.fillRect(928, 242, 22, 22);

    // Compass rose in lower-left
    const rx = 112;
    const ry = 532;
    ctx.fillStyle = '#e5d3ae';
    ctx.beginPath();
    ctx.arc(rx, ry, 38, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#6e553b';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(rx, ry, 38, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#283d63';
    ctx.beginPath();
    ctx.moveTo(rx, ry - 34);
    ctx.lineTo(rx + 9, ry);
    ctx.lineTo(rx - 9, ry);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#8c7456';
    ctx.beginPath();
    ctx.moveTo(rx, ry + 34);
    ctx.lineTo(rx + 9, ry);
    ctx.lineTo(rx - 9, ry);
    ctx.closePath();
    ctx.fill();

    // Bold mobile-safe Navy Cartographic Header Banner
    const bw = 640;
    const bh = 64;
    const bx = (W - bw) * 0.5;
    const by = 48;
    ctx.fillStyle = 'rgba(42, 28, 16, 0.22)';
    ctx.fillRect(bx + 5, by + 5, bw, bh);
    ctx.fillStyle = '#283d63';
    ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = '#cfa349';
    ctx.fillRect(bx, by, bw, 5);
    ctx.fillRect(bx, by + bh - 5, bw, 5);

    ctx.fillStyle = '#f6ecd6';
    ctx.font = '800 36px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('MONTANA TERRITORY \u00B7 1876', W * 0.5, by + bh * 0.52);
  });
}

function makePresidentialPaintingTex(): THREE.CanvasTexture {
  const W = 512;
  const H = 576;
  return ctex(W, H, (ctx) => {
    // Dignified oil landscape / Union strategic canvas above White House mantel
    const sky = ctx.createLinearGradient(0, 0, 0, H * 0.65);
    sky.addColorStop(0, '#4f6d82');
    sky.addColorStop(0.6, '#9cb4be');
    sky.addColorStop(1, '#e6d6b0');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    // Soft golden sun glow
    ctx.fillStyle = '#f7e8be';
    ctx.beginPath();
    ctx.arc(W * 0.68, H * 0.34, 58, 0, Math.PI * 2);
    ctx.fill();

    // Distant Blue Ridge hills
    ctx.fillStyle = '#5c7278';
    ctx.beginPath();
    ctx.moveTo(0, H * 0.62);
    ctx.quadraticCurveTo(W * 0.28, H * 0.46, W * 0.56, H * 0.58);
    ctx.quadraticCurveTo(W * 0.82, H * 0.48, W, H * 0.56);
    ctx.lineTo(W, H);
    ctx.lineTo(0, H);
    ctx.closePath();
    ctx.fill();

    // Potomac river bend
    ctx.fillStyle = '#7fa3b5';
    ctx.beginPath();
    ctx.moveTo(0, H * 0.74);
    ctx.quadraticCurveTo(W * 0.48, H * 0.66, W, H * 0.78);
    ctx.lineTo(W, H * 0.86);
    ctx.quadraticCurveTo(W * 0.45, H * 0.75, 0, H * 0.88);
    ctx.closePath();
    ctx.fill();

    // Warm autumn foreground ridge
    ctx.fillStyle = '#524432';
    ctx.beginPath();
    ctx.moveTo(0, H * 0.82);
    ctx.quadraticCurveTo(W * 0.35, H * 0.73, W, H * 0.85);
    ctx.lineTo(W, H);
    ctx.lineTo(0, H);
    ctx.closePath();
    ctx.fill();
  });
}

function makeCrateStencilTex(): THREE.CanvasTexture {
  const W = 256;
  const H = 256;
  return ctex(W, H, (ctx) => {
    ctx.fillStyle = '#8c623c';
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#8c623c' : '#7f5734';
      ctx.fillRect(0, i * 64, W, 62);
      ctx.fillStyle = '#694527';
      ctx.fillRect(0, i * 64 + 61, W, 3);
    }
    // Warm umber military stencil
    ctx.fillStyle = '#4a311d';
    ctx.font = '800 34px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('U.S. Q.M.', W * 0.5, H * 0.42);
    ctx.font = '700 26px Georgia, serif';
    ctx.fillText('7TH CAV.', W * 0.5, H * 0.62);
  });
}

// ============================================================================
// REUSABLE 3D ARCHITECTURAL & PROP BUILDERS
// ============================================================================

function createBankerLamp(
  brassMaterial: THREE.Material,
  shadeMat: THREE.Material
): THREE.Group {
  const g = new THREE.Group();
  // Stepped circular brass base
  const base1 = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.12, 0.025, 18), brassMaterial);
  base1.position.y = 0.0125;
  setShadow(base1, true, true);
  g.add(base1);

  const base2 = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.092, 0.028, 16), brassMaterial);
  base2.position.y = 0.036;
  setShadow(base2, true, true);
  g.add(base2);

  // Brass stem + crossbar
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.018, 0.31, 12), brassMaterial);
  stem.position.y = 0.195;
  setShadow(stem, true, true);
  g.add(stem);

  const yoke = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.25, 10), brassMaterial);
  yoke.rotation.z = Math.PI / 2;
  yoke.position.y = 0.345;
  setShadow(yoke, true, true);
  g.add(yoke);

  // Classic emerald-green curved cased-glass shade
  const shade = new THREE.Mesh(
    new THREE.CylinderGeometry(0.115, 0.115, 0.24, 16, 1, false, 0, Math.PI),
    shadeMat
  );
  shade.rotation.z = Math.PI / 2;
  shade.rotation.y = Math.PI / 2;
  shade.position.set(0, 0.31, 0.015);
  setShadow(shade, true, true);
  g.add(shade);

  // Warm cream inner bulb & soft desk light pool (NOINK)
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.048, 12, 10), untone('#fff5cc'));
  bulb.position.set(0, 0.305, 0.02);
  bulb.castShadow = false;
  bulb.receiveShadow = false;
  bulb.layers.set(NOINK);
  g.add(bulb);

  addSunPool(g, 0.56, 0.44, 0, 0.002, 0.04, 0, 0.22, '#fff1bd');
  return g;
}

function createTurnedBalusterGeo(): THREE.LatheGeometry {
  const pts: THREE.Vector2[] = [
    new THREE.Vector2(0.038, 0.0),
    new THREE.Vector2(0.038, 0.08),
    new THREE.Vector2(0.024, 0.14),
    new THREE.Vector2(0.044, 0.28),
    new THREE.Vector2(0.048, 0.38),
    new THREE.Vector2(0.028, 0.52),
    new THREE.Vector2(0.022, 0.64),
    new THREE.Vector2(0.036, 0.72),
    new THREE.Vector2(0.036, 0.80),
  ];
  return new THREE.LatheGeometry(pts, 12);
}

function createArchedWindowAssembly(
  width: number,
  height: number,
  depth: number,
  frameMat: THREE.Material,
  sillMat: THREE.Material,
  glassColor: string = '#fff6dc'
): THREE.Group {
  // Local origin: bottom-center of window opening (y = 0..height), facing +Z into the room
  const g = new THREE.Group();
  const archR = width * 0.5;
  const rectH = Math.max(0.4, height - archR);
  const frameT = 0.085;

  // Glowing window pane (rectangle + semicircular fanlight) on NOINK, castShadow = false
  const glassMat = untone(glassColor);
  const rectPane = new THREE.Mesh(new THREE.PlaneGeometry(width - frameT, rectH), glassMat);
  rectPane.position.set(0, rectH * 0.5, -depth * 0.28);
  rectPane.castShadow = false;
  rectPane.receiveShadow = false;
  rectPane.layers.set(NOINK);
  g.add(rectPane);

  const fanPane = new THREE.Mesh(new THREE.CircleGeometry(archR - frameT * 0.5, 24, 0, Math.PI), glassMat);
  fanPane.position.set(0, rectH, -depth * 0.28);
  fanPane.castShadow = false;
  fanPane.receiveShadow = false;
  fanPane.layers.set(NOINK);
  g.add(fanPane);

  // Recessed jambs & sill
  g.add(makeBox(width + 0.24, 0.11, depth + 0.14, sillMat, 0, -0.045, 0.03, true, true));
  g.add(makeBox(frameT, rectH + 0.04, depth, frameMat, -width * 0.5 + frameT * 0.5, rectH * 0.5, 0, true, true));
  g.add(makeBox(frameT, rectH + 0.04, depth, frameMat, width * 0.5 - frameT * 0.5, rectH * 0.5, 0, true, true));

  // Curved arch casing (Torus half-ring)
  const archRing = new THREE.Mesh(
    new THREE.TorusGeometry(archR - frameT * 0.35, frameT * 0.62, 10, 26, Math.PI),
    frameMat
  );
  archRing.position.set(0, rectH, 0.02);
  setShadow(archRing, true, true);
  g.add(archRing);

  // Transom bar at springline + vertical & horizontal muntins (castShadow = true for floor patterns!)
  g.add(makeBox(width - frameT, 0.055, 0.065, frameMat, 0, rectH, -depth * 0.18, true, true));
  g.add(makeBox(0.045, rectH, 0.055, frameMat, 0, rectH * 0.5, -depth * 0.18, true, true));

  const rows = 3;
  for (let r = 1; r < rows; r++) {
    const my = (rectH / rows) * r;
    g.add(makeBox(width - frameT, 0.038, 0.05, frameMat, 0, my, -depth * 0.18, true, true));
  }

  // Radial fanlight muntins
  for (const ang of [Math.PI * 0.25, Math.PI * 0.5, Math.PI * 0.75]) {
    const spokeLen = archR - frameT;
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.034, spokeLen, 0.048), frameMat);
    spoke.position.set(
      Math.cos(ang) * spokeLen * 0.5,
      rectH + Math.sin(ang) * spokeLen * 0.5,
      -depth * 0.18
    );
    spoke.rotation.z = ang - Math.PI * 0.5;
    setShadow(spoke, true, true);
    g.add(spoke);
  }

  return g;
}

function createSenatorChair(woodMat: THREE.Material, leatherMat: THREE.Material, brassMaterial: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  // Seat cushion & walnut frame
  g.add(makeBox(0.62, 0.09, 0.58, woodMat, 0, 0.44, 0, true, true));
  g.add(makeBox(0.56, 0.08, 0.52, leatherMat, 0, 0.50, 0.01, true, true));

  // Four turned/tapered legs
  const legGeo = new THREE.CylinderGeometry(0.032, 0.024, 0.44, 10);
  for (const [lx, lz] of [
    [-0.26, -0.24],
    [0.26, -0.24],
    [-0.26, 0.24],
    [0.26, 0.24],
  ]) {
    const leg = new THREE.Mesh(legGeo, woodMat);
    leg.position.set(lx, 0.22, lz);
    setShadow(leg, true, true);
    g.add(leg);
  }

  // Tall dignified backrest
  g.add(makeBox(0.60, 0.86, 0.08, woodMat, 0, 0.92, -0.25, true, true));
  g.add(makeBox(0.50, 0.74, 0.07, leatherMat, 0, 0.91, -0.22, true, true));
  // Carved crest top + brass finials
  g.add(makeBox(0.64, 0.09, 0.10, woodMat, 0, 1.37, -0.25, true, true));
  for (const fx of [-0.27, 0.27]) {
    const fin = new THREE.Mesh(new THREE.SphereGeometry(0.036, 10, 8), brassMaterial);
    fin.position.set(fx, 1.44, -0.25);
    setShadow(fin, true, true);
    g.add(fin);
  }

  // Padded armrests
  for (const ax of [-0.28, 0.28]) {
    g.add(makeBox(0.06, 0.22, 0.06, woodMat, ax, 0.58, 0.18, true, true));
    g.add(makeBox(0.07, 0.055, 0.48, woodMat, ax, 0.69, -0.03, true, true));
    g.add(makeBox(0.055, 0.03, 0.36, leatherMat, ax, 0.725, -0.02, true, true));
  }

  return g;
}

// Builds a wall along X (facing +Z or -Z) or along Z with real 3D rectangular window/door holes
interface WallOpening {
  uMin: number;
  uMax: number;
  yMin: number;
  yMax: number;
}

function buildSegmentedWallX(
  parent: THREE.Object3D,
  xMin: number,
  xMax: number,
  yMin: number,
  yMax: number,
  zCenter: number,
  thickness: number,
  mat: THREE.Material,
  openings: readonly WallOpening[]
): void {
  const cuts = new Set<number>([xMin, xMax]);
  for (const op of openings) {
    cuts.add(Math.max(xMin, Math.min(xMax, op.uMin)));
    cuts.add(Math.max(xMin, Math.min(xMax, op.uMax)));
  }
  const xs = Array.from(cuts).sort((a, b) => a - b);
  for (let i = 0; i < xs.length - 1; i++) {
    const x0 = xs[i];
    const x1 = xs[i + 1];
    if (x0 === undefined || x1 === undefined || x1 - x0 < 0.005) continue;
    const xm = (x0 + x1) * 0.5;
    const segW = x1 - x0;

    // Find opening overlapping xm
    const active = openings.filter((o) => xm > o.uMin + 0.001 && xm < o.uMax - 0.001);
    if (active.length === 0) {
      parent.add(makeBox(segW, yMax - yMin, thickness, mat, xm, (yMin + yMax) * 0.5, zCenter, true, true));
    } else {
      const op = active[0];
      if (!op) continue;
      if (op.yMin > yMin + 0.005) {
        const hLow = Math.min(yMax, op.yMin) - yMin;
        if (hLow > 0.005) {
          parent.add(makeBox(segW, hLow, thickness, mat, xm, yMin + hLow * 0.5, zCenter, true, true));
        }
      }
      if (op.yMax < yMax - 0.005) {
        const yStart = Math.max(yMin, op.yMax);
        const hHigh = yMax - yStart;
        if (hHigh > 0.005) {
          parent.add(makeBox(segW, hHigh, thickness, mat, xm, yStart + hHigh * 0.5, zCenter, true, true));
        }
      }
    }
  }
}

function buildSegmentedWallZ(
  parent: THREE.Object3D,
  zMin: number,
  zMax: number,
  yMin: number,
  yMax: number,
  xCenter: number,
  thickness: number,
  mat: THREE.Material,
  openings: readonly WallOpening[]
): void {
  const cuts = new Set<number>([zMin, zMax]);
  for (const op of openings) {
    cuts.add(Math.max(zMin, Math.min(zMax, op.uMin)));
    cuts.add(Math.max(zMin, Math.min(zMax, op.uMax)));
  }
  const zs = Array.from(cuts).sort((a, b) => a - b);
  for (let i = 0; i < zs.length - 1; i++) {
    const z0 = zs[i];
    const z1 = zs[i + 1];
    if (z0 === undefined || z1 === undefined || z1 - z0 < 0.005) continue;
    const zm = (z0 + z1) * 0.5;
    const segD = z1 - z0;

    const active = openings.filter((o) => zm > o.uMin + 0.001 && zm < o.uMax - 0.001);
    if (active.length === 0) {
      parent.add(makeBox(thickness, yMax - yMin, segD, mat, xCenter, (yMin + yMax) * 0.5, zm, true, true));
    } else {
      const op = active[0];
      if (!op) continue;
      if (op.yMin > yMin + 0.005) {
        const hLow = Math.min(yMax, op.yMin) - yMin;
        if (hLow > 0.005) {
          parent.add(makeBox(thickness, hLow, segD, mat, xCenter, yMin + hLow * 0.5, zm, true, true));
        }
      }
      if (op.yMax < yMax - 0.005) {
        const yStart = Math.max(yMin, op.yMax);
        const hHigh = yMax - yStart;
        if (hHigh > 0.005) {
          parent.add(makeBox(thickness, hHigh, segD, mat, xCenter, yStart + hHigh * 0.5, zm, true, true));
        }
      }
    }
  }
}

// ============================================================================
// SET 1: 'congress' — 1876 U.S. CONGRESS COMMITTEE HEARING CHAMBER
// ============================================================================

interface CongressBuild {
  group: THREE.Group;
  update: (t: number, paperFlutter: number) => void;
}

function buildCongressSet(): CongressBuild {
  const group = new THREE.Group();
  group.name = 'set_congress';

  // Materials
  const oakTex = rep(
    makeWoodPlankTex(101, ['#8d623f', '#835a39', '#946845', '#7d5535', '#8a5f3d'], 10, '#5e3d24'),
    6,
    5
  );
  const floorMat = lambert({map: oakTex});
  const runnerMat = lambert({map: makeCongressRunnerTex()});

  const plasterTex = rep(makeSoftPlasterTex(102, '#d8d0bd', '#c7beaa', '#b5ac97'), 3, 2);
  const plasterMat = lambert({map: plasterTex});

  const walnutMat = lambert({color: '#5c3b24'});
  const walnutDarkMat = lambert({color: '#462b19'});
  const walnutLightMat = lambert({color: '#6e472d'});
  const mahoganyMat = lambert({color: '#5e3222'});
  const mahoganyDarkMat = lambert({color: '#452216'});
  const mahoganyTrimMat = lambert({color: '#75412d'});
  const limestoneMat = lambert({map: rep(makeFlutedStoneTex(), 1, 2)});
  const stoneTrimMat = lambert({color: '#e5dcc8'});
  const ceilingMat = lambert({color: '#e3dac8'});
  const cofferRecessMat = lambert({color: '#d2c8b4'});
  const greenShadeMat = lambert({color: '#2d6b4f', side: THREE.DoubleSide});
  const baizeMat = lambert({color: '#2c5942'});
  const senatorLeatherMat = lambert({color: '#5c2324'});
  const brass = brassMat('#d4a63f', 26);
  const giltMat = brassMat('#d1a642', 28);

  // 1. Floor (X = -9.5..+9.5m, Z = -7.2..+6.5m, y = 0)
  const floor = new THREE.Mesh(new THREE.BoxGeometry(19.2, 0.16, 14.0), floorMat);
  floor.position.set(0, -0.08, -0.35);
  floor.castShadow = false;
  floor.receiveShadow = true;
  group.add(floor);

  // Crimson & gold woven runner rug down center aisle (x = -1.6..+1.6m, z = -2.6..+5.5m)
  const runner = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.016, 8.1), runnerMat);
  runner.position.set(0, 0.008, 1.45);
  runner.castShadow = false;
  runner.receiveShadow = true;
  group.add(runner);

  // 2. Walls with real 3D window openings so directional sunlight & muntin shadows enter
  const backWinOpenings: WallOpening[] = [
    {uMin: -6.30, uMax: -4.50, yMin: 2.0, yMax: 5.8},
    {uMin: 4.50, uMax: 6.30, yMin: 2.0, yMax: 5.8},
  ];
  const leftWinOpenings: WallOpening[] = [
    {uMin: -5.08, uMax: -3.32, yMin: 1.8, yMax: 5.8},
    {uMin: -1.88, uMax: -0.12, yMin: 1.8, yMax: 5.8},
    {uMin: 1.32, uMax: 3.08, yMin: 1.8, yMax: 5.8},
  ];

  // Back wall (z = -7.0m, X = -9.5..+9.5m, Y = 0..7.1m)
  buildSegmentedWallX(group, -9.5, 9.5, 1.65, 7.1, -7.02, 0.36, plasterMat, backWinOpenings);
  group.add(makeBox(19.0, 1.65, 0.42, walnutMat, 0, 0.825, -6.99, true, true));

  // Left wall (x = -9.05m, Z = -7.2..+6.5m, Y = 0..7.1m)
  buildSegmentedWallZ(group, -7.2, 6.5, 1.65, 7.1, -9.02, 0.42, plasterMat, leftWinOpenings);
  group.add(makeBox(0.46, 1.65, 13.7, walnutMat, -8.99, 0.825, -0.35, true, true));

  // Right wall (x = +9.02m, Z = -7.2..+6.5m, Y = 0..7.1m)
  group.add(makeBox(0.42, 5.45, 13.7, plasterMat, 9.02, 4.375, -0.35, true, true));
  group.add(makeBox(0.46, 1.65, 13.7, walnutMat, 8.99, 0.825, -0.35, true, true));

  // Exterior sky cards outside left & back windows (NOINK, castShadow = false)
  const skyCardMat = untone('#e9f3f8');
  const leftSky = new THREE.Mesh(new THREE.PlaneGeometry(15.0, 7.5), skyCardMat);
  leftSky.rotation.y = Math.PI / 2;
  leftSky.position.set(-10.2, 3.8, -0.5);
  leftSky.layers.set(NOINK);
  group.add(leftSky);

  const backSky = new THREE.Mesh(new THREE.PlaneGeometry(18.0, 7.5), skyCardMat);
  backSky.position.set(0, 3.8, -8.1);
  backSky.layers.set(NOINK);
  group.add(backSky);

  // Wainscot beveled recessed panels, baseboard plinth & chair rail cornice (y = 0..1.65m)
  // Back wall wainscot trim
  group.add(makeBox(18.8, 0.18, 0.08, walnutDarkMat, 0, 0.09, -6.76, true, true));
  group.add(makeBox(18.8, 0.09, 0.11, walnutLightMat, 0, 1.63, -6.75, true, true));
  for (let px = -8.1; px <= 8.15; px += 1.35) {
    group.add(makeBox(1.02, 0.96, 0.045, walnutDarkMat, px, 0.88, -6.765, true, true));
    group.add(makeBox(0.84, 0.78, 0.03, walnutLightMat, px, 0.88, -6.745, true, true));
  }
  addAOStrip(group, 18.4, 0.36, 0, 0, -6.62, 0, 0.28);

  // Left & Right wall wainscot trim
  for (const side of [-1, 1]) {
    const wx = side * 8.76;
    group.add(makeBox(0.08, 0.18, 13.6, walnutDarkMat, wx, 0.09, -0.35, true, true));
    group.add(makeBox(0.11, 0.09, 13.6, walnutLightMat, wx, 1.63, -0.35, true, true));
    for (let pz = -6.1; pz <= 5.8; pz += 1.32) {
      group.add(makeBox(0.045, 0.96, 1.0, walnutDarkMat, wx, 0.88, pz, true, true));
      group.add(makeBox(0.03, 0.78, 0.82, walnutLightMat, wx - side * 0.018, 0.88, pz, true, true));
    }
    addAOStrip(group, 0.36, 13.5, side * 8.62, 0, -0.35, 0, 0.28);
  }

  // Right wall blind neoclassical arches so reverse angles match
  for (const rz of [-4.2, -1.0, 2.2]) {
    const blindPanel = makeBox(0.06, 3.6, 1.65, stoneTrimMat, 8.79, 3.7, rz, true, true);
    group.add(blindPanel);
  }

  // 3. Fluted Neoclassical Pilasters / Columns
  const addPilaster = (x: number, z: number, rotY: number): void => {
    const p = new THREE.Group();
    p.position.set(x, 0, z);
    p.rotation.y = rotY;

    // Walnut lower pedestal matching wainscot height + limestone shaft & capital above
    p.add(makeBox(0.66, 0.24, 0.36, walnutDarkMat, 0, 0.12, 0, true, true));
    p.add(makeBox(0.58, 1.42, 0.30, walnutMat, 0, 0.94, 0, true, true));
    p.add(makeBox(0.68, 0.14, 0.38, stoneTrimMat, 0, 1.72, 0, true, true));

    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.265, 4.62, 18), limestoneMat);
    shaft.scale.set(1.0, 1.0, 0.68);
    shaft.position.set(0, 4.10, 0.02);
    setShadow(shaft, true, true);
    p.add(shaft);

    // Echinus & abacus capital
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.24, 0.14, 18), stoneTrimMat);
    neck.scale.set(1.0, 1.0, 0.72);
    neck.position.set(0, 6.46, 0.02);
    setShadow(neck, true, true);
    p.add(neck);

    p.add(makeBox(0.70, 0.16, 0.42, stoneTrimMat, 0, 6.61, 0.02, true, true));
    group.add(p);
  };

  for (const bx of [-7.65, -3.55, 3.55, 7.65]) {
    addPilaster(bx, -6.80, 0);
  }
  for (const lz of [-5.85, -2.6, 0.6, 3.8, 5.85]) {
    addPilaster(-8.80, lz, Math.PI / 2);
    addPilaster(8.80, lz, -Math.PI / 2);
  }

  // 4. Dentil Cornice (y = 6.72..7.0m) & Coffered Ceiling (y = 7.0m, castShadow = false!)
  group.add(makeBox(18.4, 0.22, 0.28, stoneTrimMat, 0, 6.82, -6.72, false, true));
  group.add(makeBox(0.28, 0.22, 13.7, stoneTrimMat, -8.72, 6.82, -0.35, false, true));
  group.add(makeBox(0.28, 0.22, 13.7, stoneTrimMat, 8.72, 6.82, -0.35, false, true));

  // Real 3D dentil blocks along back & side entablature
  for (let dx = -8.4; dx <= 8.4; dx += 0.34) {
    group.add(makeBox(0.15, 0.11, 0.12, stoneTrimMat, dx, 6.68, -6.60, false, true));
  }
  for (let dz = -6.4; dz <= 6.1; dz += 0.34) {
    group.add(makeBox(0.12, 0.11, 0.15, stoneTrimMat, -8.60, 6.68, dz, false, true));
    group.add(makeBox(0.12, 0.11, 0.15, stoneTrimMat, 8.60, 6.68, dz, false, true));
  }

  // Coffered ceiling lid & beams — STRICTLY castShadow = false so directional light enters freely!
  const ceilingSlab = makeBox(19.2, 0.22, 14.0, cofferRecessMat, 0, 7.12, -0.35, false, false);
  group.add(ceilingSlab);
  for (let cx = -6.0; cx <= 6.0; cx += 3.0) {
    group.add(makeBox(0.32, 0.16, 13.6, ceilingMat, cx, 6.96, -0.35, false, false));
  }
  for (let cz = -4.8; cz <= 4.8; cz += 3.2) {
    group.add(makeBox(18.0, 0.16, 0.32, ceilingMat, 0, 6.96, cz, false, false));
  }

  // 5. Sculpted Circular U.S. Congressional Crest Plaque at (0, 4.45, -6.68)
  const crest = new THREE.Group();
  crest.position.set(0, 4.45, -6.68);
  const navyFieldMat = lambert({color: '#243b63'});
  const crimsonMat = lambert({color: '#9c2b27'});
  const creamCrestMat = lambert({color: '#f2ead7'});

  const backingDisc = new THREE.Mesh(new THREE.CylinderGeometry(0.96, 1.0, 0.09, 32), walnutDarkMat);
  backingDisc.rotation.x = Math.PI / 2;
  backingDisc.position.z = -0.04;
  setShadow(backingDisc, true, true);
  crest.add(backingDisc);

  const navyDisc = new THREE.Mesh(new THREE.CylinderGeometry(0.84, 0.84, 0.08, 32), navyFieldMat);
  navyDisc.rotation.x = Math.PI / 2;
  setShadow(navyDisc, true, true);
  crest.add(navyDisc);

  const giltRim = new THREE.Mesh(new THREE.TorusGeometry(0.86, 0.075, 12, 36), giltMat);
  giltRim.position.z = 0.04;
  setShadow(giltRim, true, true);
  crest.add(giltRim);

  const innerRim = new THREE.Mesh(new THREE.TorusGeometry(0.68, 0.026, 8, 32), giltMat);
  innerRim.position.z = 0.048;
  setShadow(innerRim, true, true);
  crest.add(innerRim);

  // 13 sculpted stars around medallion ring
  for (let s = 0; s < 13; s++) {
    const a = (s / 13) * Math.PI * 2 + Math.PI * 0.5;
    const star = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.03, 5), giltMat);
    star.rotation.x = Math.PI / 2;
    star.position.set(Math.cos(a) * 0.765, Math.sin(a) * 0.765, 0.052);
    setShadow(star, true, true);
    crest.add(star);
  }

  // Central sculpted Union Shield (navy chief + crimson/cream vertical stripes)
  crest.add(makeBox(0.66, 0.74, 0.05, giltMat, 0, -0.02, 0.05, true, true));
  crest.add(makeBox(0.58, 0.24, 0.06, navyFieldMat, 0, 0.20, 0.065, true, true));
  for (let st = 0; st < 7; st++) {
    const sx = -0.24 + st * 0.08;
    crest.add(
      makeBox(0.076, 0.44, 0.06, st % 2 === 0 ? crimsonMat : creamCrestMat, sx, -0.14, 0.065, true, true)
    );
  }
  // Sculpted eagle wings above shield
  for (const side of [-1, 1]) {
    const wing = makeBox(0.34, 0.11, 0.05, giltMat, side * 0.22, 0.41, 0.065, true, true);
    wing.rotation.z = side * 0.28;
    crest.add(wing);
  }
  const eagleHead = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), giltMat);
  eagleHead.position.set(0, 0.45, 0.075);
  setShadow(eagleHead, true, true);
  crest.add(eagleHead);

  group.add(crest);

  // 6. Tall Arched Multi-Pane Windows + Diagonal Golden Volumetric Sunbeams
  // Back wall arched windows at (-5.4, 2.0, -6.75) and (+5.4, 2.0, -6.75)
  for (const wx of [-5.4, 5.4]) {
    const win = createArchedWindowAssembly(1.8, 3.8, 0.36, walnutDarkMat, stoneTrimMat, '#fff6dc');
    win.position.set(wx, 2.0, -6.82);
    group.add(win);
  }

  // Left wall arched windows at (-8.7, 1.8, -4.2 / -1.0 / +2.2)
  for (const wz of [-4.2, -1.0, 2.2]) {
    const win = createArchedWindowAssembly(1.76, 4.0, 0.38, walnutDarkMat, stoneTrimMat, '#fff6dc');
    win.rotation.y = Math.PI / 2;
    win.position.set(-8.82, 1.8, wz);
    group.add(win);
  }

  // Diagonal golden volumetric sunbeams slanting toward (-0.5, 0.2, 0.0)
  addVolumetricSunbeam(
    group,
    new THREE.Vector3(-8.55, 4.45, -4.2),
    new THREE.Vector3(-1.4, 0.15, -2.1),
    0.72,
    1.35,
    0.11,
    '#fff1c9'
  );
  addVolumetricSunbeam(
    group,
    new THREE.Vector3(-8.55, 4.35, -1.0),
    new THREE.Vector3(-0.5, 0.15, 0.0),
    0.76,
    1.45,
    0.12,
    '#fff1c9'
  );
  addVolumetricSunbeam(
    group,
    new THREE.Vector3(-8.55, 4.25, 2.2),
    new THREE.Vector3(-0.35, 0.15, 2.45),
    0.72,
    1.35,
    0.10,
    '#fff1c9'
  );
  addVolumetricSunbeam(
    group,
    new THREE.Vector3(-5.4, 4.45, -6.55),
    new THREE.Vector3(-2.35, 0.58, -3.15),
    0.66,
    1.18,
    0.09,
    '#fff1c9'
  );

  // Warm floor light pools under sunbeams
  addSunPool(group, 2.7, 1.9, -0.55, 0.016, 0.05, -0.15, 0.16, '#fff4cf');
  addSunPool(group, 2.4, 1.7, -1.35, 0.016, -2.0, -0.15, 0.12, '#fff4cf');
  addSunPool(group, 2.3, 1.6, -0.35, 0.016, 2.45, -0.15, 0.12, '#fff4cf');

  // 7. Elevated Tiered Mahogany Committee Dais (x = -4.0..+4.0m, z = -4.9..-2.4m, y = 0..0.55m)
  const daisCarpetMat = lambert({color: '#6e2320'});
  // Main platform body (leaves clean flat standing floor at y = 0.55m!)
  group.add(makeBox(8.0, 0.53, 2.5, mahoganyDarkMat, 0, 0.265, -3.65, true, true));
  const daisFloor = makeBox(7.92, 0.025, 2.44, daisCarpetMat, 0, 0.54, -3.65, false, true);
  group.add(daisFloor);
  // Molded mahogany platform bullnose rim
  group.add(makeBox(8.12, 0.07, 2.58, mahoganyMat, 0, 0.525, -3.65, true, true));
  addAOStrip(group, 8.35, 2.8, 0, 0, -3.65, 0, 0.30);

  // Stepped side stairs on left & right of dais
  for (const side of [-1, 1]) {
    for (let st = 0; st < 3; st++) {
      const sh = (st + 1) * 0.18;
      const sx = side * (4.72 - st * 0.26);
      group.add(makeBox(0.28, sh, 1.15, mahoganyMat, sx, sh * 0.5, -3.65, true, true));
      group.add(makeBox(0.26, 0.016, 0.92, daisCarpetMat, sx, sh + 0.008, -3.65, false, true));
    }
    addAOStrip(group, 0.95, 1.35, side * 4.45, 0, -3.65, 0, 0.25);
  }

  // 3-Segment Beveled Mahogany Bench Front (z = -2.65m, y = 0.55..1.52m)
  // Leaves standing floor at (0.95, 0.55, -3.35), (-1.35, 0.55, -3.45), (2.45, 0.55, -3.50) 100% clear!
  const buildBenchSegment = (w: number, x: number, z: number, rotY: number): void => {
    const seg = new THREE.Group();
    seg.position.set(x, 0.55, z);
    seg.rotation.y = rotY;

    // Main front modesty wall (zLocal = -0.14..+0.12)
    seg.add(makeBox(w, 0.92, 0.24, mahoganyMat, 0, 0.46, 0, true, true));
    seg.add(makeBox(w + 0.08, 0.10, 0.32, mahoganyDarkMat, 0, 0.05, 0.02, true, true));
    // Molded desktop & inner baize writing shelf (extends back only to zLocal = -0.28 -> world z = -2.93m)
    seg.add(makeBox(w + 0.12, 0.075, 0.46, mahoganyTrimMat, 0, 0.945, -0.06, true, true));
    seg.add(makeBox(w - 0.14, 0.016, 0.32, baizeMat, 0, 0.986, -0.08, false, true));

    // Recessed carved panels & corbels on front (+Z) face
    const nPanels = Math.max(2, Math.round(w / 0.92));
    const step = w / nPanels;
    for (let i = 0; i < nPanels; i++) {
      const px = -w * 0.5 + step * (i + 0.5);
      seg.add(makeBox(step * 0.74, 0.58, 0.045, mahoganyDarkMat, px, 0.48, 0.125, true, true));
      seg.add(makeBox(step * 0.58, 0.42, 0.03, mahoganyTrimMat, px, 0.48, 0.142, true, true));
    }
    for (let i = 0; i <= nPanels; i++) {
      const cx = -w * 0.5 + step * i;
      seg.add(makeBox(0.07, 0.20, 0.09, mahoganyDarkMat, cx, 0.80, 0.14, true, true));
    }
    group.add(seg);
  };

  buildBenchSegment(3.9, 0, -2.62, 0);
  buildBenchSegment(2.05, -2.88, -2.79, 0.17);
  buildBenchSegment(2.05, 2.88, -2.79, -0.17);

  // Side return cheeks of committee bench
  group.add(makeBox(0.24, 0.95, 0.92, mahoganyMat, -3.84, 1.025, -3.32, true, true));
  group.add(makeBox(0.24, 0.95, 0.92, mahoganyMat, 3.84, 1.025, -3.32, true, true));

  // Brass banker lamps, leather statute books & brass inkwells along dais bench top (y = 1.53m)
  for (const [lx, lz, rot] of [
    [-2.25, -2.78, 0.15],
    [0.0, -2.68, 0.0],
    [1.75, -2.70, -0.05],
  ] as const) {
    const lamp = createBankerLamp(brass, greenShadeMat);
    lamp.position.set(lx, 1.535, lz);
    lamp.rotation.y = rot;
    group.add(lamp);
  }

  // Statute books & inkwells on dais bench
  const bookPalette = ['#7a2e28', '#2c4261', '#856232', '#475c42'];
  const bookMats = bookPalette.map((c) => lambert({color: c}));
  const pageMat = lambert({color: '#f2ead4'});
  for (const [bx, bz, count] of [
    [-0.78, -2.68, 3],
    [0.56, -2.68, 2],
    [2.95, -2.88, 3],
  ] as const) {
    for (let b = 0; b < count; b++) {
      const bm = bookMats[(b + Math.abs(Math.round(bx))) % bookMats.length] ?? walnutMat;
      const bk = makeBox(0.26, 0.048, 0.19, bm, bx + b * 0.015, 1.56 + b * 0.05, bz, true, true);
      bk.rotation.y = (b - 1) * 0.08;
      group.add(bk);
      const pg = makeBox(0.24, 0.036, 0.175, pageMat, bx + b * 0.015, 1.56 + b * 0.05, bz + 0.006, true, true);
      pg.rotation.y = (b - 1) * 0.08;
      group.add(pg);
    }
  }

  for (const [ix, iz] of [
    [-1.42, -2.72],
    [1.12, -2.68],
    [2.32, -2.78],
  ] as const) {
    group.add(makeBox(0.16, 0.025, 0.11, walnutDarkMat, ix, 1.548, iz, true, true));
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.034, 0.045, 12), brass);
    pot.position.set(ix - 0.035, 1.58, iz);
    setShadow(pot, true, true);
    group.add(pot);
  }

  // High-backed leather Senator chairs BEHIND z = -3.85m (centered at z = -4.24m so standing actors at z = -3.35..-3.50m have abundant clearance!)
  for (const [cx, cz, crot] of [
    [-2.75, -4.26, 0.12],
    [-1.35, -4.26, 0.04],
    [0.95, -4.24, -0.03],
    [2.45, -4.28, -0.10],
  ] as const) {
    const ch = createSenatorChair(mahoganyDarkMat, senatorLeatherMat, brass);
    ch.position.set(cx, 0.55, cz);
    ch.rotation.y = crot;
    group.add(ch);
  }

  // 8. Witness Table at (-1.35, 0, 0.75) — 1.35m wide x 0.75m deep x 0.76m high
  // Leaves x = -0.45..+0.45, z = 0.0..0.35 completely unobstructed for Custer's full boots/knees!
  const witnessGrp = new THREE.Group();
  witnessGrp.position.set(-1.35, 0, 0.75);

  witnessGrp.add(makeBox(1.35, 0.065, 0.75, walnutMat, 0, 0.728, 0, true, true));
  witnessGrp.add(makeBox(1.18, 0.014, 0.58, baizeMat, 0, 0.764, 0, false, true));
  witnessGrp.add(makeBox(1.22, 0.13, 0.62, walnutDarkMat, 0, 0.64, 0, true, true));

  const wLegGeo = new THREE.CylinderGeometry(0.042, 0.028, 0.70, 12);
  for (const [lx, lz] of [
    [-0.58, -0.29],
    [0.58, -0.29],
    [-0.58, 0.29],
    [0.58, 0.29],
  ] as const) {
    const leg = new THREE.Mesh(wLegGeo, walnutDarkMat);
    leg.position.set(lx, 0.35, lz);
    setShadow(leg, true, true);
    witnessGrp.add(leg);
  }
  addAOStrip(witnessGrp, 1.48, 0.88, 0, 0, 0, 0, 0.28);

  // Brass water pitcher & glass on witness table
  const pitcherPts: THREE.Vector2[] = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(0.062, 0.0),
    new THREE.Vector2(0.052, 0.03),
    new THREE.Vector2(0.082, 0.10),
    new THREE.Vector2(0.076, 0.17),
    new THREE.Vector2(0.048, 0.22),
    new THREE.Vector2(0.064, 0.26),
  ];
  const pitcher = new THREE.Mesh(new THREE.LatheGeometry(pitcherPts, 16), brass);
  pitcher.position.set(-0.42, 0.768, -0.12);
  setShadow(pitcher, true, true);
  witnessGrp.add(pitcher);

  const pitcherHandle = new THREE.Mesh(
    new THREE.TorusGeometry(0.055, 0.011, 8, 16, Math.PI * 1.15),
    brass
  );
  pitcherHandle.rotation.z = -Math.PI * 0.5;
  pitcherHandle.position.set(-0.48, 0.90, -0.12);
  setShadow(pitcherHandle, true, true);
  witnessGrp.add(pitcherHandle);

  const waterGlass = new THREE.Mesh(
    new THREE.CylinderGeometry(0.036, 0.028, 0.10, 14),
    new THREE.MeshBasicMaterial({
      color: '#dfeff7',
      transparent: true,
      opacity: 0.58,
      depthWrite: false,
    })
  );
  waterGlass.position.set(-0.26, 0.818, -0.08);
  waterGlass.layers.set(NOINK);
  witnessGrp.add(waterGlass);

  // 3 Animated Loose Accusation Sheets on witness table (driven by state.paperFlutter)
  const sheetMat = lambert({map: makeDocumentSheetTex('#3f352c', false)});
  const sheetGeo = new THREE.BoxGeometry(0.24, 0.005, 0.32);
  const witnessSheets: THREE.Mesh[] = [];
  const sheetRest: ReadonlyArray<readonly [number, number, number, number]> = [
    [0.24, 0.773, -0.02, 0.06],
    [0.28, 0.779, 0.03, -0.11],
    [0.21, 0.785, 0.05, 0.18],
  ];
  for (const [sx, sy, sz, srot] of sheetRest) {
    const sh = new THREE.Mesh(sheetGeo, sheetMat);
    sh.position.set(sx, sy, sz);
    sh.rotation.y = srot;
    setShadow(sh, true, true);
    witnessGrp.add(sh);
    witnessSheets.push(sh);
  }

  // Witness chair tucked behind left side of witness table
  const witnessChair = createSenatorChair(walnutDarkMat, lambert({color: '#4a3525'}), brass);
  witnessChair.scale.setScalar(0.92);
  witnessChair.position.set(-0.18, 0, 0.68);
  witnessChair.rotation.y = Math.PI - 0.12;
  witnessGrp.add(witnessChair);

  group.add(witnessGrp);

  // 9. Turned Walnut Gallery Balustrade (y = 0..0.92m) across z = +3.35m
  // Central aisle gap x = -1.2..+1.0m, leaving (+1.55, 0, +2.85) clear for foreground OTS Senator!
  const balusterGeo = createTurnedBalusterGeo();
  const buildRailRun = (x0: number, x1: number, z: number): void => {
    const runW = x1 - x0;
    const xm = (x0 + x1) * 0.5;
    // Bottom plinth shoe & top molded handrail
    group.add(makeBox(runW, 0.10, 0.16, walnutDarkMat, xm, 0.05, z, true, true));
    group.add(makeBox(runW + 0.06, 0.085, 0.19, walnutLightMat, xm, 0.90, z, true, true));
    addAOStrip(group, runW + 0.12, 0.32, xm, 0, z, 0, 0.25);

    // Turned balusters
    const count = Math.max(2, Math.floor((runW - 0.32) / 0.24));
    const step = (runW - 0.32) / count;
    for (let i = 0; i <= count; i++) {
      const bx = x0 + 0.16 + i * step;
      const bal = new THREE.Mesh(balusterGeo, walnutMat);
      bal.position.set(bx, 0.09, z);
      setShadow(bal, true, true);
      group.add(bal);
    }

    // Heavy square newel posts at ends
    for (const nx of [x0 + 0.08, x1 - 0.08]) {
      group.add(makeBox(0.20, 0.98, 0.20, walnutDarkMat, nx, 0.49, z, true, true));
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.085, 12, 10), walnutLightMat);
      cap.position.set(nx, 1.04, z);
      setShadow(cap, true, true);
      group.add(cap);
    }
  };

  buildRailRun(-8.65, -1.22, 3.35);
  buildRailRun(1.02, 8.65, 3.35);

  // Gallery spectator pews behind balustrade (z = +4.55m, +5.65m) for rich architectural depth
  for (const pz of [4.55, 5.65]) {
    for (const [px0, px1] of [
      [-7.8, -1.6],
      [1.4, 7.8],
    ] as const) {
      const pw = px1 - px0;
      const pm = (px0 + px1) * 0.5;
      group.add(makeBox(pw, 0.07, 0.46, walnutMat, pm, 0.45, pz, true, true));
      group.add(makeBox(pw, 0.52, 0.08, walnutDarkMat, pm, 0.72, pz + 0.21, true, true));
      group.add(makeBox(0.10, 0.45, 0.44, walnutDarkMat, px0 + 0.12, 0.225, pz, true, true));
      group.add(makeBox(0.10, 0.45, 0.44, walnutDarkMat, px1 - 0.12, 0.225, pz, true, true));
    }
  }

  // Floating golden dust motes in congressional sunbeams
  const motes = createDustMotes(
    199,
    42,
    new THREE.Vector3(-7.6, 0.6, -4.5),
    new THREE.Vector3(1.2, 4.4, 3.0),
    '#fff4d2'
  );
  group.add(motes.group);

  return {
    group,
    update: (t: number, paperFlutter: number): void => {
      motes.update(t);
      const pf = clamp01(paperFlutter);
      // Sheet 0 stays anchored lightly; Sheets 1 & 2 slide, lift & flutter when paperFlutter > 0
      const s0 = witnessSheets[0];
      const s1 = witnessSheets[1];
      const s2 = witnessSheets[2];
      if (s0) {
        s0.position.set(0.24 + pf * 0.02, 0.773, -0.02);
        s0.rotation.set(0, 0.06 + pf * 0.05, pf * 0.015 * Math.sin(t * 7.0));
      }
      if (s1) {
        const lift1 = Math.sin(pf * Math.PI) * 0.055 + pf * 0.008 * (1 + Math.sin(t * 9.5));
        s1.position.set(0.28 + pf * 0.16, 0.779 + lift1, 0.03 + pf * 0.11);
        s1.rotation.set(
          pf * 0.12 * Math.sin(t * 8.2 + 0.6),
          -0.11 - pf * 0.42,
          -pf * 0.16 * Math.cos(t * 7.4)
        );
      }
      if (s2) {
        const lift2 = Math.sin(pf * Math.PI) * 0.095 + pf * 0.012 * (1 + Math.cos(t * 10.8));
        s2.position.set(0.21 + pf * 0.27, 0.785 + lift2, 0.05 - pf * 0.14);
        s2.rotation.set(
          -pf * 0.18 * Math.cos(t * 9.1),
          0.18 + pf * 0.68,
          pf * 0.22 * Math.sin(t * 8.6 + 1.1)
        );
      }
    },
  };
}

// ============================================================================
// SET 2: 'study' — PRESIDENT GRANT'S WHITE HOUSE EXECUTIVE STUDY
// ============================================================================

interface StudyBuild {
  group: THREE.Group;
  update: (t: number, gavelStrike: number) => void;
}

function buildStudySet(): StudyBuild {
  const group = new THREE.Group();
  group.name = 'set_study';

  // Materials
  const walnutFloorTex = rep(
    makeWoodPlankTex(201, ['#5e3d26', '#52341f', '#66432b', '#4d301c'], 9, '#382112'),
    5,
    5
  );
  const floorMat = lambert({map: walnutFloorTex});
  const persianMat = lambert({map: makePersianCarpetTex()});

  const slateWallTex = rep(makeSoftPlasterTex(202, '#3d5054', '#314145', '#28363a'), 3, 2);
  const slateWallMat = lambert({map: slateWallTex});

  const wainMat = lambert({color: '#4a2e1d'});
  const wainDarkMat = lambert({color: '#362013'});
  const wainLightMat = lambert({color: '#5e3c27'});
  const deskWalnutMat = lambert({color: '#543420'});
  const deskDarkMat = lambert({color: '#3b2214'});
  const deskLeatherMat = lambert({color: '#2a3d33'});
  const drapeMat = lambert({color: '#75201f'});
  const drapeDarkMat = lambert({color: '#571616'});
  const ceilingMat = lambert({color: '#dfd8c8'});
  const marbleMat = lambert({color: '#d9d2c5'});
  const fireboxMat = lambert({color: '#241b17'});
  const greenShadeMat = lambert({color: '#2d6b4f', side: THREE.DoubleSide});
  const brass = brassMat('#d4a63f', 26);

  // 1. Floor (X = -6.8..+6.8m, Z = -5.5..+5.0m, y = 0)
  const floor = makeBox(13.8, 0.16, 10.8, floorMat, 0, -0.08, -0.25, false, true);
  group.add(floor);

  // Persian Medallion Carpet (x = -2.8..+2.8m, z = -2.8..+2.2m)
  const carpet = makeBox(5.6, 0.016, 5.0, persianMat, 0, 0.008, -0.30, false, true);
  group.add(carpet);
  // Subtle cream fringe along carpet left/right ends
  const fringeMat = lambert({color: '#d8ccb2'});
  group.add(makeBox(0.06, 0.01, 4.92, fringeMat, -2.83, 0.005, -0.30, false, true));
  group.add(makeBox(0.06, 0.01, 4.92, fringeMat, 2.83, 0.005, -0.30, false, true));

  // 2. Walls (X = ±5.85m inner faces, Z = -4.95m back wall, Y = 0..5.4m)
  const studyLeftOpenings: WallOpening[] = [{uMin: -2.35, uMax: -0.45, yMin: 1.15, yMax: 4.50}];

  // Back wall
  group.add(makeBox(13.6, 3.9, 0.36, slateWallMat, 0, 3.45, -5.08, true, true));
  group.add(makeBox(13.6, 1.5, 0.40, wainMat, 0, 0.75, -5.06, true, true));
  addAOStrip(group, 12.2, 0.36, 0, 0, -4.76, 0, 0.28);

  // Left wall with real window aperture at z = -1.4m
  buildSegmentedWallZ(group, -5.5, 5.0, 1.5, 5.4, -5.92, 0.36, slateWallMat, studyLeftOpenings);
  buildSegmentedWallZ(group, -5.5, 5.0, 0, 1.5, -5.90, 0.40, wainMat, studyLeftOpenings);
  addAOStrip(group, 0.36, 10.4, -5.60, 0, -0.25, 0, 0.28);

  // Exterior sky glow outside study left window (NOINK)
  const studySky = new THREE.Mesh(new THREE.PlaneGeometry(7.0, 6.0), untone('#fff5dc'));
  studySky.rotation.y = Math.PI / 2;
  studySky.position.set(-6.8, 3.0, -1.4);
  studySky.layers.set(NOINK);
  group.add(studySky);

  // Right wall
  group.add(makeBox(0.36, 3.9, 10.5, slateWallMat, 5.92, 3.45, -0.25, true, true));
  group.add(makeBox(0.40, 1.5, 10.5, wainMat, 5.90, 0.75, -0.25, true, true));
  addAOStrip(group, 0.36, 10.4, 5.60, 0, -0.25, 0, 0.28);

  // Wainscot beveled panels & chair rail
  for (const side of [-1, 1]) {
    const wx = side * 5.68;
    group.add(makeBox(0.09, 0.08, 10.4, wainLightMat, wx, 1.48, -0.25, true, true));
    group.add(makeBox(0.07, 0.16, 10.4, wainDarkMat, wx, 0.08, -0.25, true, true));
    for (let pz = -4.2; pz <= 4.2; pz += 1.2) {
      if (side === -1 && pz > -2.5 && pz < -0.3) continue;
      group.add(makeBox(0.04, 0.88, 0.92, wainDarkMat, wx, 0.80, pz, true, true));
    }
  }
  group.add(makeBox(11.6, 0.08, 0.09, wainLightMat, 0, 1.48, -4.84, true, true));

  // Ceiling & Victorian crown cornice (castShadow = false so sunlight enters cleanly!)
  group.add(makeBox(13.8, 0.20, 10.8, ceilingMat, 0, 5.42, -0.25, false, false));
  group.add(makeBox(12.0, 0.18, 0.24, wainDarkMat, 0, 5.24, -4.80, false, true));
  group.add(makeBox(0.24, 0.18, 10.5, wainDarkMat, -5.64, 5.24, -0.25, false, true));
  group.add(makeBox(0.24, 0.18, 10.5, wainDarkMat, 5.64, 5.24, -0.25, false, true));

  // 3. Built-in Walnut Bookcases on Back Wall (x = -4.6..-1.8m and x = +2.0..+4.6m, z = -4.8m)
  const spineColors = ['#b5893d', '#7d2c2d', '#2b4061', '#4a6144', '#6e4328', '#8f6934', '#384f66'];
  const spineMats = spineColors.map((c) => lambert({color: c}));
  const bookRand = mulberry32(244);

  const buildBookcase = (x0: number, x1: number): void => {
    const w = x1 - x0;
    const xm = (x0 + x1) * 0.5;
    const bc = new THREE.Group();
    bc.position.set(xm, 0, -4.72);

    // Back panel & lower cabinet base
    bc.add(makeBox(w, 4.28, 0.08, wainDarkMat, 0, 2.14, -0.18, true, true));
    bc.add(makeBox(w + 0.08, 1.02, 0.46, wainMat, 0, 0.51, 0, true, true));
    bc.add(makeBox(w + 0.14, 0.07, 0.52, wainLightMat, 0, 1.04, 0.02, true, true));

    // Lower cabinet doors with brass knobs
    const doors = 3;
    const dw = (w - 0.18) / doors;
    for (let d = 0; d < doors; d++) {
      const dx = -w * 0.5 + 0.09 + dw * (d + 0.5);
      bc.add(makeBox(dw * 0.86, 0.72, 0.04, wainDarkMat, dx, 0.54, 0.24, true, true));
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 8), brass);
      knob.position.set(dx + dw * 0.28, 0.56, 0.27);
      bc.add(knob);
    }

    // Side stiles & molded Victorian pediment crown
    bc.add(makeBox(0.11, 3.24, 0.42, wainMat, -w * 0.5 + 0.055, 2.68, -0.01, true, true));
    bc.add(makeBox(0.11, 3.24, 0.42, wainMat, w * 0.5 - 0.055, 2.68, -0.01, true, true));
    bc.add(makeBox(w * 0.08, 3.20, 0.40, wainMat, 0, 2.66, -0.01, true, true));
    bc.add(makeBox(w + 0.18, 0.16, 0.52, wainDarkMat, 0, 4.32, 0.03, true, true));
    bc.add(makeBox(w * 0.62, 0.14, 0.44, wainLightMat, 0, 4.46, 0.01, true, true));

    // Shelves + rows of two-tone leather books
    const shelfYs = [1.07, 1.72, 2.37, 3.02, 3.67];
    for (let s = 0; s < shelfYs.length; s++) {
      const sy = shelfYs[s] ?? 1.07;
      if (s > 0) {
        bc.add(makeBox(w - 0.12, 0.045, 0.38, wainLightMat, 0, sy, -0.01, true, true));
      }
      // Left & right bays on each shelf
      for (const baySide of [-1, 1]) {
        const bayStart = baySide < 0 ? -w * 0.5 + 0.14 : w * 0.05 + 0.04;
        const bayEnd = baySide < 0 ? -w * 0.05 - 0.04 : w * 0.5 - 0.14;
        let curX = bayStart;
        let bIdx = 0;
        while (curX < bayEnd - 0.06) {
          const bw = 0.042 + bookRand() * 0.032;
          const bh = 0.34 + bookRand() * 0.16;
          const bd = 0.24 + bookRand() * 0.05;
          const mat = spineMats[(s * 5 + bIdx + Math.floor(bookRand() * 3)) % spineMats.length] ?? wainMat;
          const book = makeBox(bw, bh, bd, mat, curX + bw * 0.5, sy + 0.022 + bh * 0.5, 0.01, true, true);
          if (bookRand() > 0.88 && curX + bw * 1.8 < bayEnd) {
            book.rotation.z = -0.14;
            curX += bw * 1.35;
          } else {
            curX += bw + 0.005;
          }
          bc.add(book);

          // Subtle gold spine band on every 2nd book
          if (bIdx % 2 === 0) {
            bc.add(makeBox(bw + 0.004, 0.018, 0.02, brass, book.position.x, sy + bh * 0.76, bd * 0.5 + 0.01, false, false));
          }
          bIdx++;
        }
      }
    }

    addAOStrip(group, w + 0.24, 0.56, xm, 0, -4.68, 0, 0.28);
    group.add(bc);
  };

  buildBookcase(-4.6, -1.8);
  buildBookcase(2.0, 4.6);

  // 4. Central Fireplace Mantel at (0, 0, -4.65m) with Clock, Candlesticks & Framed Portrait/Map Above
  const fp = new THREE.Group();
  fp.position.set(0, 0, -4.65);

  // Chimney breast & slate hearth
  fp.add(makeBox(2.75, 5.25, 0.42, wainMat, 0, 2.625, -0.12, true, true));
  fp.add(makeBox(2.45, 0.045, 0.72, lambert({color: '#2e383b'}), 0, 0.022, 0.16, false, true));
  addAOStrip(group, 2.85, 0.85, 0, 0, -4.55, 0, 0.28);

  // Veined cream marble surround + dark firebox
  fp.add(makeBox(2.05, 1.52, 0.22, marbleMat, 0, 0.78, 0.12, true, true));
  fp.add(makeBox(1.18, 1.06, 0.28, fireboxMat, 0, 0.55, 0.11, false, true));

  // Brass andirons, split logs & warm glowing hearth embers (NOINK)
  for (const ax of [-0.36, 0.36]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.032, 0.32, 10), brass);
    post.position.set(ax, 0.18, 0.18);
    fp.add(post);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.042, 10, 8), brass);
    ball.position.set(ax, 0.36, 0.18);
    fp.add(ball);
  }
  const logFireMat = lambert({color: '#3d281c'});
  for (const [ly, lz, lrot] of [
    [0.12, 0.08, 0.08],
    [0.13, 0.16, -0.11],
    [0.21, 0.12, 0.03],
  ] as const) {
    const fl = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.68, 10), logFireMat);
    fl.rotation.z = Math.PI / 2;
    fl.rotation.y = lrot;
    fl.position.set(0, ly, lz);
    fp.add(fl);
  }
  const embers = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), untone('#ff9e44'));
  embers.scale.set(1.5, 0.32, 0.65);
  embers.position.set(0, 0.09, 0.12);
  embers.layers.set(NOINK);
  fp.add(embers);
  addSunPool(fp, 1.5, 0.95, 0, 0.046, 0.42, 0, 0.18, '#ffbe6b');

  // Carved walnut mantel shelf & pilasters
  fp.add(makeBox(2.52, 0.12, 0.42, wainDarkMat, 0, 1.58, 0.16, true, true));
  fp.add(makeBox(2.64, 0.08, 0.48, wainLightMat, 0, 1.66, 0.18, true, true));

  // Brass Mantel Clock at center (y = 1.70m)
  fp.add(makeBox(0.38, 0.07, 0.18, wainDarkMat, 0, 1.735, 0.18, true, true));
  const clockBody = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.15, 0.16, 18), brass);
  clockBody.rotation.x = Math.PI / 2;
  clockBody.position.set(0, 1.88, 0.18);
  setShadow(clockBody, true, true);
  fp.add(clockBody);
  const clockDial = new THREE.Mesh(
    new THREE.CircleGeometry(0.105, 18),
    lambert({color: '#f5eedc'})
  );
  clockDial.position.set(0, 1.88, 0.265);
  fp.add(clockDial);

  // Pair of brass candlesticks with cream tapers on mantel
  const taperMat = lambert({color: '#f5efe0'});
  for (const cx of [-0.88, 0.88]) {
    const cBase = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.068, 0.24, 12), brass);
    cBase.position.set(cx, 1.82, 0.18);
    setShadow(cBase, true, true);
    fp.add(cBase);
    const taper = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.019, 0.20, 10), taperMat);
    taper.position.set(cx, 2.02, 0.18);
    fp.add(taper);
  }

  // Ornate Gilt-Framed Presidential Portrait / Landscape above Mantel
  const frameOuter = makeBox(1.74, 1.96, 0.11, brass, 0, 3.12, 0.09, true, true);
  fp.add(frameOuter);
  fp.add(makeBox(1.52, 1.74, 0.06, wainDarkMat, 0, 3.12, 0.13, true, true));
  const painting = new THREE.Mesh(
    new THREE.PlaneGeometry(1.42, 1.64),
    lambert({map: makePresidentialPaintingTex()})
  );
  painting.position.set(0, 3.12, 0.165);
  fp.add(painting);

  group.add(fp);

  // 5. Left Wall Tall Window (x = -5.6m, z = -1.4m) with Heavy Burgundy Velvet Drapes & Gold Tiebacks
  const studyWin = createArchedWindowAssembly(1.88, 3.35, 0.36, wainDarkMat, wainLightMat, '#fff6dc');
  studyWin.rotation.y = Math.PI / 2;
  studyWin.position.set(-5.74, 1.15, -1.40);
  group.add(studyWin);

  // Carved gilt-and-walnut pelmet valance above window
  group.add(makeBox(0.36, 0.26, 2.55, wainDarkMat, -5.54, 4.62, -1.40, true, true));
  group.add(makeBox(0.39, 0.08, 2.64, brass, -5.53, 4.62, -1.40, true, true));

  // Heavy pleated burgundy velvet drapes + gold tiebacks
  for (const side of [-1, 1]) {
    const dz = -1.40 + side * 0.98;
    const dGroup = new THREE.Group();
    dGroup.position.set(-5.52, 0, dz);

    // 4 vertical velvet pleats per curtain panel
    for (let p = 0; p < 4; p++) {
      const oz = (p - 1.5) * 0.11;
      const mat = p % 2 === 0 ? drapeMat : drapeDarkMat;
      const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.056, 2.55, 10), mat);
      upper.position.set((p % 2) * 0.02, 3.30, oz);
      upper.rotation.x = side * 0.05;
      setShadow(upper, true, true);
      dGroup.add(upper);

      const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.082, 1.98, 10), mat);
      lower.position.set((p % 2) * 0.02, 1.04, oz + side * 0.05);
      setShadow(lower, true, true);
      dGroup.add(lower);
    }

    // Braided gold tieback & tassel at y = 2.02m
    const tie = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.028, 8, 16), brass);
    tie.rotation.x = Math.PI / 2;
    tie.scale.set(0.65, 1.15, 1.0);
    tie.position.set(0.02, 2.02, side * 0.03);
    setShadow(tie, true, true);
    dGroup.add(tie);

    const tassel = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.16, 10), brass);
    tassel.position.set(0.11, 1.88, side * 0.03);
    setShadow(tassel, true, true);
    dGroup.add(tassel);

    group.add(dGroup);
  }

  // Dramatic warm raking sunbeam from left window across Grant's Executive Desk
  addVolumetricSunbeam(
    group,
    new THREE.Vector3(-5.48, 3.25, -1.40),
    new THREE.Vector3(0.65, 0.65, -0.82),
    0.78,
    1.48,
    0.12,
    '#fff1c9'
  );
  addSunPool(group, 2.9, 1.85, 0.15, 0.018, -0.85, -0.10, 0.15, '#fff3cc');

  // 6. 3D Draped U.S. Stars-and-Stripes Silk Flag on Brass Eagle Pole at (2.25, 0, -3.2m)
  const flagStand = new THREE.Group();
  flagStand.position.set(2.25, 0, -3.20);

  const standBase1 = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.055, 20), wainDarkMat);
  standBase1.position.y = 0.028;
  setShadow(standBase1, true, true);
  flagStand.add(standBase1);
  const standBase2 = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.19, 0.09, 18), brass);
  standBase2.position.y = 0.095;
  setShadow(standBase2, true, true);
  flagStand.add(standBase2);
  addAOStrip(group, 0.68, 0.68, 2.25, 0, -3.20, 0, 0.26);

  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 3.78, 12), wainMat);
  pole.position.y = 1.98;
  setShadow(pole, true, true);
  flagStand.add(pole);

  // Brass globe & spread-winged Eagle finial
  const finialOrb = new THREE.Mesh(new THREE.SphereGeometry(0.052, 12, 10), brass);
  finialOrb.position.y = 3.91;
  setShadow(finialOrb, true, true);
  flagStand.add(finialOrb);
  for (const side of [-1, 1]) {
    const wing = makeBox(0.18, 0.055, 0.035, brass, side * 0.095, 3.99, 0, true, true);
    wing.rotation.z = side * 0.36;
    flagStand.add(wing);
  }
  const eagleBody = new THREE.Mesh(new THREE.ConeGeometry(0.036, 0.12, 8), brass);
  eagleBody.position.y = 3.99;
  setShadow(eagleBody, true, true);
  flagStand.add(eagleBody);

  // Sculpted 3D draped silk flag mesh hanging naturally beside the pole
  const flagGeo = new THREE.PlaneGeometry(0.95, 1.55, 16, 20);
  const posAttr = flagGeo.attributes['position'];
  if (posAttr) {
    for (let i = 0; i < posAttr.count; i++) {
      const u = (posAttr.getX(i) + 0.475) / 0.95; // 0 near pole, 1 outer edge
      const v = 1 - (posAttr.getY(i) + 0.775) / 1.55; // 0 top, 1 bottom
      // Gather silk folds toward pole while draping downward cleanly
      const gatherX = -0.475 + u * (0.22 + v * 0.36);
      const dropY = 0.775 - v * 1.48 - u * 0.24;
      const pleatZ = Math.sin(u * Math.PI * 3.5 + v * 2.2) * (0.045 + u * 0.055);
      posAttr.setXYZ(i, gatherX + 0.49, dropY, pleatZ);
    }
    flagGeo.computeVertexNormals();
  }
  const silkFlag = new THREE.Mesh(
    flagGeo,
    lambert({map: makeUSFlagTex(), side: THREE.DoubleSide})
  );
  silkFlag.position.set(0.02, 2.86, 0.02);
  silkFlag.rotation.y = -0.25;
  setShadow(silkFlag, true, true);
  flagStand.add(silkFlag);

  group.add(flagStand);

  // 7. Carved Walnut Executive Desk at (0.65, 0, -0.85) — 2.1m x 1.0m x 0.78m, rotY = -0.12 rad
  // Leaves (0.75, 0, -1.58) behind desk clear for Grant & (-1.35, 0, +0.35) clear for Custer!
  const deskAnchor = new THREE.Group();
  deskAnchor.position.set(0.65, 0, -0.85);
  deskAnchor.rotation.y = -0.12;
  addAOStrip(group, 2.32, 1.22, 0.65, 0, -0.85, -0.12, 0.32);

  const deskBody = new THREE.Group();
  deskAnchor.add(deskBody);

  // Left & right carved pedestals + central kneehole modesty front
  deskBody.add(makeBox(0.62, 0.72, 0.92, deskWalnutMat, -0.70, 0.36, 0, true, true));
  deskBody.add(makeBox(0.62, 0.72, 0.92, deskWalnutMat, 0.70, 0.36, 0, true, true));
  deskBody.add(makeBox(0.82, 0.60, 0.14, deskDarkMat, 0, 0.38, 0.34, true, true));

  // Molded base plinths
  deskBody.add(makeBox(0.66, 0.08, 0.96, deskDarkMat, -0.70, 0.04, 0, true, true));
  deskBody.add(makeBox(0.66, 0.08, 0.96, deskDarkMat, 0.70, 0.04, 0, true, true));

  // Carved front panels (+Z facing camera/Custer) & brass pulls on rear/side
  for (const px of [-0.70, 0.70]) {
    deskBody.add(makeBox(0.46, 0.50, 0.04, deskDarkMat, px, 0.39, 0.47, true, true));
    deskBody.add(makeBox(0.36, 0.40, 0.025, wainLightMat, px, 0.39, 0.49, true, true));
    for (let dr = 0; dr < 3; dr++) {
      const dy = 0.20 + dr * 0.19;
      deskBody.add(makeBox(0.48, 0.15, 0.03, deskDarkMat, px, dy, -0.47, true, true));
      deskBody.add(makeBox(0.11, 0.025, 0.025, brass, px, dy, -0.49, true, true));
    }
  }
  // Central carved Presidential shield relief on desk front
  deskBody.add(makeBox(0.38, 0.36, 0.04, wainLightMat, 0, 0.40, 0.42, true, true));
  deskBody.add(makeBox(0.24, 0.24, 0.03, brass, 0, 0.41, 0.445, true, true));

  // Beveled walnut desktop + forest-green tooled leather inlay (y = 0.78m)
  deskBody.add(makeBox(2.10, 0.068, 1.00, deskDarkMat, 0, 0.746, 0, true, true));
  deskBody.add(makeBox(1.86, 0.012, 0.78, deskLeatherMat, 0, 0.784, 0, false, true));

  // Brass inkstand & stack of War Department dispatches on desk
  deskBody.add(makeBox(0.24, 0.028, 0.15, deskDarkMat, -0.10, 0.80, -0.16, true, true));
  for (const ix of [-0.15, -0.05]) {
    const well = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.032, 0.045, 12), brass);
    well.position.set(ix, 0.832, -0.16);
    setShadow(well, true, true);
    deskBody.add(well);
  }

  const dispatchMat = lambert({map: makeDocumentSheetTex('#2e3e52', true)});
  const plainSheetMat = lambert({map: makeDocumentSheetTex('#473b30', false)});
  for (let d = 0; d < 4; d++) {
    const sh = makeBox(
      0.23,
      0.008,
      0.30,
      d === 3 ? dispatchMat : plainSheetMat,
      0.32 + d * 0.008,
      0.794 + d * 0.009,
      -0.06,
      true,
      true
    );
    sh.rotation.y = 0.08 - d * 0.04;
    deskBody.add(sh);
  }

  group.add(deskAnchor);

  // Glowing green-shaded brass banker lamp at world (1.35, 0.78, -1.05)
  const grantLamp = createBankerLamp(brass, greenShadeMat);
  grantLamp.position.set(1.35, 0.788, -1.05);
  grantLamp.rotation.y = -0.35;
  group.add(grantLamp);

  // Wooden gavel sounding block at world (0.22, 0.79, -0.58)
  const soundingBlockGrp = new THREE.Group();
  soundingBlockGrp.position.set(0.22, 0.788, -0.58);
  const blockBase = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.11, 0.032, 20), deskDarkMat);
  blockBase.position.y = 0.016;
  setShadow(blockBase, true, true);
  soundingBlockGrp.add(blockBase);
  const blockBrassRing = new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.094, 0.012, 20), brass);
  blockBrassRing.position.y = 0.034;
  soundingBlockGrp.add(blockBrassRing);
  const blockStrikePad = new THREE.Mesh(new THREE.CylinderGeometry(0.082, 0.086, 0.016, 20), wainLightMat);
  blockStrikePad.position.y = 0.044;
  setShadow(blockStrikePad, true, true);
  soundingBlockGrp.add(blockStrikePad);
  group.add(soundingBlockGrp);

  // Gavel strike 3D shockwave ring & dust puffs at (0.22, 0.805, -0.58) (NOINK)
  const impactRingMat = new THREE.MeshBasicMaterial({
    color: '#fff5d4',
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const impactRing = new THREE.Mesh(new THREE.RingGeometry(0.085, 0.135, 28), impactRingMat);
  impactRing.rotation.x = -Math.PI / 2;
  impactRing.position.set(0.22, 0.802, -0.58);
  impactRing.layers.set(NOINK);
  group.add(impactRing);

  const dustPuffMat = new THREE.MeshBasicMaterial({
    color: '#f7ebd2',
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const dustPuffs: THREE.Mesh[] = [];
  const puffGeo = new THREE.SphereGeometry(0.022, 8, 6);
  for (let p = 0; p < 6; p++) {
    const pf = new THREE.Mesh(puffGeo, dustPuffMat);
    pf.layers.set(NOINK);
    group.add(pf);
    dustPuffs.push(pf);
  }

  // Two loose dispatch sheets near sounding block that jump on gavelStrike
  const jumpSheetA = makeBox(0.22, 0.005, 0.29, dispatchMat, 0.50, 0.794, -0.66, true, true);
  jumpSheetA.rotation.y = -0.18;
  group.add(jumpSheetA);

  const jumpSheetB = makeBox(0.21, 0.005, 0.28, plainSheetMat, -0.08, 0.794, -0.72, true, true);
  jumpSheetB.rotation.y = 0.22;
  group.add(jumpSheetB);

  // Grant's high-backed leather chair set well back at (0.82, 0, -2.18) so (0.75, 0, -1.58) stays 100% clear!
  const grantChair = createSenatorChair(deskDarkMat, lambert({color: '#2d3b32'}), brass);
  grantChair.scale.setScalar(1.04);
  grantChair.position.set(0.82, 0, -2.18);
  grantChair.rotation.y = -0.08;
  group.add(grantChair);

  const motes = createDustMotes(
    299,
    34,
    new THREE.Vector3(-5.0, 0.7, -2.6),
    new THREE.Vector3(1.8, 3.8, 0.8),
    '#fff2cc'
  );
  group.add(motes.group);

  return {
    group,
    update: (t: number, gavelStrike: number): void => {
      motes.update(t);
      const g = clamp01(gavelStrike);
      // Bell curve peaks during impact transition and settles cleanly at g = 0 and g = 1
      const bell = Math.sin(g * Math.PI);
      const settle = easeOutCubic(g);

      // Subtle desk slam recoil
      deskBody.position.y = -bell * 0.006;
      soundingBlockGrp.position.y = 0.788 - bell * 0.006;

      // Expanding warm shockwave ring & radial dust puffs
      impactRingMat.opacity = bell * 0.62;
      const ringScale = 0.85 + settle * 2.85;
      impactRing.scale.setScalar(ringScale);

      dustPuffMat.opacity = bell * 0.45;
      for (let i = 0; i < dustPuffs.length; i++) {
        const pf = dustPuffs[i];
        if (!pf) continue;
        const ang = (i / dustPuffs.length) * Math.PI * 2 + 0.35;
        const dist = 0.11 + settle * 0.28;
        pf.position.set(
          0.22 + Math.cos(ang) * dist,
          0.805 + bell * 0.075,
          -0.58 + Math.sin(ang) * dist
        );
        pf.scale.setScalar(0.65 + bell * 0.9);
      }

      // Jumping War Department dispatch sheets (hop on strike, land slightly displaced)
      jumpSheetA.position.set(
        0.50 + settle * 0.045,
        0.794 + bell * 0.072,
        -0.66 + settle * 0.03
      );
      jumpSheetA.rotation.set(
        bell * 0.16,
        -0.18 - settle * 0.19,
        -bell * 0.14
      );

      jumpSheetB.position.set(
        -0.08 - settle * 0.05,
        0.794 + bell * 0.058,
        -0.72 + settle * 0.025
      );
      jumpSheetB.rotation.set(
        -bell * 0.13,
        0.22 + settle * 0.24,
        bell * 0.15
      );
    },
  };
}

// ============================================================================
// SET 3: 'cabin' — FORT ABRAHAM LINCOLN TIMBER HQ CABIN + 3D DAKOTA EXTERIOR
// ============================================================================

interface CabinBuild {
  group: THREE.Group;
  update: (t: number, probationSlide: number) => void;
}

function buildCabinSet(): CabinBuild {
  const group = new THREE.Group();
  group.name = 'set_cabin';

  // Materials
  const pineFloorTex = rep(
    makeWoodPlankTex(301, ['#8f653f', '#7d5634', '#996d45', '#855c39'], 7, '#5c3c22'),
    4,
    4
  );
  const floorMat = lambert({map: pineFloorTex});
  const rugMat = lambert({map: makeFrontierRugTex()});

  const logTex = rep(
    makeWoodPlankTex(302, ['#996b41', '#8d6039', '#a37348', '#845934'], 4, '#664225'),
    3,
    1
  );
  const logMat = lambert({map: logTex});
  const logEndMat = lambert({color: '#cbb089'});
  const chinkMat = lambert({color: '#ddd1b8'});
  const timberDarkMat = lambert({color: '#543620'});
  const timberMedMat = lambert({color: '#6e482c'});
  const ironMat = twoTone(
    new THREE.MeshPhongMaterial({
      color: '#383430',
      specular: '#8c857d',
      shininess: 14,
    })
  );
  const brass = brassMat('#d4a63f', 24);

  // 1. Interior Pine Floor (X = -6.2..+6.2m, Z = -4.6..+4.8m, y = 0) & Frontier Rug
  group.add(makeBox(12.6, 0.16, 9.6, floorMat, 0, -0.08, 0.10, false, true));
  group.add(makeBox(4.4, 0.016, 3.8, rugMat, 0.10, 0.008, -0.65, false, true));

  // 2. Real 3D Rounded Hewn Log Walls with Mortar Chinking & Saddle-Notched Corners
  // TRUE 3D OPEN DOORWAY at x = -2.1m, z = -4.6m (opening 1.55m wide [-2.875..-1.325] x 2.45m high)
  // Plus 6-pane frontier window on left wall at x = -5.8m, z = -1.2m [-1.95..-0.45, y = 1.35..2.85m]
  const logRadius = 0.185;
  const coursePitch = 0.335;
  const numCourses = 11; // up to y = 3.55m

  const addHorizontalLogX = (x0: number, x1: number, y: number, z: number, withEndCaps: boolean): void => {
    const len = x1 - x0;
    if (len < 0.05) return;
    const xm = (x0 + x1) * 0.5;
    const cyl = new THREE.Mesh(
      new THREE.CylinderGeometry(logRadius, logRadius, len, 12),
      [logMat, logEndMat, logEndMat]
    );
    cyl.rotation.z = Math.PI / 2;
    cyl.position.set(xm, y, z);
    setShadow(cyl, true, true);
    group.add(cyl);

    if (!withEndCaps && y > 0.25) {
      // Cream-tan mortar chinking strip beneath log course
      group.add(makeBox(len - 0.08, 0.085, 0.23, chinkMat, xm, y - coursePitch * 0.5, z, true, true));
    }
  };

  const addHorizontalLogZ = (z0: number, z1: number, y: number, x: number): void => {
    const len = z1 - z0;
    if (len < 0.05) return;
    const zm = (z0 + z1) * 0.5;
    const cyl = new THREE.Mesh(
      new THREE.CylinderGeometry(logRadius, logRadius, len, 12),
      [logMat, logEndMat, logEndMat]
    );
    cyl.rotation.x = Math.PI / 2;
    cyl.position.set(x, y, zm);
    setShadow(cyl, true, true);
    group.add(cyl);

    if (y > 0.25) {
      group.add(makeBox(0.23, 0.085, len - 0.08, chinkMat, x, y - coursePitch * 0.5, zm, true, true));
    }
  };

  const doorXMin = -2.875;
  const doorXMax = -1.325;
  const doorYMax = 2.45;

  const winZMin = -1.95;
  const winZMax = -0.45;
  const winYMin = 1.35;
  const winYMax = 2.85;

  for (let c = 0; c < numCourses; c++) {
    const ly = 0.185 + c * coursePitch;

    // Back wall (z = -4.60m) with protruding saddle-notched corners to ±6.42m
    if (ly < doorYMax + 0.10) {
      // Split left and right around open doorway!
      addHorizontalLogX(-6.42, doorXMin, ly, -4.60, false);
      addHorizontalLogX(doorXMax, 6.42, ly, -4.60, false);
    } else {
      // Full-span log header courses above doorway
      addHorizontalLogX(-6.42, 6.42, ly, -4.60, false);
    }

    // Interlocking Z side walls offset by half-notches at corners (z = -5.02..+5.15m)
    const zy = ly + 0.08;
    // Left wall (x = -6.0m) with real 3D window hole at z = -1.95..-0.45m, y = 1.35..2.85m
    if (zy > winYMin - 0.08 && zy < winYMax + 0.08) {
      addHorizontalLogZ(-5.02, winZMin, zy, -6.0);
      addHorizontalLogZ(winZMax, 5.15, zy, -6.0);
    } else {
      addHorizontalLogZ(-5.02, 5.15, zy, -6.0);
    }

    // Right wall (x = +6.0m)
    addHorizontalLogZ(-5.02, 5.15, zy, 6.0);
  }

  // AO contact strips along cabin walls
  addAOStrip(group, 3.2, 0.42, -4.45, 0, -4.42, 0, 0.28);
  addAOStrip(group, 7.3, 0.42, 2.35, 0, -4.42, 0, 0.28);
  addAOStrip(group, 0.42, 9.6, -5.82, 0, 0.10, 0, 0.28);
  addAOStrip(group, 0.42, 9.6, 5.82, 0, 0.10, 0, 0.28);

  // Pitched Timber Rafters, Ridge Beam & Roof Boards (castShadow = false on overhead roof!)
  const ridgeBeam = makeBox(12.8, 0.24, 0.22, timberDarkMat, 0, 4.62, 0.10, false, false);
  group.add(ridgeBeam);

  const roofPlankMat = lambert({color: '#6b472b'});
  for (const side of [-1, 1]) {
    // Sloped roof deck high overhead — castShadow = false so sunlight enters freely!
    const deck = makeBox(12.6, 0.09, 5.25, roofPlankMat, 0, 4.18, 0.10 + side * 2.42, false, false);
    deck.rotation.x = side * 0.21;
    group.add(deck);
  }

  for (let rx = -5.2; rx <= 5.2; rx += 1.73) {
    for (const side of [-1, 1]) {
      const rafter = makeBox(0.14, 0.18, 5.1, timberDarkMat, rx, 4.08, 0.10 + side * 2.38, false, false);
      rafter.rotation.x = side * 0.21;
      group.add(rafter);
    }
    // Collar tie beam
    group.add(makeBox(0.13, 0.15, 6.4, timberDarkMat, rx, 3.88, 0.10, false, false));
  }

  // 3. Heavy Timber Door Frame & Swung-Inward Plank Door (x = -2.1m, z = -4.6m)
  // Jambs frame the exact 1.55m x 2.45m opening without blocking a millimeter of it!
  group.add(makeBox(0.16, 2.54, 0.44, timberDarkMat, doorXMin - 0.06, 1.27, -4.60, true, true));
  group.add(makeBox(0.16, 2.54, 0.44, timberDarkMat, doorXMax + 0.06, 1.27, -4.60, true, true));
  group.add(makeBox(1.96, 0.18, 0.48, timberDarkMat, -2.10, 2.54, -4.60, true, true));
  group.add(makeBox(1.72, 0.035, 0.46, timberMedMat, -2.10, 0.018, -4.60, false, true));

  // Plank door hinged at x = -2.85m, swung inward into cabin leaving full sightline open!
  const doorPivot = new THREE.Group();
  doorPivot.position.set(-2.85, 0.035, -4.44);
  doorPivot.rotation.y = -1.71; // Swung wide inward so leaf & ironwork frame left of doorway cleanly

  const doorW = 1.48;
  const doorH = 2.40;
  for (let p = 0; p < 5; p++) {
    const pw = doorW / 5;
    const pMat = p % 2 === 0 ? timberMedMat : lambert({color: '#7d5333'});
    doorPivot.add(makeBox(pw - 0.008, doorH, 0.065, pMat, pw * (p + 0.5), doorH * 0.5, 0, true, true));
  }
  // Cross battens & diagonal Z-brace on inward face
  doorPivot.add(makeBox(doorW - 0.08, 0.14, 0.045, timberDarkMat, doorW * 0.5, 0.36, 0.05, true, true));
  doorPivot.add(makeBox(doorW - 0.08, 0.14, 0.045, timberDarkMat, doorW * 0.5, 2.02, 0.05, true, true));
  const zBrace = makeBox(1.88, 0.13, 0.04, timberDarkMat, doorW * 0.5, 1.19, 0.048, true, true);
  zBrace.rotation.z = 0.86;
  doorPivot.add(zBrace);

  // Wrought-iron strap hinges & latch
  for (const hy of [0.36, 2.02]) {
    doorPivot.add(makeBox(0.56, 0.055, 0.02, ironMat, 0.28, hy, -0.042, true, true));
    doorPivot.add(makeBox(0.56, 0.055, 0.02, ironMat, 0.28, hy, 0.075, true, true));
  }
  doorPivot.add(makeBox(0.18, 0.045, 0.08, ironMat, doorW - 0.16, 1.08, 0.05, true, true));
  group.add(doorPivot);

  // 4. 6-Pane Frontier Window on Left Wall (x = -5.8m, z = -1.2m) + Warm Sunbeam
  const frontierWin = new THREE.Group();
  frontierWin.position.set(-5.96, winYMin, -1.20);
  frontierWin.rotation.y = Math.PI / 2;

  const fw = winZMax - winZMin; // 1.50m
  const fh = winYMax - winYMin; // 1.50m
  const fPane = new THREE.Mesh(new THREE.PlaneGeometry(fw - 0.12, fh - 0.12), untone('#fff6dc'));
  fPane.position.set(0, fh * 0.5, -0.06);
  fPane.layers.set(NOINK);
  frontierWin.add(fPane);

  frontierWin.add(makeBox(fw + 0.24, 0.12, 0.46, timberDarkMat, 0, -0.04, 0.04, true, true));
  frontierWin.add(makeBox(fw + 0.24, 0.12, 0.44, timberDarkMat, 0, fh + 0.04, 0.02, true, true));
  frontierWin.add(makeBox(0.11, fh + 0.08, 0.42, timberDarkMat, -fw * 0.5, fh * 0.5, 0.02, true, true));
  frontierWin.add(makeBox(0.11, fh + 0.08, 0.42, timberDarkMat, fw * 0.5, fh * 0.5, 0.02, true, true));
  // 6-pane muntins (2 vertical columns x 3 rows -> 1 vertical mullion + 2 horizontal bars)
  frontierWin.add(makeBox(0.045, fh, 0.06, timberDarkMat, 0, fh * 0.5, -0.02, true, true));
  frontierWin.add(makeBox(fw, 0.045, 0.06, timberDarkMat, 0, fh * 0.333, -0.02, true, true));
  frontierWin.add(makeBox(fw, 0.045, 0.06, timberDarkMat, 0, fh * 0.667, -0.02, true, true));
  group.add(frontierWin);

  const leftExtSky = new THREE.Mesh(new THREE.PlaneGeometry(5.5, 4.5), untone('#e4f2f8'));
  leftExtSky.rotation.y = Math.PI / 2;
  leftExtSky.position.set(-6.9, 2.2, -1.2);
  leftExtSky.layers.set(NOINK);
  group.add(leftExtSky);

  // Volumetric sunbeam from left frontier window
  addVolumetricSunbeam(
    group,
    new THREE.Vector3(-5.70, 2.35, -1.20),
    new THREE.Vector3(-1.45, 0.15, -0.85),
    0.58,
    1.12,
    0.10,
    '#fff2cf'
  );

  // Sunlit floor patch & volumetric light shaft pouring through the OPEN DOORWAY onto kneeling Custer!
  addVolumetricSunbeam(
    group,
    new THREE.Vector3(-2.10, 1.65, -4.55),
    new THREE.Vector3(-0.75, 0.12, -0.55),
    0.72,
    1.28,
    0.11,
    '#fff3d1'
  );

  const doorPatchMat = new THREE.MeshBasicMaterial({
    color: '#fff4ce',
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -3,
  });
  const doorFloorShape = new THREE.Shape();
  doorFloorShape.moveTo(-2.82, 4.52);
  doorFloorShape.lineTo(-1.36, 4.52);
  doorFloorShape.lineTo(-0.12, -0.45);
  doorFloorShape.lineTo(-2.05, -0.45);
  doorFloorShape.closePath();
  const doorFloorGeo = new THREE.ShapeGeometry(doorFloorShape);
  const doorFloorPatch = new THREE.Mesh(doorFloorGeo, doorPatchMat);
  doorFloorPatch.rotation.x = -Math.PI / 2;
  doorFloorPatch.position.set(0, 0.014, 0);
  doorFloorPatch.layers.set(NOINK);
  group.add(doorFloorPatch);

  // 5. Genuine 3D Fort Abraham Lincoln Exterior Diorama (z = -4.8m..-42m)
  const exterior = new THREE.Group();
  exterior.name = 'fort_lincoln_exterior';

  // Sunlit golden-green Dakota prairie ground (y = -0.05m) + dirt parade road
  const prairieTex = rep(makeSoftPlasterTex(310, '#b5c476', '#9fb060', '#8b9d50'), 8, 8);
  const prairieGround = makeBox(84.0, 0.12, 44.0, lambert({map: prairieTex}), -4.0, -0.11, -26.5, false, true);
  exterior.add(prairieGround);

  const paradeTrail = new THREE.Mesh(
    new THREE.PlaneGeometry(4.2, 32.0),
    lambert({color: '#dfcfa2'})
  );
  paradeTrail.rotation.x = -Math.PI / 2;
  paradeTrail.rotation.z = -0.16;
  paradeTrail.position.set(-3.4, -0.038, -20.0);
  paradeTrail.receiveShadow = true;
  exterior.add(paradeTrail);

  // Wooden Log Stockade Fence at z = -16m with Fort Gate & Blockhouse Watchtower
  const palisadeMat = lambert({color: '#87603c'});
  const palisadeDarkMat = lambert({color: '#6e4c2e'});
  const stockadeRand = mulberry32(321);
  for (let sx = -24.0; sx <= 14.0; sx += 0.34) {
    if (sx > -4.6 && sx < -2.2) continue; // Fort parade gate gap
    const ph = 2.75 + stockadeRand() * 0.22;
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.16, ph, 7),
      sx % 0.68 < 0.34 ? palisadeMat : palisadeDarkMat
    );
    post.position.set(sx, ph * 0.5 - 0.05, -16.0);
    setShadow(post, true, true);
    exterior.add(post);

    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.155, 0.36, 7), logEndMat);
    tip.position.set(sx, ph + 0.12, -16.0);
    setShadow(tip, true, true);
    exterior.add(tip);
  }
  // Timber gate arch header across gate gap
  exterior.add(makeBox(3.1, 0.26, 0.34, timberDarkMat, -3.4, 3.05, -16.0, true, true));

  // Blockhouse watchtower on stockade corner (x = -9.2m, z = -16.2m)
  exterior.add(makeBox(2.8, 3.4, 2.8, palisadeMat, -9.2, 1.65, -16.2, true, true));
  exterior.add(makeBox(3.2, 1.5, 3.2, palisadeDarkMat, -9.2, 4.05, -16.2, true, true));
  const towerRoof = new THREE.Mesh(new THREE.ConeGeometry(2.55, 1.45, 4), timberDarkMat);
  towerRoof.rotation.y = Math.PI * 0.25;
  towerRoof.position.set(-9.2, 5.52, -16.2);
  setShadow(towerRoof, true, true);
  exterior.add(towerRoof);

  // Cavalry Barracks with Pitched Gable Roofs (framed through open doorway from multiple angles!)
  const barracksWallMat = lambert({color: '#dfd6c3'});
  const shingleMat = lambert({color: '#5c4330'});
  const buildBarracks = (bx: number, bz: number, bw: number, bd: number): void => {
    const b = new THREE.Group();
    b.position.set(bx, -0.05, bz);
    b.add(makeBox(bw, 2.45, bd, barracksWallMat, 0, 1.225, 0, true, true));
    // Porch roof & posts facing cabin
    b.add(makeBox(bw + 0.2, 0.12, 1.05, shingleMat, 0, 2.15, bd * 0.5 + 0.45, true, true));
    for (let px = -bw * 0.42; px <= bw * 0.43; px += bw * 0.28) {
      b.add(makeBox(0.11, 2.15, 0.11, timberMedMat, px, 1.075, bd * 0.5 + 0.88, true, true));
    }
    // Pitched gable roof
    for (const side of [-1, 1]) {
      const slope = makeBox(bw + 0.4, 0.14, bd * 0.64, shingleMat, 0, 2.95, side * bd * 0.27, true, true);
      slope.rotation.x = side * 0.48;
      b.add(slope);
    }
    // Gable end triangles + brick chimney
    const gableShape = new THREE.Shape();
    gableShape.moveTo(-bd * 0.5, 0);
    gableShape.lineTo(bd * 0.5, 0);
    gableShape.lineTo(0, 1.05);
    gableShape.closePath();
    const gableGeo = new THREE.ExtrudeGeometry(gableShape, {depth: bw, bevelEnabled: false});
    const gable = new THREE.Mesh(gableGeo, barracksWallMat);
    gable.rotation.y = Math.PI / 2;
    gable.position.set(-bw * 0.5, 2.45, 0);
    setShadow(gable, true, true);
    b.add(gable);

    b.add(makeBox(0.45, 1.35, 0.45, lambert({color: '#8c4b3b'}), bw * 0.28, 3.35, 0, true, true));
    exterior.add(b);
  };

  buildBarracks(-6.3, -13.8, 4.4, 3.1);
  buildBarracks(0.4, -14.6, 3.8, 2.8);

  // Fort Flagpole flying animated U.S. Garrison Flag at (x = -3.2m, z = -14.0m)
  const fortPole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.085, 8.2, 10),
    lambert({color: '#e8e0cf'})
  );
  fortPole.position.set(-3.2, 4.05, -14.0);
  setShadow(fortPole, true, true);
  exterior.add(fortPole);

  const fortTruck = new THREE.Mesh(new THREE.SphereGeometry(0.10, 10, 8), brass);
  fortTruck.position.set(-3.2, 8.2, -14.0);
  exterior.add(fortTruck);

  // Also add a lower parade guidon/garrison flag at y = 4.65m (or place pole top at 5.8m so flag is clearly visible inside doorway lintel!)
  // Wait: let's check vertical framing through the 2.45m high doorway from y = 1.25m camera!
  // From y = 1.25m at z = +1.5m through doorway lintel y = 2.45m at z = -4.6m (dz = 6.1m, dy = +1.20m -> slope +0.197/m):
  // At z = -14.0m (9.4m past doorway), doorway top shows up to y = 2.45 + 9.4 * 0.197 = 4.30m!
  // Placing the flagpole top at y = 4.15m with the U.S. flag flying at y = 3.55..4.10m guarantees the waving U.S. flag is 100% framed INSIDE the open doorway!
  fortPole.scale.set(1, 0.52, 1);
  fortPole.position.set(-3.2, 2.08, -14.0);
  fortTruck.position.set(-3.2, 4.24, -14.0);

  const extFlagGeo = new THREE.PlaneGeometry(1.15, 0.68, 12, 6);
  const extFlagBaseX: number[] = [];
  const extFlagPos = extFlagGeo.attributes['position'];
  if (extFlagPos) {
    for (let i = 0; i < extFlagPos.count; i++) {
      extFlagBaseX.push(extFlagPos.getX(i));
    }
  }
  const extFlagMesh = new THREE.Mesh(
    extFlagGeo,
    lambert({map: makeUSFlagTex(), side: THREE.DoubleSide})
  );
  extFlagMesh.position.set(-2.60, 3.82, -14.0);
  setShadow(extFlagMesh, true, false);
  exterior.add(extFlagMesh);

  // 3D Ponderosa Pine Trees across mid-ground Dakota prairie
  const pineGreenA = lambert({color: '#4c7a5b'});
  const pineGreenB = lambert({color: '#395e45'});
  const pineTrunkMat = lambert({color: '#6b482e'});
  const addPonderosaPine = (px: number, pz: number, sc: number): void => {
    const p = new THREE.Group();
    p.position.set(px, -0.05, pz);
    p.scale.setScalar(sc);

    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.24, 2.2, 8), pineTrunkMat);
    trunk.position.y = 1.1;
    setShadow(trunk, true, true);
    p.add(trunk);

    const tiers: ReadonlyArray<readonly [number, number, number]> = [
      [1.25, 1.85, 2.15],
      [1.02, 1.65, 3.15],
      [0.76, 1.45, 4.05],
      [0.48, 1.15, 4.82],
    ];
    tiers.forEach(([r, h, y], idx) => {
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(r, h, 9),
        idx % 2 === 0 ? pineGreenA : pineGreenB
      );
      cone.position.y = y;
      setShadow(cone, true, true);
      p.add(cone);
    });
    exterior.add(p);
  };

  for (const [tx, tz, ts] of [
    [-11.2, -19.5, 1.12],
    [-8.0, -21.0, 0.96],
    [-4.9, -22.5, 1.05],
    [-1.7, -20.2, 0.92],
    [1.8, -21.8, 1.08],
    [-14.5, -24.0, 1.24],
    [5.2, -23.5, 1.15],
  ] as const) {
    addPonderosaPine(tx, tz, ts);
  }

  // Distant Soft Blue-Ochre Dakota Buttes at z = -34m
  const butteOchreMat = lambert({color: '#bfa375'});
  const butteBlueMat = lambert({color: '#8da69f'});
  const butteMidMat = lambert({color: '#9db09a'});
  const addButte = (bx: number, bz: number, rTop: number, rBot: number, bh: number, mat: THREE.Material): void => {
    const mesa = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, bh, 8), mat);
    mesa.scale.set(1.35, 1.0, 0.72);
    mesa.position.set(bx, bh * 0.5 - 0.1, bz);
    mesa.castShadow = false;
    mesa.receiveShadow = true;
    exterior.add(mesa);
  };

  addButte(-18.0, -34.5, 3.8, 6.8, 5.4, butteBlueMat);
  addButte(-8.2, -33.8, 3.2, 5.8, 4.6, butteOchreMat);
  addButte(-1.2, -35.2, 4.1, 7.2, 5.1, butteMidMat);
  addButte(8.5, -34.0, 3.5, 6.4, 4.8, butteBlueMat);

  // Bright Sky Backdrop at z = -42m (untone('#cfe4f2'), NOINK, castShadow = false)
  const skyDomePlane = new THREE.Mesh(new THREE.PlaneGeometry(105.0, 36.0), untone('#cfe4f2'));
  skyDomePlane.position.set(-4.0, 14.0, -42.0);
  skyDomePlane.layers.set(NOINK);
  exterior.add(skyDomePlane);

  const horizonBand = new THREE.Mesh(new THREE.PlaneGeometry(105.0, 8.5), untone('#e6f1eb'));
  horizonBand.position.set(-4.0, 3.2, -41.8);
  horizonBand.layers.set(NOINK);
  exterior.add(horizonBand);

  // Soft Storybook Clouds on sky backdrop (NOINK)
  const cloudMat = untone('#f8fbfc');
  for (const [cx, cy, cs] of [
    [-12.5, 9.2, 1.3],
    [-4.2, 7.8, 1.05],
    [4.6, 9.6, 1.2],
  ] as const) {
    const cl = new THREE.Group();
    cl.position.set(cx, cy, -41.4);
    cl.scale.setScalar(cs);
    for (const [ox, oy, rx, ry] of [
      [0, 0, 2.2, 0.55],
      [-0.7, 0.35, 1.3, 0.62],
      [0.85, 0.25, 1.1, 0.48],
    ] as const) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(1.0, 12, 8), cloudMat);
      puff.scale.set(rx, ry, 0.2);
      puff.position.set(ox, oy, 0);
      puff.layers.set(NOINK);
      cl.add(puff);
    }
    exterior.add(cl);
  }

  group.add(exterior);

  // 6. Interior HQ Props
  // (A) Large Wooden-Framed 'MONTANA TERRITORY · 1876' Campaign Wall Map at (1.15, 2.25, -4.38)
  const wallMapGrp = new THREE.Group();
  wallMapGrp.position.set(1.15, 2.25, -4.34);

  wallMapGrp.add(makeBox(2.42, 1.52, 0.08, timberDarkMat, 0, 0, -0.02, true, true));
  wallMapGrp.add(makeBox(2.26, 1.36, 0.05, timberMedMat, 0, 0, 0.01, true, true));
  const mapCanvas = new THREE.Mesh(
    new THREE.PlaneGeometry(2.16, 1.28),
    lambert({map: makeMontanaMapTex()})
  );
  mapCanvas.position.set(0, 0, 0.042);
  wallMapGrp.add(mapCanvas);

  // Brass corner map tacks
  for (const [tx, ty] of [
    [-1.02, 0.58],
    [1.02, 0.58],
    [-1.02, -0.58],
    [1.02, -0.58],
  ] as const) {
    const tack = new THREE.Mesh(new THREE.SphereGeometry(0.024, 8, 8), brass);
    tack.position.set(tx, ty, 0.05);
    wallMapGrp.add(tack);
  }
  group.add(wallMapGrp);

  // (B) Wooden Trestle / Field Campaign Desk at (0.25, 0, -1.35) — 1.35m x 0.72m x 0.75m
  const trestle = new THREE.Group();
  trestle.position.set(0.25, 0, -1.35);
  addAOStrip(group, 1.50, 0.88, 0.25, 0, -1.35, 0, 0.28);

  // Rough plank tabletop
  for (let p = 0; p < 3; p++) {
    const pz = (p - 1) * 0.235;
    trestle.add(
      makeBox(1.35, 0.052, 0.228, p === 1 ? timberMedMat : lambert({color: '#7d5333'}), 0, 0.724, pz, true, true)
    );
  }
  trestle.add(makeBox(1.18, 0.065, 0.56, timberDarkMat, 0, 0.67, 0, true, true));

  // Crossed X-frame sawbuck trestle legs on left & right + stretcher beam
  for (const lx of [-0.50, 0.50]) {
    trestle.add(makeBox(0.09, 0.07, 0.66, timberDarkMat, lx, 0.035, 0, true, true));
    for (const ang of [0.38, -0.38]) {
      const xLeg = makeBox(0.075, 0.74, 0.075, timberDarkMat, lx, 0.36, 0, true, true);
      xLeg.rotation.x = ang;
      trestle.add(xLeg);
    }
  }
  trestle.add(makeBox(1.06, 0.065, 0.075, timberDarkMat, 0, 0.28, 0, true, true));

  // Tabletop campaign props: unrolled field map, enameled tin mug, brass compass/spyglass, oil lantern
  const tableMap = new THREE.Mesh(
    new THREE.BoxGeometry(0.66, 0.008, 0.44),
    lambert({map: makeMontanaMapTex()})
  );
  tableMap.position.set(-0.08, 0.755, -0.02);
  tableMap.rotation.y = 0.05;
  setShadow(tableMap, true, true);
  trestle.add(tableMap);

  // Rolled map scroll beside flat map
  const scroll = new THREE.Mesh(
    new THREE.CylinderGeometry(0.028, 0.028, 0.46, 12),
    lambert({color: '#efe3c6'})
  );
  scroll.rotation.x = Math.PI / 2;
  scroll.rotation.z = 0.14;
  scroll.position.set(-0.48, 0.778, -0.04);
  setShadow(scroll, true, true);
  trestle.add(scroll);

  // Cavalry enameled blue tin mug
  const mugMat = lambert({color: '#2f4d6e'});
  const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.042, 0.095, 14), mugMat);
  mug.position.set(0.42, 0.798, -0.19);
  setShadow(mug, true, true);
  trestle.add(mug);
  const mugHandle = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.007, 6, 12, Math.PI), mugMat);
  mugHandle.rotation.z = -Math.PI / 2;
  mugHandle.position.set(0.462, 0.798, -0.19);
  trestle.add(mugHandle);

  // Brass pocket compass & telescoping brass spyglass
  const compass = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.018, 14), brass);
  compass.position.set(-0.34, 0.759, 0.19);
  setShadow(compass, true, true);
  trestle.add(compass);

  const spyglass = new THREE.Group();
  spyglass.position.set(-0.46, 0.774, 0.14);
  spyglass.rotation.y = 0.48;
  const sg1 = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.022, 0.15, 12), lambert({color: '#4f331f'}));
  sg1.rotation.z = Math.PI / 2;
  setShadow(sg1, true, true);
  spyglass.add(sg1);
  const sg2 = new THREE.Mesh(new THREE.CylinderGeometry(0.020, 0.016, 0.13, 12), brass);
  sg2.rotation.z = Math.PI / 2;
  sg2.position.x = 0.12;
  setShadow(sg2, true, true);
  spyglass.add(sg2);
  trestle.add(spyglass);

  // Frontier oil lantern with glowing NOINK flame
  const lantern = new THREE.Group();
  lantern.position.set(0.48, 0.75, 0.14);
  const lFont = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.082, 0.065, 14), brass);
  lFont.position.y = 0.032;
  setShadow(lFont, true, true);
  lantern.add(lFont);
  const lChimney = new THREE.Mesh(
    new THREE.CylinderGeometry(0.042, 0.058, 0.16, 14),
    new THREE.MeshBasicMaterial({
      color: '#fff6d8',
      transparent: true,
      opacity: 0.44,
      depthWrite: false,
    })
  );
  lChimney.position.y = 0.14;
  lChimney.layers.set(NOINK);
  lantern.add(lChimney);
  const lFlame = new THREE.Mesh(new THREE.SphereGeometry(0.026, 8, 8), untone('#ffe58f'));
  lFlame.scale.set(0.75, 1.45, 0.75);
  lFlame.position.y = 0.12;
  lFlame.layers.set(NOINK);
  lantern.add(lFlame);
  const lCap = new THREE.Mesh(new THREE.ConeGeometry(0.068, 0.045, 14), ironMat);
  lCap.position.y = 0.235;
  setShadow(lCap, true, true);
  lantern.add(lCap);
  addSunPool(trestle, 0.54, 0.48, 0.46, 0.752, 0.14, 0, 0.20, '#ffea9c');
  trestle.add(lantern);

  // Probation / Campaign Orders Document driven by state.probationSlide (0..1)
  const probationDoc = new THREE.Mesh(
    new THREE.BoxGeometry(0.23, 0.006, 0.30),
    lambert({map: makeDocumentSheetTex('#283d63', true)})
  );
  probationDoc.position.set(0.38, 0.762, 0.06);
  setShadow(probationDoc, true, true);
  trestle.add(probationDoc);

  group.add(trestle);

  // (C) Cavalry Sabre & Kepi Rack on Wall Post at (x = +3.4m, z = -4.2m)
  const rackGrp = new THREE.Group();
  rackGrp.position.set(3.40, 0, -4.32);

  rackGrp.add(makeBox(0.22, 3.45, 0.22, timberDarkMat, 0, 1.725, 0, true, true));
  rackGrp.add(makeBox(0.86, 0.16, 0.06, timberMedMat, 0, 2.02, 0.13, true, true));
  for (const px of [-0.26, 0.0, 0.26]) {
    const peg = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.16, 8), timberDarkMat);
    peg.rotation.x = Math.PI * 0.42;
    peg.position.set(px, 2.02, 0.20);
    rackGrp.add(peg);
  }

  // U.S. 7th Cavalry Officer Kepi on right peg
  const kepi = new THREE.Group();
  kepi.position.set(0.26, 2.08, 0.26);
  kepi.rotation.x = 0.45;
  kepi.rotation.z = -0.18;
  const kepiCrown = new THREE.Mesh(
    new THREE.CylinderGeometry(0.105, 0.125, 0.12, 16),
    lambert({color: '#223554'})
  );
  setShadow(kepiCrown, true, true);
  kepi.add(kepiCrown);
  const kepiBand = new THREE.Mesh(new THREE.CylinderGeometry(0.126, 0.128, 0.026, 16), brass);
  kepiBand.position.y = -0.045;
  kepi.add(kepiBand);
  const kepiVisor = new THREE.Mesh(
    new THREE.CylinderGeometry(0.13, 0.13, 0.012, 16, 1, false, -Math.PI * 0.45, Math.PI * 0.9),
    ironMat
  );
  kepiVisor.position.set(0, -0.055, 0.055);
  kepi.add(kepiVisor);
  rackGrp.add(kepi);

  // 1860 Light Cavalry Sabre in steel scabbard with brass handguard hanging diagonally across rack
  const sabreGrp = new THREE.Group();
  sabreGrp.position.set(-0.08, 1.88, 0.23);
  sabreGrp.rotation.z = -0.22;
  const scabbard = new THREE.Mesh(
    new THREE.CylinderGeometry(0.019, 0.012, 0.92, 10),
    twoTone(new THREE.MeshPhongMaterial({color: '#6e7780', specular: '#d8e0e8', shininess: 22}))
  );
  scabbard.rotation.z = Math.PI / 2;
  setShadow(scabbard, true, true);
  sabreGrp.add(scabbard);
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.016, 0.15, 10), timberDarkMat);
  grip.rotation.z = Math.PI / 2;
  grip.position.x = -0.53;
  sabreGrp.add(grip);
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.065, 0.011, 8, 14, Math.PI * 1.15), brass);
  guard.position.set(-0.52, -0.02, 0);
  sabreGrp.add(guard);
  rackGrp.add(sabreGrp);

  group.add(rackGrp);

  // (D) Wooden Supply Crates & Rolled Canvas Tents at (-4.2, 0, -3.6) — well clear of doorway!
  const supplies = new THREE.Group();
  supplies.position.set(-4.35, 0, -3.65);
  const crateMat = lambert({map: makeCrateStencilTex()});

  const crateA = makeBox(0.86, 0.62, 0.68, crateMat, -0.25, 0.31, -0.10, true, true);
  crateA.rotation.y = 0.14;
  supplies.add(crateA);

  const crateB = makeBox(0.68, 0.52, 0.56, crateMat, 0.48, 0.26, 0.08, true, true);
  crateB.rotation.y = -0.22;
  supplies.add(crateB);

  const crateC = makeBox(0.62, 0.46, 0.52, timberMedMat, -0.20, 0.85, -0.12, true, true);
  crateC.rotation.y = -0.08;
  supplies.add(crateC);

  // Rolled canvas Sibley tent bundles with leather straps
  const canvasMat = lambert({color: '#dfd4bc'});
  for (const [rx, ry, rz, rrot] of [
    [0.25, 0.18, 0.52, 0.28],
    [0.34, 0.50, 0.48, 0.19],
  ] as const) {
    const roll = new THREE.Group();
    roll.position.set(rx, ry, rz);
    roll.rotation.y = rrot;
    const bundle = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 1.05, 14), canvasMat);
    bundle.rotation.z = Math.PI / 2;
    setShadow(bundle, true, true);
    roll.add(bundle);
    for (const sx of [-0.30, 0.30]) {
      const strap = new THREE.Mesh(new THREE.CylinderGeometry(0.178, 0.178, 0.045, 14), timberDarkMat);
      strap.rotation.z = Math.PI / 2;
      strap.position.x = sx;
      roll.add(strap);
    }
    supplies.add(roll);
  }
  addAOStrip(group, 1.95, 1.55, -4.25, 0, -3.55, 0.08, 0.28);
  group.add(supplies);

  const motes = createDustMotes(
    399,
    36,
    new THREE.Vector3(-4.8, 0.4, -4.2),
    new THREE.Vector3(0.6, 2.8, 0.6),
    '#fff4d2'
  );
  group.add(motes.group);

  return {
    group,
    update: (t: number, probationSlide: number): void => {
      motes.update(t);

      // Gentle Dakota breeze rippling the exterior Fort Abraham Lincoln U.S. flag
      if (extFlagPos) {
        for (let i = 0; i < extFlagPos.count; i++) {
          const bx = extFlagBaseX[i] ?? 0;
          const u = (bx + 0.575) / 1.15; // 0 pinned at pole, 1 free fly edge
          const wave = Math.sin(u * 4.5 - t * 3.6) * 0.095 * u;
          extFlagPos.setZ(i, wave);
        }
        extFlagPos.needsUpdate = true;
      }

      // Subtle warm breathe on oil lantern flame
      const flicker = 1 + Math.sin(t * 11.3) * 0.06 + Math.cos(t * 17.1) * 0.04;
      lFlame.scale.set(0.75 * flicker, 1.45 * flicker, 0.75 * flicker);

      // Smooth deterministic slide of Probation / Campaign Orders across trestle desk
      const ps = clamp01(probationSlide);
      const e = easeOutCubic(ps);
      const arcLift = Math.sin(ps * Math.PI) * 0.024;
      probationDoc.position.set(
        0.42 - e * 0.72,
        0.763 + arcLift,
        0.08 + e * 0.06
      );
      probationDoc.rotation.set(
        arcLift * 1.4,
        -0.24 + e * 0.34,
        -arcLift * 1.1
      );
    },
  };
}

// ============================================================================
// PUBLIC WORLD FACTORY
// ============================================================================

export function createInteriors3D(): InteriorsWorld {
  const root = new THREE.Group();
  root.name = 'interiors3d_root';

  const congress = buildCongressSet();
  const study = buildStudySet();
  const cabin = buildCabinSet();

  congress.group.visible = false;
  study.group.visible = false;
  cabin.group.visible = false;

  root.add(congress.group);
  root.add(study.group);
  root.add(cabin.group);

  const update = (state: InteriorsState): void => {
    const t = Number.isFinite(state.t) ? state.t : 0;
    congress.group.visible = state.mode === 'congress';
    study.group.visible = state.mode === 'study';
    cabin.group.visible = state.mode === 'cabin';

    if (state.mode === 'congress') {
      congress.update(t, state.paperFlutter ?? 0);
    } else if (state.mode === 'study') {
      study.update(t, state.gavelStrike ?? 0);
    } else if (state.mode === 'cabin') {
      cabin.update(t, state.probationSlide ?? 0);
    }
  };

  return {root, update};
}
