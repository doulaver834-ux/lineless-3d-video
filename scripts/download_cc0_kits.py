#!/usr/bin/env python3
"""
Downloads 8 curated CC0 1.0 Public Domain 3D .glb asset kits (~1,007 models) from Kenney.nl
into `<project>/public/assets/3d-kits/` and builds `<project>/public/assets/catalog.json`
with exact 3D bounding-box dimensions (`width`, `height`, `depth`, `minY`) and material slots.

Usage:
  python3 download_cc0_kits.py <project_dir>
  python3 download_cc0_kits.py <project_dir> --reindex-only
"""
import argparse
import http.cookiejar
import io
import json
import math
import pathlib
import re
import struct
import urllib.request
import zipfile

KITS = [
    ("furniture-kit", "indoor_furniture"),
    ("nature-kit", "nature_terrain_trees"),
    ("castle-kit", "fortress_medieval"),
    ("fantasy-town-kit", "historical_buildings_props"),
    ("pirate-kit", "ships_harbor_cannons"),
    ("train-kit", "railroad_industrial"),
    ("city-kit-suburban", "urban_buildings_streets"),
    ("survival-kit", "camp_tools_crates"),
]


def parse_glb_bounds(glb_path: pathlib.Path):
    data = glb_path.read_bytes()
    if len(data) < 20:
        return None
    magic, _version, _length, chunk_len, _chunk_type = struct.unpack_from("<IIIII", data, 0)
    if magic != 0x46546C67:
        return None
    gltf = json.loads(data[20 : 20 + chunk_len].decode("utf-8"))
    accessors = gltf.get("accessors", [])
    meshes = gltf.get("meshes", [])
    nodes = gltf.get("nodes", [])

    min_v = [float("inf")] * 3
    max_v = [float("-inf")] * 3
    mesh_bounds = []
    for m in meshes:
        m_min = [float("inf")] * 3
        m_max = [float("-inf")] * 3
        for prim in m.get("primitives", []):
            pos_idx = prim.get("attributes", {}).get("POSITION")
            if pos_idx is not None and pos_idx < len(accessors):
                acc = accessors[pos_idx]
                amin, amax = acc.get("min"), acc.get("max")
                if amin and amax and len(amin) == 3:
                    for k in range(3):
                        m_min[k] = min(m_min[k], amin[k])
                        m_max[k] = max(m_max[k], amax[k])
        mesh_bounds.append((m_min, m_max))

    used_node_mesh = False
    for nd in nodes:
        mi = nd.get("mesh")
        if mi is not None and mi < len(mesh_bounds):
            m_min, m_max = mesh_bounds[mi]
            if math.isinf(m_min[0]):
                continue
            used_node_mesh = True
            tr = nd.get("translation", [0.0, 0.0, 0.0])
            sc = nd.get("scale", [1.0, 1.0, 1.0])
            for k in range(3):
                a = m_min[k] * sc[k] + tr[k]
                b = m_max[k] * sc[k] + tr[k]
                min_v[k] = min(min_v[k], a, b)
                max_v[k] = max(max_v[k], a, b)

    if not used_node_mesh:
        for m_min, m_max in mesh_bounds:
            if not math.isinf(m_min[0]):
                for k in range(3):
                    min_v[k] = min(min_v[k], m_min[k])
                    max_v[k] = max(max_v[k], m_max[k])

    if math.isinf(min_v[0]):
        return {"width": 1.0, "height": 1.0, "depth": 1.0, "minY": 0.0, "materials": []}

    return {
        "width": round(max_v[0] - min_v[0], 3),
        "height": round(max_v[1] - min_v[1], 3),
        "depth": round(max_v[2] - min_v[2], 3),
        "minY": round(min_v[1], 3),
        "materials": [mt.get("name", "") for mt in gltf.get("materials", [])][:8],
    }


def download_kits(dest_root: pathlib.Path):
    cj = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
    opener.addheaders = [
        ("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"),
        ("Referer", "https://kenney.nl/assets"),
    ]
    for slug, _category in KITS:
        page_url = f"https://kenney.nl/assets/{slug}"
        html = opener.open(page_url, timeout=20).read().decode("utf-8", errors="ignore")
        m = re.search(r"data-download-id=['\"]([0-9a-fA-F]+)['\"]", html)
        dl_id = m.group(1) if m else f"assets/{slug}".encode().hex()
        req = urllib.request.Request(
            f"https://kenney.nl/download-link/{dl_id}",
            headers={"Referer": page_url, "X-Requested-With": "XMLHttpRequest"},
        )
        zip_url = json.loads(opener.open(req, timeout=15).read().decode("utf-8"))["url"]
        print(f"Downloading {slug} ...")
        raw = opener.open(zip_url, timeout=90).read()
        zf = zipfile.ZipFile(io.BytesIO(raw))
        kit_dir = dest_root / slug
        kit_dir.mkdir(parents=True, exist_ok=True)
        count = 0
        for name in zf.namelist():
            lower = name.lower()
            base = pathlib.Path(name).name
            if not base:
                continue
            if lower.endswith(".glb") and "glb format" in lower:
                (kit_dir / base).write_bytes(zf.read(name))
                count += 1
            elif "glb format/textures/" in lower and lower.endswith((".png", ".jpg")):
                tex_dir = kit_dir / "Textures"
                tex_dir.mkdir(parents=True, exist_ok=True)
                (tex_dir / base).write_bytes(zf.read(name))
            elif base.lower() in ("license.txt", "preview.png", "sample.png"):
                (kit_dir / base).write_bytes(zf.read(name))
        if count == 0:
            for name in zf.namelist():
                if name.lower().endswith(".glb"):
                    base = pathlib.Path(name).name
                    (kit_dir / base).write_bytes(zf.read(name))
                    count += 1
        print(f"  -> Extracted {count} .glb models into {kit_dir}")


def build_catalog(dest_root: pathlib.Path):
    cat_map = dict(KITS)
    kit_summary = []
    catalog_items = []
    for kit_dir in sorted(p for p in dest_root.iterdir() if p.is_dir()):
        slug = kit_dir.name
        category = cat_map.get(slug, "custom")
        glbs = sorted(kit_dir.glob("*.glb"))
        kit_summary.append({"kit": slug, "category": category, "count": len(glbs)})
        for glb_file in glbs:
            meta = parse_glb_bounds(glb_file)
            if meta:
                catalog_items.append(
                    {
                        "id": f"{slug}/{glb_file.stem}",
                        "path": f"{slug}/{glb_file.name}",
                        "kit": slug,
                        "category": category,
                        "name": glb_file.stem,
                        **meta,
                    }
                )
    catalog = {
        "license": "CC0 1.0 Universal (Public Domain)",
        "totalModels": len(catalog_items),
        "kits": kit_summary,
        "models": catalog_items,
    }
    out_path = dest_root.parent / "catalog.json"
    out_path.write_text(json.dumps(catalog, indent=2))
    print(f"Indexed {len(catalog_items)} .glb models -> {out_path}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("project", help="Target project root directory")
    ap.add_argument("--reindex-only", action="store_true", help="Rebuild catalog.json without downloading")
    args = ap.parse_args()

    proj = pathlib.Path(args.project).resolve()
    dest_root = proj / "public" / "assets" / "3d-kits"
    dest_root.mkdir(parents=True, exist_ok=True)

    if not args.reindex_only:
        download_kits(dest_root)
    build_catalog(dest_root)


if __name__ == "__main__":
    main()
