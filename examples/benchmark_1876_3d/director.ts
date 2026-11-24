import {ease, mix, smoother, spanProgress} from './timeline';

export type StageKind = 'congress' | 'study' | 'cabin' | 'montana';

export interface ShotSpec {
  id: string;
  stage: StageKind;
  t0: number;
  t1: number;
  pos0: [number, number, number];
  pos1: [number, number, number];
  look0: [number, number, number];
  look1: [number, number, number];
  fov0: number;
  fov1: number;
  roll0?: number;
  roll1?: number;
  focusDist0: number;
  focusDist1: number;
  aperture: number; // LensBlur aperture strength (higher = shallower OTS bokeh)
}

export const SHOTS: ShotSpec[] = [
  {
    // "Then, Custer made accusations in Congress"
    // True 3D OTS dolly past foreground Senator toward Custer waving blank papers before the dais
    id: 'S01',
    stage: 'congress',
    t0: 0.0,
    t1: 2.54,
    pos0: [1.95, 1.72, 4.65],
    pos1: [1.28, 1.56, 3.15],
    look0: [-0.28, 1.36, -0.65],
    look1: [-0.32, 1.34, -0.55],
    fov0: 38,
    fov1: 36,
    focusDist0: 4.9,
    focusDist1: 3.5,
    aperture: 0.032,
  },
  {
    // "against President Grant's brother that he couldn't prove."
    // Diagonal 3D medium-full two-shot: Custer's turned-out empty pockets clearly visible on left; Senate dais behind-right
    id: 'S02',
    stage: 'congress',
    t0: 2.54,
    t1: 4.95,
    pos0: [-1.15, 1.46, 3.25],
    pos1: [-0.92, 1.40, 2.75],
    look0: [0.12, 1.12, -1.05],
    look1: [0.06, 1.08, -0.95],
    fov0: 40,
    fov1: 38,
    focusDist0: 3.3,
    focusDist1: 2.8,
    aperture: 0.018,
  },
  {
    // "Grant took away his command."
    // Low-angle executive push across carved walnut desk as Grant slams gavel & Custer recoils cleanly inside frame
    id: 'S03',
    stage: 'study',
    t0: 4.95,
    t1: 6.72,
    pos0: [-0.22, 1.28, 3.15],
    pos1: [-0.08, 1.34, 2.52],
    look0: [-0.12, 1.26, -0.68],
    look1: [-0.14, 1.26, -0.62],
    fov0: 40,
    fov1: 38,
    roll0: -0.012,
    roll1: 0.0,
    focusDist0: 3.6,
    focusDist1: 3.0,
    aperture: 0.020,
  },
  {
    // "According to General Alfred Terry, Custer begged him for help with tears in his eyes."
    // True 3D OTS past Gen. Terry's shoulder onto kneeling teary Custer framed by the open sunlit Fort Lincoln doorway
    id: 'S04',
    stage: 'cabin',
    t0: 6.72,
    t1: 10.82,
    pos0: [1.58, 1.54, 3.18],
    pos1: [1.12, 1.36, 2.28],
    look0: [-0.56, 1.14, -1.15],
    look1: [-0.62, 1.04, -1.02],
    fov0: 38,
    fov1: 35,
    focusDist0: 4.4,
    focusDist1: 3.6,
    aperture: 0.032,
  },
  {
    // "He got to go. On probation. Under Terry."
    // Medium 3D two-shot across the HQ campaign table as Terry hands sealed probation orders & Custer puffs up
    id: 'S05',
    stage: 'cabin',
    t0: 10.82,
    t1: 14.36,
    pos0: [-0.12, 1.44, 2.68],
    pos1: [0.08, 1.48, 2.28],
    look0: [0.08, 1.26, -1.02],
    look1: [0.04, 1.28, -0.98],
    fov0: 39,
    fov1: 37,
    focusDist0: 3.6,
    focusDist1: 3.2,
    aperture: 0.020,
  },
  {
    // "So here's a commander who badly needs a win of his own,"
    // Low 3D tracking shot alongside mounted Custer on the elevated Montana sandstone bluff
    id: 'S06',
    stage: 'montana',
    t0: 14.36,
    t1: 16.92,
    pos0: [-3.2, 5.95, 5.15],
    pos1: [-0.35, 6.08, 5.45],
    look0: [-2.85, 6.05, -0.65],
    look1: [0.15, 6.12, -0.85],
    fov0: 36,
    fov1: 37,
    focusDist0: 5.3,
    focusDist1: 5.6,
    aperture: 0.022,
  },
  {
    // "riding into Montana with an 8-year-old playbook."
    // Sweeping 3D crane pull-back revealing the 7th Cavalry column along the ridge above the winding river valley & mesas
    id: 'S07',
    stage: 'montana',
    t0: 16.92,
    t1: 19.81,
    pos0: [1.65, 6.65, 6.85],
    pos1: [4.85, 9.85, 14.8],
    look0: [0.95, 6.05, -2.2],
    look1: [0.45, 5.25, -14.5],
    fov0: 38,
    fov1: 43,
    focusDist0: 7.4,
    focusDist1: 15.6,
    aperture: 0.0,
  },
];

export function shotAt(t: number): ShotSpec {
  for (const s of SHOTS) {
    if (t >= s.t0 && t < s.t1) return s;
  }
  return SHOTS[SHOTS.length - 1];
}

export function directedCamera(t: number) {
  const shot = shotAt(t);
  const raw = spanProgress(t, shot.t0, shot.t1);
  const p = shot.id === 'S07' ? ease(raw) : smoother(raw);
  return {
    shot,
    raw,
    pos: [
      mix(shot.pos0[0], shot.pos1[0], p),
      mix(shot.pos0[1], shot.pos1[1], p),
      mix(shot.pos0[2], shot.pos1[2], p),
    ] as [number, number, number],
    look: [
      mix(shot.look0[0], shot.look1[0], p),
      mix(shot.look0[1], shot.look1[1], p),
      mix(shot.look0[2], shot.look1[2], p),
    ] as [number, number, number],
    fov: mix(shot.fov0, shot.fov1, p),
    roll: mix(shot.roll0 ?? 0, shot.roll1 ?? 0, p),
    focusDist: mix(shot.focusDist0, shot.focusDist1, p),
    aperture: shot.aperture,
  };
}
