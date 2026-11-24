import React, {useEffect, useMemo} from 'react';
import * as THREE from 'three';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';
import {AbsoluteFill, Audio, continueRender, delayRender, staticFile, useCurrentFrame} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import {useThree} from '@react-three/fiber';
import {EffectComposer} from '@react-three/postprocessing';
import {BlendFunction, BloomEffect, ToneMappingEffect, ToneMappingMode} from 'postprocessing';
import {NOINK} from '../vendor/templates/bridge/ink';
import {LensBlur} from '../vendor/templates/bridge/lensblur';
import {GradeEffect} from '../vendor/templates/bridge/grade';
import {TONE} from '../vendor/templates/bridge/shade';
import {CameraShutter} from './motion';
import {FPS, clamp, smoother, spanProgress} from './timeline';
import {directedCamera} from './director';
import {EditorialGraphics} from './Graphics';
import {ActVerbs, EX, createMountedActor, createStandingActor, perform} from './linelessCast';
import {InteriorsState, createInteriors3D} from './interiors3d';
import {createMontana3D} from './montana3d';
import cues from '../production/action-cues.json';

function Scene() {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const {scene, camera, gl, advance} = useThree();

  // Deterministic frame-capture sync with postprocessing EffectComposer
  const ready = useMemo(() => delayRender(`Lineless3D frame ${frame}`), [frame]);
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      advance(performance.now());
      gl.getContext().finish();
      continueRender(ready);
    });
    return () => {
      cancelAnimationFrame(id);
      continueRender(ready);
    };
  }, [ready, advance, gl]);

  // 3D Worlds (Lineless Storybook 3D)
  const interiors = useMemo(() => createInteriors3D(), []);
  const montana = useMemo(() => createMontana3D(), []);

  // Authentic Style 2 2D Cast Cards in 3D Space
  const custer = useMemo(() => createStandingActor('custer'), []);
  const senLead = useMemo(() => createStandingActor('senator'), []);
  const senLeft = useMemo(() => createStandingActor('senator_warm'), []);
  const senRight = useMemo(() => createStandingActor('clerk'), []);
  const otsSenator = useMemo(() => createStandingActor('senator_warm'), []);
  const grant = useMemo(() => createStandingActor('grant'), []);
  const terry = useMemo(() => createStandingActor('terry'), []);
  const otsTerry = useMemo(() => createStandingActor('terry'), []);

  // Mounted 7th Cavalry Column for Set 4 (Montana Bluff)
  const mtdCuster = useMemo(() => createMountedActor('custer', 'sorrel'), []);
  const mtdGuidon = useMemo(() => createMountedActor('trooper', 'bay'), []);
  const mtdBenteen = useMemo(() => createMountedActor('benteen', 'buck'), []);
  const mtdTrooper = useMemo(() => createMountedActor('trooper', 'brown'), []);

  const previousCamera = useMemo(() => new THREE.PerspectiveCamera(38, 1920 / 1080, 0.08, 400), []);
  const lastShotId = React.useRef<string>('');
  const keyTarget = useMemo(() => new THREE.Object3D(), []);

  const envMap = useMemo(() => {
    const pm = new THREE.PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const map = pm.fromScene(room, 0.04).texture;
    room.dispose();
    pm.dispose();
    return map;
  }, [gl]);

  // Pure Lineless Storybook Post-Processing Stack (zero black comic InkPass outlines!)
  const fx = useMemo(
    () => ({
      lens: new LensBlur({maxCoC: 18, nearScale: 0.9}),
      shutter: new CameraShutter(),
      bloom: new BloomEffect({
        blendFunction: BlendFunction.ADD,
        intensity: 0.14,
        luminanceThreshold: 1.25,
        mipmapBlur: true,
      }),
      tone: new ToneMappingEffect({mode: ToneMappingMode.NEUTRAL}),
      grade: new GradeEffect(
        {
          ky: [0.014, 0.095, 0.248, 0.52, 0.79, 0.93, 1],
          sat: [0.98, 1.05, 1.0],
          tintS: [0.01, 0.005],
          tintM: [0.003, 0.002],
          tintH: [-0.004, 0.006],
          vig: [0.09, 0.56],
        },
        0.58
      ),
    }),
    []
  );

  // Camera placement + physical gavel impact micro-kick
  const cp = directedCamera(t);
  const shot = cp.shot;
  const cam = camera as THREE.PerspectiveCamera;
  const pos = new THREE.Vector3(...cp.pos);
  const kick = (at: number, amp: number) => {
    const dt = t - at;
    return dt >= 0 && dt < 0.22 ? Math.cos(frame * Math.PI) * Math.exp(-dt * 18) * amp : 0;
  };
  pos.y += kick(cues.sfx.gavelSlam, 0.022) + kick(cues.sfx.kneelThud, 0.012);
  pos.x += kick(cues.sfx.gavelSlam, 0.014);

  cam.position.copy(pos);
  cam.fov = cp.fov;
  cam.near = 0.1;
  cam.far = 420;
  cam.lookAt(new THREE.Vector3(...cp.look));
  cam.rotateZ(cp.roll);
  cam.updateProjectionMatrix();
  cam.layers.enable(NOINK);

  // Stage-specific atmosphere, fog & two-tone shader lighting palette
  let fogHex = '#dfd4be';
  let fogNear = 14;
  let fogFar = 48;
  let sunPos: [number, number, number] = [-6.2, 8.8, 5.4];
  let sunTarget: [number, number, number] = [0, 0.6, -1.0];
  let sunCol = '#fff2d6';
  let sunInt = 2.2;
  let ambInt = 0.72;
  let shadowExtent = 9.5;
  let charTint: [string, number] | null = null;

  if (shot.stage === 'congress') {
    fogHex = '#d8ccb6';
    fogNear = 13;
    fogFar = 42;
    sunPos = [-6.8, 9.2, 5.6];
    sunTarget = [-0.2, 0.6, -1.2];
    sunCol = '#fff1cf';
    sunInt = 2.25;
    ambInt = 0.76;
    shadowExtent = 9.5;
    TONE.uLitCol.value.set(1.42, 1.36, 1.24);
    TONE.uShadeCol.value.set(0.68, 0.64, 0.74);
    TONE.uShadeLift.value.set(0.02, 0.015, 0.018);
    TONE.uBounce.value.set(0.08, 0.06, 0.04);
    TONE.uTerm.value = 0.22;
    charTint = ['#f7e6c4', 0.06];
  } else if (shot.stage === 'study') {
    fogHex = '#2a3338';
    fogNear = 10;
    fogFar = 34;
    sunPos = [-5.4, 7.8, 4.8];
    sunTarget = [-0.1, 0.6, -0.8];
    sunCol = '#ffe6ba';
    sunInt = 2.35;
    ambInt = 0.58;
    shadowExtent = 7.5;
    TONE.uLitCol.value.set(1.45, 1.34, 1.18);
    TONE.uShadeCol.value.set(0.52, 0.54, 0.68);
    TONE.uShadeLift.value.set(0.015, 0.012, 0.02);
    TONE.uBounce.value.set(0.06, 0.04, 0.03);
    TONE.uTerm.value = 0.2;
    charTint = ['#ebcfa8', 0.08];
  } else if (shot.stage === 'cabin') {
    fogHex = '#c8d6dc';
    fogNear = 14;
    fogFar = 64;
    sunPos = [-5.2, 8.4, 4.8];
    sunTarget = [-0.2, 0.5, -1.2];
    sunCol = '#fff0cc';
    sunInt = 2.25;
    ambInt = 0.72;
    shadowExtent = 9.0;
    TONE.uLitCol.value.set(1.42, 1.35, 1.22);
    TONE.uShadeCol.value.set(0.64, 0.6, 0.7);
    TONE.uShadeLift.value.set(0.022, 0.016, 0.014);
    TONE.uBounce.value.set(0.09, 0.065, 0.04);
    TONE.uTerm.value = 0.22;
    charTint = ['#f5e2bf', 0.06];
  } else {
    // 'montana' — vast golden-afternoon badlands & turquoise river valley
    fogHex = '#e6d2b5';
    fogNear = 42;
    fogFar = 185;
    sunPos = [-26, 24, 18];
    sunTarget = [0, 3.5, -8];
    sunCol = '#ffebc2';
    sunInt = 2.4;
    ambInt = 0.78;
    shadowExtent = 24;
    TONE.uLitCol.value.set(1.48, 1.38, 1.2);
    TONE.uShadeCol.value.set(0.66, 0.64, 0.8);
    TONE.uShadeLift.value.set(0.025, 0.018, 0.022);
    TONE.uBounce.value.set(0.11, 0.08, 0.045);
    TONE.uTerm.value = 0.24;
    charTint = ['#ffdfad', 0.08];
  }

  const fogColor = new THREE.Color(fogHex);
  scene.fog = new THREE.Fog(fogColor, fogNear, fogFar);
  scene.environment = envMap;
  scene.environmentIntensity = shot.stage === 'study' ? 0.2 : 0.28;
  gl.setClearColor(fogColor);
  gl.shadowMap.enabled = true;
  gl.shadowMap.type = THREE.PCFSoftShadowMap;

  // Hide all actors before deterministic shot placement
  const standingCast = [custer, senLead, senLeft, senRight, otsSenator, grant, terry, otsTerry];
  for (const a of standingCast) a.update(t, cam, {visible: false});
  const mountedCast = [mtdCuster, mtdGuidon, mtdBenteen, mtdTrooper];
  for (const m of mountedCast) m.update(t, cam, {visible: false});

  // Update 3D Worlds
  const intState: InteriorsState = {
    mode: shot.stage === 'montana' ? 'none' : shot.stage,
    t,
    paperFlutter: shot.stage === 'congress' ? smoother(spanProgress(t, 3.82, 4.65)) : 0,
    gavelStrike: shot.stage === 'study' ? smoother(spanProgress(t, 5.48, 5.62)) : 0,
    probationSlide: shot.stage === 'cabin' ? smoother(spanProgress(t, 11.25, 12.15)) : 0,
  };
  interiors.update(intState);
  montana.update({visible: shot.stage === 'montana', t});

  // ---------------- SHOT-BY-SHOT ACTING & BLOCKING ----------------
  if (shot.id === 'S01' || shot.id === 'S02') {
    // U.S. Congress Committee Chamber
    const custerPose = perform(
      t,
      [
        [
          0.0,
          {
            ...EX.cocky,
            kit: 'custer_dress',
            stance: 'strut',
            mouth: 'talk',
            prop: 'blank_paper',
            hand: [138, -205],
            hand2: [-28, -185],
            look: 0.35,
          },
        ],
        [
          1.12,
          {
            ...EX.charge,
            brow: -0.45,
            mouth: 'talk',
            prop: 'blank_paper',
            hand: [162, -252],
            lean: 0.11,
            amp: 0.35,
          },
          0.26,
        ],
        [
          2.56,
          {
            ...EX.smug,
            mouth: 'talk',
            prop: 'blank_paper',
            hand: [148, -222],
            lean: -0.06,
          },
          0.32,
        ],
        [
          3.84,
          {
            eyes: 'roll',
            brow: 0.78,
            mouth: 'wobble',
            sweat: 0.92,
            blush: 0.45,
            emptyPockets: 1,
            prop: undefined,
            stance: 'stand',
            hand: [104, -242],
            hand2: [-78, -236],
            handKind: 'open',
            hand2Kind: 'open',
            lean: -0.05,
            tilt: 0.08,
            amp: 0.42,
          },
          0.24,
        ],
      ],
      {seed: 1}
    );

    custer.update(t, cam, {
      visible: true,
      pos: shot.id === 'S01' ? [-0.42, 0, 0.14] : [-0.48, 0, 0.18],
      flip: false,
      tint: charTint,
      pose: custerPose,
    });

    const leadSenPose = perform(
      t,
      [
        [
          0.0,
          {
            ...EX.skeptic,
            kit: 'senator',
            prop: 'dossier',
            hand: [86, -198],
            look: 0.4,
          },
        ],
        ...ActVerbs.point(3.92, {to: [156, -268], brow: -0.65}),
      ],
      {seed: 2}
    );
    senLead.update(t, cam, {
      visible: true,
      pos: [0.95, 0.78, -3.32],
      flip: true,
      tint: charTint,
      groundShadowOpacity: 0.18,
      pose: leadSenPose,
    });

    senLeft.update(t, cam, {
      visible: true,
      pos: [-1.35, 0.78, -3.45],
      flip: false,
      tint: charTint,
      groundShadowOpacity: 0.18,
      pose: perform(
        t,
        [
          [0.0, {...EX.solemn, kit: 'senator_warm', look: 0.5}],
          [3.95, {...EX.eyeroll, tilt: 0.07}, 0.28],
        ],
        {seed: 3}
      ),
    });

    senRight.update(t, cam, {
      visible: true,
      pos: [2.38, 0.78, -3.48],
      flip: true,
      tint: charTint,
      groundShadowOpacity: 0.18,
      pose: perform(
        t,
        [
          [0.0, {...EX.skeptic, kit: 'clerk', prop: 'note', hand: [78, -192]}],
          [4.02, {...EX.eyeroll}, 0.3],
        ],
        {seed: 4}
      ),
    });

    if (shot.id === 'S01') {
      otsSenator.update(t, cam, {
        visible: true,
        pos: [2.08, -0.14, 3.22],
        scale: 0.92,
        tint: charTint,
        groundShadowOpacity: 0.0,
        pose: {kit: 'senator_warm', view: 'back', hat: 'none'},
      });
    }
  } else if (shot.id === 'S03') {
    // White House Executive Study — Grant revokes Custer's command
    const grantPose = perform(
      t,
      [
        [
          4.9,
          {
            ...EX.solemn,
            kit: 'grant',
            beard: true,
            cigar: true,
            brow: -0.75,
            prop: 'gavel',
            hand: [118, -315],
            lean: -0.04,
          },
        ],
        [
          5.54,
          {
            eyes: 'squint',
            brow: -0.95,
            mouth: 'frown',
            prop: 'gavel',
            hand: [142, -218],
            lean: 0.12,
            amp: 0.55,
          },
          0.14,
        ],
        [
          6.02,
          {
            prop: undefined,
            hand: [158, -282],
            handKind: 'point',
            lean: 0.08,
            brow: -0.85,
          },
          0.24,
        ],
      ],
      {seed: 5}
    );
    grant.update(t, cam, {
      visible: true,
      pos: [0.76, 0.16, -1.52],
      flip: true,
      tint: charTint,
      groundShadowOpacity: 0.15,
      pose: grantPose,
    });

    const custerStudyPose = perform(
      t,
      [
        [
          4.9,
          {
            ...EX.cocky,
            kit: 'custer_dress',
            hand: [42, -182],
          },
        ],
        ...ActVerbs.recoil(5.56, {hold: 0.9}),
      ],
      {seed: 6}
    );
    custer.update(t, cam, {
      visible: true,
      pos: [-0.94, 0, 0.14],
      flip: false,
      tint: charTint,
      pose: {...custerStudyPose, hatLift: t >= 5.55 && t < 5.95 ? 14 : 0},
    });
  } else if (shot.id === 'S04' || shot.id === 'S05') {
    // Fort Abraham Lincoln Timber HQ Cabin
    if (shot.id === 'S04') {
      otsTerry.update(t, cam, {
        visible: true,
        pos: [1.31, -0.08, 1.62],
        scale: 0.94,
        tint: charTint,
        groundShadowOpacity: 0.0,
        pose: {kit: 'terry', view: 'back', hat: 'kepi'},
      });

      const begPose = perform(
        t,
        [
          [
            6.7,
            {
              ...EX.dread,
              kit: 'custer',
              stance: 'crouch',
              mouth: 'plead',
              hand: [92, -225],
              hand2: [68, -215],
            },
          ],
          [
            8.86,
            {
              ...EX.beg,
              stance: 'kneel',
              eyes: 'teary',
              mouth: 'plead',
              brow: 0.95,
              sweat: 0.55,
              shiver: 0.35,
              hand: [114, -256],
              hand2: [86, -242],
              prop2: 'hanky',
              handKind: 'open',
              amp: 0.45,
            },
            0.26,
          ],
        ],
        {seed: 7}
      );
      custer.update(t, cam, {
        visible: true,
        pos: [-0.62, 0, -0.88],
        flip: false,
        tint: charTint,
        pose: begPose,
      });
    } else {
      // S05: Medium 2-shot across campaign table — probation order handoff & instant cocky recovery
      const terryPose = perform(
        t,
        [
          [
            10.8,
            {
              ...EX.solemn,
              kit: 'terry',
              hat: 'kepi',
              beard: true,
              prop: 'probation',
              hand: [134, -206],
              lean: 0.06,
            },
          ],
          [
            12.32,
            {
              ...EX.skeptic,
              prop: undefined,
              hand: [150, -268],
              handKind: 'point',
              brow: -0.55,
              lean: 0.08,
              amp: 0.28,
            },
            0.22,
          ],
        ],
        {seed: 8}
      );
      terry.update(t, cam, {
        visible: true,
        pos: [0.92, 0, -0.95],
        flip: true,
        tint: charTint,
        pose: terryPose,
      });

      const custerRecoverPose = perform(
        t,
        [
          [
            10.8,
            {
              ...EX.beg,
              kit: 'custer',
              stance: 'kneel',
              hand: [98, -238],
            },
          ],
          [
            11.34,
            {
              ...EX.starry,
              stance: 'strut',
              sweat: 0,
              shiver: 0,
              hand: [122, -214],
              hand2: [-26, -188],
              amp: 0.48,
            },
            0.22,
          ],
          [
            12.36,
            {
              eyes: 'open',
              lid: 0.34,
              brow: 0.52,
              mouth: 'smirk',
              prop: 'probation',
              hand: [128, -206],
              tilt: 0.04,
              amp: 0.22,
            },
            0.22,
          ],
          [
            13.38,
            {
              ...EX.cocky,
              stance: 'strut',
              prop: 'probation',
              hand: [132, -218],
              lean: -0.09,
            },
            0.28,
          ],
        ],
        {seed: 9}
      );
      custer.update(t, cam, {
        visible: true,
        pos: [-0.76, 0, -0.92],
        flip: false,
        tint: charTint,
        pose: custerRecoverPose,
      });
    }
  } else {
    // S06 & S07: Vast 3D Southern Montana Bluff & River Valley
    const marchDt = Math.max(0, t - 14.36);
    const leadX = -3.8 + marchDt * 1.55;
    const basePh = t * 6.4;

    const custerRidePose = perform(
      t,
      [
        [
          14.3,
          {
            ...EX.cocky,
            kit: 'custer',
            coat: 'sorrel',
            blaze: true,
            socks: true,
            blanket: '#243b63',
            dust: '#d8be94',
            lean: 0.08,
            look: 0.35,
          },
        ],
        [
          18.18,
          {
            ...EX.smug,
            mouth: 'grin',
            brow: 0.72,
            prop: 'playbook',
            hand: [166, -472],
            lean: 0.04,
            amp: 0.35,
          },
          0.26,
        ],
      ],
      {seed: 10}
    );

    const cZ = 0.05;
    mtdCuster.update(t, cam, {
      visible: true,
      pos: [leadX, montana.getTrailHeight(leadX, cZ), cZ],
      flip: false,
      tint: charTint,
      pose: {...custerRidePose, ph: basePh},
    });

    const gX = leadX - 3.35;
    const gZ = -0.55;
    mtdGuidon.update(t, cam, {
      visible: true,
      pos: [gX, montana.getTrailHeight(gX, gZ), gZ],
      flip: false,
      tint: charTint,
      pose: {
        ...EX.solemn,
        kit: 'trooper',
        coat: 'bay',
        blanket: '#243b63',
        dust: '#d8be94',
        prop: 'guidon',
        hand: [108, -365],
        ph: basePh + 1.3,
      },
    });

    const bX = leadX - 6.55;
    const bZ = 0.42;
    mtdBenteen.update(t, cam, {
      visible: true,
      pos: [bX, montana.getTrailHeight(bX, bZ), bZ],
      flip: false,
      tint: charTint,
      pose: {
        ...EX.skeptic,
        kit: 'benteen',
        coat: 'buck',
        blanket: '#243b63',
        dust: '#d8be94',
        ph: basePh + 2.5,
      },
    });

    const tX = leadX - 9.65;
    const tZ = -0.35;
    mtdTrooper.update(t, cam, {
      visible: true,
      pos: [tX, montana.getTrailHeight(tX, tZ), tZ],
      flip: false,
      tint: charTint,
      pose: {
        ...EX.solemn,
        kit: 'trooper',
        coat: 'brown',
        blanket: '#243b63',
        prop: 'carbine',
        hand: [82, -222],
        ph: basePh + 3.8,
      },
    });
  }

  // Optical LensBlur focus distance & CoC radius (in 1080p px; cp.aperture * 380 -> ~14px on OTS, ~4.5px on wide crane)
  fx.lens.focus = cp.focusDist;
  fx.lens.cInf = cp.aperture * 380;

  if (lastShotId.current !== shot.id) {
    fx.shutter.vector = new THREE.Vector2(0, 0);
    lastShotId.current = shot.id;
  } else {
    const prev = new THREE.Vector3(0, 0, -4)
      .applyMatrix4(previousCamera.matrixWorld)
      .project(cam);
    const curr = new THREE.Vector3(0, 0, -4)
      .applyMatrix4(cam.matrixWorld)
      .project(cam);
    const rawDx = curr.x - prev.x;
    const rawDy = curr.y - prev.y;
    const speed = Math.hypot(rawDx, rawDy);
    // Deadzone so steady dollies & crane moves keep characters 100% tack-sharp; smear only on rapid whip-pans
    if (speed < 0.035) {
      fx.shutter.vector = new THREE.Vector2(0, 0);
    } else {
      const dx = clamp(rawDx * 0.08, -0.0025, 0.0025);
      const dy = clamp(rawDy * 0.08, -0.0025, 0.0025);
      fx.shutter.vector = new THREE.Vector2(dx, dy);
    }
  }
  previousCamera.copy(cam);
  previousCamera.updateMatrixWorld();

  keyTarget.position.set(...sunTarget);
  keyTarget.updateMatrixWorld();

  return (
    <>
      <primitive object={keyTarget} />
      <directionalLight
        position={sunPos}
        target={keyTarget}
        intensity={sunInt}
        color={sunCol}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-camera-near={1.0}
        shadow-camera-far={shot.stage === 'montana' ? 95 : 36}
        shadow-camera-left={-shadowExtent}
        shadow-camera-right={shadowExtent}
        shadow-camera-top={shadowExtent}
        shadow-camera-bottom={-shadowExtent}
      />
      <ambientLight intensity={ambInt} color="#f5ebd8" />
      <hemisphereLight args={['#dce8f5', '#8a6b48', 0.35]} />

      <primitive object={interiors.root} />
      <primitive object={montana.root} />

      {standingCast.map((a, idx) => (
        <primitive key={`st-${idx}`} object={a.root} />
      ))}
      {mountedCast.map((m, idx) => (
        <primitive key={`mt-${idx}`} object={m.root} />
      ))}

      <EffectComposer multisampling={4}>
        <primitive object={fx.lens.pre} />
        <primitive object={fx.lens.main} />
        <primitive object={fx.bloom} />
        <primitive object={fx.tone} />
        <primitive object={fx.grade} />
      </EffectComposer>
    </>
  );
}

export const LinelessGeneralTest: React.FC = () => {
  return (
    <AbsoluteFill style={{backgroundColor: '#1a1518'}}>
      <ThreeCanvas
        width={1920}
        height={1080}
        shadows
        gl={{
          antialias: true,
          powerPreference: 'high-performance',
          toneMapping: THREE.NoToneMapping,
        }}
      >
        <Scene />
      </ThreeCanvas>
      <EditorialGraphics />
      <Audio src={staticFile('audio_master.wav')} />
    </AbsoluteFill>
  );
};
