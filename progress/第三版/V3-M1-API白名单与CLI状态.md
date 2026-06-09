# ResearchClaw V3-M1 API 白名单与 CLI 状态

> 阶段：V3-M1
> 目标：把 `API.md` 中 claude/codex/gemini 栏变成后端可查询的脱敏 provider 状态，并探测三套 CLI 可用性
> 前置：V3-M0 基线核查完成

---

## 0. 一句话目标

```text
后端只读取 API.md 的 claude/codex/gemini 白名单配置，向前端提供不含密钥的 provider 状态和 Claude Code / Gemini CLI / Codex CLI 可执行状态。
```

V3-M1 是 V3 多 CLI 路由的配置地基，不执行真实 Gemini/Codex workflow。

---

## 1. 范围

### 1.1 必须做

- 强化 `adapters/providers.js`，继续只解析 `# claude, codex, gemini` 栏。
- 新增 `GET /system/providers`。
- 新增 `GET /system/cli-status`。
- provider status 只返回脱敏信息。
- CLI status 探测 `claude`、`gemini`、`codex` 是否可执行。
- 前端 Settings 显示 provider configured 状态与 CLI available 状态。
- 替换 `ModelSettings` 中明显误导的 demo 模型列表，或明确转为 V3 路由状态页。

### 1.2 明确不做

- 不新增 phase CLI policy 保存接口。
- 不让 workflow 按 provider/CLI 路由。
- 不实现 Gemini/Codex adapter。
- 不让用户在 Settings 中输入任意 base URL/API key。
- 不读取 `API.md` 的 `# openclaw` 栏。

---

## 2. 后端设计

### 2.1 Provider 状态

新增接口：

```text
GET /system/providers
```

响应示例：

```js
{
  ok: true,
  providers: [
    { id: 'claude', configured: true, baseUrlHost: 'yunwu.ai', models: ['claude-haiku-4-5-20251001'] },
    { id: 'gemini', configured: true, baseUrlHost: 'yunwu.ai', models: ['gemini-3.1-flash-lite'] },
    { id: 'codex', configured: true, baseUrlHost: 'yunwu.ai', models: ['gpt-5.4-mini'] }
  ]
}
```

规则：

- `configured` 只表示 base URL、API key、model 配置完整。
- `baseUrlHost` 只返回 host，不返回完整敏感 URL 参数。
- 不返回 API key。
- 不返回父进程环境里的非 ResearchClaw provider key。

### 2.2 CLI 状态

新增接口：

```text
GET /system/cli-status
```

响应示例：

```js
{
  ok: true,
  clis: [
    { id: 'claude-code', provider: 'claude', available: true, command: 'claude' },
    { id: 'gemini-cli', provider: 'gemini', available: false, command: 'gemini' },
    { id: 'codex-cli', provider: 'codex', available: true, command: 'codex' }
  ]
}
```

规则：

- CLI availability 只探测二进制可执行性。
- provider configured 与 CLI available 分开显示。
- CLI 不存在不代表 provider key 缺失。
- 探测失败不能导致 server 启动失败。

---

## 3. 前端设计

Settings 中新增或改造“模型/CLI 路由”入口，M1 只读展示：

```text
Provider 状态
  Claude: configured / model / host
  Gemini: configured / model / host
  Codex: configured / model / host

CLI 状态
  Claude Code CLI: available/unavailable
  Gemini CLI: available/unavailable
  Codex CLI: available/unavailable
```

UI 红线：

- 不显示 API key。
- 不提供任意 key/base URL 输入框。
- 不把 demo 模型伪装成真实后端模型。
- unavailable 要诚实显示，不 mock 成 available。

---

## 4. 关键文件

| 文件 | 改造方向 |
| --- | --- |
| `researchclaw/adapters/providers.js` | 增加 provider status helper，继续只读白名单栏 |
| `researchclaw/server.js` | 增加 `/system/providers`、`/system/cli-status` |
| `researchclaw/tests/providers.test.js` | 覆盖白名单解析、脱敏、缺配置 |
| `researchclaw/tests/server.test.js` | 覆盖两个 system endpoint |
| `researchclaw/web/src/api/types.ts` | 增加 provider/CLI status 类型 |
| `researchclaw/web/src/api/client.ts` | 增加 system API client |
| `researchclaw/web/src/components/ModelSettings.tsx` | 改造成 provider/CLI 状态展示 |

---

## 5. 测试要求

### 5.1 Provider 测试

- 只解析 `# claude, codex, gemini` 栏。
- 不解析 `# openclaw` 栏。
- 缺 `API.md` 时返回 configured=false，不崩。
- 缺某个 base URL 时该 provider configured=false。
- 响应 JSON 不包含 API key 字符串。

### 5.2 CLI 状态测试

- 可注入 command checker，避免测试依赖本机真实 CLI。
- 三套 CLI 分别返回 available/unavailable。
- command checker 抛错时 endpoint 仍返回 ok。

### 5.3 前端测试

- provider configured/unconfigured 显示正确。
- CLI available/unavailable 显示正确。
- 不渲染 API key。
- demo 模型列表不再作为真实能力展示。

---

## 6. 验收标准

- `GET /system/providers` 可返回 Claude/Gemini/Codex 脱敏状态。
- `GET /system/cli-status` 可返回三套 CLI 可执行状态。
- 前端 Settings 能看到 provider 与 CLI 两类状态。
- API key 不出现在响应、日志、SSE、artifact 中。
- mock 回放与现有测试保持绿色。

---

## 7. 红线

1. 只读取 `API.md` 的 claude/codex/gemini 栏。
2. 不读取、不展示、不落档 API key。
3. 不使用任意系统 provider 环境变量作为 ResearchClaw 默认来源，除非是显式 `RESEARCHCLAW_*` override。
4. Settings 不允许用户随意填 key/base URL。
5. M1 只做状态，不做真实多 CLI 路由。
