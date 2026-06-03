# ResearchClaw 启动运行指南

> 配套《M1进度交接.md》。本文只讲"怎么把服务跑起来 / 测试 / 远程访问 / 排坑"。
> 仓库根目录:`/home/wj/openclaw`。所有命令默认在仓库根执行,除非标注 `cd researchclaw/web`。

---

## 0. 环境要求

- **Node.js** ≥ 18(实测 v24.15.0)。后端**零外部依赖**(用 Node 原生 http / test runner / ES modules)。
- 前端需装依赖:`cd researchclaw/web && npm install`(首次)。
- 无需数据库;状态落盘在 `.researchclaw/projects/`(已 gitignore)。

---

## 1. 最快路线:只看新版 UI(单进程)

新版 React 控制台已构建进 `researchclaw/web/dist`,由后端直接托管。只需起后端:

```bash
cd /home/wj/openclaw
npm run dev            # ResearchClaw 后端,监听 http://127.0.0.1:8787
```

浏览器打开:

- **新版三栏控制台 → http://127.0.0.1:8787/app/**  ← 末尾 `/app/` 不能少
- 旧版手写面板(对照)→ http://127.0.0.1:8787/

> 列表为空?灌一个演示项目(见第 3 节),或直接用界面"新建研究"输入框创建。

---

## 2. 前端开发模式(热重载,改代码实时生效)

需要**两个终端**:

```bash
# 终端 A:后端
cd /home/wj/openclaw
npm run dev                       # :8787

# 终端 B:前端 dev server
cd /home/wj/openclaw/researchclaw/web
npm install                       # 首次
npm run dev                       # Vite :5173,API/SSE 经 proxy 打到 :8787
```

浏览器打开 **http://localhost:5173/app/**。
改 `web/src/**` 即时热更新;`/projects`、`/openclaw` 请求由 Vite 代理到后端。

> 后端不在默认 8787?设 `RESEARCHCLAW_API` 改代理目标:
> `RESEARCHCLAW_API=http://127.0.0.1:9999 npm run dev`(在 web 目录)。

---

## 3. 灌演示数据

```bash
cd /home/wj/openclaw
npm run demo:fixture   # 跑一条完整 mock 流水线,生成一个演示项目
```

或直接在 UI 里用 **"新建研究"** 表单:输入研究方向 → 创建 → 自动进面板停在"契约待审"。

---

## 4. 改了前端后,让后端托管最新版

dev 模式改的代码不会自动进 `dist`。要让 `:8787/app/` 反映最新前端,需重新构建:

```bash
cd /home/wj/openclaw/researchclaw/web
npm run build          # tsc -b(strict)+ vite build → 产物进 web/dist(base=/app/)
```

后端按请求实时读 `dist/`,构建完**无需重启后端**,浏览器 Ctrl+Shift+R 硬刷新即可。

---

## 5. 测试 / 校验

```bash
# 后端(Node 原生 test runner)—— 当前 49/49
cd /home/wj/openclaw
npm test

# 前端(vitest,纯派生逻辑单测)—— 当前 26/26
cd /home/wj/openclaw/researchclaw/web
npm run test

# 前端类型检查(strict)
npm run typecheck
```

> 红线:任何改动后这三条都应保持绿,且 `npm run demo:fixture` 能跑通(全 mock,零模型额度)。

---

## 6. 远程访问(SSH 隧道)+ 常见坑

服务监听 `127.0.0.1`(仅本机)。从你自己的电脑访问,需要 SSH 端口转发。

### 6.1 建隧道

```powershell
# 在你本机(Windows PowerShell / Mac 终端)执行
ssh -N -L 18787:127.0.0.1:8787 wj@<远端IP>
```

然后浏览器开 **http://localhost:18787/app/**。

### 6.2 坑:本地 `bind ... Permission denied`

报 `bind [127.0.0.1]:8787: Permission denied` 是**你本机**绑端口失败(端口被占,或落在 Windows 保留端口段),与远端无关。
**解法:把隧道左边(本地)端口换成高位**,如上例的 `18787`(右边 `127.0.0.1:8787` 是远端后端,不要改)。
排查 Windows 保留段:`netsh interface ipv4 show excludedportrange protocol=tcp`。

### 6.3 坑:`/app/` 返回 404 但 `/projects` 正常 + 新进程 `EADDRINUSE`

说明 8787 被一个**旧版 `server.js` 进程**占着(早于 `/app` 托管路由的版本)。排查并重启:

```bash
# 找出占用 8787 的进程
ss -ltnp | grep 8787            # 看 pid=NNNN
ps -o pid,etime,cmd -p NNNN     # 确认是 node researchclaw/server.js 且已跑很久

# 杀掉并用当前代码重起
kill NNNN
cd /home/wj/openclaw && npm run dev

# 验证 /app 路由已生效
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8787/app/   # 期望 200
```

---

## 7. 路由速查

| 路径 | 内容 |
| --- | --- |
| `GET /app/` | 新版 React 控制台(SPA,客户端路由 basename=`/app`) |
| `GET /` `GET /panel` `GET /panel/:id` | 旧版手写 `ui.js` 面板(保留) |
| `GET /projects` | 项目列表 JSON |
| `GET /projects/:id/state` | 单项目完整 state |
| `GET /projects/:id/artifact?ref=...` | 读 artifact |
| `GET /projects/:id/stream` | SSE,首帧发当前快照,之后广播 `snapshot` |
| `POST /projects/:id/start` | `{research_direction}` 新建并起草契约 |
| `POST /projects/:id/approve` | `{target:"contract"[,artifact_id,artifact_ref]}` |
| `POST /projects/:id/revise` | `{target:"contract",feedback,...}`(feedback 必填非空) |
| `POST /projects/:id/advance` | 推进当前阶段工作流(无 body) |
| `POST /projects/:id/recover` | `{to?}` 从 blocked 回退重跑 |

---

## 8. 环境变量

| 变量 | 默认 | 作用 |
| --- | --- | --- |
| `RESEARCHCLAW_HOST` | `127.0.0.1` | 后端监听地址 |
| `RESEARCHCLAW_PORT` | `8787` | 后端监听端口 |
| `RESEARCHCLAW_API` | `http://127.0.0.1:8787` | (web dev)Vite 代理目标 |

---

## 9. 浏览器里能怎么玩(冒烟自验)

1. 打开 `/app/` → 顶部"新建研究"填方向 → **创建** → 自动进面板,停在"契约待审"。
2. 中栏"待办操作"区点 **批准契约** → 不刷新,经 SSE 自动变"文献侦察"+ 出现 **推进** 按钮。
3. 连点 **推进** → 一段段走完 7 段流水线 → 回到"已完成 / 空闲"。
4. 试 **要求修订** → 填理由 → 提交 → 版本 +1,契约 tab 底部"修订记录"追加你的反馈。
   (mock 不会重写契约主体字段,只递增版本 + 记录反馈,属正常,见交接文档 §5。)
