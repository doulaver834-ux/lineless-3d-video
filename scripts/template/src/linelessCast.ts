import * as THREE from 'three';
import {NOINK} from '../vendor/templates/bridge/ink';
import {STYLE2_WORDS} from './timeline';
import {
  setStyle2Words,
  withStyle2Context,
  standing,
  mounted,
  EX,
  perform,
  V as ActVerbs,
} from './style2Rig.js';

setStyle2Words(STYLE2_WORDS);

export {EX, perform, ActVerbs};

export interface Style2Pose {
  kit?: string;
  view?: 'side' | 'front' | 'back';
  stance?: 'stand' | 'strut' | 'lunge' | 'kneel' | 'crouch' | 'recoil' | 'leap';
  eyes?: string;
  mouth?: string;
  brow?: number;
  lid?: number;
  look?: number;
  lookY?: number;
  lean?: number;
  tilt?: number;
  squash?: number;
  jump?: number;
  walk?: number;
  sweat?: number;
  pale?: number;
  blush?: number;
  steam?: number;
  shockLines?: number;
  shiver?: number;
  emptyPockets?: number;
  hat?: string;
  hatLift?: number;
  curls?: boolean;
  stache?: boolean;
  beard?: boolean;
  cigar?: boolean;
  hand?: [number, number];
  hand2?: [number, number];
  handKind?: 'open' | 'point' | 'fist' | 'beckon';
  hand2Kind?: 'open' | 'point' | 'fist' | 'beckon';
  prop?: string;
  prop2?: string;
  ph?: number;
  // Horse-specific fields
  coat?: string;
  blanket?: string;
  blaze?: boolean;
  socks?: boolean;
  dust?: string;
  nod?: number;
  rear?: number;
  tired?: number;
  noReins?: boolean;
}

export interface ActorUpdateOpts {
  visible: boolean;
  pos?: [number, number, number];
  scale?: number;
  flip?: boolean;
  tint?: [string, number] | null;
  yawMode?: 'camera' | 'fixed';
  fixedYaw?: number;
  pose?: Style2Pose;
  groundShadowOpacity?: number;
}

function makeContactShadowTexture(): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = 128;
  cv.height = 128;
  const ctx = cv.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 6, 64, 64, 60);
  grad.addColorStop(0, 'rgba(20, 14, 24, 0.50)');
  grad.addColorStop(0.55, 'rgba(20, 14, 24, 0.22)');
  grad.addColorStop(1, 'rgba(20, 14, 24, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

let _sharedShadowTex: THREE.CanvasTexture | null = null;
function getShadowTex() {
  if (!_sharedShadowTex) _sharedShadowTex = makeContactShadowTexture();
  return _sharedShadowTex;
}

function attachCardMesh(
  canvas: HTMLCanvasElement,
  planeW: number,
  planeH: number,
  meshOffsetY: number,
  shadowRx: number,
  shadowRz: number
) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;

  // Calibrated lineless Lambert + soft self-illumination so Style 2 skin & buckskin tones
  // stay warm and clean in shadow while still catching 3D directional sunlight!
  const mat = new THREE.MeshLambertMaterial({
    map: tex,
    emissive: new THREE.Color('#fffaf2'),
    emissiveMap: tex,
    emissiveIntensity: 0.30,
    transparent: false,
    alphaTest: 0.18,
    side: THREE.DoubleSide,
  });

  const depthMat = new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking,
    map: tex,
    alphaTest: 0.22,
  });
  const distMat = new THREE.MeshDistanceMaterial({
    map: tex,
    alphaTest: 0.22,
  });

  const card = new THREE.Mesh(new THREE.PlaneGeometry(planeW, planeH), mat);
  card.position.y = meshOffsetY;
  card.castShadow = true;
  card.receiveShadow = false;
  card.customDepthMaterial = depthMat;
  card.customDistanceMaterial = distMat;
  card.layers.set(NOINK);

  const shadowMat = new THREE.MeshBasicMaterial({
    map: getShadowTex(),
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
  });
  const contactShadow = new THREE.Mesh(new THREE.PlaneGeometry(shadowRx * 2, shadowRz * 2), shadowMat);
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.y = 0.012;
  contactShadow.layers.set(NOINK);

  const root = new THREE.Group();
  root.add(card, contactShadow);
  return {root, card, tex, contactShadow, shadowMat};
}

export interface LinelessActor {
  root: THREE.Group;
  card: THREE.Mesh;
  update: (t: number, cam: THREE.Camera, opts: ActorUpdateOpts) => void;
}

export function createStandingActor(defaultKit = 'custer'): LinelessActor {
  const CW = 1024;
  const CH = 1152;
  const FOOT_X = 512;
  const FOOT_Y = 1060;
  const RIG_SCALE = 1.48;
  // 530 rig px * 1.48 = 784.4 canvas px -> 1.78m human height
  const METER_PER_PX = 1.78 / (530 * RIG_SCALE);
  const PLANE_W = CW * METER_PER_PX;
  const PLANE_H = CH * METER_PER_PX;
  const OFFSET_Y = (FOOT_Y - CH * 0.5) * METER_PER_PX;

  const canvas = document.createElement('canvas');
  canvas.width = CW;
  canvas.height = CH;
  const ctx = canvas.getContext('2d')!;

  const {root, card, tex, contactShadow, shadowMat} = attachCardMesh(
    canvas,
    PLANE_W,
    PLANE_H,
    OFFSET_Y,
    0.42,
    0.26
  );

  return {
    root,
    card,
    update(t, cam, opts) {
      root.visible = opts.visible;
      if (!opts.visible) return;
      const [px, py, pz] = opts.pos || [0, 0, 0];
      root.position.set(px, py, pz);
      root.scale.setScalar(opts.scale ?? 1);

      if (opts.yawMode === 'fixed') {
        card.rotation.y = opts.fixedYaw ?? 0;
      } else {
        const dx = cam.position.x - px;
        const dz = cam.position.z - pz;
        card.rotation.y = Math.atan2(dx, dz);
      }

      const shOp = opts.groundShadowOpacity ?? 0.42;
      contactShadow.visible = shOp > 0.01;
      shadowMat.opacity = shOp;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, CW, CH);
      const pose: Style2Pose = {kit: defaultKit, ...opts.pose};
      withStyle2Context(ctx, t, opts.tint ?? null, () => {
        standing(FOOT_X, FOOT_Y, RIG_SCALE, {...pose, noShadow: true}, Boolean(opts.flip));
      });
      tex.needsUpdate = true;
    },
  };
}

export function createMountedActor(defaultKit = 'custer', defaultCoat = 'sorrel'): LinelessActor {
  const CW = 1408;
  const CH = 1280;
  const HOOF_X = 680;
  const HOOF_Y = 1160;
  const RIG_SCALE = 1.36;
  // 650 rig px * 1.36 = 884 canvas px -> 2.52m mounted cavalry height
  const METER_PER_PX = 2.52 / (650 * RIG_SCALE);
  const PLANE_W = CW * METER_PER_PX;
  const PLANE_H = CH * METER_PER_PX;
  const OFFSET_Y = (HOOF_Y - CH * 0.5) * METER_PER_PX;

  const canvas = document.createElement('canvas');
  canvas.width = CW;
  canvas.height = CH;
  const ctx = canvas.getContext('2d')!;

  const {root, card, tex, contactShadow, shadowMat} = attachCardMesh(
    canvas,
    PLANE_W,
    PLANE_H,
    OFFSET_Y,
    0.92,
    0.36
  );

  return {
    root,
    card,
    update(t, cam, opts) {
      root.visible = opts.visible;
      if (!opts.visible) return;
      const [px, py, pz] = opts.pos || [0, 0, 0];
      root.position.set(px, py, pz);
      root.scale.setScalar(opts.scale ?? 1);

      if (opts.yawMode === 'fixed') {
        card.rotation.y = opts.fixedYaw ?? 0;
      } else {
        const dx = cam.position.x - px;
        const dz = cam.position.z - pz;
        card.rotation.y = Math.atan2(dx, dz);
      }
      contactShadow.rotation.z = -card.rotation.y;

      const shOp = opts.groundShadowOpacity ?? 0.44;
      contactShadow.visible = shOp > 0.01;
      shadowMat.opacity = shOp;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, CW, CH);
      const pose: Style2Pose = {kit: defaultKit, coat: defaultCoat, ...opts.pose};
      withStyle2Context(ctx, t, opts.tint ?? null, () => {
        mounted(HOOF_X, HOOF_Y, RIG_SCALE, {...pose, noShadow: true}, Boolean(opts.flip));
      });
      tex.needsUpdate = true;
    },
  };
}
