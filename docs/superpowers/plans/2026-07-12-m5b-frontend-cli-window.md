# V3-M5b 多 CLI 窗口与成本来源展示（前端）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让前端识别并渲染 M5a 后端已产出的三个实验阶段数据（阶段、runner badge、命令确认、三 artifact 抽屉），纯消费端零后端改动。

**Architecture:** 扩 `ResearchPhase`/`CliProvider`/`ArtifactType` 等联合类型认得新阶段与 runner；整形/派生逻辑入 `lib/` 层用 vitest 覆盖，组件 JSX 保持薄；命令确认在现有 advance 按钮上方渲染只读命令块；三 artifact 由新建 lib helper 整形后在抽屉渲染。

**Tech Stack:** React + TypeScript（`researchclaw/web/`），vitest 单测（co-located `*.test.ts`），Tailwind。

## Global Constraints

- **零后端改动**：M5b 只识别并渲染 M5a 已发出的数据，不碰任何后端文件。
- **测试架构**：仅 vitest 纯逻辑单测，co-located 于对应 `lib/*.test.ts`；**不新增 React/JSX 组件测试脚手架**。JSX 渲染由收尾浏览器实测确认。
- **阶段插入顺序**：`experiment_planning → experiment_execution → experiment_review`，插在 `idea_review` 与 `summary` 之间，与后端 `researchPhases` 顺序一致。
- **阶段中文标签（已批准措辞）**：experiment_planning=`实验规划`，experiment_execution=`实验执行`，experiment_review=`实验复核`。
- **runner badge**：label=`执行器`，tone=`runner`，色 amber（`border-amber-400/40 bg-amber-400/15 text-amber-300`）。
- **命令块**：等宽字体、逐行、`$` 前缀、只读不可编辑、带边框；commands 为空时不渲染空块（行为与现状一致）。
- **前端命令**：所有 vitest 在 `researchclaw/web/` 目录下用 `npm run test`（或 `npx vitest run <file>` 跑单文件）。tsc 校验用 `npm run build` 或 `npx tsc --noEmit`。
- **types.ts 是后端契约镜像**：`Engine is single source of truth`，新增字段须与后端产出形状一致。

---

### Task 1: 类型与标签地基

**Files:**
- Modify: `researchclaw/web/src/api/types.ts`（`ResearchPhase` 5-16、`PendingAction` run_phase 45、`ProjectCurrent` 57-71、`ArtifactType` 220-229、`CliProvider` 189、`Artifact.producer.adapter` 237）
- Modify: `researchclaw/web/src/lib/processFeed.ts`（`AdapterTone` 3）
- Modify: `researchclaw/web/src/lib/phase.ts`（`PHASE_LABEL`、`PHASE_TASKS`、`ArtifactKey`、`PHASE_ARTIFACT_KEY`）
- Test: `researchclaw/web/src/lib/phase.test.ts`（新建）

**Interfaces:**
- Consumes: 无（地基任务）。
- Produces:
  - `ResearchPhase` 含 `"experiment_planning" | "experiment_execution" | "experiment_review"`。
  - `CliProvider` 含 `"runner"`；`Artifact.producer.adapter` 含 `"runner"`；`AdapterTone` 含 `"runner"`。
  - `ArtifactType` 含 `"experiment_plan" | "experiment_run" | "experiment_review"`。
  - `ProjectCurrent` 含 `experiment_plan_artifact_ref?` / `experiment_run_artifact_ref?` / `experiment_review_artifact_ref?`。
  - `PendingAction` run_phase 变体含 `commands?: string[]`。
  - `phaseLabel("experiment_planning") === "实验规划"`（及另两条）；`currentArtifactRef` 对三阶段返回对应 ref。

- [ ] **Step 1: 写失败测试**

新建 `researchclaw/web/src/lib/phase.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { phaseLabel, currentArtifactRef } from "./phase";
import type { ProjectCurrent } from "../api/types";

describe("phaseLabel — experiment phases", () => {
  it("labels experiment_planning", () => {
    expect(phaseLabel("experiment_planning")).toBe("实验规划");
  });
  it("labels experiment_execution", () => {
    expect(phaseLabel("experiment_execution")).toBe("实验执行");
  });
  it("labels experiment_review", () => {
    expect(phaseLabel("experiment_review")).toBe("实验复核");
  });
});

describe("currentArtifactRef — experiment phases", () => {
  const current = {
    experiment_plan_artifact_ref: "artifacts/experiment_planning/plan_1.json",
    experiment_run_artifact_ref: "artifacts/experiment_execution/run_1.json",
    experiment_review_artifact_ref: "artifacts/experiment_review/review_1.json"
  } as ProjectCurrent;

  it("resolves the plan ref for experiment_planning", () => {
    expect(currentArtifactRef(current, "experiment_planning")).toBe(
      "artifacts/experiment_planning/plan_1.json"
    );
  });
  it("resolves the run ref for experiment_execution", () => {
    expect(currentArtifactRef(current, "experiment_execution")).toBe(
      "artifacts/experiment_execution/run_1.json"
    );
  });
  it("resolves the review ref for experiment_review", () => {
    expect(currentArtifactRef(current, "experiment_review")).toBe(
      "artifacts/experiment_review/review_1.json"
    );
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run（在 `researchclaw/web/`）：`npx vitest run src/lib/phase.test.ts`
Expected: FAIL（`phaseLabel` 对 experiment 阶段返回原始 key 而非中文标签；`currentArtifactRef` 返回 undefined）。

- [ ] **Step 3: 扩 types.ts 联合类型**

`researchclaw/web/src/api/types.ts`：

`ResearchPhase`（5-16）在 `"idea_review"` 与 `"summary"` 之间插三阶段：

```ts
export type ResearchPhase =
  | "idle"
  | "contract_draft"
  | "literature_scouting"
  | "baseline_selection"
  | "baseline_reproduction_checklist"
  | "idea_generation"
  | "idea_review"
  | "experiment_planning"
  | "experiment_execution"
  | "experiment_review"
  | "summary";
```

`PendingAction` 的 run_phase 变体（45）加 commands：

```ts
  | { type: "run_phase"; phase: ResearchPhase; label: string; commands?: string[] }
```

`ProjectCurrent`（57-71）在 `review_artifact_ref` 与 `summary_artifact_ref` 之间加三条：

```ts
  experiment_plan_artifact_ref?: string;
  experiment_run_artifact_ref?: string;
  experiment_review_artifact_ref?: string;
```

`ArtifactType`（220-229）末尾加三条：

```ts
  | "experiment_plan"
  | "experiment_run"
  | "experiment_review";
```

`CliProvider`（189）：

```ts
export type CliProvider = "claude" | "gemini" | "codex" | "mock" | "runner";
```

`Artifact.producer.adapter`（237）：

```ts
    adapter: "mock" | "claude" | "gemini" | "codex" | "manual" | "runner";
```

- [ ] **Step 4: 扩 processFeed.ts AdapterTone**

`researchclaw/web/src/lib/processFeed.ts` 第 3 行 `AdapterTone` 加 `"runner"`：

```ts
export type AdapterTone = "claude" | "gemini" | "codex" | "mock" | "manual" | "runner" | "unknown";
```

（`adapterBadgeMeta` 的 runner case 由 Task 2 加。）

- [ ] **Step 5: 扩 phase.ts 标签与 ref 映射**

`researchclaw/web/src/lib/phase.ts`：

`PHASE_LABEL`（Partial Record）加三条：

```ts
  experiment_planning: "实验规划",
  experiment_execution: "实验执行",
  experiment_review: "实验复核",
```

`PHASE_TASKS` 加三条（简短任务描述，与既有阶段风格一致）：

```ts
  experiment_planning: ["产出可执行实验计划", "对齐指标与判据"],
  experiment_execution: ["确认并执行实验命令", "记录运行结果与产物"],
  experiment_review: ["判断实验是否支持各 claim", "给出实验决策"],
```

`ArtifactKey` 类型（`keyof Pick<ProjectCurrent, ...>`）在 Pick 的 key 列表里加三条：

```ts
  | "experiment_plan_artifact_ref"
  | "experiment_run_artifact_ref"
  | "experiment_review_artifact_ref"
```

`PHASE_ARTIFACT_KEY` 映射加三条：

```ts
  experiment_planning: "experiment_plan_artifact_ref",
  experiment_execution: "experiment_run_artifact_ref",
  experiment_review: "experiment_review_artifact_ref",
```

- [ ] **Step 6: 运行确认通过**

Run（在 `researchclaw/web/`）：`npx vitest run src/lib/phase.test.ts`
Expected: PASS（6 tests）。

- [ ] **Step 7: tsc 校验**

Run（在 `researchclaw/web/`）：`npx tsc --noEmit`
Expected: 无类型错误。

- [ ] **Step 8: Commit**

```bash
git add researchclaw/web/src/api/types.ts researchclaw/web/src/lib/processFeed.ts researchclaw/web/src/lib/phase.ts researchclaw/web/src/lib/phase.test.ts
git commit -m "feat(v3-m5b): 前端类型与阶段标签地基（experiment 三阶段+runner+commands）"
```

---

### Task 2: runner amber badge

**Files:**
- Modify: `researchclaw/web/src/lib/processFeed.ts`（`adapterBadgeMeta` switch 7-22）
- Modify: `researchclaw/web/src/components/AdapterBadge.tsx`（`TONE_CLASS` 6-13）
- Test: `researchclaw/web/src/lib/processFeed.test.ts`（新建或追加）

**Interfaces:**
- Consumes: Task 1 的 `AdapterTone += "runner"`。
- Produces: `adapterBadgeMeta("runner") === { label: "执行器", tone: "runner" }`；`AdapterBadge` 对 runner tone 有专属 class，不落 unknown 兜底。

- [ ] **Step 1: 写失败测试**

新建（或追加到既有）`researchclaw/web/src/lib/processFeed.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { adapterBadgeMeta } from "./processFeed";

describe("adapterBadgeMeta — runner", () => {
  it("returns runner tone with a non-empty label", () => {
    const meta = adapterBadgeMeta("runner");
    expect(meta.tone).toBe("runner");
    expect(meta.label).toBe("执行器");
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run（在 `researchclaw/web/`）：`npx vitest run src/lib/processFeed.test.ts`
Expected: FAIL（runner 落到 default/unknown 兜底，tone !== "runner"）。

- [ ] **Step 3: 加 adapterBadgeMeta runner case**

`researchclaw/web/src/lib/processFeed.ts` 的 `adapterBadgeMeta` switch 里，在 default 之前加：

```ts
    case "runner":
      return { label: "执行器", tone: "runner" };
```

- [ ] **Step 4: 加 AdapterBadge TONE_CLASS runner 条目**

`researchclaw/web/src/components/AdapterBadge.tsx` 的 `TONE_CLASS`（6-13）加：

```ts
  runner: "border-amber-400/40 bg-amber-400/15 text-amber-300",
```

- [ ] **Step 5: 运行确认通过 + tsc**

Run（在 `researchclaw/web/`）：`npx vitest run src/lib/processFeed.test.ts && npx tsc --noEmit`
Expected: PASS + 无类型错误（`TONE_CLASS: Record<AdapterTone, string>` 若缺 runner 键会 tsc 报错，故此条同时验证完整性）。

- [ ] **Step 6: Commit**

```bash
git add researchclaw/web/src/lib/processFeed.ts researchclaw/web/src/lib/processFeed.test.ts researchclaw/web/src/components/AdapterBadge.tsx
git commit -m "feat(v3-m5b): runner 执行器 amber badge"
```

---

### Task 3: 管线节点

**Files:**
- Modify: `researchclaw/web/src/lib/pipeline.ts`（`PIPELINE` 14-27、`STRUCTURED_REF_KEYS` 64-72）
- Modify: `researchclaw/web/src/components/PipelineProgress.tsx`（若需——多数情况数据驱动无需改）
- Test: `researchclaw/web/src/lib/pipeline.test.ts`（新建或追加）

**Interfaces:**
- Consumes: Task 1 的 `ResearchPhase += 三阶段`、`ProjectCurrent += 三 ref`。
- Produces: `PIPELINE` 含三个 experiment 节点（顺序在 idea_review 后、summary 前）；`overallProgress` / `artifactCount` 把三阶段算进去。

- [ ] **Step 1: 写失败测试**

新建（或追加）`researchclaw/web/src/lib/pipeline.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { PIPELINE, artifactCount } from "./pipeline";
import type { ProjectState } from "../api/types";

describe("PIPELINE — experiment nodes", () => {
  it("includes the three experiment phases in order between idea_review and summary", () => {
    const idxOf = (id: string) => PIPELINE.findIndex((n) => n.id === id);
    const seq = PIPELINE.slice(idxOf("idea_review") + 1, idxOf("summary")).map((n) => n.id);
    expect(seq).toEqual([
      "experiment_planning",
      "experiment_execution",
      "experiment_review"
    ]);
  });
});

describe("artifactCount — experiment refs", () => {
  it("counts experiment artifact refs", () => {
    const state = {
      current: {
        experiment_plan_artifact_ref: "a",
        experiment_run_artifact_ref: "b",
        experiment_review_artifact_ref: "c"
      }
    } as ProjectState;
    expect(artifactCount(state)).toBe(3);
  });
});
```

（注：`artifactCount(state: ProjectState)` 读 `state.current?.[key]`，`STRUCTURED_REF_KEYS` 是模块内 `as const` 数组；核心断言是三 ref 被计入 count。PIPELINE 节点用 `id` 断言顺序，与既有节点 `id===phase` 命名一致。）

- [ ] **Step 2: 运行确认失败**

Run（在 `researchclaw/web/`）：`npx vitest run src/lib/pipeline.test.ts`
Expected: FAIL（PIPELINE 缺三节点；artifactCount 不含三 ref）。

- [ ] **Step 3: 加 PIPELINE 三节点**

`researchclaw/web/src/lib/pipeline.ts` 的 `PIPELINE` 数组里，在 idea_review 节点后、summary 节点前插入：

```ts
  { id: "experiment_planning", label: "实验规划", phases: ["experiment_planning"], done: "experiment_planning" },
  { id: "experiment_execution", label: "实验执行", phases: ["experiment_execution"], done: "experiment_execution" },
  { id: "experiment_review", label: "实验复核", phases: ["experiment_review"], done: "experiment_review" },
```

（字段名/形状实现时对齐既有 `PipelineNode` 定义——若既有节点用 `done: phase` 之外的形状，照既有节点镜像。）

- [ ] **Step 4: 加 STRUCTURED_REF_KEYS 三条**

`STRUCTURED_REF_KEYS`（64-72）加：

```ts
  "experiment_plan_artifact_ref",
  "experiment_run_artifact_ref",
  "experiment_review_artifact_ref",
```

- [ ] **Step 5: 运行确认通过 + tsc**

Run（在 `researchclaw/web/`）：`npx vitest run src/lib/pipeline.test.ts && npx tsc --noEmit`
Expected: PASS + 无类型错误。

- [ ] **Step 6: Commit**

```bash
git add researchclaw/web/src/lib/pipeline.ts researchclaw/web/src/lib/pipeline.test.ts
git commit -m "feat(v3-m5b): 管线进度加 experiment 三节点"
```

---

### Task 4: 命令确认

**Files:**
- Modify: `researchclaw/web/src/lib/actions.ts`（local `PHASE_LABEL` 5-12、`PanelAction` advance 变体 23、`deriveActions` run_phase case 42-46）
- Modify: `researchclaw/web/src/components/ActionBar.tsx`（advance action 渲染 91-102）
- Test: `researchclaw/web/src/lib/actions.test.ts`（新建或追加）

**Interfaces:**
- Consumes: Task 1 的 `PendingAction.run_phase += commands?`。
- Produces: `deriveActions` 对带 commands 的 run_phase 保留 commands 到 advance action；不带的返回 undefined。`ActionBar` 在 advance 按钮上方渲染只读命令块（commands 非空时）。

- [ ] **Step 1: 写失败测试**

新建（或追加）`researchclaw/web/src/lib/actions.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { deriveActions } from "./actions";
import type { PendingAction } from "../api/types";

function advanceOf(pending: PendingAction[]) {
  return deriveActions(pending).find((a) => a.kind === "advance");
}

describe("deriveActions — run_phase commands passthrough", () => {
  it("carries commands onto the advance action", () => {
    const pending: PendingAction[] = [
      { type: "run_phase", phase: "experiment_execution", label: "确认并执行实验命令", commands: ["node -e \"1\"", "ls"] }
    ];
    const advance = advanceOf(pending);
    expect(advance?.commands).toEqual(["node -e \"1\"", "ls"]);
  });

  it("leaves commands undefined when the run_phase has none", () => {
    const pending: PendingAction[] = [
      { type: "run_phase", phase: "idea_review", label: "Run idea review" }
    ];
    const advance = advanceOf(pending);
    expect(advance?.commands).toBeUndefined();
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run（在 `researchclaw/web/`）：`npx vitest run src/lib/actions.test.ts`
Expected: FAIL（advance action 无 commands 字段）。

- [ ] **Step 3: 扩 actions.ts**

`researchclaw/web/src/lib/actions.ts`：

local `PHASE_LABEL`（5-12）加三条实验标签（供 advance 按钮文案）：

```ts
  experiment_planning: "实验规划",
  experiment_execution: "实验执行",
  experiment_review: "实验复核",
```

`PanelAction` advance 变体（23）加 commands：

```ts
  | { kind: "advance"; label: string; phase: ResearchPhase; commands?: string[] }
```

`deriveActions` 的 run_phase case（42-45）把 commands 透传到 advance action。既有代码用 cast 读取风格，镜像之——把该 case 改为：

```ts
      case "run_phase": {
        const phase = (p as { phase: ResearchPhase }).phase;
        const commands = (p as { commands?: string[] }).commands;
        actions.push({
          kind: "advance",
          label: `推进：${phaseLabel(phase)}`,
          phase,
          commands: Array.isArray(commands) ? commands : undefined
        });
        break;
      }
```

- [ ] **Step 4: 运行确认通过**

Run（在 `researchclaw/web/`）：`npx vitest run src/lib/actions.test.ts`
Expected: PASS（2 tests）。

- [ ] **Step 5: ActionBar 渲染只读命令块**

`researchclaw/web/src/components/ActionBar.tsx`：在 advance action 渲染处（91-102），当 `action.commands` 非空时，于按钮上方渲染带边框只读命令块。参照既有 recover errors 块（34-40）的结构：

```tsx
{action.kind === "advance" && action.commands && action.commands.length > 0 ? (
  <div className="mb-2 rounded border border-amber-400/30 bg-black/30 p-2 font-mono text-xs text-amber-200">
    {action.commands.map((cmd, i) => (
      <div key={i} className="whitespace-pre-wrap break-all">
        <span className="select-none text-amber-500/70">$ </span>
        {cmd}
      </div>
    ))}
  </div>
) : null}
```

（具体 className 实现时与既有 ActionBar 块风格核对；核心：等宽、逐行、`$` 前缀、只读、带边框，放在 advance 按钮上方。commands 为空/undefined 时不渲染。）

- [ ] **Step 6: tsc 校验**

Run（在 `researchclaw/web/`）：`npx tsc --noEmit`
Expected: 无类型错误。

- [ ] **Step 7: Commit**

```bash
git add researchclaw/web/src/lib/actions.ts researchclaw/web/src/lib/actions.test.ts researchclaw/web/src/components/ActionBar.tsx
git commit -m "feat(v3-m5b): experiment_execution 命令确认（commands 透传+只读命令块）"
```

---

### Task 5: artifact 抽屉渲染

**Files:**
- Create: `researchclaw/web/src/lib/experimentArtifact.ts`（整形 helper）
- Modify: `researchclaw/web/src/components/ArtifactDetailDrawer.tsx`（按 type 渲染，79-84 附近的 content 渲染）
- Test: `researchclaw/web/src/lib/experimentArtifact.test.ts`（新建）

**Interfaces:**
- Consumes: Task 1 的 `ArtifactType += 三类型`。
- Produces: `shapeExperimentArtifact(type, content) → { fields: Array<{ label: string; value: string }>; commands?: string[]; claimSupport?: {...}[]; runRef?: string }`（形状实现时定，测试断言核心字段）。三种 content 形状（含缺字段退化 content）返回预期字段列表。

- [ ] **Step 1: 写失败测试**

新建 `researchclaw/web/src/lib/experimentArtifact.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { shapeExperimentArtifact } from "./experimentArtifact";

describe("shapeExperimentArtifact — experiment_plan", () => {
  it("extracts hypothesis, commands, metrics, criteria", () => {
    const shaped = shapeExperimentArtifact("experiment_plan", {
      hypothesis: "reranking improves recall",
      commands: ["node run.js"],
      metrics: { recall: "top-10" },
      success_criteria: "recall > 0.8",
      failure_criteria: "recall < 0.5"
    });
    expect(shaped.commands).toEqual(["node run.js"]);
    const labels = shaped.fields.map((f) => f.label);
    expect(labels).toContain("hypothesis");
    expect(labels).toContain("success_criteria");
  });
});

describe("shapeExperimentArtifact — experiment_run", () => {
  it("extracts status, per-command exit_code, metrics_observed, failure_reason", () => {
    const shaped = shapeExperimentArtifact("experiment_run", {
      status: "passed",
      commands_executed: [{ command: "node run.js", exit_code: 0 }],
      metrics_observed: { accuracy: 0.9 },
      failure_reason: null,
      produced_files: ["metrics.json"]
    });
    const labels = shaped.fields.map((f) => f.label);
    expect(labels).toContain("status");
    expect(shaped.commands).toEqual(["node run.js"]);
  });
});

describe("shapeExperimentArtifact — experiment_review", () => {
  it("extracts decision, claim_support, run_ref", () => {
    const shaped = shapeExperimentArtifact("experiment_review", {
      decision: "accept_idea",
      run_ref: "artifacts/experiment_execution/run_1.json",
      claim_support: [{ claim_id: "c1", metric_ref: "accuracy", support_type: "supports" }]
    });
    expect(shaped.runRef).toBe("artifacts/experiment_execution/run_1.json");
    expect(shaped.claimSupport?.length).toBe(1);
  });
});

describe("shapeExperimentArtifact — degraded content", () => {
  it("does not throw on missing fields", () => {
    expect(() => shapeExperimentArtifact("experiment_run", {})).not.toThrow();
    const shaped = shapeExperimentArtifact("experiment_run", {});
    expect(Array.isArray(shaped.fields)).toBe(true);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run（在 `researchclaw/web/`）：`npx vitest run src/lib/experimentArtifact.test.ts`
Expected: FAIL（`Cannot find module ./experimentArtifact`）。

- [ ] **Step 3: 实现 helper**

新建 `researchclaw/web/src/lib/experimentArtifact.ts`：

```ts
import type { ArtifactType } from "../api/types";

export interface ExperimentField {
  label: string;
  value: string;
}

export interface ClaimSupportEntry {
  claim_id?: string;
  metric_ref?: string;
  support_type?: string;
}

export interface ShapedExperimentArtifact {
  fields: ExperimentField[];
  commands?: string[];
  claimSupport?: ClaimSupportEntry[];
  runRef?: string;
}

function toValue(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return JSON.stringify(v);
}

function record(content: unknown): Record<string, unknown> {
  return content && typeof content === "object" ? (content as Record<string, unknown>) : {};
}

export function shapeExperimentArtifact(
  type: ArtifactType,
  content: unknown
): ShapedExperimentArtifact {
  const c = record(content);

  if (type === "experiment_plan") {
    const commands = Array.isArray(c.commands) ? (c.commands as string[]) : undefined;
    return {
      commands,
      fields: [
        { label: "hypothesis", value: toValue(c.hypothesis) },
        { label: "metrics", value: toValue(c.metrics) },
        { label: "success_criteria", value: toValue(c.success_criteria) },
        { label: "failure_criteria", value: toValue(c.failure_criteria) }
      ]
    };
  }

  if (type === "experiment_run") {
    const executed = Array.isArray(c.commands_executed)
      ? (c.commands_executed as Array<Record<string, unknown>>)
      : [];
    const commands = executed.map((e) => toValue(e.command));
    return {
      commands,
      fields: [
        { label: "status", value: toValue(c.status) },
        ...executed.map((e, i) => ({
          label: `command[${i}] exit_code`,
          value: `${toValue(e.command)} → ${toValue(e.exit_code)}`
        })),
        { label: "metrics_observed", value: toValue(c.metrics_observed) },
        { label: "failure_reason", value: toValue(c.failure_reason) },
        { label: "produced_files", value: toValue(c.produced_files) }
      ]
    };
  }

  if (type === "experiment_review") {
    const claimSupport = Array.isArray(c.claim_support)
      ? (c.claim_support as ClaimSupportEntry[])
      : undefined;
    return {
      runRef: typeof c.run_ref === "string" ? c.run_ref : undefined,
      claimSupport,
      fields: [
        { label: "decision", value: toValue(c.decision) },
        { label: "next_actions", value: toValue(c.next_actions) }
      ]
    };
  }

  return { fields: [] };
}
```

- [ ] **Step 4: 运行确认通过**

Run（在 `researchclaw/web/`）：`npx vitest run src/lib/experimentArtifact.test.ts`
Expected: PASS（4 tests）。

- [ ] **Step 5: ArtifactDetailDrawer 按 type 渲染**

`researchclaw/web/src/components/ArtifactDetailDrawer.tsx`：在 content 渲染处（79-84 附近，现为 raw JSON `<pre>`），当 `artifact.type` 是三 experiment 类型时，用 `shapeExperimentArtifact` 输出渲染字段列表 + 命令块 + claim_support 列表 + run_ref（用既有 `RefChip` 若可用）。其余类型保留原 `<pre>` 渲染。

```tsx
{isExperimentType(artifact.type) ? (
  <ExperimentArtifactBody type={artifact.type} content={artifact.content} />
) : (
  <pre className="...">{JSON.stringify(artifact.content, null, 2)}</pre>
)}
```

`ExperimentArtifactBody` 为本文件内的薄组件：调 `shapeExperimentArtifact`，用既有 `Meta`（6-13）逐字段渲染，commands 用只读命令块（复用 Task 4 风格），claimSupport 逐条渲染 claim_id/metric_ref/support_type，runRef 用 `RefChip`（若 drawer 已 import；否则纯文本）。未知/缺字段安全兜底（helper 已保证不崩）。

- [ ] **Step 6: tsc 校验**

Run（在 `researchclaw/web/`）：`npx tsc --noEmit`
Expected: 无类型错误。

- [ ] **Step 7: Commit**

```bash
git add researchclaw/web/src/lib/experimentArtifact.ts researchclaw/web/src/lib/experimentArtifact.test.ts researchclaw/web/src/components/ArtifactDetailDrawer.tsx
git commit -m "feat(v3-m5b): 抽屉渲染 experiment 三 artifact（lib 整形 helper）"
```

---

### Task 6: 收尾浏览器实测

**Files:** 无代码改动（除非实测暴露 bug）。

- [ ] **Step 1: 全量前端测试 + tsc**

Run（在 `researchclaw/web/`）：`npm run test && npx tsc --noEmit`
Expected: 全绿。

- [ ] **Step 2: 启 dev server**

Run（在 `researchclaw/web/`）：`npm run dev`（后端 mock 管线按项目既有方式启动）。

- [ ] **Step 3: mock 管线推到 summary，肉眼确认**

用 mock 管线把项目从 idea_review 一路推进，逐项确认：
- experiment_execution 前 ActionBar 显示只读命令块（$ 前缀、逐行、按钮在下方）。
- runner badge（琥珀色「执行器」）出现在 runner 窗口/experiment_run artifact。
- 三 experiment artifact 抽屉内容正确（plan/run/review 字段、逐命令 exit_code、claim_support、run_ref 可跳转）。
- PipelineProgress 显示三个 experiment 节点，顺序正确。
- 进度百分比随三阶段推进正确递增，不错算。

- [ ] **Step 4: 里程碑收尾**

用 superpowers:finishing-a-development-branch：验证测试 → 呈现 merge/PR/keep/discard 四选项。

---

## Self-Review

**1. Spec coverage（对照 `2026-07-12-m5b-frontend-cli-window-design.md`）：**
- 单元 1 类型与标签地基 → Task 1 ✓（额外补 ArtifactType +3、ProjectCurrent +3，survey 遗漏的 gap，抽屉/派生依赖）。
- 单元 2 runner badge → Task 2 ✓。
- 单元 3 管线节点 → Task 3 ✓。
- 单元 4 命令确认 → Task 4 ✓。
- 单元 5 artifact 抽屉渲染 → Task 5 ✓。
- 测试策略（vitest co-located，无 JSX 框架，收尾浏览器实测）→ 各 Task 的 test step + Task 6 ✓。

**2. Placeholder 扫描：** 无 TBD/TODO。Step 3/5 中带「实现时对齐既有形状」的括注是针对既有代码形状的对齐指引（PipelineNode 字段、RefChip 是否 import），非占位——核心代码与断言均已给出。

**3. 类型一致性：**
- state.current 键：`experiment_plan_artifact_ref` / `experiment_run_artifact_ref` / `experiment_review_artifact_ref`——与后端 orchestrator（task-6-brief）一致 ✓。
- `ArtifactType` 值 `experiment_plan/experiment_run/experiment_review`——与后端 `artifactTypes` Set 一致 ✓。
- `adapterBadgeMeta("runner")` tone `"runner"` ↔ `TONE_CLASS.runner` ↔ `AdapterTone += "runner"` 三处一致 ✓。
- `deriveActions` advance action `commands?` ↔ `PanelAction` advance 变体 ↔ `ActionBar` 读 `action.commands` 一致 ✓。
- `shapeExperimentArtifact(type, content)` 签名 ↔ 测试调用 ↔ 抽屉调用一致 ✓。

**边界确认：** 无后端改动；EvidenceMapTab 深度证据化（M6）、可编辑命令、metrics 对比表均不在本计划。
