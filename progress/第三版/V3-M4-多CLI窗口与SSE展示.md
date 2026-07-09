# ResearchClaw V3-M4 多 CLI 窗口与 SSE 展示

> 阶段：V3-M4
> 状态：**未完成（2026-07-09 代码核查）**
> 目标：让前端能区分 Claude Code、Gemini CLI、Codex CLI 的执行窗口、过程流、artifact 来源与成本来源
> 前置：V3-M3 CliRouter 与三套 CLI Adapter 完成

---

## 0. 一句话目标

```text
右栏不再只是 Claude 过程流，而是能按 provider/CLI/windowId 展示多套 CLI 的 workflow 执行流，并在 phase 卡片、artifact 列表、指标栏中清楚标注来源。
```

V3-M4 主要解决可视化与实时流，不改变科研状态机主逻辑。

2026-07-09 代码核查后的真实现状：

- `web/src/api/types.ts` 中 `CliChunk` 尚未包含 `provider/cli/model/windowId`。
- `engine/events.js` 的 replay/buffer 仍未按 `windowId` 建模。
- `web/src/components/RightColumn.tsx` 已有 Claude consult UI，但 Gemini/Codex 仍应视为未接入/disabled。
- 由于 V3-M3 的 Gemini/Codex adapter 和 policy router 尚未完成，M4 的多 CLI 执行窗口还不能算完成。
- M4 文档内容仍是目标设计，不是当前已验收状态。

---

## 1. 范围

### 1.1 必须做

- 扩展 `cli_chunk` 数据契约，增加 provider/cli/model/windowId/kind。
- EventBus 缓冲按 project + windowId 保留最近事件。
- 前端 SSE 按 workflow/consult、provider/CLI、windowId 分流。
- 右栏展示 Claude/Gemini/Codex 执行 lane 或窗口。
- phase 卡片显示实际 provider/cli/model。
- artifact 列表显示来源 provider/CLI。
- MetricsRow 展示 provider/CLI 维度调用与成本。

### 1.2 明确不做

- 不改变 phase policy 保存逻辑。
- 不新增实验 phase。
- 不把 consult 内容纳入 gated evidence。
- 不做嵌入式交互终端。
- 不让用户直接在浏览器里执行任意 shell。

---

## 2. SSE 数据契约

`cli_chunk` 建议形状：

```ts
interface CliChunk {
  kind: 'workflow' | 'consult';
  phase?: ResearchPhase | 'consult';
  provider: 'claude' | 'gemini' | 'codex' | 'mock';
  cli: 'claude-code' | 'gemini-cli' | 'codex-cli' | 'mock';
  model?: string;
  windowId: string;
  role?: string;
  text?: string;
  degraded?: boolean;
  ts: string;
}
```

规则：

- workflow chunk 与 consult chunk 必须可分流。
- windowId 在一次 adapter run 内稳定。
- raw_log summary 记录同一个 windowId。
- mock fallback chunk 必须带 `degraded:true` 或明确 source。

---

## 3. 后端任务

- Adapter run 开始时生成 `windowId`。
- 所有 `cli_chunk` 带 provider/cli/model/windowId。
- EventBus replay buffer 支持按 windowId 分组或保留足够 metadata。
- raw_log artifact content 增加 provider/cli/model/windowId。
- `state.usage.by_phase` 或新增 bucket 能按 provider/cli/model 展示。
- 确保旧前端对新增字段向后兼容。

---

## 4. 前端任务

### 4.1 右栏多 CLI 展示

右栏建议结构：

```text
CLI 执行窗口
  Claude Code   available/configured/running
  Gemini CLI    available/configured/running
  Codex CLI     available/configured/running

过程流
  [windowId: contract_draft / claude-code]
  [windowId: literature / gemini-cli]
  [windowId: checklist / codex-cli]

Consult
  Claude consult 保持原语义
```

### 4.2 Phase 与 artifact 来源

- `CurrentPhaseCard` 显示当前 phase 实际 provider/cli/model。
- `PipelineProgress` 或 phase tooltip 显示每个已完成 phase 的来源。
- `ArtifactDetailDrawer` 显示 provider/cli/model/windowId/raw_log_ref。
- `ArtifactList` 按 source 展示徽章。

### 4.3 指标栏

- CLI 调用次数按 provider/CLI 拆分。
- 成本 tooltip 显示 provider/CLI/model/phase。
- over budget 时清楚说明暂停的是哪个 channel 或全局 CLI 调用。

---

## 5. Consult 保持红线

M4 可以让 UI 看起来支持多 CLI，但 consult 的语义不能变：

- Claude consult 已有，可以继续显示。
- Gemini/Codex consult 若未实现，按钮显示 unavailable/disabled。
- consult 不推进 phase。
- consult_note 不进入 claim evidence。
- consult 不 fallback mock。

---

## 6. 关键文件

| 文件 | 改造方向 |
| --- | --- |
| `researchclaw/engine/events.js` | cli_chunk buffer 增加 window metadata |
| `researchclaw/adapters/*` | emit cli_chunk 时带 provider/cli/model/windowId |
| `researchclaw/evidence/types.js` | source metadata 扩展 |
| `researchclaw/web/src/api/types.ts` | 扩展 CliChunk、Artifact producer/source 类型 |
| `researchclaw/web/src/api/useProjectStream.ts` | 按 kind/provider/windowId 分流 |
| `researchclaw/web/src/lib/cliStream.ts` | 多窗口 reduce 逻辑 |
| `researchclaw/web/src/components/RightColumn.tsx` | 多 CLI lane / window 展示 |
| `researchclaw/web/src/components/CurrentPhaseCard.tsx` | phase 来源展示 |
| `researchclaw/web/src/components/MetricsRow.tsx` | provider/CLI 成本展示 |

---

## 7. 测试要求

- `cli_chunk` 含 provider/cli/model/windowId。
- 同一 run 的 windowId 稳定。
- SSE reconnect 后能回放最近 chunk。
- 前端 workflow chunk 与 consult chunk 分流正确。
- Claude/Gemini/Codex 徽章显示正确。
- degraded mock 显示为降级，不显示成真实 CLI。
- artifact detail 显示 source metadata。
- consult_note 仍不进入结构化 artifact 列表。

---

## 8. 验收标准

- 用户能在前端区分三套 CLI 的执行来源。
- workflow phase 卡片能显示实际 provider/cli/model。
- artifact 能追溯到 provider/cli/model/windowId/raw_log。
- 成本/调用统计能按 provider/CLI 解释。
- 右栏不会把 mock、consult、workflow artifact 混淆。

---

## 9. 红线

1. 多窗口只是展示层，不是第二状态源。
2. raw_log 仍只是过程透明度，不是结论。
3. mock 必须明确标注。
4. consult 和 workflow chunk 必须分流。
5. 不为 UI 展示修改 artifact/gate 的语义。
