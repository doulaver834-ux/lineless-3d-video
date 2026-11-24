---
name: lineless-3d-video
description: 制作通用叙事、历史、商业、科普与人物故事的「无描边二维角色（Style 2）+ 无描边双色调三维空间（Three.js + Remotion）」动画视频。完全去除石膏半身像老师与考卷打 F 等特定频道设定，采用通用纪录片地标条、克制转折印章、逐词高亮字幕、真实光学景深（LensBlur）、真实三维投影及 1,007 个 CC0 低多边形 .glb 模块化资产库。若需制作带石膏老师与红笔打 F 的专有栏目用 f-in-history-video；白脸粗黑线风格用 flat-cartoon-code-video。
---

# 通用无描边 3D 叙事动画（Style 2 二维角色 + Three.js 双色调三维空间）

如有 `LOCAL.md`，先读其中的本机 T7 路径、共享 `node_modules`、已缓存的 1,007 个 CC0 `.glb` 资产目录及 2026-11-24 认可的 2K 样片基准。以下 `K=<本技能目录>/scripts`。

认可视觉基准（2026-11-24）：`examples/little_bighorn_1876_3d/`（19.80 秒，`2560×1440 @ 30fps`，覆盖国会听证厅过肩推镜、白宫书房落槌、林肯堡原木屋真实三维敞开门洞透视校场、蒙大拿砂岩高地摇臂拉远俯瞰蜿蜒河谷四幕空间）。所有新成片画质、锐度与 2D–3D 融合度不得低于该基准。

---

## 一、核心定位与硬性排除规则

1. **彻底通用化（无特定频道包袱）**：
   - **严禁出现**无臂大理石石膏老师（`teacher.js`）、考卷定格（`examFreeze`）、黑板出题或红笔打 `F` 等特定栏目符号。
   - 平面视觉包装统一采用通用纪录片体制（`src/Graphics.tsx`）：左上角克制的地点/年代条（Dateline）、关键转折点的单枚印章卡片（如 `ZERO EVIDENCE`、`COMMAND REVOKED`）、底部语义分句逐词高亮字幕。
2. **2D 与 3D 美术统一铁律（拒绝割裂感）**：
   - **人物与骑兵**：保留原版 Style 2 无描边二维骨骼（圆胶囊头、柔和暖白 `#fffaf0` 眼仁、双色调分层服装、带拇指手型、逐词口型门控 `speechOpen()`），挂载至 Three.js 离屏画布立牌并投射真实剪影阴影（`customDepthMaterial`）。
   - **三维场景**：**严禁开启黑色漫画描边 `InkPass`**，也严禁在程序化贴图中使用黑色描边线框或引入高精度照片级写实扫描 PBR 模型。所有三维建筑、地形与外部 `.glb` 模型统一包裹 `twoTone()` 双色调着色器，辅以墙角暖深褐环境光遮蔽条（AO Strip）与柔和体积光束。
3. **动态清晰度铁律**：
   - **严禁挂载屏幕空间运动快门卷积模糊（`CameraShutter`）**——实测证实该卷积在摇臂或推拉运镜中会糊掉无描边二维人物的干净色块边缘。
   - 仅保留基于真实深度缓冲的薄透镜光学景深 `LensBlur`：过肩（OTS）前景镜头开启浅景深虚化前景肩头（遮挡面积控制在画面侧边 `15%–22%` 以内，绝不挡住主体手部动作与道具）；大远景摇臂俯瞰镜头将 `aperture` 设为 `0`（全景深锐利成像）。

---

## 二、标准制作流程

1. **剧本与默认旁白（TTS）**
   - 旁白配置详见 [references/tts.md](references/tts.md)：默认使用 `gemini-3.8-flash-tts`、音色 `Fenrir`、配置 `compact-shortform-v3`（[narration-compact-v3.txt](references/narration-compact-v3.txt)），保留模型原生语速，不做后期变速。
   - 生成音频与词级时间轴：
     ```bash
     python3 "$K/narrate.py" <project> --prepare-only
     python3 "$K/narrate.py" <project>
     python3 "$K/words.py" <project> <project>/assets/audio/narration.wav
     ```

2. **一键初始化三维工程与挂载 CC0 `.glb` 资产库**
   - 运行初始化脚本（若本机 `LOCAL.md` 中存在 T7 缓存资产与 `node_modules` 会自动秒级软链；新机器可加 `--download-assets` 自动拉取 8 套共 1,007 个 Kenney CC0 `.glb` 模型并生成尺寸字典 `public/assets/catalog.json`）：
     ```bash
     python3 "$K/setup_lineless_3d.py" <project>
     ```

3. **搭建三维空间（资产优先 + 参数化壳体）**
   - 优先查阅 `<project>/public/assets/catalog.json`（涵盖 `furniture-kit` 140 件、`nature-kit` 329 件、`fantasy-town-kit` 167 件、`train-kit` 103 件、`survival-kit` 80 件、`castle-kit` 76 件、`pirate-kit` 72 件、`city-kit-suburban` 40 件），用 `src/glbAssetKit.ts` 中的 `instantiateLinelessGlb(path, { targetHeightM, pos, rotY })` 直接摆位——自动完成底面对齐 `y = 0` 与 `twoTone` 双色调材质转换。
   - 室内外建筑门窗与地形规范详见 [references/architecture-and-craft.md](references/architecture-and-craft.md) 与 [references/assets-and-pipeline.md](references/assets-and-pipeline.md)：
     - 室内顶棚/屋顶一律设 `castShadow = false`，确保方向太阳光顺畅照入室内；门洞与窗洞必须留出真实三维开口（可透过门洞看到门外三维远景）。
     - 浮尘粒子半径不超过 `0.007m`（`opacity <= 0.24`），防止浅景深下膨胀成白斑。

4. **角色表演、机位约束与拟音合成**
   - 人物手部与骑兵坐标、24 种历史/叙事道具及 `perform()` 表演动词见 [references/architecture-and-craft.md](references/architecture-and-craft.md)。注意骑兵局部坐标偏移：马背骑手举起道具（如手册、军旗、马刀）时 `hand[1]` 需设在 `-365 ～ -480` 区间，才能高过马颈清晰露出剪影。
   - 侧面二维马匹运镜约束：水平方向机位角度保持在行进法线 `±25°` 以内（配合垂直高度升降与远近推拉），避免接近 `90°` 侧切暴露纸片厚度。
   - 若叙事涉及机械内部原理或建筑构造拆解，可穿插 4–8 秒四色调（Four-tone）等距剖面图镜头（规范见 [references/architecture-and-craft.md](references/architecture-and-craft.md)）。
   - 用 `uv run --with numpy --with scipy python scripts/audio.py` 生成与关键动作帧（落槌、翻口袋、跪地、递交文书、马蹄声）严格锁定的物理拟音，并经 `loudnorm` 标准化至 `-14 LUFS`。

5. **强制静帧质检（Stills QA）与 2K 成片渲染**
   - **禁止未经静帧看图直接渲染长片**。先跑 `node scripts/render.mjs --stills` 输出每个镜头的关键帧并拼成总览表逐图核查：
     1. 前景过肩人物或桌椅是否挡住主角脸部、翻出的口袋或手中道具？
     2. 台后/桌后人物高度是否合适（槌子、文件是否落到桌面以下被挡住）？
     3. 双脚与马蹄是否严丝合缝踩在 `y = 0` 或 `getTrailHeight(x, z)` 地面上？
   - 质检通过后执行 `node scripts/render.mjs` 输出 `2560×1440`（2K，`CRF 16`）成片，并在完成后清理 `.bundle` 与 `.render-tmp` 临时目录。

---

## 三、10 分钟长片的多 Subagent 并行量产规范

制作 8–12 分钟长片时，严禁单文件硬塞全片，按以下流水线并行（实测在沉淀资产库基础上约 **1.5–3 小时** 完成一条 2K 长片）：
1. **单线程锁定全局基准**：先完成全片 TTS 配音与 `words.json`，按叙事段落切分为 8–10 个独立章节（每章 60–75 秒），统一定义角色 `kit` 与公共场景模块。
2. **分波并发 Subagent（每批 4–6 个最稳）**：由专门场景 Subagent 组装新增三维舞台，多个章节 Subagent 并行编写各自章节的运镜与动作时间轴（子 Agent 只写模块化 TS 代码，由主进程统一编译与渲染）。
3. **批量静帧初筛 + 增量分章渲染**：全片抽帧拼表排查那 10%–15% 的遮挡/构图偏差，只重渲修改过的章节，最后用 `ffmpeg -c copy` 无损合成全片。
