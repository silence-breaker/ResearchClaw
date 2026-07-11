# ResearchClaw 三套 CLI 接入配置

> 用途：记录 Claude Code / Codex CLI / Gemini CLI 三套 CLI 接入 yunwu.ai 中转的**固定接线方法**。
> 定位：这是**可提交进 git 的接线知识**（不含任何密钥），供 M3 的 `codexCli.js` / `geminiCli.js` adapter 与后续「UI 启动自动配置」功能直接复用。
> 红线：本文件**只记方法，不记 key**。API key 只存在于 gitignored 的 `API.md` 与运行时子进程环境中，禁止进入本文件、git、日志、SSE、artifact。

---

## 0. 秘密与配置的分层

| 内容 | 位置 | 是否进 git |
| --- | --- | --- |
| `api_key` | `API.md`（仓库根，gitignored） | 否 |
| 三个 base_url、`available_models` 白名单 | `API.md` | 否 |
| 接线方法（本文件全部内容） | 本文件 `docs/CLI接入配置.md` | **是** |

`researchclaw/adapters/providers.js` 解析 `API.md` 的 `# claude, codex, gemini` 栏，读出 `api_key` / 三个 base_url / models。本文件补充 providers.js **不覆盖**的那部分——每套 CLI 各自的启动参数与环境注入方式。

---

## 1. model → CLI → 端点映射（yunwu.ai 同一 key，不同协议入口）

同一个 yunwu.ai api key，三种协议走**不同入口**：

| provider | CLI | 协议 | base_url | 模型 |
| --- | --- | --- | --- | --- |
| claude | Claude Code | Anthropic Messages | `https://yunwu.ai` | `claude-haiku-4-5-20251001` |
| codex | Codex CLI | OpenAI（Responses） | `https://yunwu.ai/v1` | `gpt-5.4-mini` |
| gemini | Gemini CLI | Google Gemini | `https://yunwu.ai` | `gemini-3.1-flash-lite` |

要点：yunwu.ai **不是**「一个万能 Anthropic 端点转发所有模型」，它按协议分流。因此三套 CLI 必须各自用自己的协议入口，这也是 V3 坚持「三套独立 CLI」而非「单 CLI 多模型」的技术根因。

---

## 2. Claude Code CLI（已验证 · V2 在用）

- 环境变量：`ANTHROPIC_BASE_URL=https://yunwu.ai`、`ANTHROPIC_API_KEY=<key>`、模型 `claude-haiku-4-5-20251001`。
- 双通道：`stream-json`（过程流）+ `out.json`（结构化 artifact），见 `researchclaw/adapters/claudeCode.js`。
- 状态：**已验证可用**（V2 主链路一直在用）。

---

## 3. Codex CLI（已验证 · 2026-07-11 冒烟通过）

### 3.1 关键结论

- Codex CLI 默认打 OpenAI **Responses API**（`/v1/responses`）。
- **实测：配好命名 provider 后，`wire_api = "responses"` 可通；`"chat"` 不通。** 以实测为准。
- 直接用默认内置 `openai` provider（仅设 `OPENAI_BASE_URL` env）会 `403 Forbidden`（「该令牌无权访问模型」）——必须显式声明一个**命名 provider** 并指定 `wire_api`、`base_url`、`env_key`。
- 模型、key、套餐本身无问题：curl 直打 `https://yunwu.ai/v1/chat/completions` 用 `gpt-5.4-mini` 正常返回。

### 3.2 已验证可用的调用（PowerShell 冒烟）

```powershell
$env:OPENAI_API_KEY = "<key，从环境注入，勿写入文件>"

codex exec --skip-git-repo-check `
  -c 'model_providers.yunwu.name="yunwu"' `
  -c 'model_providers.yunwu.base_url="https://yunwu.ai/v1"' `
  -c 'model_providers.yunwu.env_key="OPENAI_API_KEY"' `
  -c 'model_providers.yunwu.wire_api="responses"' `
  -c 'model_provider="yunwu"' `
  --model gpt-5.4-mini `
  "Reply with exactly: CODEX_OK"
```

### 3.3 adapter（`codexCli.js`）拼 argv 模板

spawn `codex` 时**必须**注入以下参数，不能靠 codex 默认：

- 子命令：`exec`（非交互）。
- `--skip-git-repo-check`：绕过「trusted directory」前置检查。
- `-c model_providers.<name>.base_url="<openai_base_url>"`（取自 API.md）。
- `-c model_providers.<name>.env_key="OPENAI_API_KEY"`（key 走子进程 env，不进 argv）。
- `-c model_providers.<name>.wire_api="responses"`。
- `-c model_provider="<name>"`。
- `--model <codex_model>`（取自 API.md 白名单）。
- 子进程 env 注入 `OPENAI_API_KEY`（**不放进 argv、不落 raw_log**）。

### 3.4 M5 遗留约束

- Codex 有 `sandbox`（冒烟输出 `sandbox: read-only`）与 trusted-directory 机制。`experiment_execution`（M5）要它跑实验命令时，`--skip-git-repo-check` 与 sandbox 策略必须正式设计，冒烟阶段的临时绕过不能照搬进生产。

---

## 4. Gemini CLI（已验证 · 2026-07-11 冒烟通过）

### 4.1 关键结论

- 版本：`gemini` v0.47.0（Google 官方 gemini-cli）。
- 命令行**无** base_url 开关；base_url 与 auth 走环境变量 + `~/.gemini/settings.json`。
- 踩过三个坑，逐个已解：
  1. `Invalid auth method selected` → `~/.gemini/settings.json` 未声明认证方式。
  2. `Unexpected token '锘?, ... is not valid JSON` → settings.json 被 PowerShell `Set-Content -Encoding utf8` 写入了 **UTF-8 BOM**，gemini 解析器不吃 BOM。必须写**无 BOM** UTF-8。
  3. `not running in a trusted directory` → 需 `--skip-trust`（或 `GEMINI_CLI_TRUST_WORKSPACE=true`）。

### 4.2 已验证可用的调用（PowerShell 冒烟）

第一步：`~/.gemini/settings.json`，**无 BOM UTF-8**，声明 API key 认证：

```json
{
  "security": {
    "auth": {
      "selectedType": "gemini-api-key"
    }
  }
}
```

> 写入务必无 BOM。PowerShell 用 `[System.IO.File]::WriteAllText(path, json)`（默认无 BOM），
> **不要**用 `Set-Content -Encoding utf8`（PS5.x 会加 BOM）。

第二步：注入 env + `--skip-trust` 跑：

```powershell
$env:GEMINI_API_KEY = "<key，从环境注入，勿写入文件>"
$env:GOOGLE_GEMINI_BASE_URL = "https://yunwu.ai"

gemini --skip-trust -m gemini-3.1-flash-lite -p "Reply with exactly: GEMINI_OK"
```

（`Warning: 256-color ...` 与 `Ripgrep is not available` 为无害 warning，不影响结果。）

### 4.3 adapter（`geminiCli.js`）拼 argv 模板

spawn `gemini` 时必须：

- `-p "<prompt>"`：非交互 headless 模式。
- `-m <gemini_model>`：取自 API.md 白名单（`gemini-3.1-flash-lite`）。
- `--skip-trust`：绕过 trusted-directory 门禁。
- 前置确保 `~/.gemini/settings.json` 存在且**无 BOM**，声明 `gemini-api-key` 认证。
- 子进程 env 注入 `GEMINI_API_KEY` + `GOOGLE_GEMINI_BASE_URL`（取自 API.md，**不进 argv、不落 raw_log**）。

### 4.4 遗留观察

- gemini headless 输出是纯文本，无 codex/claude 那种「过程流 + 结构化 JSON 双通道」。M3 要 gemini 出结构化 artifact 时，需在 prompt 内约束 JSON 输出并由 adapter 抠取/校验，schema 校验失败不得推进 phase。

---

## 5. 对「UI 启动自动配置」的接口

后续「用户只选模型、系统自动接线」功能应：

1. 从 `API.md` 读 `api_key` + 三个 base_url + `available_models`（复用 `providers.js`）。
2. 从**本文件对应的常量表/配置**（建议落成 `researchclaw/adapters/cliProfiles.js`）读每套 CLI 的接线参数（codex 的 `wire_api`/`--skip-git-repo-check`、gemini 的 settings.json 结构等）。
3. 用户在 Settings 只选 phase→model；系统据映射自动拼 CLI argv + 子进程 env。
4. key 只在子进程 env 注入，全程不进前端、日志、artifact。

> 建议：本文档的 §3.3 / §4.2 参数将来固化为 `cliProfiles.js` 常量，代码与文档保持单一事实源，改参数先改常量、文档同步。

---

## 6. 冒烟记录

| 日期 | CLI | 结果 | 备注 |
| --- | --- | --- | --- |
| （V2 期） | Claude Code | ✅ 通过 | 主链路在用 |
| 2026-07-11 | Codex CLI | ✅ 通过 | `wire_api="responses"` + 命名 provider + `--skip-git-repo-check` |
| 2026-07-11 | Gemini CLI | ✅ 通过 | 无 BOM settings.json（`gemini-api-key`）+ `GOOGLE_GEMINI_BASE_URL` + `--skip-trust` |

---

## 7. 三套 CLI 的共性约束（adapter 层统一处理）

1. **trusted-directory 门禁**：codex 用 `--skip-git-repo-check`，gemini 用 `--skip-trust`（或 `GEMINI_CLI_TRUST_WORKSPACE=true`）。三套 adapter spawn 时都要显式带各自开关。此门禁与 M5 `experiment_execution` 的沙箱策略是同一类问题，需在 adapter 层统一设计，冒烟期的临时绕过不能照搬进生产。
2. **key 只走子进程 env**：三套都通过 env 注入 key（`ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY`），绝不进 argv、raw_log、SSE、artifact。
3. **base_url 显式钉死**：不能依赖任一 CLI 的默认端点（codex 默认 `/v1/responses` 会 403，gemini 默认打 Google 官方端点）。均从 API.md 读 base_url 显式注入。
4. **结构化输出差异**：claude 有双通道（stream-json + out.json）；codex/gemini headless 输出需 adapter 抠取/校验 JSON。schema 校验失败一律不得推进 phase。
