# ResearchClaw V3-M3 CliRouter 与三套 CLI Adapter

> 阶段：V3-M3
> 目标：把当前 Claude primary + mock fallback 路由升级为 phase-aware 多 CLI router，并新增 Gemini/Codex CLI adapter
> 前置：V3-M2 phase CLI policy 已后端化

---

## 0. 一句话目标

```text
同一个 Research Workflow phase 可以按后端 phase policy 分别走 Claude Code CLI、Gemini CLI、Codex CLI 或 mock，并让每个 artifact 都记录真实 provider/cli/model/source。
```

V3-M3 是 V3 的多 CLI 执行核心。

---

## 1. 范围

### 1.1 必须做

- 将 `adapters/route.js` 升级或替换为 phase-aware `CliRouter`。
- 保留并扩展 `ClaudeCodeAdapter`。
- 新增 `GeminiCliAdapter`。
- 新增 `CodexCliAdapter`。
- 三套真实 CLI adapter 实现统一 result shape。
- router 从 V3-M2 的 phase policy 读取 provider/CLI/model。
- artifact/raw_log/SSE 写入 provider、cli、model、source metadata。
- fallback policy 初版落地。
- CostTracker 增加 provider/cli/model 维度。

### 1.2 明确不做

- 不插入实验 phase。
- 不做多 CLI 前端窗口细化，M4 处理。
- 不开放危险命令自动执行能力。
- 不让 consult fallback mock。
- 不让 CLI 自己改 research state。

---

## 2. 架构变化

当前 V2 路由：

```text
phase opted-in → primary Claude → fallback mock
```

V3-M3 路由：

```text
phase
  → phaseCliPolicy
  → provider/cli/model validation
  → matched adapter
  → structured result + raw_log + usage
  → gate / fallback / blocked
```

建议文件：

```text
researchclaw/adapters/cliRouter.js
researchclaw/adapters/claudeCode.js
researchclaw/adapters/geminiCli.js
researchclaw/adapters/codexCli.js
researchclaw/adapters/mock.js
```

可选择保留 `route.js` 作为兼容入口，但内部委托给 `cliRouter.js`。

---

## 3. Adapter 统一接口

三套真实 CLI 都实现：

```js
adapter.run({
  project_id,
  phase,
  prompt,
  schema,
  input_artifacts,
  workspace_dir,
  budget,
  eventBus,
  policy
}) => {
  ok,
  adapter,
  provider,
  cli,
  model,
  output,
  raw,
  usage,
  error
}
```

兼容当前 workflow adapter request 时，可以在 router 内做 request 转换，避免一次性改所有 workflow。

返回规则：

- `ok:true` 时 `output` 必须是结构化对象。
- `raw.transcript` 只作为过程流，不是结论。
- `usage` 必须至少包含 model、provider、cli、phase、duration。
- `error` 必须结构化，不能只抛异常。

---

## 4. ClaudeCodeAdapter 改造

保留 V2 双通道：

- `stream-json` → SSE 过程流。
- `out.json` → 结构化 artifact。
- raw transcript → raw_log。

M3 追加：

- 返回 `provider:'claude'`。
- 返回 `cli:'claude-code'`。
- 返回实际 `model`。
- `cli_chunk` 带 provider/cli/model。
- raw_log summary 带 provider/cli/model。
- artifact producer/source 带 provider/cli/model。

---

## 5. GeminiCliAdapter

最小可行要求：

- 使用 `API.md` 的 `gemini_base_url`、API key、Gemini 模型。
- 通过子进程环境逐进程注入，不修改全局 Gemini CLI 配置。
- 捕获 stdout/stderr/过程输出。
- 过程输出进入 `raw_log` 与 SSE `cli_chunk`。
- 要求模型输出结构化 JSON，写入 adapter 可读结果。
- schema 校验失败不得推进 phase。

建议错误码：

```text
unavailable
spawn_error
timeout
missing_output
schema_violation
provider_error
```

---

## 6. CodexCliAdapter

最小可行要求：

- 使用 `API.md` 的 `openai_base_url`、API key、Codex/GPT 模型。
- 通过子进程环境逐进程注入 OpenAI compatible base/key/model。
- 重点服务代码与实验相关 phase。
- 捕获 stdout/stderr/exit code。
- 输出结构化 JSON，schema 校验后返回。
- 对执行类任务记录 command、cwd、stdout/stderr、exit_code、duration。

安全规则：

- 默认不开放危险命令。
- 超时必须中止。
- 越权路径必须 blocked。
- exit_code 非 0 不可伪装成功。
- 不把 API key 写入 raw_log。

---

## 7. Fallback Policy 初版

建议结构：

```js
fallbackPolicy = {
  onCliUnavailable: 'mock',
  onProviderUnavailable: 'mock',
  onSchemaViolation: 'blocked',
  onTimeout: 'mock',
  onOverBudget: 'blocked'
}
```

默认建议：

- 普通 workflow phase：CLI/provider unavailable 可 mock fallback。
- schema violation：blocked，不把错误输出转 mock 成功。
- over budget：blocked 或暂停 CLI。
- consult：永远不 mock fallback。
- 未来 `experiment_execution`：默认不 mock fallback。

---

## 8. 关键文件

| 文件 | 改造方向 |
| --- | --- |
| `researchclaw/adapters/route.js` | 升级或替换为 phase-aware router |
| `researchclaw/adapters/cliRouter.js` | 新增多 CLI router |
| `researchclaw/adapters/claudeCode.js` | 增加 provider/cli/model metadata |
| `researchclaw/adapters/geminiCli.js` | 新增 Gemini CLI adapter |
| `researchclaw/adapters/codexCli.js` | 新增 Codex CLI adapter |
| `researchclaw/adapters/schemas.js` | 注册更多 phase output schema |
| `researchclaw/engine/cost.js` | 增加 provider/cli/model 维度 |
| `researchclaw/server.js` | 装配 CliRouter 与 policy service |

---

## 9. 测试要求

- phase policy 配 claude-code → 调 ClaudeCodeAdapter。
- phase policy 配 gemini-cli → 调 GeminiCliAdapter。
- phase policy 配 codex-cli → 调 CodexCliAdapter。
- phase policy 配 mock → 调 MockModelAdapter。
- CLI unavailable 按 fallback policy 处理。
- schema violation 不推进 phase。
- artifact producer/source 写入 provider/cli/model。
- `cli_chunk` 带 provider/cli/model。
- consult 不 fallback mock。
- CI 使用 stub 子进程/fixture，不真实消耗模型额度。

---

## 10. 验收标准

- 任一已支持 phase 可按 Settings policy 选择 Claude/Gemini/Codex/mock。
- 三套 adapter 都输出统一 result shape。
- artifact、raw_log、SSE、usage 都能追踪 provider/cli/model。
- mock 回放仍稳定。
- 出错路径诚实：不能把真实失败包装成成功。

---

## 11. 红线

1. adapter 不改 research state。
2. engine 只经 router/adapter 调 CLI，不直接 spawn。
3. 结构化 artifact 必须经 schema/gate。
4. transcript/raw_log 不能当结论。
5. consult 不 mock。
6. API key 不进日志、SSE、artifact、错误信息。
