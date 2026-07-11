# V3-M4 多 CLI 窗口与 SSE 展示 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让前端能按 windowId 分组区分 Claude/Gemini/Codex 三套 CLI 的执行来源、过程流、artifact 来源与成本来源，并修正 raw_log 来源恒为 "claude" 的 bug。

**Architecture:** 纯展示层增强。`cliRouter.run()` 铸造 `windowId` 并注入 `request.window_id`，三套 adapter 与 router 降级路径都把 `provider/cli/model/windowId/kind` 打进每条 `cli_chunk`；`CostTracker` 增加 `by_provider` 桶；`createArtifact` 的 `producer` 扩展 `cli/model/windowId`。前端新增纯函数 `groupCliWindows` 把 chunk 按 windowId 归并成有序窗口，右栏渲染可折叠分组，指标栏/详情抽屉/阶段卡展示来源。

**Tech Stack:** 后端 Node ESM + `node --test` + `node:assert/strict`；前端 React 18 + TypeScript + Vitest（`*.test.ts`）+ Tailwind。

## Global Constraints

- 多窗口只是展示层，**不是第二状态源**；`snapshot` 事件仍是唯一真相。
- mock 降级必须显式 `degraded:true` 标注，**绝不冒充真实 CLI**。
- consult 保持 **Claude-only**；Gemini/Codex consult 按钮维持 disabled，consult **不 fallback mock**。
- 不改 phase/gate/evidence 语义；不新增实验 phase（M5 的事）。
- key 只走子进程 env，**绝不进** argv/raw_log/SSE/artifact（继承 M3 红线）。
- 新增字段一律**可选**，旧前端/旧 chunk（无 windowId）必须仍能渲染。
- 后端测试：`npm test`（根目录，`node --test researchclaw/tests/*.test.js`）。
- 前端测试：在 `researchclaw/web/` 下 `npm run test`（vitest run）、`npm run typecheck`。
- 统一形状 `cli_chunk`（后端 emit）：`{ kind, phase, provider, cli, model, windowId, role, text?, tool?, degraded?, ts }`。consult chunk 只带 `{ kind:"consult", role, text?/tool?, ts }`（无 windowId）。
- `windowId` 格式：`win_<phase>_<8位hex>`，由 `cliRouter.run()` 生成，一次 run 内稳定。

---

### Task 1: cliRouter 铸造 windowId + 降级 chunk 带来源

**Files:**
- Modify: `researchclaw/adapters/cliRouter.js`
- Test: `researchclaw/tests/cliRouter.test.js`

**Interfaces:**
- Consumes: `resolvePolicy(phase) → { provider, cli, model }`；`adapters[provider].run(request)`；`costTracker.record/recordFailure`。
- Produces:
  - `sourceOf(policy, adapterName, windowId) → { provider, cli, model, adapter, windowId }`
  - `run(request)` 现会在调用 adapter 前设 `request.window_id`，返回值 `result.source` 含 `windowId`。
  - 降级时 emit 的 `cli_chunk.data` 含 `{ kind:"workflow", phase, provider, cli, model, windowId, role:"系统", degraded:true, text, ts }`。
  - 成功时 `costTracker.record(projectId, { ...usage, phase, provider })`；失败时 `costTracker.recordFailure(projectId, phase, provider)`。

- [ ] **Step 1: 加断言到已有测试（写失败测试）**

在 `researchclaw/tests/cliRouter.test.js` 末尾（`createCliRouter requires a mock adapter` 之前）插入：

```js
// --- M4: windowId + 降级 chunk 来源 ---

test("run stamps a stable window_id on the request and returns it in source", async () => {
  const adapters = baseAdapters();
  const result = await makeRouter({ adapters }).run(req("contract_draft"));
  const passed = adapters.claude.calls[0];
  assert.match(passed.window_id, /^win_contract_draft_[0-9a-f]{8}$/);
  assert.equal(result.source.windowId, passed.window_id);
});

test("degraded cli_chunk carries provider/cli/model/windowId, not just a banner", async () => {
  const adapters = baseAdapters();
  adapters.gemini.available = false;
  const eventBus = new EventBus();
  const events = [];
  eventBus.subscribe("proj_a", (e) => events.push(e));
  const result = await makeRouter({ adapters, eventBus }).run(req("literature_scouting"));
  const chunk = events.find((e) => e.type === "cli_chunk")?.data;
  assert.equal(chunk.degraded, true);
  assert.equal(chunk.kind, "workflow");
  assert.equal(chunk.provider, "gemini");
  assert.equal(chunk.cli, "gemini-cli");
  assert.equal(chunk.windowId, result.source.windowId);
});

test("successful run records usage under the provider bucket", async () => {
  const adapters = baseAdapters();
  const costTracker = new CostTracker();
  await makeRouter({ adapters, costTracker }).run(req("contract_draft"));
  const snap = costTracker.snapshot("proj_a");
  assert.equal(snap.by_provider.claude.cli_calls, 1);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test`
Expected: FAIL —— 上述三个新 test 报 `window_id` undefined / `chunk.provider` undefined / `snap.by_provider` undefined。（`by_provider` 在 Task 4 补全 CostTracker，本步只需前两个失败即证明；第三个会在 Task 4 后转绿，此处允许其暂红。）

- [ ] **Step 3: 改 cliRouter.js**

把 `researchclaw/adapters/cliRouter.js` 中 `sourceOf` / `emitDegraded` / `degrade` / `run` 段整体替换为：

```js
  function makeWindowId(phase) {
    return `win_${phase || "phase"}_${Math.random().toString(16).slice(2, 10).padEnd(8, "0")}`;
  }

  function sourceOf(policy, adapterName, windowId) {
    return {
      provider: policy?.provider ?? null,
      cli: policy?.cli ?? null,
      model: policy?.model ?? null,
      adapter: adapterName,
      windowId
    };
  }

  function emitDegraded(request, policy, windowId, reason) {
    eventBus?.emit(request.project_id, {
      type: "cli_chunk",
      data: {
        kind: "workflow",
        phase: request.phase,
        provider: policy?.provider ?? null,
        cli: policy?.cli ?? null,
        model: policy?.model ?? null,
        windowId,
        role: "系统",
        degraded: true,
        text: `${reason}，已降级 mock`,
        ts: new Date().toISOString()
      }
    });
  }

  async function degrade(request, policy, windowId, reason) {
    emitDegraded(request, policy, windowId, reason);
    const result = await mock.run(request);
    return { ...result, degraded: true, source: sourceOf(policy, "mock", windowId) };
  }

  return {
    name: "cli-router",

    async run(request) {
      const policy = resolvePolicy(request.phase) || { provider: fallbackProvider, cli: "mock", model: null };
      const provider = policy.provider;
      const windowId = makeWindowId(request.phase);
      const runReq = { ...request, window_id: windowId };

      if (provider === "mock") {
        const result = await mock.run(runReq);
        return { ...result, source: sourceOf(policy, "mock", windowId) };
      }

      const adapter = adapters[provider];
      if (!adapter || adapter.available === false || typeof adapter.run !== "function") {
        return degrade(runReq, policy, windowId, `${provider} CLI 不可用`);
      }
      if (costTracker?.overBudget(request.project_id)) {
        return degrade(runReq, policy, windowId, "超出会话预算");
      }

      let result;
      try {
        result = await adapter.run({ ...runReq, model: policy.model });
      } catch (err) {
        costTracker?.recordFailure(request.project_id, request.phase, provider);
        return degrade(runReq, policy, windowId, `${provider} 运行异常（${err?.message || err}）`);
      }
      if (!result.ok) {
        costTracker?.recordFailure(request.project_id, request.phase, provider);
        return degrade(runReq, policy, windowId, result.error?.code || `${provider} 运行失败`);
      }
      if (result.usage) {
        costTracker?.record(request.project_id, { ...result.usage, phase: request.phase, provider });
      }
      return { ...result, source: sourceOf(policy, provider, windowId) };
    },
```

（`consult` 方法保持原样，不动。注意删除旧的 `sourceOf/emitDegraded/degrade` 定义，避免重复声明。）

- [ ] **Step 4: 跑测试**

Run: `npm test`
Expected: Task 1 的前两个 test PASS；`by_provider` 那个仍 FAIL（Task 4 补）。其余原有 cliRouter 测试全绿。

- [ ] **Step 5: Commit**

```bash
git add researchclaw/adapters/cliRouter.js researchclaw/tests/cliRouter.test.js
git commit -m "feat(v3-m4): cliRouter 铸造 windowId，降级 chunk 带 provider/cli/model 来源"
```

---

### Task 2: CostTracker 增加 by_provider 桶

**Files:**
- Modify: `researchclaw/engine/cost.js`
- Test: `researchclaw/tests/cost.test.js`

**Interfaces:**
- Consumes: `record(projectId, { ..., phase, provider })`、`recordFailure(projectId, phase, provider)`。
- Produces: `snapshot(projectId).by_provider` = `Record<provider, { input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens, cli_calls, cli_failures }>`。未知 project 的 snapshot 含 `by_provider: {}`。

- [ ] **Step 1: 写失败测试**

在 `researchclaw/tests/cost.test.js` 末尾追加：

```js
// --- M4: by_provider 桶 ---

test("record buckets usage by provider when provider is given", () => {
  const tracker = new CostTracker();
  tracker.record("proj_p", { input_tokens: 100, output_tokens: 50, phase: "contract_draft", provider: "claude" });
  tracker.record("proj_p", { input_tokens: 10, output_tokens: 5, phase: "literature_scouting", provider: "gemini" });
  const snap = tracker.snapshot("proj_p");
  assert.equal(snap.by_provider.claude.input_tokens, 100);
  assert.equal(snap.by_provider.claude.cli_calls, 1);
  assert.equal(snap.by_provider.gemini.output_tokens, 5);
});

test("recordFailure buckets a failure under its provider", () => {
  const tracker = new CostTracker();
  tracker.recordFailure("proj_p", "literature_scouting", "gemini");
  const snap = tracker.snapshot("proj_p");
  assert.equal(snap.by_provider.gemini.cli_failures, 1);
});

test("record without a provider does not create a by_provider bucket", () => {
  const tracker = new CostTracker();
  tracker.record("proj_p", { input_tokens: 1, output_tokens: 1, phase: "contract_draft" });
  const snap = tracker.snapshot("proj_p");
  assert.deepEqual(snap.by_provider, {});
});

test("unknown project snapshot has an empty by_provider", () => {
  const tracker = new CostTracker();
  assert.deepEqual(tracker.snapshot("nope").by_provider, {});
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test`
Expected: FAIL —— `snap.by_provider` undefined。

- [ ] **Step 3: 改 cost.js**

在 `_project` 里给 entry 增加 `by_provider: {}`：

```js
  _project(projectId) {
    let entry = this.byProject.get(projectId);
    if (!entry) {
      entry = { ...emptyBucket(), by_phase: {}, by_provider: {} };
      this.byProject.set(projectId, entry);
    }
    return entry;
  }
```

在 `_phase` 下方新增 `_provider`：

```js
  _provider(entry, provider) {
    if (!provider) return null;
    if (!entry.by_provider[provider]) {
      entry.by_provider[provider] = emptyBucket();
    }
    return entry.by_provider[provider];
  }
```

`record` 增加 `provider` 参数并 apply 到 provider 桶：

```js
  record(projectId, {
    input_tokens = 0,
    output_tokens = 0,
    cache_creation_input_tokens = 0,
    cache_read_input_tokens = 0,
    phase,
    provider
  } = {}) {
    const entry = this._project(projectId);
    const apply = (b) => {
      if (!b) return;
      b.input_tokens += input_tokens;
      b.output_tokens += output_tokens;
      b.cache_creation_tokens += cache_creation_input_tokens;
      b.cache_read_tokens += cache_read_input_tokens;
      b.cli_calls += 1;
    };
    apply(entry);
    apply(this._phase(entry, phase));
    apply(this._provider(entry, provider));
  }
```

`recordFailure` 增加 `provider`：

```js
  recordFailure(projectId, phase, provider) {
    const entry = this._project(projectId);
    entry.cli_failures += 1;
    this._phase(entry, phase).cli_failures += 1;
    const pb = this._provider(entry, provider);
    if (pb) pb.cli_failures += 1;
  }
```

`snapshot` 两个返回分支都加 `by_provider`：未知 project 分支加 `by_provider: {}`；已知分支加 `by_provider: JSON.parse(JSON.stringify(entry.by_provider))`。

- [ ] **Step 4: 跑测试**

Run: `npm test`
Expected: PASS —— 本 Task 4 个 test + Task 1 遗留的 `by_provider.claude.cli_calls` test 全绿。

- [ ] **Step 5: Commit**

```bash
git add researchclaw/engine/cost.js researchclaw/tests/cost.test.js
git commit -m "feat(v3-m4): CostTracker 增加 by_provider 桶"
```

---

### Task 3: Claude adapter 的 cli_chunk 补全来源字段

**Files:**
- Modify: `researchclaw/adapters/claudeCode.js:161-178`（`handleEventChunks`）
- Test: `researchclaw/tests/claudeCode.test.js`

**Interfaces:**
- Consumes: `request.window_id`（Task 1 注入）、`this.config.model`。
- Produces: workflow 模式 emit 的 chunk = `{ kind:"workflow", phase, provider:"claude", cli:"claude-code", model, windowId, role, text?/tool?, ts }`；consult 模式不变（`{ kind:"consult", role, text?/tool?, ts }`）。

- [ ] **Step 1: 写失败测试**

先看 `researchclaw/tests/claudeCode.test.js` 现有构造 adapter + 注入 fake spawn 的方式，仿照它在文件末尾加：

```js
test("workflow cli_chunk carries kind/provider/cli/model/windowId", async () => {
  const emitted = [];
  const eventBus = { emit: (_pid, e) => emitted.push(e) };
  const adapter = new ClaudeCodeAdapter({ eventBus, config: { model: "claude-haiku-4-5" } });
  const event = {
    type: "assistant",
    message: { content: [{ type: "text", text: "drafting" }] }
  };
  adapter.handleEventChunks(event, { project_id: "p", phase: "contract_draft", window_id: "win_x" }, "workflow");
  const data = emitted[0].data;
  assert.equal(data.kind, "workflow");
  assert.equal(data.provider, "claude");
  assert.equal(data.cli, "claude-code");
  assert.equal(data.model, "claude-haiku-4-5");
  assert.equal(data.windowId, "win_x");
  assert.equal(data.text, "drafting");
});

test("consult cli_chunk stays kind:consult with no windowId", async () => {
  const emitted = [];
  const eventBus = { emit: (_pid, e) => emitted.push(e) };
  const adapter = new ClaudeCodeAdapter({ eventBus, config: { model: "claude-haiku-4-5" } });
  const event = { type: "assistant", message: { content: [{ type: "text", text: "hi" }] } };
  adapter.handleEventChunks(event, { project_id: "p", phase: "contract_draft", window_id: "win_x" }, "consult");
  const data = emitted[0].data;
  assert.equal(data.kind, "consult");
  assert.equal(data.windowId, undefined);
});
```

（若 `claudeCode.test.js` 顶部未 import `ClaudeCodeAdapter`/`assert`，按文件现有 import 补上。）

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test`
Expected: FAIL —— workflow chunk 无 `kind/provider/cli/model/windowId`。

- [ ] **Step 3: 改 handleEventChunks**

把 workflow 分支的两处 `emitChunk` payload 换成带全字段。将循环体替换为：

```js
    for (const block of event.message.content) {
      if (block.type === "text" && block.text) {
        this.emitChunk(
          request,
          consult
            ? { kind: "consult", role, text: block.text, ts }
            : {
                kind: "workflow",
                phase: request.phase,
                provider: "claude",
                cli: "claude-code",
                model: this.config.model,
                windowId: request.window_id,
                role,
                text: block.text,
                ts
              }
        );
        texts.push(block.text);
      } else if (block.type === "tool_use") {
        this.emitChunk(
          request,
          consult
            ? { kind: "consult", role, tool: block.name, ts }
            : {
                kind: "workflow",
                phase: request.phase,
                provider: "claude",
                cli: "claude-code",
                model: this.config.model,
                windowId: request.window_id,
                role,
                tool: block.name,
                ts
              }
        );
      }
    }
```

- [ ] **Step 4: 跑测试**

Run: `npm test`
Expected: PASS（本 Task 两个 test + 原有 claudeCode 测试全绿）。

- [ ] **Step 5: Commit**

```bash
git add researchclaw/adapters/claudeCode.js researchclaw/tests/claudeCode.test.js
git commit -m "feat(v3-m4): claude workflow cli_chunk 补 kind/provider/cli/model/windowId"
```

---

### Task 4: Gemini + Codex adapter 的 cli_chunk 补 windowId/kind

**Files:**
- Modify: `researchclaw/adapters/geminiCli.js:124-132`、`researchclaw/adapters/codexCli.js:128-136`
- Test: `researchclaw/tests/geminiCli.test.js`、`researchclaw/tests/codexCli.test.js`

**Interfaces:**
- Consumes: `request.window_id`。
- Produces: consume 中 emit 的 chunk 追加 `kind:"workflow"` 与 `windowId: request.window_id`（已有 provider/cli/model/phase/role/text/ts）。

- [ ] **Step 1: 写失败测试**

在 `researchclaw/tests/geminiCli.test.js` 里，找现有「emit cli_chunk」类测试或仿其构造，加：

```js
test("gemini cli_chunk carries kind:workflow and windowId", async () => {
  const emitted = [];
  const eventBus = { emit: (_pid, e) => emitted.push(e) };
  const adapter = new GeminiCliAdapter({ eventBus, config: { model: "gemini-3.1-flash-lite" } });
  const child = { stdout: { on: (_e, cb) => cb(Buffer.from("hello")) }, stderr: { on() {} }, on() {} };
  adapter.consume(child, { project_id: "p", phase: "literature_scouting", window_id: "win_y" });
  const data = emitted[0].data;
  assert.equal(data.kind, "workflow");
  assert.equal(data.windowId, "win_y");
  assert.equal(data.provider, "gemini");
});
```

在 `researchclaw/tests/codexCli.test.js` 加对应：

```js
test("codex cli_chunk carries kind:workflow and windowId", async () => {
  const emitted = [];
  const eventBus = { emit: (_pid, e) => emitted.push(e) };
  const adapter = new CodexCliAdapter({ eventBus, config: { model: "gpt-5.4-mini" } });
  const child = { stdout: { on: (_e, cb) => cb(Buffer.from("hello")) }, stderr: { on() {} }, on() {} };
  adapter.consume(child, { project_id: "p", phase: "baseline_reproduction_checklist", window_id: "win_z" });
  const data = emitted[0].data;
  assert.equal(data.kind, "workflow");
  assert.equal(data.windowId, "win_z");
  assert.equal(data.provider, "codex");
});
```

（`consume` 返回一个 Promise，但同步 emit 已发生，本测试只查 emit，不必 await；若 lint 要求可 `void adapter.consume(...)`。按各测试文件已有 import 风格补 import。）

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test`
Expected: FAIL —— chunk 无 `kind`/`windowId`。

- [ ] **Step 3: 改两个 adapter 的 consume emit**

`geminiCli.js` 的 `child.stdout.on("data", ...)` 里 emitChunk 改为：

```js
        this.emitChunk(request, {
          kind: "workflow",
          phase: request.phase,
          role: roleForPhase(request.phase),
          provider: PROVIDER,
          cli: CLI,
          model: this.config.model,
          windowId: request.window_id,
          text,
          ts: this.now()
        });
```

`codexCli.js` 同样在其 emitChunk 加 `kind: "workflow"` 与 `windowId: request.window_id`（其余字段不变）。

- [ ] **Step 4: 跑测试**

Run: `npm test`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add researchclaw/adapters/geminiCli.js researchclaw/adapters/codexCli.js researchclaw/tests/geminiCli.test.js researchclaw/tests/codexCli.test.js
git commit -m "feat(v3-m4): gemini/codex cli_chunk 补 kind:workflow + windowId"
```

---

### Task 5: createArtifact 扩展 producer + producerFields 助手

**Files:**
- Modify: `researchclaw/evidence/types.js`
- Test: `researchclaw/tests/schemas.test.js` 或新建 `researchclaw/tests/artifactProducer.test.js`（本 Task 用后者）

**Interfaces:**
- Produces:
  - `createArtifact({ ..., cli = null, model = null, windowId = null })` → `producer: { workflow, adapter, cli, model, windowId }`。
  - `producerFields(result) → { adapter, cli, model, windowId }`：非降级取 `result.source.cli/model`；降级（`result.degraded`）诚实返回 `{ adapter:"mock", cli:"mock", model:null }`，`windowId` 恒取 `result.source.windowId`。

- [ ] **Step 1: 写失败测试**

新建 `researchclaw/tests/artifactProducer.test.js`：

```js
import test from "node:test";
import assert from "node:assert/strict";
import { createArtifact, producerFields } from "../evidence/types.js";

test("createArtifact records cli/model/windowId in producer", () => {
  const a = createArtifact({
    projectId: "p", phase: "literature_scouting", type: "paper_cards", workflow: "literature",
    adapter: "gemini", cli: "gemini-cli", model: "gemini-3.1-flash-lite", windowId: "win_y", content: {}
  });
  assert.equal(a.producer.adapter, "gemini");
  assert.equal(a.producer.cli, "gemini-cli");
  assert.equal(a.producer.model, "gemini-3.1-flash-lite");
  assert.equal(a.producer.windowId, "win_y");
});

test("createArtifact producer cli/model/windowId default to null", () => {
  const a = createArtifact({ projectId: "p", phase: "intake", type: "raw_log", workflow: "intake", adapter: "manual", content: {} });
  assert.equal(a.producer.cli, null);
  assert.equal(a.producer.model, null);
  assert.equal(a.producer.windowId, null);
});

test("producerFields uses source cli/model for a real run", () => {
  const p = producerFields({ adapter: "claude", degraded: false, source: { cli: "claude-code", model: "claude-haiku-4-5", windowId: "win_x" } });
  assert.deepEqual(p, { adapter: "claude", cli: "claude-code", model: "claude-haiku-4-5", windowId: "win_x" });
});

test("producerFields reports mock honestly for a degraded run, keeping windowId", () => {
  const p = producerFields({ adapter: "mock", degraded: true, source: { provider: "gemini", cli: "gemini-cli", model: "g", windowId: "win_y" } });
  assert.deepEqual(p, { adapter: "mock", cli: "mock", model: null, windowId: "win_y" });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test`
Expected: FAIL —— `producerFields` 未导出、producer 无 cli/model/windowId。

- [ ] **Step 3: 改 evidence/types.js**

`createArtifact` 签名加三个可选参数并写入 producer：

```js
export function createArtifact({
  projectId,
  phase,
  type,
  workflow,
  adapter = "mock",
  cli = null,
  model = null,
  windowId = null,
  inputRefs = [],
  evidenceRefs = [],
  content,
  status = "accepted"
}) {
  if (!artifactTypes.has(type)) {
    throw new Error(`Unsupported artifact type: ${type}`);
  }
  return {
    artifact_id: makeId(`artifact_${type}`),
    project_id: projectId,
    phase,
    type,
    created_at: nowIso(),
    producer: { workflow, adapter, cli, model, windowId },
    input_refs: inputRefs,
    evidence_refs: evidenceRefs,
    content,
    status
  };
}

// 从 router 结果算出诚实的 producer 归属。非降级：cli/model 取自 source（= 实跑）。
// 降级：实际跑的是 mock，故 cli/model 归 mock（null），但 windowId 仍保留以便追溯
// 「这个窗口本该是某 provider、降级成了 mock」。
export function producerFields(result) {
  const src = result?.source || {};
  if (result?.degraded) {
    return { adapter: result.adapter || "mock", cli: "mock", model: null, windowId: src.windowId ?? null };
  }
  return {
    adapter: result?.adapter ?? "mock",
    cli: src.cli ?? null,
    model: src.model ?? null,
    windowId: src.windowId ?? null
  };
}
```

- [ ] **Step 4: 跑测试**

Run: `npm test`
Expected: PASS（本 Task 4 个 test 全绿；原有测试不受影响，producer 新增字段不破坏任何 deepEqual —— 已确认测试无 producer 精确匹配）。

- [ ] **Step 5: Commit**

```bash
git add researchclaw/evidence/types.js researchclaw/tests/artifactProducer.test.js
git commit -m "feat(v3-m4): createArtifact producer 扩展 cli/model/windowId + producerFields 助手"
```

---

### Task 6: 工作流与 raw_log 记录真实来源（修 adapter:"claude" 硬编码）

**Files:**
- Modify: `researchclaw/workflows/contractDraft.js`、`literature.js`、`baseline.js`、`idea.js`、`review.js`、`summary.js`
- Modify: `researchclaw/engine/orchestrator.js`（`landCliRawLog` + `_commitDraft`）
- Test: `researchclaw/tests/workflow.test.js`（或 `engine.test.js`，取现有验 producer/raw_log 的文件）

**Interfaces:**
- Consumes: `producerFields(result)`（Task 5）。
- Produces:
  - 6 个 workflow 的 `createArtifact` 用 `producerFields(result)` 填 adapter/cli/model/windowId。
  - `runContractDraftWorkflow` 返回 `{ contract, raw, producer }`（`producer = producerFields(result)`）。
  - `landCliRawLog(state, raw, phase, sourceRef, producer)`：producer.adapter 决定 raw_log 的来源（不再恒 "claude"），content 增 `provider/cli/model/window_id`。

- [ ] **Step 1: 写失败测试**

在 `researchclaw/tests/workflow.test.js` 找到用 fake adapter 驱动 literature 的测试，仿其加（fake adapter 需返回 `source`）：

```js
test("gemini-routed literature artifact records gemini as producer, not claude", async () => {
  const adapter = {
    async run() {
      return {
        ok: true, adapter: "gemini", degraded: false,
        source: { provider: "gemini", cli: "gemini-cli", model: "gemini-3.1-flash-lite", adapter: "gemini", windowId: "win_y" },
        output: [{ id: "p1", title: "t", why_relevant: "r", is_baseline_candidate: true }]
      };
    }
  };
  const art = await runLiteratureWorkflow({ adapter, projectId: "p", contract: {}, inputRefs: [], evidenceRefs: [] });
  assert.equal(art.producer.adapter, "gemini");
  assert.equal(art.producer.cli, "gemini-cli");
});
```

（`output` 需满足 `PaperCard[]` schema 的最小字段；若与仓库 fixture 字段不符，参照 `fixtures/workflows/literature-output.json` 里单条卡片的必填键补齐。import `runLiteratureWorkflow` 按文件现有风格。）

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test`
Expected: FAIL —— producer.cli undefined（旧 createArtifact 只写 adapter）。

- [ ] **Step 3a: 改 6 个 workflow**

每个 workflow 顶部 import 改为：`import { createArtifact, producerFields } from "../evidence/types.js";`

把每个 `createArtifact({ ... adapter: result.adapter, ... })` 中的 `adapter: result.adapter,` 替换为展开 producer 字段。例如 `literature.js`：

```js
  const p = producerFields(result);
  return createArtifact({
    projectId,
    phase: "literature_scouting",
    type: "paper_cards",
    workflow: "literature",
    adapter: p.adapter,
    cli: p.cli,
    model: p.model,
    windowId: p.windowId,
    inputRefs,
    evidenceRefs,
    content: result.output
  });
```

`baseline.js` / `idea.js` / `review.js` / `summary.js` 同样：在 `createArtifact` 前 `const p = producerFields(result);`，用 `adapter: p.adapter, cli: p.cli, model: p.model, windowId: p.windowId`。

`contractDraft.js`：contract artifact 同上用 `p`；并把返回值改为带 producer：

```js
  const p = producerFields(result);
  const contract = createArtifact({
    projectId, phase: "contract_draft", type: "contract", workflow: "contractDraft",
    adapter: p.adapter, cli: p.cli, model: p.model, windowId: p.windowId,
    inputRefs, evidenceRefs, content: result.output, status: "draft"
  });
  return { contract, raw: result.raw, producer: p };
```

- [ ] **Step 3b: 改 orchestrator landCliRawLog + _commitDraft**

`landCliRawLog` 签名与实现（约 `orchestrator.js:97-116`）改为：

```js
  landCliRawLog(state, raw, phase, sourceRef, producer = { adapter: "mock", cli: null, model: null, windowId: null }) {
    if (!raw) {
      return;
    }
    const transcriptRef = this.store.saveRawPayload(state.project_id, `${phase}-transcript`, {
      transcript: raw.transcript
    });
    const artifact = createArtifact({
      projectId: state.project_id,
      phase,
      type: "raw_log",
      workflow: "cli_transcript",
      adapter: producer.adapter,
      cli: producer.cli,
      model: producer.model,
      windowId: producer.windowId,
      inputRefs: [sourceRef].filter(Boolean),
      evidenceRefs: [],
      content: redactSecrets({
        ...raw.summary,
        provider: producer.adapter,
        cli: producer.cli,
        model: producer.model,
        window_id: producer.windowId,
        transcript_ref: transcriptRef
      })
    });
    const ref = this.store.appendArtifact(artifact);
    state.current.raw_log_artifact_refs = [...(state.current.raw_log_artifact_refs || []), ref];
  }
```

确认 `orchestrator.js` 顶部已 `import { createArtifact } from "../evidence/types.js";`（是），并追加 `producerFields`：`import { createArtifact, producerFields } from "../evidence/types.js";`

`_commitDraft` 解构加 `producer` 并透传：

```js
  _commitDraft(state, { contract: draftArtifact, raw, producer }) {
    const gate = contractGate(draftArtifact.content);
    const draftRef = this.store.appendArtifact(draftArtifact);
    state.current.contract_artifact_ref = draftRef;
    state.current.contract_artifact_id = draftArtifact.artifact_id;
    this.landCliRawLog(state, raw, "contract_draft", draftRef, producer);
    // ...其余不变
```

- [ ] **Step 4: 跑测试**

Run: `npm test`
Expected: PASS。原有验 contract raw_log 的测试若断言 producer.adapter，仍应为 "claude"（真跑）或对应 provider —— 若某旧测试用 mock 且此前默认 "claude"，改断言为实际来源（"mock"）。

- [ ] **Step 5: 全量回归 + Commit**

Run: `npm test`
Expected: 全绿。

```bash
git add researchclaw/workflows/ researchclaw/engine/orchestrator.js researchclaw/tests/workflow.test.js
git commit -m "fix(v3-m4): workflow/raw_log 记录真实 provider 来源，修 landCliRawLog 硬编码 claude"
```

---

### Task 7: 前端类型契约扩展

**Files:**
- Modify: `researchclaw/web/src/api/types.ts`
- Test:（无独立测试，随 Task 8 typecheck 验证）

**Interfaces:**
- Produces:
  - `CliChunk` 增 `kind?/provider?/cli?/model?/windowId?`（provider/cli 用 `CliProvider`/`CliId`）。
  - `Artifact.producer` 增 `cli?/model?/windowId?`。
  - `UsageSummary` 增 `by_provider?`。
  - `CliRawLogSummary` 增 `provider?/cli?/window_id?`。

- [ ] **Step 1: 改 types.ts（无测试步，属类型基座）**

`CliChunk` 替换为：

```ts
export interface CliChunk {
  kind?: "consult" | "workflow";
  phase?: string;
  provider?: CliProvider;
  cli?: CliId;
  model?: string;
  windowId?: string;
  role: string;
  text?: string;
  tool?: string;
  ts: string;
  degraded?: boolean;
}
```

（`CliProvider`/`CliId` 已在本文件后段定义；`CliChunk` 位于其前，TS `interface`/`type` 无提升问题因同模块整体解析，可直接引用。）

`Artifact.producer` 改为：

```ts
  producer: {
    workflow: string;
    adapter: "mock" | "claude" | "gemini" | "codex" | "manual";
    cli?: string;
    model?: string;
    windowId?: string;
  };
```

`UsageSummary` 追加字段：

```ts
  by_provider?: Record<string, { input_tokens: number; output_tokens: number; cli_calls: number; cli_failures: number }>;
```

`CliRawLogSummary` 追加：`provider?: string; cli?: string; window_id?: string;`

- [ ] **Step 2: typecheck**

Run（在 `researchclaw/web/`）: `npm run typecheck`
Expected: PASS（纯新增可选字段，不破坏现有引用）。

- [ ] **Step 3: Commit**

```bash
git add researchclaw/web/src/api/types.ts
git commit -m "feat(v3-m4): 前端类型契约扩展 CliChunk/producer/by_provider 来源字段"
```

---

### Task 8: groupCliWindows 分组纯函数

**Files:**
- Modify: `researchclaw/web/src/lib/cliStream.ts`
- Test: `researchclaw/web/src/lib/cliStream.test.ts`

**Interfaces:**
- Produces:
  - `interface CliWindow { windowId: string; provider?: string; cli?: string; model?: string; phase?: string; degraded: boolean; chunks: CliChunk[]; }`
  - `groupCliWindows(chunks: CliChunk[]): CliWindow[]` —— 按 `windowId` 归并、保留首次出现顺序、跳过 `kind:"consult"`、任一 chunk `degraded` 则窗口 `degraded:true`、元数据由首个带值的 chunk 填充；无 windowId 的 workflow chunk 归入 `"ungrouped"` 窗口。

- [ ] **Step 1: 写失败测试**

在 `researchclaw/web/src/lib/cliStream.test.ts` 顶部 import 追加 `groupCliWindows`，并加：

```ts
describe("groupCliWindows", () => {
  const wf = (over: Partial<CliChunk>): CliChunk => ({ kind: "workflow", role: "规划", ts: "t", ...over });

  test("groups chunks by windowId, preserving first-seen order", () => {
    const wins = groupCliWindows([
      wf({ windowId: "w1", provider: "claude", cli: "claude-code", model: "h", phase: "contract_draft", text: "a" }),
      wf({ windowId: "w2", provider: "gemini", cli: "gemini-cli", phase: "literature_scouting", text: "b" }),
      wf({ windowId: "w1", text: "c" })
    ]);
    expect(wins.map((w) => w.windowId)).toEqual(["w1", "w2"]);
    expect(wins[0].chunks.map((c) => c.text)).toEqual(["a", "c"]);
    expect(wins[0].provider).toBe("claude");
    expect(wins[1].cli).toBe("gemini-cli");
  });

  test("marks a window degraded if any chunk is degraded", () => {
    const wins = groupCliWindows([
      wf({ windowId: "w1", provider: "codex", degraded: true, role: "系统", text: "超时，已降级 mock" })
    ]);
    expect(wins[0].degraded).toBe(true);
    expect(wins[0].provider).toBe("codex");
  });

  test("skips consult chunks", () => {
    const wins = groupCliWindows([
      { kind: "consult", role: "对话", ts: "t", text: "hi" },
      wf({ windowId: "w1", text: "a" })
    ]);
    expect(wins).toHaveLength(1);
    expect(wins[0].windowId).toBe("w1");
  });

  test("puts windowId-less workflow chunks into an ungrouped window", () => {
    const wins = groupCliWindows([wf({ text: "a" })]);
    expect(wins[0].windowId).toBe("ungrouped");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run（在 `researchclaw/web/`）: `npm run test`
Expected: FAIL —— `groupCliWindows` 未定义。

- [ ] **Step 3: 实现 groupCliWindows**

在 `researchclaw/web/src/lib/cliStream.ts` 追加：

```ts
export interface CliWindow {
  windowId: string;
  provider?: string;
  cli?: string;
  model?: string;
  phase?: string;
  degraded: boolean;
  chunks: CliChunk[];
}

// 把 workflow chunk 按 windowId 归并成有序窗口（首次出现顺序）。consult chunk 走
// 独立聊天视图，这里跳过。窗口元数据由首个带值的 chunk 填充；任一 chunk degraded
// 则整窗标记 degraded（诚实：该窗降级成了 mock）。纯函数，不改输入。
export function groupCliWindows(chunks: CliChunk[]): CliWindow[] {
  const order: string[] = [];
  const map = new Map<string, CliWindow>();
  for (const c of chunks) {
    if (c.kind === "consult") continue;
    const id = c.windowId ?? "ungrouped";
    let win = map.get(id);
    if (!win) {
      win = { windowId: id, provider: c.provider, cli: c.cli, model: c.model, phase: c.phase, degraded: false, chunks: [] };
      map.set(id, win);
      order.push(id);
    }
    if (!win.provider && c.provider) win.provider = c.provider;
    if (!win.cli && c.cli) win.cli = c.cli;
    if (!win.model && c.model) win.model = c.model;
    if (!win.phase && c.phase) win.phase = c.phase;
    if (c.degraded) win.degraded = true;
    win.chunks.push(c);
  }
  return order.map((id) => map.get(id) as CliWindow);
}
```

- [ ] **Step 4: 跑测试**

Run（在 `researchclaw/web/`）: `npm run test`
Expected: PASS（新增 4 个 + 原有 cliStream 测试全绿）。

- [ ] **Step 5: Commit**

```bash
git add researchclaw/web/src/lib/cliStream.ts researchclaw/web/src/lib/cliStream.test.ts
git commit -m "feat(v3-m4): groupCliWindows 按 windowId 归并 cli_chunk"
```

---

### Task 9: 来源徽章与 CLI 标签（gemini/codex）

**Files:**
- Modify: `researchclaw/web/src/lib/processFeed.ts`、`researchclaw/web/src/components/AdapterBadge.tsx`
- Test: `researchclaw/web/src/lib/processFeed.test.ts`（若不存在则新建）

**Interfaces:**
- Produces:
  - `AdapterTone` 增 `"gemini" | "codex"`。
  - `adapterBadgeMeta("gemini") → { label:"Gemini", tone:"gemini" }`；`"codex" → { label:"Codex", tone:"codex" }`。
  - `cliLabel(cli?: string): string` —— `claude-code→"Claude Code"`、`gemini-cli→"Gemini CLI"`、`codex-cli→"Codex CLI"`、`mock→"Mock"`、其他→原值或 `"—"`。

- [ ] **Step 1: 写失败测试**

新建/追加 `researchclaw/web/src/lib/processFeed.test.ts`：

```ts
import { describe, expect, test } from "vitest";
import { adapterBadgeMeta, cliLabel } from "./processFeed";

describe("adapterBadgeMeta", () => {
  test("maps gemini and codex to their own tone", () => {
    expect(adapterBadgeMeta("gemini")).toEqual({ label: "Gemini", tone: "gemini" });
    expect(adapterBadgeMeta("codex")).toEqual({ label: "Codex", tone: "codex" });
  });
  test("keeps claude/mock/manual", () => {
    expect(adapterBadgeMeta("claude").tone).toBe("claude");
    expect(adapterBadgeMeta("mock").tone).toBe("mock");
    expect(adapterBadgeMeta("manual").tone).toBe("manual");
  });
});

describe("cliLabel", () => {
  test("maps cli ids to human labels", () => {
    expect(cliLabel("claude-code")).toBe("Claude Code");
    expect(cliLabel("gemini-cli")).toBe("Gemini CLI");
    expect(cliLabel("codex-cli")).toBe("Codex CLI");
    expect(cliLabel(undefined)).toBe("—");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run（在 `researchclaw/web/`）: `npm run test`
Expected: FAIL —— `cliLabel` 未导出、gemini/codex tone 落到 unknown。

- [ ] **Step 3: 改 processFeed.ts + AdapterBadge.tsx**

`processFeed.ts`：`AdapterTone` 改为 `"claude" | "gemini" | "codex" | "mock" | "manual" | "unknown"`；`adapterBadgeMeta` 的 switch 增：

```ts
    case "gemini":
      return { label: "Gemini", tone: "gemini" };
    case "codex":
      return { label: "Codex", tone: "codex" };
```

并新增：

```ts
const CLI_LABELS: Record<string, string> = {
  "claude-code": "Claude Code",
  "gemini-cli": "Gemini CLI",
  "codex-cli": "Codex CLI",
  mock: "Mock"
};

export function cliLabel(cli: string | undefined): string {
  if (!cli) return "—";
  return CLI_LABELS[cli] ?? cli;
}
```

`AdapterBadge.tsx` 的 `TONE_CLASS` 增两行（用现有 Tailwind 调色板风格）：

```ts
  gemini: "border-sky-400/40 bg-sky-400/15 text-sky-300",
  codex: "border-violet-400/40 bg-violet-400/15 text-violet-300",
```

- [ ] **Step 4: 跑测试 + typecheck**

Run（在 `researchclaw/web/`）: `npm run test && npm run typecheck`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add researchclaw/web/src/lib/processFeed.ts researchclaw/web/src/lib/processFeed.test.ts researchclaw/web/src/components/AdapterBadge.tsx
git commit -m "feat(v3-m4): 来源徽章加 gemini/codex tone + cliLabel 助手"
```

---

### Task 10: 右栏按 windowId 分组展示

**Files:**
- Modify: `researchclaw/web/src/components/RightColumn.tsx`
- Test: typecheck + build（无组件测试基座；分组逻辑已在 Task 8 单测覆盖）

**Interfaces:**
- Consumes: `groupCliWindows`（Task 8）、`cliLabel`/`adapterBadgeMeta`（Task 9）。
- Produces: 用 `CliWindows` 分组视图替换扁平 `LiveChunks`；每组组头 `phase · <CLI label> · <model> + [真实]/[降级 mock]`。

- [ ] **Step 1: 替换 LiveChunks 为 CliWindows**

在 `RightColumn.tsx` import 追加：`import { groupCliWindows } from "../lib/cliStream";` 与 `import { cliLabel } from "../lib/processFeed";`

删除现有 `LiveChunks` 组件，替换为：

```tsx
// 按 windowId 分组的 CLI 执行窗口：每次 run 一组，组头标 phase · CLI · model +
// [真实]/[降级 mock]。过程透明度，非结论（两通道红线 §2.1）。
function CliWindows({ chunks }: { chunks: CliChunk[] }) {
  const windows = groupCliWindows(chunks);
  if (windows.length === 0) {
    return null;
  }
  return (
    <div className="space-y-2">
      <div className="text-[10px] uppercase tracking-wide text-panel-muted">CLI 执行窗口 · 过程透明度，非结论</div>
      {windows.map((w) => {
        const recent = w.chunks.slice(-12);
        return (
          <details key={w.windowId} className="rounded border border-panel-border bg-panel-bg/60" open>
            <summary className="cursor-pointer px-2 py-1 text-[10px] text-panel-muted">
              <span className="text-panel-text">{w.phase ?? "—"}</span>
              {" · "}
              {cliLabel(w.cli)}
              {w.model ? ` · ${w.model}` : ""}
              {"  "}
              <span className={w.degraded ? "text-amber-300" : "text-emerald-300"}>
                {w.degraded ? "[降级 mock]" : "[真实]"}
              </span>
            </summary>
            <ul className="max-h-40 space-y-0.5 overflow-auto px-2 pb-2">
              {recent.map((c, i) => (
                <li key={`${c.ts}-${i}`} className="font-mono text-[10px] text-panel-muted/80">
                  {c.tool ? `🛠 ${c.tool}` : c.text?.slice(0, 80)}
                </li>
              ))}
            </ul>
          </details>
        );
      })}
    </div>
  );
}
```

将 `RightColumn` 主体里的 `<LiveChunks chunks={cliChunks} />` 换成 `<CliWindows chunks={cliChunks} />`。`degraded` 顶部横幅逻辑（`cliChunks.some(isDegradedChunk)`）保留不变。

- [ ] **Step 2: typecheck + build**

Run（在 `researchclaw/web/`）: `npm run typecheck && npm run build`
Expected: PASS，无类型错误。

- [ ] **Step 3: 人工验证（可选，本地）**

Run（仓库根）: `npm run dev`，浏览器发起一次 draft，右栏应显示一个 `contract_draft · Claude Code · <model> [真实]` 分组，内含实时 chunk。

- [ ] **Step 4: Commit**

```bash
git add researchclaw/web/src/components/RightColumn.tsx
git commit -m "feat(v3-m4): 右栏按 windowId 分组展示三套 CLI 执行窗口"
```

---

### Task 11: 阶段卡 + artifact 详情抽屉展示来源

**Files:**
- Modify: `researchclaw/web/src/components/CurrentPhaseCard.tsx`、`researchclaw/web/src/components/ArtifactDetailDrawer.tsx`
- Test: typecheck + build

**Interfaces:**
- Consumes: `artifact.producer.{adapter,cli,model,windowId}`。

- [ ] **Step 1: CurrentPhaseCard 徽章带 cli/model**

将 `CurrentPhaseCard.tsx` 右上角来源徽章块（`{artifact.data?.producer.adapter && (...)}`）替换为：

```tsx
        {artifact.data?.producer.adapter && (
          <span
            className="rounded-full border border-panel-border bg-panel-bg px-2 py-0.5 text-xs text-panel-muted"
            title={artifact.data.producer.windowId ? `windowId: ${artifact.data.producer.windowId}` : undefined}
          >
            {artifact.data.producer.adapter}
            {artifact.data.producer.model ? ` · ${artifact.data.producer.model}` : ""}
          </span>
        )}
```

- [ ] **Step 2: ArtifactDetailDrawer 增来源 Meta 行**

在 `ArtifactDetailDrawer.tsx` 的 `<Meta label="adapter" .../>` 之后追加：

```tsx
                {artifact.producer?.cli && <Meta label="cli" value={artifact.producer.cli} />}
                {artifact.producer?.model && <Meta label="model" value={artifact.producer.model} />}
                {artifact.producer?.windowId && <Meta label="windowId" value={artifact.producer.windowId} />}
```

- [ ] **Step 3: typecheck + build**

Run（在 `researchclaw/web/`）: `npm run typecheck && npm run build`
Expected: PASS。

- [ ] **Step 4: Commit**

```bash
git add researchclaw/web/src/components/CurrentPhaseCard.tsx researchclaw/web/src/components/ArtifactDetailDrawer.tsx
git commit -m "feat(v3-m4): 阶段卡/详情抽屉展示 provider/cli/model/windowId 来源"
```

---

### Task 12: 指标栏按 provider 拆分

**Files:**
- Modify: `researchclaw/web/src/components/MetricsRow.tsx`
- Test: typecheck + build

**Interfaces:**
- Consumes: `state.usage.by_provider`（Task 2 产出，经 snapshot 落 state.usage）。

- [ ] **Step 1: 在 MetricsRow 增 by_provider 明细**

在 `MetricsRow.tsx` 的 `<div className="grid ...">` 指标网格**之后**、组件返回的最外层 `</div>` 之前，插入：

```tsx
      {usage?.by_provider && Object.keys(usage.by_provider).length > 0 && (
        <div className="flex flex-wrap gap-2 text-[11px] text-panel-muted">
          <span className="text-panel-muted/70">按 CLI：</span>
          {Object.entries(usage.by_provider).map(([provider, b]) => (
            <span key={provider} className="rounded border border-panel-border bg-panel-bg px-2 py-0.5">
              {provider} · {b.cli_calls} 调用{b.cli_failures ? ` / ${b.cli_failures} 失败` : ""}
            </span>
          ))}
        </div>
      )}
```

（成本按 provider 拆分需要每 provider 的 token→成本换算，`by_provider` 桶已含 token 但 MetricsRow 现不引 `estimateCostUsd`；本步先展示调用/失败次数，符合 spec §4.3「CLI 调用次数按 provider 拆分」。成本仍以总额 + phase tooltip 呈现，避免前端重算定价。）

- [ ] **Step 2: typecheck + build**

Run（在 `researchclaw/web/`）: `npm run typecheck && npm run build`
Expected: PASS。

- [ ] **Step 3: Commit**

```bash
git add researchclaw/web/src/components/MetricsRow.tsx
git commit -m "feat(v3-m4): 指标栏按 provider 拆分 CLI 调用/失败次数"
```

---

### Task 13: 全量回归 + 文档订正

**Files:**
- Modify: `progress/第三版/V3-M4-多CLI窗口与SSE展示.md`（状态更新）
- Test: 后端 `npm test` + 前端 `npm run test` + `npm run build`

- [ ] **Step 1: 后端全量测试**

Run（仓库根）: `npm test`
Expected: 全绿（含新增 cliRouter/cost/claudeCode/geminiCli/codexCli/artifactProducer/workflow 测试）。

- [ ] **Step 2: 前端全量测试 + 构建**

Run（在 `researchclaw/web/`）: `npm run test && npm run typecheck && npm run build`
Expected: 全绿。

- [ ] **Step 3: 订正 M4 milestone 文档状态**

在 `progress/第三版/V3-M4-多CLI窗口与SSE展示.md` 顶部状态行由「未完成（2026-07-09 代码核查）」改为「已完成（2026-07-11 实现，按 windowId 分组 + by_provider）」，并加一行指向本实现设计 `docs/superpowers/specs/2026-07-11-m4-multi-cli-window-design.md`。

- [ ] **Step 4: Commit**

```bash
git add progress/第三版/V3-M4-多CLI窗口与SSE展示.md
git commit -m "docs(v3-m4): 里程碑状态更新为已完成"
```

---

## Self-Review

**Spec coverage：**
- cli_chunk 扩展 provider/cli/model/windowId/kind → Task 1（router+降级）/3（claude）/4（gemini/codex）✓
- EventBus 按 windowId「保留足够 metadata」→ chunk 带 windowId，扁平 buffer 不改（spec §3 允许）✓
- 前端 CliChunk 类型扩展 → Task 7 ✓
- 右栏多 CLI 展示 → Task 10（按 run 分组，已批准）✓
- phase 卡显示 provider/cli/model → Task 11 ✓
- artifact 来源徽章 → Task 9 + 11 ✓
- Metrics 按 provider → Task 2（后端桶）+ 12（前端）✓
- raw_log 来源 bug → Task 6 ✓
- consult 保持 Claude-only → 全程不动 consult 路径 ✓（红线）

**Placeholder scan：** 无 TBD/TODO；每个代码步给出完整代码块。

**Type consistency：** `producerFields` 返回 `{adapter,cli,model,windowId}` 在 Task 5 定义、Task 6 消费一致；`groupCliWindows`/`CliWindow` Task 8 定义、Task 10 消费一致；`cliLabel`/`adapterBadgeMeta` Task 9 定义、Task 10/11 消费一致；`window_id`（后端 request/raw_log content 蛇形）与 `windowId`（source/producer/前端 驼峰）区分明确，未混用。

**风险备注：** Task 6 改 6 个 workflow + orchestrator，若某旧测试断言 mock 路径下 producer.adapter 为 "claude"（旧硬编码），需改断言为实际 "mock"——这正是本 Task 要修的 bug，属预期改动。
