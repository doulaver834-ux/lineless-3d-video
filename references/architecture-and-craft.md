# Architecture, Coordinate System & Craft Rules

## 1. Authentic Style 2 2D Cast in Three.js (`style2Rig.js` + `linelessCast.ts`)

### Standing Actor (`createStandingActor(defaultKit)`)
- Offscreen canvas: `1024 × 1152` px, foot anchor `(512, 1060)`, rig scale `1.48`.
- World scale: `1.78m` human height (`530` rig px = `1.78m`), plane bottom offset calibrated so `root.position.y = 0` places boot soles **flush on `y = 0`**.
- Views:
  - `view: 'side'` (default 3/4 view; `flip: true` faces left, `flip: false` faces right).
  - `view: 'front'` (symmetric front view).
  - `view: 'back'` (full-length rear OTS figure with legs down to `y = 0` so camera height changes never reveal a cropped waist).
- Hand coordinates in rig px relative to feet (`y = 0`):
  - Hip: `y = -176`
  - Tabletop / waist gesture: `y = -205 .. -245`
  - Shoulder: `y = -296`
  - Eyes / facepalm: `y = -404`
  - Hat top: `y = -540`
  - `x > 0` reaches forward in the direction the character faces (`x = 130..165` keeps held papers/gavels cleanly clear of the speaking mouth and moustache).

### Mounted Cavalry / Horse Actor (`createMountedActor(defaultKit, defaultCoat)`)
- Offscreen canvas: `1408 × 1280` px, hoof anchor `(680, 1160)`, rig scale `1.36`, `2.52m` mounted height.
- **CRITICAL Rider Hand Coordinate Rule**:
  - `rider.js` translates to `(-15, -292)` and adds `+292` to `o.hand[1]` (default rein hand is `[95, -312]`).
  - Therefore, to make a mounted rider hold a prop (`'playbook'`, `'guidon'`, `'sabre'`, `'spyglass'`) **up high above the horse's neck/ears**, pass `hand: [150..170, -440..-490]` (NOT `-220`, which drops the hand down to the saddle skirt!).
- **Camera Angle Rule for Mounted Horses**:
  - Keep the 3D camera horizontal viewing angle within **`±25°` of perpendicular** to the horse's travel vector. Achieve epic scale via **vertical crane elevation** (`y: 5.9m -> 10.2m`) and **depth pull-back** (`z: 5.2m -> 15.0m`) rather than orbiting `80°–90°` edge-on to the flat horse card.

### Lighting Harmony on 2D Cards
- Material: `MeshLambertMaterial` with `emissive: '#fffaf2'`, `emissiveMap: tex`, `emissiveIntensity: 0.30`, `alphaTest: 0.18`, `layers.set(NOINK)`.
- Shadow casting: `customDepthMaterial` + `customDistanceMaterial` (`alphaTest: 0.22`) cast real 3D directional silhouette shadows onto floors, desks, and terrain; pair with a front-diagonal directional sun (`30°–50°` off the camera axis, NEVER edge-on to the card) so cast shadows are broad and readable.

---

## 2. Lineless Storybook 3D World Rules (`twoTone` + Portals)

1. **Zero Comic Black Outlines**:
   - Do **not** mount `InkPass` in `<EffectComposer>`, and never draw black `strokeStyle` grid borders in `ctex()` procedural textures.
   - Wrap all opaque `MeshLambertMaterial` and low-shininess brass `MeshPhongMaterial` instances in `twoTone(...)` (`vendor/templates/bridge/shade.ts`).
   - Ground walls and heavy furniture with thin dark warm-umber ambient-occlusion strips (`#2a1e18`, `opacity: 0.28`, `polygonOffset`, `layers.set(NOINK)`).
2. **Interior Sunlight & Real 3D Portals**:
   - Set `castShadow = false` on high room ceilings and roof decks so the directional sun enters interiors freely, while window frames, muntins, pilasters, desks, and characters keep `castShadow = true`.
   - When a room has an open door or window, cut a **real 3D aperture** in the wall and place a 3D exterior diorama outside (`z = -5m .. -40m`) so OTS cameras see genuine multi-plane exterior depth through the doorway.
   - Keep floating dust motes tiny (`SphereGeometry(0.007, 6, 6)`, `opacity <= 0.24`) so `LensBlur` never blooms them into distracting white snowballs.
3. **Post-Processing Stack (`<EffectComposer multisampling={4}>`)**:
   - `fx.lens.pre` + `fx.lens.main` (`LensBlur`): `cInf ~ 12` px on close OTS shots (`focus` locked on the speaking subject), `cInf ~ 6–7` px on medium interiors, `cInf = 0` on wide exterior crane panoramas.
   - `BloomEffect` (`intensity: 0.14`, `luminanceThreshold: 1.25`) for window panes, sun shafts, and oil/banker lamps.
   - `ToneMappingEffect` (`ToneMappingMode.NEUTRAL`) + `GradeEffect`.
   - **Never include `CameraShutter`** — screen-space motion blur smears crisp lineless character silhouettes during pans and cranes.

---

## 3. Ten-Point Visual QA Scorecard (Run on `--stills` Contact Sheet Before Final Render)

Adapted from production graphics lookdev rules and verified benchmark failure modes:
1. **OTS Foreground Framing**: Does any foreground OTS figure occupy `<= 22%` of the frame edge without blocking the subject's face, hands, or held prop?
2. **Desk / Podium Clearance**: Are characters behind desks/daises elevated appropriately (`y` offset) so gavels, dossiers, and pointing hands clear the desktop instead of clipping inside it?
3. **Action Waist Clearance**: When a beat involves hip/leg acting (kneeling, turning pockets inside-out, drawing a holstered prop), is the camera wide enough and unobstructed by foreground tables?
4. **Grounded Contact**: Are all standing boots at `y = 0` and all horse hooves at `getTrailHeight(x, z)` with visible contact + directional shadows?
5. **Value & Palette Separation**: Does the speaking character's head/coat separate clearly in value against the wall or terrain behind them?
6. **Depth Layers**: Does every shot read with distinct foreground, midground subject, and background depth (e.g., through windows/doorways or valley horizons)?
7. **Lineless Cohesion**: Zero rogue black-outlined textures, zero photorealistic PBR noise textures clashing with Style 2 characters.
8. **Typography Hygiene**: At most 1 location dateline or 1 editorial badge + bottom phrase caption at once; zero overlap with faces.
9. **Particle Restraint**: Zero oversized out-of-focus bokeh circles covering faces.
10. **Motion Sharpness**: Confirm crisp vector edges during camera dollies and cranes (`CameraShutter` disabled).

---

## 4. Optional Mechanical / Architectural Cutaway Inserts

When explaining *how* a mechanism, weapon, ship hull, or building works internally (3–8 s insert beat):
- Use **four-tone lineless isometric / cross-section staging** (inspired by `wheresryan22/anatomy` & David Macaulay cutaways):
  1. Lit top plane (`1.0×` warm base),
  2. Sunlit front bevel (`0.86×`),
  3. Shaded side plane (`0.64×`),
  4. Deep interior section cut (`#2b2329` or muted cross-section accent) with clean callout leader lines and `>= 26px` labels.

---

## 5. Modern / Contemporary Cast Kits, Two-Person Hug & Brand Accent

Ported from the approved 2026-11-24 contemporary short (4 sets, 12 shots) and made brand-neutral.

- **Contemporary kits** (`KIT` in `style2Rig.js`): `exec_founder` (zip work jacket, swept silver hair, half-rim glasses, white-sole shoes), `modern_fleece`, `modern_vest`, `modern_red_hoodie`, `modern_tee`, `modern_woman_jacket`, `modern_hoodie`, `modern_navy_jacket`, `modern_it_vest`, `modern_tee_woman`, and boardroom suits `board_chair`, `board_suit`, `board_woman`.
  - Kit flags: `trim: 'zip_jacket' | 'vest' | 'hoodie' | 'tee' | 'suit'`, `badge` (lanyard ID), `modernBelt`, `silverBuckle`, `whiteSole`, `glasses`, `halfRim`, `hairStyle: 'swept_silver' | 'long'`.
- **Contemporary props**: `'day1_badge'`, `'pc_box'`, `'resignation_folder'`, `'protest_sign'` (plus existing `laptop_open`, `phone_rec`).
- **Brand accent**: lanyards, badges, `pc_box`, `day1_badge` and `protest_sign` use one accent colour. Call `setStyle2Accent('#76b900')` (optionally with a shade) once per project or inside a `withStyle2Context` block. Default is neutral blue `#3f8fd0`.
- **Two-person hug** — never fake it by shrinking one head onto the other's chest:
  ```ts
  import {createHugActor} from './linelessCast';
  const hug = createHugActor('exec_founder', 'modern_tee_woman'); // kitA: right-rear, eyes closed; kitB: foreground-left, rear 3/4 with low bun
  hug.update(t, camera, {visible: true, pos: [-0.1, 0, 0.7]});
  ```
  Both heads share Style 2 scale (~1.32–1.40×); colours come from the two kits. Best framed as a medium shot with shallow `LensBlur`, then crane up and away.
- Contemporary crowds: scatter 8–20 standing actors across real Z depths and stair/mezzanine heights (`4–6m` behind the hero), mixing kits; never a single evenly spaced row.
