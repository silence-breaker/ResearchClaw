# ResearchClaw 启动运行指南

> 覆盖 M0–M4（引擎/gate/证据闭环 → 实时面板 → 真实 Claude workflow → consult 一问一答 → 指标/成本告警）。
> 本文只讲「怎么把服务跑起来 / 接真实 Claude / 测试 / 远程访问 / 排坑」。
> 仓库根目录:`/home/wj/openclaw`。所有命令默认在仓库根执行,除非标注 `cd researchclaw/web`。

---

## 0. 环境要求

- **Node.js** ≥ 20。后端**零外部依赖**(Node 原生 http / test runner / ES modules)。
- 前端首次需装依赖:`cd researchclaw/web && npm install`。
- 无需数据库;状态落盘在 `.researchclaw/projects/`(已 gitignore)。
- **接真实 Claude(可选)**:本机需有 `claude` 可执行(Claude Code CLI),且已能正常调用(订阅登录或 API token 均可)。不接也能跑——全 mock。

---

## 1. 两种运行模式(最重要,先看这张表)

| 模式 | 启动命令 | contract 起草 / 各 phase | **consult 一问一答** | 花不花钱 |
| --- | --- | --- | --- | --- |
| **mock(默认)** | `npm run dev` | 全部 mock 回放,产物来源徽章 = `mock` | ❌ **不可用**,输入框提示「Claude 未接入」 | 零模型额度 |
| **真实 Claude** | `RESEARCHCLAW_ENABLE_CLAUDE=1 npm run dev` | `contract_draft` 由真实 Haiku 产出过 gate;失败/无 key 优雅降级 mock | ✅ 可用,点 Claude 发消息走真实 Haiku | 走 Haiku,**默认最便宜** |

> **为什么 consult 默认不可用?** 这是 v2 红线:workflow 模式失败可退回 mock 保流程,但 consult 没有要续命的 pipeline,假造一段对话会破坏「结论只来自真实证据」。所以没接真实 Claude 时,consult **诚实拒绝**,绝不给 mock 假回答。要用一问一答,**必须**加 `RESEARCHCLAW_ENABLE_CLAUDE=1`。

---

## 2. 最快路线:mock 模式看新版 UI(单进程,零额度)

新版 React 控制台已构建进 `researchclaw/web/dist`,由后端直接托管。只需起后端:

```bash
cd /home/wj/openclaw
npm run dev            # ResearchClaw 后端,监听 http://127.0.0.1:8787
```

浏览器打开:

- **新版三栏控制台 → http://127.0.0.1:8787/app/**  ← 末尾 `/app/` 不能少
- 旧版手写面板(对照)→ http://127.0.0.1:8787/

> 列表为空?灌一个演示项目(`npm run demo:fixture`,见 §5),或直接用界面"新建研究"输入框创建。
> 此模式下右栏 consult 输入框可点开,但发消息会提示「Claude 未接入」——属正常,要真用见 §3。

---

## 3. 接真实 Claude(workflow + consult 全开)

```bash
cd /home/wj/openclaw
RESEARCHCLAW_ENABLE_CLAUDE=1 npm run dev
```

启动成功会打印一行(看到它就对了):

```
[researchclaw] Claude Code enabled for contract_draft (model=<haiku-id>, endpoint=<...>).
```

此时:

- **新建研究** → `contract_draft` 由真实 Haiku 起草,右栏实时滚动 CLI 过程,产物来源徽章 = `claude`。
- **右栏点 Claude** → 输入框解锁 → 发消息走真实 Haiku 一问一答;每轮入过程流,可「提升为 artifact」。

### 3.1 ⚠️ 本机中转站的模型 id 坑(接 CLI 必踩)

本机 `claude` 走 **cc-switch 中转站**,有三个坑(详见《M2进度交接》§2):

1. 中转站默认 `ANTHROPIC_MODEL` 是 **Opus**——headless 调用绝不能跟默认走(成本红线),代码已强制 `--model` 指定 Haiku。
2. 中转站的 Haiku 是**带日期全 id**(如 `claude-haiku-4-5-20251001`),**裸别名 `claude-haiku-4-5` 会 503 挂死**。
3. 普通 shell 取不到 `~/.claude/settings.json` 的 env → 代码用 `resolveClaudeModel()` 兜底直接读 settings.json 的 `ANTHROPIC_DEFAULT_HAIKU_MODEL`。

**所以正常情况你什么都不用设**,启动就用对的 Haiku id。模型解析优先级:
`RESEARCHCLAW_MODEL`(进程 env) → `ANTHROPIC_DEFAULT_HAIKU_MODEL`(进程 env) → `~/.claude/settings.json` 同名 → 裸别名兜底。

如要强制指定:
```bash
RESEARCHCLAW_ENABLE_CLAUDE=1 RESEARCHCLAW_MODEL=claude-haiku-4-5-20251001 npm run dev
```

### 3.2 ResearchClaw 专用供应商(可选,覆盖 cc-switch 但不改它)

若想让 ResearchClaw 单独走另一套 API(如 `yunwu.ai`)而**不动全局 cc-switch、不影响其它项目**:

- 在仓库根放 **`API.md`**(已 gitignore,含密钥,**勿提交**),`# claude, codex, gemini` 段填 `API_key` / `claude_base_url` / `available_models`。
- 启动时自动逐进程覆盖子进程的 `ANTHROPIC_BASE_URL` / `ANTHROPIC_AUTH_TOKEN`,父进程与全局配置原样不动。
- 也可用 env 覆盖 claude:`RESEARCHCLAW_ANTHROPIC_BASE_URL` / `RESEARCHCLAW_ANTHROPIC_API_KEY` / `RESEARCHCLAW_MODEL`。
- 缺 `API.md` → 回退继承 cc-switch 端点 + `resolveClaudeModel()`(就是 §3.1 的默认行为)。

### 3.3 成本护栏(默认就有,可调)

```bash
RESEARCHCLAW_ENABLE_CLAUDE=1 \
RESEARCHCLAW_SESSION_BUDGET_USD=0.50 \   # 会话级预算;超过 80% warn,超过 100% over(暂停 CLI 调用)
npm run dev
```

面板"本会话成本"指标:含 cache token 的真实估算;接近上限琥珀高亮,超限红条「CLI 已暂停」。无 key/超限/失败时 workflow 优雅降级 mock(consult 则诚实拒绝),进程不崩。

---

## 4. 前端开发模式(热重载,改代码实时生效)

需要**两个终端**:

```bash
# 终端 A:后端(要试 consult 就加开关)
cd /home/wj/openclaw
RESEARCHCLAW_ENABLE_CLAUDE=1 npm run dev      # :8787(纯 mock 就去掉开关)

# 终端 B:前端 dev server
cd /home/wj/openclaw/researchclaw/web
npm install                                   # 首次
npm run dev                                   # Vite :5173,API/SSE 经 proxy 打到 :8787
```

浏览器打开 **http://localhost:5173/app/**。改 `web/src/**` 即时热更新;`/projects`(含 consult/stream)与 `/openclaw` 请求由 Vite 代理到后端。

> 后端不在默认 8787?设 `RESEARCHCLAW_API` 改代理目标:
> `RESEARCHCLAW_API=http://127.0.0.1:9999 npm run dev`(在 web 目录)。

---

## 5. 灌演示数据

```bash
cd /home/wj/openclaw
npm run demo:fixture   # 跑一条完整 mock 流水线,生成一个演示项目(零额度)
```

或直接在 UI 用 **"新建研究"** 表单:输入研究方向 → 创建 → 自动进面板停在"契约待审"。

---

## 6. 改了前端后,让后端托管最新版

dev 模式改的代码不会自动进 `dist`。要让 `:8787/app/` 反映最新前端,需重新构建:

```bash
cd /home/wj/openclaw/researchclaw/web
npm run build          # tsc -b(strict)+ vite build → 产物进 web/dist(base=/app/)
```

后端按请求实时读 `dist/`,构建完**无需重启后端**,浏览器 Ctrl+Shift+R 硬刷新即可。

---

## 7. 测试 / 校验

```bash
# 后端(Node 原生 test runner)—— 当前 151/151,全 mock 零额度
cd /home/wj/openclaw
npm test

# 前端(vitest,纯派生逻辑单测)—— 当前 100/100
cd /home/wj/openclaw/researchclaw/web
npm run test

# 前端类型检查(strict)
npm run typecheck

# 前端构建(顺带跑 tsc)
npm run build
```

> 红线:任何改动后这四条都应保持绿,且 `npm run demo:fixture` 能跑通(全 mock,零模型额度,CI 不真调 CLI)。

---

## 8. 真实端到端冒烟(本地,**会花钱**)

验证 V1/V2/V7/V10(真实 Haiku 起草过 gate → approve → consult 一问一答 → promote → 成本/cache/预算):

```bash
cd /home/wj/openclaw
npm run smoke:claude   # = RESEARCHCLAW_ENABLE_CLAUDE=1 node researchclaw/scripts/smoke-claude.js
```

- 没设 `RESEARCHCLAW_ENABLE_CLAUDE=1` 会拒绝运行(防误花钱)。
- 跑完写 `logs/smoke-<ts>.json`(已 gitignore),含每步 phase / artifact ref / `state.usage`(token/cache/cost/budget)/ 是否降级。
- **不进 CI**:真调 CLI、花钱,仅本地联调用。

---

## 9. 远程访问(SSH 隧道)+ 常见坑

服务监听 `127.0.0.1`(仅本机)。从你自己的电脑访问,需要 SSH 端口转发。

### 9.1 建隧道

```powershell
# 在你本机(Windows PowerShell / Mac 终端)执行
ssh -N -L 18787:127.0.0.1:8787 wj@<远端IP>
```

然后浏览器开 **http://localhost:18787/app/**。

### 9.2 坑:本地 `bind ... Permission denied`

报 `bind [127.0.0.1]:8787: Permission denied` 是**你本机**绑端口失败(端口被占,或落在 Windows 保留端口段),与远端无关。
**解法:把隧道左边(本地)端口换成高位**,如上例的 `18787`(右边 `127.0.0.1:8787` 是远端后端,不要改)。
排查 Windows 保留段:`netsh interface ipv4 show excludedportrange protocol=tcp`。

### 9.3 坑:`/app/` 返回 404 但 `/projects` 正常 + 新进程 `EADDRINUSE`

说明 8787 被一个**旧版 `server.js` 进程**占着。排查并重启:

```bash
ss -ltnp | grep 8787            # 看 pid=NNNN
ps -o pid,etime,cmd -p NNNN     # 确认是 node researchclaw/server.js
kill NNNN
cd /home/wj/openclaw && npm run dev
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8787/app/   # 期望 200
```

---

## 10. 路由速查

| 路径 | 内容 |
| --- | --- |
| `GET /app/` | 新版 React 控制台(SPA,客户端路由 basename=`/app`) |
| `GET /` `GET /panel` `GET /panel/:id` | 旧版手写 `ui.js` 面板(保留) |
| `GET /projects` | 项目列表 JSON |
| `GET /projects/:id/state` | 单项目完整 state |
| `GET /projects/:id/artifact?ref=...` | 读 artifact |
| `GET /projects/:id/evidence` | 实时 claim→artifact 证据映射(claimEvidenceGate) |
| `GET /projects/:id/stream` | SSE,首帧发当前快照,之后广播 `snapshot` / `cli_chunk` / `consult_message` |
| `POST /projects/:id/start` | `{research_direction}` 新建并(异步)起草契约 |
| `POST /projects/:id/approve` | `{target:"contract"[,artifact_id]}` |
| `POST /projects/:id/revise` | `{target:"contract",feedback}`(feedback 必填非空,异步) |
| `POST /projects/:id/advance` | 推进当前阶段工作流(无 body) |
| `POST /projects/:id/recover` | `{to?}` 从 blocked 回退重跑 |
| `POST /projects/:id/consult` | `{message}` **一问一答**(需 `ENABLE_CLAUDE=1`,否则返回 `unavailable`) |
| `POST /projects/:id/consult/promote` | `{raw_log_ref,note?}` 把某轮 consult 提升为 `consult_note` |
| `POST /projects/:id/archive` `/unarchive` `/delete` | 归档 / 取消归档 / 永久删除 |
| `POST /openclaw/hooks` | OpenClaw hook 入口(keyword-detector 触发 start_research,异步) |

---

## 11. 环境变量

| 变量 | 默认 | 作用 |
| --- | --- | --- |
| `RESEARCHCLAW_ENABLE_CLAUDE` | (未设) | `=1` 才接真实 Claude;**consult 一问一答必需**。不设则全 mock。 |
| `RESEARCHCLAW_MODEL` | (解析) | 强制指定模型 id;不设则 `resolveClaudeModel()` 兜底(见 §3.1)。非 Haiku 会告警。 |
| `RESEARCHCLAW_MAX_TURNS` | `20` | 单次 workflow CLI 运行 turn 上限(consult 另在内部封顶 8)。 |
| `RESEARCHCLAW_TIMEOUT_MS` | `120000` | 单次 CLI 运行超时(ms),超时 kill 并标 fail。 |
| `RESEARCHCLAW_SESSION_BUDGET_USD` | (无) | 会话级预算;超过即 `over`,暂停 CLI 调用。 |
| `RESEARCHCLAW_BUDGET_WARN_RATIO` | `0.8` | 预算告警阈值(达到比例显琥珀 warn)。 |
| `RESEARCHCLAW_ANTHROPIC_BASE_URL` | (无) | 覆盖 claude 子进程端点(优先于 API.md)。 |
| `RESEARCHCLAW_ANTHROPIC_API_KEY` | (无) | 覆盖 claude 子进程 token(优先于 API.md)。 |
| `RESEARCHCLAW_HOST` | `127.0.0.1` | 后端监听地址。 |
| `RESEARCHCLAW_PORT` | `8787` | 后端监听端口。 |
| `RESEARCHCLAW_API` | `http://127.0.0.1:8787` | (web dev)Vite 代理目标。 |

---

## 12. 浏览器里能怎么玩(冒烟自验)

**mock 即可**:

1. 打开 `/app/` → 顶部"新建研究"填方向 → **创建** → 自动进面板,停在"契约待审"。
2. 中栏"待办操作"区点 **批准契约** → 不刷新,经 SSE 自动变"文献侦察"+ 出现 **推进** 按钮。
3. 连点 **推进** → 一段段走完 7 段流水线 → 回到"已完成 / 空闲"。
4. 试 **要求修订** → 填理由 → 提交 → 版本 +1,契约 tab 底部"修订记录"追加反馈。
5. 顶部指标行看 **总体进度 / gate 通过率 / 证据覆盖率 / artifact 数 / 当前阶段已用时**。

**接真实 Claude(`ENABLE_CLAUDE=1`)再加**:

6. 新建研究 → 右栏实时滚动真实 CLI 过程,契约产物来源徽章 = `claude`,指标行"本会话成本"出现真实数字(含 cache)。
7. 右栏点 **Claude** → 输入框解锁 → 发一条消息 → 流式回显 → 该轮入过程流,点 **提升为 artifact** → 出现在"采纳笔记(consult,未过 gate)"分区。

---

## 13. 排坑速查

| 现象 | 原因 / 解法 |
| --- | --- |
| consult 输入框发消息提示 **「Claude 未接入」** | 后端没加 `RESEARCHCLAW_ENABLE_CLAUDE=1`。改用 `RESEARCHCLAW_ENABLE_CLAUDE=1 npm run dev`,看到 `Claude Code enabled...` 那行即可。 |
| 启动时警告 **`...but no claude binary found — staying on mock`** | 加了开关但 `claude` 不在 PATH。`command -v claude` 确认;装好/加 PATH 再起。 |
| 接了 Claude 但起草卡死 / 503 | 多半是裸别名 Haiku id(§3.1)。确认 `~/.claude/settings.json` 有 `ANTHROPIC_DEFAULT_HAIKU_MODEL`,或显式 `RESEARCHCLAW_MODEL=claude-haiku-4-5-20251001`。 |
| consult 提示 **「超出会话预算」** | 命中 `RESEARCHCLAW_SESSION_BUDGET_USD`。调高或新开会话(重启后台 CostTracker 清零)。 |
| 契约产物徽章是 `mock` 但我开了开关 | 该 phase 被降级了(无 key / 失败 / 超预算)。面板顶部应有琥珀降级 banner;查后端日志的失败码。 |
| `/app/` 空白 / 旧界面 | 改了前端没重新 `npm run build`(§6),或 8787 被旧进程占(§9.3)。 |

---

## 14. 关键参考
- 《progress/第二版/研究工作流页面开发/》— M0–M4 各里程碑技术路线与进度交接。
- 《M2进度交接.md》§2 — 本机模型/中转站三坑、API.md 供应商。
- 《第二版技术路线指南.md》§2.1 两通道红线、§6 指标、§7 成本安全。
