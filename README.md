# Lineless 3D Video (`lineless-3d-video`)

Universal agent skill (Claude Code, Codex, Antigravity) for producing narrated historical, biographical, science, business, and documentary animation combining **Style 2 lineless colour-block 2D characters & riders** with **Three.js two-tone 3D architecture, terrain, real directional shadows, and thin-lens optical depth of field** (`2560×1440` 2K @ 30fps, `-14 LUFS`).

![8-Shot 2K Benchmark Overview](examples/benchmark_1876_3d/lineless_3d_8shots_overview.jpg)

## Key Capabilities

- **Style 2 Lineless 2D Cast in 3D Space** (`style2Rig.js` + `linelessCast.ts`): Rounded capsule heads, warm soft eyes, universal two-tone wardrobe presets (statesmen, officers, scholars, merchants, artisans, explorers, soldiers, civilians), sculpted cuff+thumb hands, 24 props, word-gated `speechOpen()` lip sync, full-length rear OTS figures, and side-view horses casting real 3D silhouette shadows (`customDepthMaterial`).
- **Contemporary Cast & Two-Person Hug**: 13 modern office / tech-campus / boardroom kits (`exec_founder`, `modern_*`, `board_*`), lanyard badges with a configurable brand accent (`setStyle2Accent`), contemporary props, and a proportion-matched two-person embrace actor (`createHugActor(kitA, kitB)`).
- **Quality Bar** (`references/quality-bar.md`): minimum scene/shot/detail density for "no demo" deliverables and the parallel set-architect subagent brief template.
- **Lineless Storybook 3D Worlds (`twoTone` Shader)**: Unified two-tone surface shading without comic black outlines (`InkPass` off) so 3D architecture and terrain harmonize seamlessly with lineless 2D characters; real 3D window/doorway portals, warm-umber AO baseboard strips, volumetric sun shafts, and `LensBlur` shallow optical bokeh.
- **1,007 Reusable CC0 `.glb` Assets + Auto-Normalizer** (`download_cc0_kits.py` + `glbAssetKit.ts`): Pulls 8 curated Kenney CC0 3D kits (`furniture`, `nature`, `fantasy-town`, `train`, `survival`, `castle`, `pirate`, `city-suburban`), indexes exact `[width, height, depth, minY]` bounds into `catalog.json`, grounds every model flush at `y = 0`, scales to real-world meter heights, and converts materials to `twoTone()` automatically.
- **Script Linting, Narrated Timeline & Broadcast Mastering**: Bundled pre-TTS visual script linter (`script_lint.py`), pause breather (`air.py`), Gemini 3.8 Flash TTS (`Fenrir`, `compact-shortform-v3`), `mlx-whisper` word alignment (`words.py`), data-driven documentary typography (`Graphics.tsx`), and `-14 LUFS` Foley SFX mastering (`audio.py`).

## Install

### Claude Code
```bash
mkdir -p ~/.claude/skills
git clone https://github.com/doulaver834-ux/lineless-3d-video.git ~/.claude/skills/lineless-3d-video
```

### Codex
```bash
mkdir -p ~/.codex/skills
git clone https://github.com/doulaver834-ux/lineless-3d-video.git ~/.codex/skills/lineless-3d-video
```

## Quick Start

```bash
K=~/.claude/skills/lineless-3d-video/scripts

# 1. Scaffold a new 3D project (links local cached node_modules & 1,007 GLB kits if present, or pass --download-assets)
python3 "$K/setup_lineless_3d.py" ./my-episode --download-assets

# 2. Render lookdev QA stills first, then full 2K (2560x1440 @ 30fps) master
cd ./my-episode
node scripts/render.mjs --stills
node scripts/render.mjs
```

See [SKILL.md](SKILL.md), [Script Guide](references/script.md), [Architecture & Craft Rules](references/architecture-and-craft.md), and [3D GLB Asset Pipeline](references/assets-and-pipeline.md) for full details.

[MIT License](LICENSE) (3D asset downloader pulls CC0 1.0 Public Domain packs from Kenney.nl)
