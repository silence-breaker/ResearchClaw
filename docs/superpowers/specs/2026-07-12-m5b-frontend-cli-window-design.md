# V3-M5b 多 CLI 窗口与成本来源展示（前端）设计

> 日期：2026-07-12 · 里程碑：V3-M5b（前端）· 状态：已批准，待实现
> 关联 spec：`docs/superpowers/specs/2026-07-12-m5-experiment-workflow-design.md`（M5a 后端，已落地 main）
> 边界：M6 做深度证据化（EvidenceMapTab 的 experiment claim_support 门控可视化），M5b 不碰。

## 目标

M5a 后端把三个实验阶段（`experiment_planning → experiment_execution → experiment_review`）插入了状态机，并发出了对应的 SSE 事件与 artifact。但前端**完全不认识这三个阶段**——`ResearchPhase` 类型仍止于 `summary`，`runner` 不在任何 adapter 联合类型里，`run_phase` pending action 的 `commands` 字段前端不透传也不渲染，抽屉不认三种 experiment artifact 的 content 形状。

M5b 让前端把 M5a 已经产出的数据显示出来：**纯消费端，零后端改动**。

三阶段数据流走通后用户能看到的：

```
experiment_planning 跑完 → pending action 带 commands
  → ActionBar 在确认按钮上方显示只读命令块
  → 人工确认 advance → experiment_execution 真跑
  → cli_chunk（provider "runner" / windowId）流入右栏 CliWindows（M4 已按 windowId 分组）
  → experiment_run artifact 落地 → 抽屉可查（status/exit_code/metrics_observed/failure_reason）
  → experiment_review → summary
```

## 核心设计决策（已批准）

1. **纯消费端，零后端改动**。M5a 后端已发出全部所需数据：`cli_chunk` 带 `provider:"runner"`/`windowId`，`run_phase` pending action 带 `commands:string[]`，`experiment_run` artifact 带 `producer.adapter:"runner"`。M5b 只识别并渲染。
2. **阶段感知走扩联合类型，不做数据驱动重构**。让前端认得三个新阶段的方式是直接扩 `ResearchPhase` 联合类型 + 阶段标签映射 + `PipelineProgress` 节点，镜像现有 `summary` 的处理方式。不改成后端下发阶段列表的数据驱动方案（YAGNI，且偏离现有模式）。
3. **逻辑入 lib、JSX 保持薄**。整形/派生逻辑放 `lib/` 层用 vitest 单测覆盖；组件 JSX 不新增 React 测试脚手架（贴合现有纯逻辑单测的测试架构）。
4. **命令确认 = 只读命令块 + 确认按钮**。`experiment_execution` 是人工把关真实命令执行的安全点。在现有 advance 按钮上方渲染带边框的只读命令块（等宽、逐行、`$` 前缀），按钮沿用后端 label「确认并执行实验命令」。命令**不可编辑**（来自 plan gate，编辑需后端回路，不在范围）。
5. **runner 用琥珀色 badge**。`AdapterBadge` 的 runner tone 用 amber，区别于 claude=accent / gemini=sky / codex=violet / mock=muted，呼应「终端/执行」语义。
6. **精简完整的可视化**。三 artifact 以结构化但朴素的方式渲染（键值、逐命令 exit_code、failure_reason）；不做图表、可编辑命令、metrics 对比表、证据深链——那些属丰富体验或 M6。

## 阶段标签（已批准措辞）

| phase | 中文标签 |
| --- | --- |
| experiment_planning | 实验规划 |
| experiment_execution | 实验执行 |
| experiment_review | 实验复核 |

## 工作单元（5 个，各自独立可测/可 review）

### 单元 1 — 类型与标签地基

**文件：** `researchclaw/web/src/api/types.ts`、`researchclaw/web/src/lib/processFeed.ts`、`researchclaw/web/src/lib/phase.ts`（`phaseLabel` 所在，被 `actions.ts` 引用）

- `ResearchPhase` 联合类型 += `"experiment_planning" | "experiment_execution" | "experiment_review"`（插在 `idea_review` 与 `summary` 之间，与后端 `researchPhases` 顺序一致）。
- `CliProvider`（types.ts:189）+= `"runner"`。
- `Artifact.producer.adapter`（types.ts:237）联合 += `"runner"`。
- `AdapterTone`（processFeed.ts:3）+= `"runner"`。
- `PendingAction` 的 `run_phase` 变体 += `commands?: string[]`。
- 阶段中文标签映射加三条（见上表）。

**验收：** tsc 通过；阶段标签函数对三个新 phase 返回上表措辞的单测。

### 单元 2 — runner badge

**文件：** `researchclaw/web/src/lib/processFeed.ts`、`researchclaw/web/src/components/AdapterBadge.tsx`

- `adapterBadgeMeta("runner")` → `{ label: "执行器", tone: "runner" }`（label 具体措辞实现时与既有 claude/gemini 风格对齐）。
- `AdapterBadge` 的 `TONE_CLASS` += `runner: "border-amber-400/40 bg-amber-400/15 text-amber-300"`（amber 具体色阶实现时与 Tailwind 主题核对）。

**验收：** `adapterBadgeMeta("runner")` 返回 runner tone 与非空 label 的单测；badge 组件对 runner 不落到 unknown 兜底。

### 单元 3 — 管线节点

**文件：** `researchclaw/web/src/lib/pipeline.ts`、`researchclaw/web/src/components/PipelineProgress.tsx`

- 三个 experiment 阶段进入进度节点显示，顺序与状态机一致。
- `overallProgress` / `artifactCount`（及任何按阶段枚举的派生）把三个新阶段算进去，不因新增阶段导致进度百分比错算。

**验收：** pipeline 派生函数对含 experiment 阶段的 state 返回正确节点数/进度的单测。

### 单元 4 — 命令确认

**文件：** `researchclaw/web/src/lib/actions.ts`、`researchclaw/web/src/components/ActionBar.tsx`

- `deriveActions` 处理 `run_phase` 时，把 `commands` 透传到派生出的 `advance` action 上（`PanelAction` 的 advance 变体 += `commands?: string[]`）。
- `ActionBar` 渲染 advance action 时，若 `commands` 非空，在按钮上方渲染带边框只读命令块（等宽字体、逐行、`$` 前缀）。commands 为空时行为与现在完全一致（不显示空块）。

**验收：** `deriveActions` 对带 commands 的 run_phase 保留 commands、对不带的返回 undefined 的双向单测。命令块渲染由浏览器实测确认（无组件测试框架）。

### 单元 5 — artifact 抽屉渲染

**文件：** `researchclaw/web/src/components/ArtifactDetailDrawer.tsx` + 一个 lib 整形 helper（新建于 `lib/`，如 `experimentArtifact.ts`）

- lib helper 把三种 content 整形为可渲染的字段列表：
  - `experiment_plan`：hypothesis、commands、metrics、success_criteria、failure_criteria。
  - `experiment_run`：status、逐命令 `{command, exit_code}`、metrics_observed 键值、failure_reason、produced_files。
  - `experiment_review`：decision、claim_support 列表（claim_id/metric_ref/support_type）、run_ref（用 `RefChip` 渲染成可跳转引用）。
- `ArtifactDetailDrawer` 用 helper 输出渲染三种类型；未知/缺字段安全兜底（不崩）。

**验收：** helper 对三种 content 形状（含缺字段的退化 content）返回预期字段列表的单测；抽屉渲染由浏览器实测确认。

## 测试策略

- **单元 1-5 的 lib 逻辑**：vitest 单测，co-located 于对应 `lib/*.test.ts`。新增覆盖：阶段标签三 phase、`adapterBadgeMeta("runner")`、pipeline 含新阶段、`deriveActions` commands 透传、experimentArtifact helper 三形状。
- **JSX 渲染**：无 React 组件测试框架，不新增脚手架。
- **收尾浏览器实测**（CLAUDE.md 要求）：启 dev server，用 mock 管线把项目从头推到 summary，肉眼确认——命令块在 execution 前显示、runner badge 出现在 runner 窗口/artifact、三 artifact 抽屉内容正确、PipelineProgress 三节点、进度百分比正确。

## 不做（M5b 边界外）

- EvidenceMapTab 的 experiment claim_support 深度证据状态（M6）。
- 可编辑命令 / 命令级 screen 预览（需扩后端）。
- metrics_observed vs success_criteria 对比表、per-command stdout/stderr 折叠预览、CurrentPhaseCard 三阶段专属摘要卡（丰富体验，非本里程碑）。
- 任何后端改动。
