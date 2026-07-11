# V3-M4 多 CLI 窗口与 SSE 展示 —— 实现设计

> 日期：2026-07-11
> 状态：设计已批准，待实现
> 前置：V3-M3（CliRouter + 三套真实 CLI adapter）三绿完成
> 关系：本文是对 `progress/第三版/V3-M4-多CLI窗口与SSE展示.md`（2026-07-09 目标设计，写于 M3 落地前）的**实现级订正**，以当前真实代码状态为准。

---

## 0. 目标

右栏过程流不再只是「Claude 一条扁平流」，而是能**按来源区分** Claude Code / Gemini CLI / Codex CLI 的执行窗口、过程流、artifact 来源与成本来源。M4 只做展示层与实时流，**不改科研状态机主逻辑**。

## 1. 代码现状 vs 目标（2026-07-11 核查）

| 目标 | 现状 | 差距 |
| --- | --- | --- |
| cli_chunk 带 provider/cli/model/windowId/kind | gemini/codex 已带 provider/cli/model；**claude 一个都没带**；**无一带 windowId**；router 降级 chunk 也没带 | 补 windowId（全体）+ claude 对齐 + 降级 chunk 带 source |
| EventBus 按 windowId 建模 | 扁平 ring buffer，已能 replay | 只需 chunk 带 windowId，buffer 结构不改 |
| 前端 CliChunk 类型扩展 | 只有 phase/role/text/ts/kind/degraded | 加 provider/cli/model/windowId |
| 右栏多 CLI 展示 | Claude 按钮 + Gemini/Codex 灰掉；LiveChunks 一条扁平流 | 换成 windowId 分组 |
| phase 卡显示实际 provider/cli/model | 只显示 producer.adapter 字符串 | 带 cli/model |
| artifact 来源徽章 | AdapterBadge 只认 claude/mock/manual | 加 gemini/codex |
| Metrics 按 provider 拆 | CostTracker 只有 by_phase | 加 by_provider |

**顺带修一个真 bug**：`researchclaw/engine/orchestrator.js:109` 的 `landCliRawLog` 把 raw_log 的 `adapter` **硬编码成 `"claude"`**，导致 gemini/codex/mock 跑出来的过程流徽章全显示 "Claude" —— 来源标注错误，M4 必须修。

## 2. 已批准的两个关键决策

1. **右栏按 run 分组**（不是三条常驻 lane）。状态机串行，任一时刻只一个 phase 在跑，三条常驻 lane 是过度设计。每次 CLI run = 一个可折叠分组，组头标 `phase · CLI · model + [真实]/[降级 mock]`。
2. **成本加 by_provider 桶**。MetricsRow 能真实按 Claude/Gemini/Codex 拆成本与调用次数。

## 3. 数据契约

后端 emit 的 `cli_chunk` 统一形状：

```ts
interface CliChunk {
  kind: 'workflow' | 'consult';
  phase?: string;
  provider: 'claude' | 'gemini' | 'codex' | 'mock';
  cli: 'claude-code' | 'gemini-cli' | 'codex-cli' | 'mock';
  model?: string;
  windowId: string;
  role: string;
  text?: string;
  tool?: string;
  degraded?: boolean;
  ts: string;
}
```

规则：
- **windowId 生成点**：`cliRouter.run()` 是所有 workflow run 的唯一入口，由它铸造 `windowId`（`win_<phase>_<rand>`），注入 `request.window_id` 再传给 adapter。
- **降级复用同一 windowId**：失败尝试与 mock 兜底在同一窗口，来源诚实（用户能看到「这个窗口本该是 codex，降级成了 mock」）。
- adapter 各自知道自己的 provider/cli/model（已是常量），emit 时带上 + `request.window_id` + `kind`。
- workflow chunk 与 consult chunk 靠 `kind` 分流（现有 `isConsultChunk` 逻辑保留）。
- 向后兼容：新增字段全部可选于旧前端；旧 chunk（无 windowId）仍能渲染进一个「未分组」窗口。

## 4. 后端改动

| 文件 | 改动 |
| --- | --- |
| `adapters/cliRouter.js` | `run()` 铸 `windowId` 注入 request；`sourceOf` 已有；`emitDegraded` 补 provider/cli/model/windowId；`costTracker.record` 传 provider |
| `adapters/claudeCode.js` | `handleEventChunks` 的 chunk 补 `provider:'claude', cli:'claude-code', model, windowId, kind`；consult 分支 `kind:'consult'` |
| `adapters/geminiCli.js` | consume 的 chunk 补 `windowId, kind:'workflow'` |
| `adapters/codexCli.js` | 同 gemini |
| `engine/orchestrator.js` | `landCliRawLog` 收 source 参数：修 `adapter:"claude"` 硬编码 → 真实 provider；raw_log content 记 provider/cli/model/windowId |
| `evidence/types.js` | `createArtifact` 的 `producer` 从 `{workflow,adapter}` 扩到 `{workflow,adapter,cli,model}`（cli/model 可选） |
| `workflows/contractDraft.js`（及其余 workflow） | 把 `result.source` 的 cli/model 透传进 `createArtifact` 的 producer |
| `engine/cost.js` | 加 `by_provider` 桶；`record(provider)` 累加；`snapshot` 输出 `by_provider` |

windowId 传导路径：`cliRouter.run(request)` → `request.window_id = win_...` → `adapter.run({...request})` → adapter.emitChunk 读 `request.window_id`。raw_log 与结构化 artifact 的 source 从 `result.source`（router 已返回）取。

## 5. 前端改动

| 文件 | 改动 |
| --- | --- |
| `web/src/api/types.ts` | `CliChunk` 加 provider/cli/model/windowId + `kind:'workflow'`；`Artifact.producer` 加 cli?/model?；`UsageSummary` 加 `by_provider?` |
| `web/src/lib/cliStream.ts` | 新增纯函数 `groupCliWindows(chunks)` → 按 windowId 归并为有序窗口 `[{windowId,provider,cli,model,phase,degraded,chunks[]}]`（保持出现顺序） |
| `web/src/lib/processFeed.ts` | `adapterBadgeMeta` 加 gemini/codex 的 label + tone |
| `web/src/components/AdapterBadge.tsx` | `TONE_CLASS` 加 gemini/codex |
| `web/src/components/RightColumn.tsx` | 扁平 `LiveChunks` → windowId 分组的可折叠组，组头 `phase · CLI · model + [真实]/[降级 mock]`；consult 原样 |
| `web/src/components/CurrentPhaseCard.tsx` | 来源徽章带 cli/model |
| `web/src/components/ArtifactDetailDrawer.tsx` | 显示 provider/cli/model/windowId/raw_log_ref |
| `web/src/components/MetricsRow.tsx` | 渲染 by_provider 拆分（成本 + 调用次数） |
| `web/src/api/useProjectStream.ts` | 现有 consult/workflow 分流保留；workflow chunk 现带 windowId，无需改分流逻辑 |

## 6. 测试

后端（`node --test`）：
- cli_chunk 带全字段（provider/cli/model/windowId/kind）。
- 同一 run 内 windowId 稳定。
- 降级 chunk 带 source（provider/cli/model/windowId + degraded:true）。
- `landCliRawLog` 来源不再恒为 claude（gemini/codex/mock 各自正确）。
- `CostTracker.by_provider` 累加正确；snapshot 输出正确。

前端（`*.test.ts`）：
- `groupCliWindows` 按 windowId 分组、保持顺序、degraded 归到对应窗口。
- 降级窗口显示为「降级 mock」不冒充真实。
- 三套（claude/gemini/codex）徽章 label+tone 正确。

## 7. 红线（不碰）

1. 多窗口只是展示层，不是第二状态源；`snapshot` 仍是唯一真相。
2. raw_log 仍只是过程透明度，不是结论（两通道红线 §2.1）。
3. consult 保持 Claude-only；Gemini/Codex consult 按钮维持 disabled，不 fallback mock。
4. mock 降级必须明确标注，绝不冒充真实 CLI。
5. 不改 phase/gate/evidence 语义；不新增实验 phase（那是 M5）。
6. key 只走子进程 env，绝不进 argv/raw_log/SSE/artifact（继承 M3 红线）。

## 8. 范围边界

- 正常串行流里只有 contract_draft 被端到端验过；source 管道做成**通用**的（所有 phase workflow 受益），但 M4 只保证展示层正确，不趟 M5 的实验 phase。
- 不做嵌入式交互终端、不让浏览器执行任意 shell（spec §1.2）。
