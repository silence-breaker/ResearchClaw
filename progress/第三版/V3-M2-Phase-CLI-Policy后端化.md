# ResearchClaw V3-M2 Phase CLI Policy 后端化

> 阶段：V3-M2
> 目标：让每个 research phase 的 provider/CLI/model 策略由后端持久化与校验
> 前置：V3-M1 provider/CLI 状态 API 完成

---

## 0. 一句话目标

```text
Settings 不再只保存本地模型偏好，而是通过后端维护 phase → provider/CLI/model 的策略配置；后续 workflow/router 必须能读取这份策略。

截至 2026-07-09，M2 已完成策略配置、校验、持久化与 Settings 接入；执行层尚未消费该 policy。当前真实执行仍是 Claude Code + mock 路由，启用 Claude 时仅 `contract_draft` 走真实 Claude。
```

V3-M2 只完成策略配置，不要求 Gemini/Codex adapter 已能真实执行。

---

## 1. 范围

### 1.1 必须做

- 新增默认 `phaseCliPolicy`。
- 新增 `GET /settings/cli-policy`。
- 新增 `PUT /settings/cli-policy`。
- 后端持久化 policy。
- 校验 provider、CLI、model、phase 合法性。
- Settings 页面支持逐 phase 选择 provider/CLI/model。
- 保存后为后续 phase 执行策略读取点提供数据源；当前 M2 不要求已被执行层消费。

### 1.2 明确不做

- 不实现 Gemini/Codex adapter。
- 不要求当前 workflow 真实按策略切换 CLI。
- 不改历史 artifact 的 producer/source。
- 不开放任意自填模型名。
- 不让 consult 降级 mock。

---

## 2. 默认策略

建议默认：

| phase | provider | cli | model |
| --- | --- | --- | --- |
| `contract_draft` | claude | claude-code | `claude-haiku-4-5-20251001` |
| `literature_scouting` | gemini | gemini-cli | `gemini-3.1-flash-lite` |
| `baseline_selection` | claude | claude-code | `claude-haiku-4-5-20251001` |
| `baseline_reproduction_checklist` | codex | codex-cli | `gpt-5.4-mini` |
| `idea_generation` | gemini | gemini-cli | `gemini-3.1-flash-lite` |
| `idea_review` | claude | claude-code | `claude-haiku-4-5-20251001` |
| `experiment_planning` | codex | codex-cli | `gpt-5.4-mini` |
| `experiment_execution` | codex | codex-cli | `gpt-5.4-mini` |
| `experiment_review` | claude | claude-code | `claude-haiku-4-5-20251001` |
| `summary` | claude | claude-code | `claude-haiku-4-5-20251001` |

注意：M2 可先允许配置未来 experiment phase，即使 M5 才真正加入状态机。这样 Settings 与 V3 总纲保持一致。

---

## 3. 后端 API

### 3.1 读取策略

```text
GET /settings/cli-policy
```

响应：

```js
{
  ok: true,
  policy: {
    contract_draft: { provider: 'claude', cli: 'claude-code', model: 'claude-haiku-4-5-20251001' }
  },
  defaults: { ... },
  fallbackPolicy: { ... }
}
```

### 3.2 保存策略

```text
PUT /settings/cli-policy
```

请求：

```js
{
  policy: {
    literature_scouting: { provider: 'gemini', cli: 'gemini-cli', model: 'gemini-3.1-flash-lite' }
  }
}
```

保存规则：

- 可只提交部分 phase，后端 merge 到默认策略。
- 非法项返回 400，不写入。
- 保存后只影响后续执行，不修改已有 artifact。

---

## 4. 校验规则

- provider 只能是 `claude | gemini | codex | mock`。
- cli 只能是 `claude-code | gemini-cli | codex-cli | mock`。
- provider 与 cli 必须匹配。
- `mock` 不需要 model。
- 非 mock provider 必须 configured。
- model 必须来自 `API.md` available models 中对应 provider 的模型。
- phase 必须属于 ResearchClaw 已知 phase 或 V3 预声明 phase。
- 不允许任意自填模型名。

---

## 5. 持久化建议

建议新增轻量 settings service：

```text
researchclaw/settings/cliPolicy.js
```

职责：

- 读取默认 policy。
- 从 `.researchclaw/settings.json` 或 evidence store 附近的全局 settings 文件读取覆盖。
- 写入覆盖。
- 校验 policy。
- 向 router 提供 `resolvePhasePolicy(phase)`。

不建议把执行策略放在前端 localStorage，因为它影响真实后端执行。

---

## 6. 前端任务

Settings 新增“模型/CLI 路由”页：

- 顶部展示 provider 与 CLI 状态。
- 中部展示 Phase CLI Policy 表格。
- 每行包含 phase label、provider 下拉、CLI 下拉、model 下拉。
- 下拉选项来自 `/system/providers` 与 `/system/cli-status`。
- 保存调用 `PUT /settings/cli-policy`。
- 保存失败显示后端校验错误。
- 已完成 artifact 的来源不随设置变化。

---

## 7. 关键文件

| 文件 | 改造方向 |
| --- | --- |
| `researchclaw/settings/cliPolicy.js` | 新增策略默认值、校验、读写 |
| `researchclaw/server.js` | 新增 settings endpoint |
| `researchclaw/tests/server.test.js` | 覆盖 GET/PUT policy |
| `researchclaw/tests/cliPolicy.test.js` | 新增纯函数校验测试 |
| `researchclaw/web/src/api/types.ts` | 增加 `PhaseCliPolicy` 类型 |
| `researchclaw/web/src/api/client.ts` | 增加 policy API |
| `researchclaw/web/src/components/ModelSettings.tsx` | 改造成 phase policy 配置 UI |

---

## 8. 测试要求

- 默认 policy 完整覆盖 V3 phase。
- 合法 policy 可保存。
- 非法 provider 被拒绝。
- provider/CLI 不匹配被拒绝。
- 非白名单 model 被拒绝。
- mock provider 不要求 model。
- 保存只影响 settings，不修改 project state 或 artifact。
- 前端保存成功/失败路径有测试。

---

## 9. 验收标准

- Settings 可读取并保存每个 phase 的 provider/CLI/model。
- 后端策略持久化成功，重启后仍可读取。
- 非法配置不会写入。
- policy API 不泄露 API key。
- 后续 router 可通过 service 读取某个 phase 的执行策略。
- 当前执行层仍未按 policy 路由；“修改某 phase CLI 后下一次执行即使用新 CLI”属于 V3-M3 验收，不属于 M2 已完成范围。

---

## 10. 红线

1. 后端策略是执行真相源，不能只存在前端 localStorage。
2. 不开放任意 key/base URL/model 输入。
3. 不让 policy 改写历史 artifact source。
4. 不把 `mock` 包装成真实 provider。
5. 不因为 Settings UI 方便而改变 workflow/state 边界。
