import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {staticFile} from 'remotion';
import {twoTone} from '../vendor/templates/bridge/shade';

/**
 * Reusable Lineless Storybook 3D GLB Asset Kit:
 * 1. Loads any CC0 `.glb` model from `public/assets/3d-kits/<kit>/<model>.glb`
 * 2. Automatically normalizes its pivot so the bottom of its bounding box sits flush at `y = 0`
 *    and centers `(x, z)` at `(0, 0)` — eliminating floating or half-buried models!
 * 3.Optionally scales to a target physical height (`targetHeightM`) or uniform `scale`.
 * 4. Automatically converts all standard/PBR materials into our unified Style 2 `twoTone()`
 *    lineless colour-block shader while preserving each part's base color / palette texture!
 */

export interface GlbPlaceOptions {
  /** Target real-world height in meters (overrides raw asset scale if set) */
  targetHeightM?: number;
  /** Additional uniform multiplier after targetHeightM (default 1) */
  scale?: number;
  /** World position [x, y, z] where y is the floor contact point */
  pos?: [number, number, number];
  /** Y-axis rotation in radians */
  rotY?: number;
  /** Optional tint mixed into the model's native palette [hex, amount 0..1] */
  tint?: [string, number];
  castShadow?: boolean;
  receiveShadow?: boolean;
}

const _loader = new GLTFLoader();
const _rawCache = new Map<string, Promise<THREE.Group>>();
const _matCache = new Map<string, THREE.MeshLambertMaterial>();

function toLinelessTwoToneMaterial(
  srcMat: THREE.Material | undefined,
  tint?: [string, number]
): THREE.MeshLambertMaterial {
  const anyMat = srcMat as THREE.MeshStandardMaterial | undefined;
  const baseCol = anyMat?.color ? anyMat.color.clone() : new THREE.Color('#b8a992');
  if (tint) {
    baseCol.lerp(new THREE.Color(tint[0]), tint[1]);
  }
  const map = anyMat?.map ?? null;
  const key = `${baseCol.getHexString()}_${map ? map.uuid : 'nomap'}`;
  let cached = _matCache.get(key);
  if (!cached) {
    cached = twoTone(
      new THREE.MeshLambertMaterial({
        color: map ? '#ffffff' : baseCol,
        map,
      })
    );
    _matCache.set(key, cached);
  }
  return cached;
}

/**
 * Asynchronously loads and caches a normalized prototype `.glb` from `public/assets/3d-kits/...`
 * Example `assetRelPath`: `'furniture-kit/desk.glb'` or `'nature-kit/tree_pineTallA.glb'`
 */
export function loadNormalizedGlbPrototype(assetRelPath: string): Promise<THREE.Group> {
  const cleanPath = assetRelPath.replace(/^\/+/, '');
  let pending = _rawCache.get(cleanPath);
  if (!pending) {
    const url = staticFile(`assets/3d-kits/${cleanPath}`);
    pending = new Promise<THREE.Group>((resolve, reject) => {
      _loader.load(
        url,
        (gltf) => {
          const model = gltf.scene;
          model.updateMatrixWorld(true);
          const box = new THREE.Box3().setFromObject(model);
          const size = new THREE.Vector3();
          const center = new THREE.Vector3();
          box.getSize(size);
          box.getCenter(center);

          // Wrap in a pivot group where (0, 0, 0) = bottom-center on the ground plane (y = 0)
          const wrapper = new THREE.Group();
          model.position.set(-center.x, -box.min.y, -center.z);
          wrapper.add(model);
          wrapper.userData.nativeSize = {
            width: Number(size.x.toFixed(4)),
            height: Number(size.y.toFixed(4)),
            depth: Number(size.z.toFixed(4)),
          };
          resolve(wrapper);
        },
        undefined,
        (err) => reject(err)
      );
    });
    _rawCache.set(cleanPath, pending);
  }
  return pending;
}

/**
 * Clones a loaded GLB prototype, applies unified Lineless Storybook `twoTone` materials,
 * normalizes to `targetHeightM` (if given), and places it cleanly on the floor at `pos`.
 */
export async function instantiateLinelessGlb(
  assetRelPath: string,
  opts: GlbPlaceOptions = {}
): Promise<THREE.Group> {
  const proto = await loadNormalizedGlbPrototype(assetRelPath);
  const inst = proto.clone(true);
  const nativeH = proto.userData.nativeSize?.height || 1;
  const baseScale = opts.targetHeightM ? opts.targetHeightM / Math.max(1e-4, nativeH) : 1;
  const finalScale = baseScale * (opts.scale ?? 1);
  inst.scale.setScalar(finalScale);

  if (opts.pos) inst.position.set(opts.pos[0], opts.pos[1], opts.pos[2]);
  if (opts.rotY) inst.rotation.y = opts.rotY;

  const cast = opts.castShadow ?? true;
  const receive = opts.receiveShadow ?? true;

  inst.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      const m = obj as THREE.Mesh;
      if (Array.isArray(m.material)) {
        m.material = m.material.map((sub) => toLinelessTwoToneMaterial(sub, opts.tint));
      } else {
        m.material = toLinelessTwoToneMaterial(m.material, opts.tint);
      }
      m.castShadow = cast;
      m.receiveShadow = receive;
    }
  });

  return inst;
}
