# 通用叙事动画剧本与分镜化顺稿指南

在锁定旁白音频前先完成剧本分镜化顺稿：一旦根据旁白音频跑完 `words.json`，所有镜头时长即被锁定；如果原稿充满统计数字堆砌或没有画面的抽象议论，后期三维空间再精致也会退化成念字卡。

---

## 一、篇幅与叙事结构

- **时长估算**：紧凑短视频叙事旁白通常约 **165–180 词/分钟**；1,700–2,200 词约合 **10–12 分钟**（通常划分为 8–10 章，每章 60–75 秒）。
- **开场钩子（前 20–35 秒）**：
  1. **现场第二人称代入**：直接把观众放进冲突发生的那一刻与具体三维空间中，再抛出核心悬念。
  2. **反常事实反差**：先给出违反直觉的结果，再追问“为什么看似最稳的方案反而导致崩盘？”。
  3. **终局倒叙**：先亮出关键转折画面，再顺着人物的每一次具体选择往回拆解。
- **常见题材结构**：
  - **历史/商业决策复盘**：初始困境 → 关键人物登场与豪赌 → 早期顺境埋下的隐患 → 核心转折现场 → 连锁崩盘或逆转 → 余波。
  - **技术/发明/工程科普**：旧时代的痛点 → 失败尝试 → 核心原理突破（可配 4–8 秒四色调三维/等距剖面图）→ 现实阻力 → 落地改变。
  - **人物传记**：决定性瞬间开场 → 早年伏笔 → 三步崛起 → 最艰难的一次抉择 → 代价与遗产。

---

## 二、剧本文件格式（`production/script.md`）

每行一个叙事节拍（Beat），` | ` 左侧为旁白正文，右侧为三维空间与表演提示，`[air 0.8]` 表示在该处预留至少 0.8 秒的环境音呼吸停顿：

```markdown
## 1 The Harbor Test
Thirty sailors sprint from starboard to port across the brand-new warship's deck. | SET harbor_dock, 30 sailors run across deck, ship heels 8 deg
Below the waterline, the hull holds too little stone to right itself. | cutaway: four-tone hull cross-section showing high bronze guns vs shallow ballast
Nobody dares tell the King. [air 0.9] | SET royal_quay, admiral gulp, courier hands sealed scroll
```

---

## 三、定稿前三大分镜化铁律（由 `script_lint.py` 自动检查）

1. **去报表化（`NUMBERS` / `ROLL-CALL`）**：
   - **避免**：10 秒内连报 3 个以上统计数字，或 `First... Second... Third...` 编制清单。
   - **改法**：每 10 秒最多保留 **1 组最直观的核心反差数字**，其余全部改写为具象的物理动作或空间对比。
2. **抽象推演转具象场景或剖面拆解（`ARGUMENT` / `TEXT`）**：
   - **避免**：超过 6 秒没有时间、地点、人物动作的纯假设议论（`If they wait... Which means... In other words...`），或超过一半的节拍靠屏幕弹文字卡片解释。
   - **改法**：将抽象推演改写为 **3–5 秒的角色脑补小剧场（`playlet:`）**、**沙盘桌面推演（`tabletop:`）** 或 **机械/建筑结构剖面镜头（`cutaway:`）**。全片带屏幕标牌的节拍占比不超过 40%。
3. **关键反差留呼吸气口（`AIR`）**：
   - 在极短的反差句（如 `"Did it hold? No."`）、视觉冲击落点及每章结尾句后显式标注 `[air 0.8]`～`[air 1.2]`，导入旁白音频后再用 `scripts/director/air.py` 打开停顿并同步重算 `words.json`。

---

## 四、检查与导出命令

```bash
K=~/.gemini/skills/lineless-3d-video/scripts
python3 "$K/director/script_lint.py" production/script.md --strict --export production/texts_clean
```
