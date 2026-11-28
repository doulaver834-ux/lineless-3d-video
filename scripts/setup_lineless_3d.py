#!/usr/bin/env python3
"""
Scaffolds or updates a Universal Lineless 3D Video project (`Remotion + Three.js + Style 2 2D Cast + CC0 GLB Kit`).

- Copies core runtime modules (`style2Rig.js`, `linelessCast.ts`, `glbAssetKit.ts`, `vendor/templates/{bridge,audio}`, `scripts/render.mjs`).
- Automatically symlinks shared `node_modules` and the pre-downloaded 1,007 CC0 `.glb` asset cache if found on local machine,
  or downloads fresh CC0 `.glb` kits when `--download-assets` is passed.
"""
import argparse
import os
import pathlib
import shutil
import subprocess
import sys

import json

SCRIPT_DIR = pathlib.Path(__file__).resolve().parent
SKILL_DIR = SCRIPT_DIR.parent
TEMPLATE_DIR = SCRIPT_DIR / "template"


def _load_local_cfg() -> dict:
    cfg_path = SKILL_DIR / "local.json"
    if cfg_path.exists():
        try:
            return json.loads(cfg_path.read_text())
        except Exception:
            return {}
    return {}


def _candidate_paths(env_key: str, local_key: str) -> list[pathlib.Path]:
    out: list[pathlib.Path] = []
    if os.environ.get(env_key):
        out.append(pathlib.Path(os.environ[env_key]).expanduser())
    local_val = _load_local_cfg().get(local_key)
    if local_val:
        out.append(pathlib.Path(local_val).expanduser())
    return out


KNOWN_NODE_MODULES = _candidate_paths("LINELESS_3D_NODE_MODULES", "shared_node_modules")
KNOWN_ASSET_CACHES = _candidate_paths("LINELESS_3D_ASSETS", "asset_cache")


def copy_if_missing(src: pathlib.Path, dst: pathlib.Path, force: bool = False):
    if dst.exists() and not force:
        return
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("project", help="Target project directory to create or update")
    ap.add_argument("--force-libs", action="store_true", help="Overwrite core library files (`style2Rig.js`, `linelessCast.ts`, `glbAssetKit.ts`, `vendor/`)")
    ap.add_argument("--download-assets", action="store_true", help="Download 8 Kenney CC0 .glb kits if no local cache is found")
    args = ap.parse_args()

    proj = pathlib.Path(args.project).resolve()
    for sub in ("src", "public", "production", "scripts", "out", "vendor"):
        (proj / sub).mkdir(parents=True, exist_ok=True)

    # 1. Copy vendor shader/DSP bridge
    vendor_dst = proj / "vendor" / "templates"
    if not vendor_dst.exists() or args.force_libs:
        if vendor_dst.exists():
            shutil.rmtree(vendor_dst)
        shutil.copytree(TEMPLATE_DIR / "vendor" / "templates", vendor_dst)

    # 2. Copy package.json, tsconfig.json, core rig & GLB loader
    for rel in ("package.json", "tsconfig.json"):
        copy_if_missing(TEMPLATE_DIR / rel, proj / rel, force=False)

    for core_lib in ("style2Rig.js", "linelessCast.ts", "glbAssetKit.ts"):
        copy_if_missing(TEMPLATE_DIR / "src" / core_lib, proj / "src" / core_lib, force=args.force_libs)

    for starter in ("timeline.ts", "Graphics.tsx", "Root.tsx", "index.tsx"):
        copy_if_missing(TEMPLATE_DIR / "src" / starter, proj / "src" / starter, force=False)

    for prod_json in ("editorial-plates.json", "action-cues.json"):
        copy_if_missing(TEMPLATE_DIR / "production" / prod_json, proj / "production" / prod_json, force=False)

    for scr in ("render.mjs", "audio.py"):
        copy_if_missing(TEMPLATE_DIR / "scripts" / scr, proj / "scripts" / scr, force=False)

    # 3. Link shared node_modules if available locally
    nm_target = proj / "node_modules"
    if not nm_target.exists():
        for cand in KNOWN_NODE_MODULES:
            if cand.exists():
                os.symlink(cand, nm_target)
                print(f"Linked shared node_modules -> {cand}")
                break
        else:
            print("Note: No local shared node_modules found; run `npm install` inside project before rendering.")

    # 4. Link cached 1,007 CC0 .glb assets + catalog.json or download fresh
    pub_assets = proj / "public" / "assets"
    if not pub_assets.exists():
        linked = False
        for cand in KNOWN_ASSET_CACHES:
            if (cand / "catalog.json").exists() and cand.resolve() != pub_assets.resolve():
                os.symlink(cand, pub_assets)
                print(f"Linked cached 1,007 CC0 .glb assets -> {cand}")
                linked = True
                break
        if not linked and args.download_assets:
            subprocess.run([sys.executable, str(SCRIPT_DIR / "download_cc0_kits.py"), str(proj)], check=True)

    root_assets_link = proj / "assets"
    if not root_assets_link.exists():
        os.symlink("public/assets", root_assets_link)

    print(f"Ready: {proj}")


if __name__ == "__main__":
    main()
