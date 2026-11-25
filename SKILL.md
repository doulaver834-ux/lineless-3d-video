---
name: lineless-3d-video
description: 制作通用叙事、历史、商业、科普与人物故事的「无描边二维角色（Style 2）+ 无描边双色调三维空间（Three.js + Remotion）」动画视频。支持圆胶囊头无描边人物与骑兵骨骼、真实三维门窗透视与地形高差、薄透镜光学景深（LensBlur）、真实三维剪影投影、纪录片地标与逐词高亮字幕，以及 1,007 个 CC0 低多边形 .glb 模块化三维资产库。白脸粗黑线、CUTAWAY 和 LOW SUN 二维风格请用 flat-cartoon-code-video。
---

# 通用无描边 3D 叙事动画（Style 2 二维角色 + Three.js 双色调三维空间）

如有 `LOCAL.md`，先读其中的本机 T7 路径、共享 `node_modules`、已缓存的 1,007 个 CC0 `.glb` 资产目录及认可的 2K 样片基准。以下 `K=<本技能目录>/scripts`。

认可视觉基准（2026-11-24）：`examples/benchmark_1876_3d/`（19.80 秒，`2560×1440 @ 30fps`，包含议会大厅过肩推镜、书房木槌落案、原木指挥部真实三维敞开门洞透视室外营区、高地砂岩悬崖摇臂拉远俯瞰蜿蜒河谷四幕空间）。所有新成片画质、边缘锐度与 2D–3D 融合度不得低于该基准。

**开工前必读 [references/quality-bar.md](references/quality-bar.md)**：用户要求「细致、高质量，不要 demo」。短片同样至少 3 座独立三维场景、每座单独文件 ≥ 650 行、每 4–6 秒换空间或机位、每座场景一件随剧情动画的英雄道具，并按第三节派多个 Subagent 并行精雕。禁止白墙空房间、一字排开的群演、沿用被否决版本的切音和场景代码。

---

## 一、画风与视觉统一铁律

1. **通用纪录片视觉包装（`src/Graphics.tsx`）**：
   - 采用克制的现代叙事纪录片包装：左上角地点/年代条（Dateline）、关键叙事转折处的单枚状态印章（Badge）、底部按语义自动切分并逐词高亮的字幕条。
   - 单镜头同屏不超过 1 个主信息标牌 + 底部字幕，所有说明性信息优先转化为角色手中的实体道具（信函、手册、账本、地图、旗帜）。
2. **2D 角色与 3D 空间无描边统一**：
   - **人物与坐骑（`src/style2Rig.js` + `src/linelessCast.ts`）**：圆胶囊头、柔和暖白 `#fffaf0` 眼仁、双色调分层服饰（政治家、军官、学者、工匠、商人、探险家、士兵等通用预设）、带拇指手型、逐词口型门控 `speechOpen()`，挂载至 Three.js 离屏画布立牌并开启 `customDepthMaterial` 投射真实三维剪影阴影。
   - **三维环境（`twoTone` 双色调着色器）**：**不挂载黑色漫画描边 `InkPass`**，不在程序化贴图里画黑色网格描边，也不混入高面数写实扫描 PBR 模型。所有三维建筑、地形与外部 `.glb` 模型统一包裹 `twoTone()` 双色调着色器，辅以墙角暖深褐环境光遮蔽条（AO Strip）与柔和体积光束。
3. **动态清晰度铁律**：
   - **禁用屏幕空间运动快门卷积模糊（`CameraShutter`）**，保持推拉与摇臂运镜中无描边色块边缘 100% 锐利。
   - 仅使用基于真实深度缓冲的薄透镜光学景深 `LensBlur`：过肩（OTS）前景镜头开启浅景深虚化前景肩头（遮挡控制在画面侧边 `15%–22%` 以内，不遮挡主体手部与道具）；大远景摇臂俯瞰镜头设 `aperture: 0`（全景深清晰成像）。

---

## 二、标准制作流程

1. **分镜化顺稿与旁白配音（TTS）**
   - 配音前先按 [剧本分镜化指南](references/script.md) 检查文稿（去连续数字报表、超 6 秒抽象推演转具象小剧场或剖面拆解、关键转折留 `[air 0.8]` 气口）：
     ```bash
     python3 "$K/director/script_lint.py" <project>/production/script.md --strict --export <project>/production/texts_clean
     ```
   - 默认旁白配置见 [references/tts.md](references/tts.md)（`gemini-3.8-flash-tts`、音色 `Fenrir`、`compact-shortform-v3`，保留原生语速）：
     ```bash
     python3 "$K/narrate.py" <project> --texts <project>/production/texts_clean
     python3 "$K/words.py" <project> <project>/assets/audio/narration.wav
     ```
   - 如剧本标有 `[air N]` 停顿气口，用 `python3 "$K/director/air.py"` 精准撑开音频与 `words.json`。

2. **一键初始化三维工程与挂载 CC0 `.glb` 资产库**
   - 运行初始化脚本（本机存在 T7 缓存时自动秒级软链 `node_modules` 与 1,007 个 `.glb` 资产及 `catalog.json`；新机器加 `--download-assets` 自动下载入库）：
     ```bash
     python3 "$K/setup_lineless_3d.py" <project>
     ```

3. **搭建三维空间（`.glb` 资产优先 + 参数化壳体）**
   - 查阅 `<project>/public/assets/catalog.json`（8 套共 1,007 个 CC0 `.glb` 模型：室内家具 140 件、自然树石地形 329 件、历史城镇建筑 167 件、铁路火车 103 件、营地工具 80 件、城堡要塞 76 件、帆船港口 72 件、近现代街区 40 件），用 `instantiateLinelessGlb(path, { targetHeightM, pos, rotY })` 直接摆位，自动完成底面对齐 `y = 0` 与 `twoTone` 双色调材质转换。
   - 室内顶棚/屋顶一律设 `castShadow = false` 以保证方向阳光照入室内；门洞与窗洞留出真实三维开口并布置窗外/门外三维远景；室内浮尘半径不超过 `0.007m`（`opacity <= 0.24`）。详见 [references/architecture-and-craft.md](references/architecture-and-craft.md) 与 [references/assets-and-pipeline.md](references/assets-and-pipeline.md)。

4. **角色表演、机位约束与拟音母带**
   - 当代题材（公司、科技园区、董事会）用 `exec_founder` / `modern_*` / `board_*` 服装 kit，工牌主题色用 `setStyle2Accent()` 设置；双人拥抱一律用 `createHugActor(kitA, kitB)`，详见 [references/architecture-and-craft.md](references/architecture-and-craft.md) 第 5 节。
   - 人物手部坐标、马背手部偏移（骑手举高道具需设 `hand[1]` 在 `-440 ~ -490` 区间）及 `perform()` 表演动词见 [references/architecture-and-craft.md](references/architecture-and-craft.md)。
   - 侧面坐骑运镜约束：水平机位保持在行进法线 `±25°` 以内，通过垂直摇臂升降与纵深推拉展现空间感。
   - 涉及机械原理或建筑构造时，可穿插 4–8 秒四色调（Four-tone）等距剖面拆解镜头。
   - 编辑 `production/action-cues.json`，运行 `uv run --with numpy --with scipy python scripts/audio.py` 合成动作锁定的物理拟音并标准化至 `-14 LUFS`。

5. **强制静帧质检（Stills QA）与 2K 成片渲染**
   - 先运行 `node scripts/render.mjs --stills` 输出关键帧总览，按 10 项质检表核查过肩遮挡、桌面高度、腰部动作空间与脚底接地阴影；通过后再运行 `node scripts/render.mjs` 输出 `2560×1440`（2K，`CRF 16`）成片并清理 `.bundle` 与 `.render-tmp`。

---

## 三、多 Subagent 并行规范（短片与长片都适用）

**短片（30–90 秒）**：主线程锁定剧本、配音、`words.json`、镜头表和每座场景的世界坐标契约后，每座场景派 1 个场景建筑师 Subagent（独占一个 `src/setXxx3d.ts`），角色骨骼和服装另派 1 个（独占 `style2Rig.js` + `linelessCast.ts`）；任务书模板与要求见 [references/quality-bar.md](references/quality-bar.md) 第五节。

**长片（8–12 分钟）**：制作 8–12 分钟长片时，先单线程锁死全片配音与 `words.json` 并切分为 8–10 个章节（每章 60–75 秒），再以每批 4–6 个 Subagent 并行编写新增场景与各章运镜代码，统一跑全片静帧抽检修正遮挡后，分章增量渲染并用 `ffmpeg -c copy` 无损拼接。
