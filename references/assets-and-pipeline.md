# Reusable 3D GLB Asset Pipeline & Parallel Long-Form Scaling

## 1. Local CC0 `.glb` Library (`1,007` Models Across 8 Kits)

Every initialized project exposes `<project>/public/assets/catalog.json` and `<project>/public/assets/3d-kits/`:

| Kit | Count | Typical Narrative Uses |
| --- | ---: | --- |
| `furniture-kit` | 140 | Executive desks, chairs, bookcases, banker/table lamps, rugs, beds, cabinets |
| `nature-kit` | 329 | Pine & oak trees, cliffs, boulders, riverbanks, wooden bridges, tents, campfires |
| `fantasy-town-kit` | 167 | Timber & stone historical buildings, roofs, doors, windows, fences, carts, lanterns, market stalls |
| `train-kit` | 103 | Locomotives, passenger/freight cars, rails, stations, water towers, signals |
| `survival-kit` | 80 | Frontier workbenches, crates, barrels, canvas tents, tools, camp gear |
| `castle-kit` | 76 | Fortresses, battlements, towers, gates, stone stairs, banners, siege props |
| `pirate-kit` | 72 | Wooden sailing ships, cannons, harbor docks, barrels, chests, palms |
| `city-kit-suburban` | 40 | Modern/industrial houses, streets, fences, street trees |

### Placing Normalized `.glb` Models in Three.js (`src/glbAssetKit.ts`)

Raw `.glb` files from external packs often have miniature or inconsistent native scales (e.g., a desk exported at `0.39m` tall). Always load through `instantiateLinelessGlb`:

```ts
import {instantiateLinelessGlb} from './glbAssetKit';

// Automatically centers X/Z, grounds bottom at y = 0, scales to 0.78m tall,
// and converts all materials to unified Style 2 twoTone() shading!
const desk = await instantiateLinelessGlb('furniture-kit/desk.glb', {
  targetHeightM: 0.78,
  pos: [0.65, 0, -0.85],
  rotY: -0.12,
  tint: ['#6b442b', 0.15],
});
stageGroup.add(desk);
```

- When synchronizing async `.glb` loading inside Remotion's `<ThreeCanvas>`, wrap the initial asset-pack preload in `delayRender('Preload GLB kit')` -> `Promise.all(...)` -> `continueRender(handle)` inside a `useEffect(..., [])` hook so Frame 0 never renders before `.glb` meshes are mounted!

### Adding & Optimizing Custom External `.glb` Models

1. **Style Filter**: Only import **clean low-poly colour-block `.glb` models** (Kenney, Quaternius, KayKit, Poly Pizza CC0). Avoid high-poly photorealistic scanned PBR models (Poly Haven / Smithsonian scans), which clash visually with Style 2 characters and slow down rendering.
2. **Optimize & Inspect** (using `@gltf-transform/cli` when adding heavy third-party `.glb` files):
   ```bash
   npx @gltf-transform/cli inspect custom_model.glb
   npx @gltf-transform/cli optimize custom_model.glb custom_model_opt.glb --compress meshopt
   ```
3. Re-run `python3 "$K/download_cc0_kits.py" <project> --reindex-only` to update `public/assets/catalog.json` with exact `[width, height, depth, minY]` bounds.
4. For large forests, crowds of tents, or repeating building rows (`> 50` copies), use Three.js `InstancedMesh` or `@react-three/drei`'s `<Instances>` to keep draw calls low.

---

## 2. Scaling to 10-Minute (`600s`) Films with Parallel Subagents

Measured benchmark on Apple Silicon (`2560×1440` 2K @ 30fps, `CRF 16`, `concurrency: 2`):
- Pure 2K GPU render speed: **~2.7× real-time** (`~54s` for `19.8s` = `~27 min` for `600s` at 2K, or `~10–12 min` at 1080p).

### Recommended 4-Stage Parallel Architecture
1. **Stage 1 — Single-Thread Master Timeline (~15 min)**:
   - Finalize script, generate full narration WAV (`-14 LUFS`), extract `words.json`, and partition the film into **8–10 chapters** (`ch01`..`ch10`, `60–75s` each) with a shared `cast-and-stages.md` spec locking character `kit` names and stage coordinate origins.
2. **Stage 2 — Parallel Subagent Authoring (Batches of 4–6 Subagents, ~25–35 min)**:
   - Spawn 1–2 `lineless-3d-architect` subagents for bespoke landmark geometry + 4–5 chapter choreographer subagents writing `src/chapters/ch01.ts`..`ch10.ts` using `catalog.json` `.glb` prefabs and `createStandingActor` / `createMountedActor`.
   - Subagents write modular TypeScript files only (never running shell builds concurrently).
3. **Stage 3 — Contact-Sheet Visual QA (~30–45 min)**:
   - Render 1–2 representative stills per shot (`--stills`) across all chapters (~6–8 min total), review contact sheets in parallel against the 10-Point Visual QA Scorecard, and patch any sightline/height collisions.
4. **Stage 4 — Incremental Chapter Render & Lossless Concat (~30 min)**:
   - Render each chapter to `out/chNN_2K.mp4` (`TMPDIR` set to `.render-tmp` on external SSD), re-render only modified chapters after fixes, and concatenate via `ffmpeg -f concat -safe 0 -i chapters.txt -c copy out/final_2K.mp4`.
