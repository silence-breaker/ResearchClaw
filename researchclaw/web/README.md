# ResearchClaw 前端控制台（web）

React 18 + TypeScript + Vite + Tailwind 的三栏研究控制台。消费后端（`researchclaw/server.js`，默认 `:8787`）的真实 state，经 SSE 实时更新。

## 开发

```bash
cd researchclaw/web
npm install
npm run dev        # Vite :5173，API/SSE 经 proxy 打到 :8787
```

另开一个终端启动后端：

```bash
# 仓库根目录
npm run dev        # ResearchClaw 后端 :8787
npm run demo:fixture   # 先跑一遍，给 dev store 灌一个 proj_demo_001
```

浏览器打开 <http://localhost:5173/app/>。

## 构建 + 由后端托管

```bash
npm run build      # 产物 -> web/dist（base=/app/）
```

后端会把 `web/dist` 托管在 `/app`（SPA fallback），legacy `ui.js` 仍在 `/` 与 `/panel`。
构建后访问 <http://127.0.0.1:8787/app/>。

## 测试

```bash
npm run typecheck  # tsc -b（strict）
npm run test       # vitest：派生逻辑（pipeline 进度 / 节点状态 / 指标）单测
```

## 范围（M1.2）

- ✅ 项目列表、三栏面板骨架、pipeline 进度、研究契约 tab（只读）、运行指标（进度/gate 通过率/artifact 数）。
- ✅ SSE 实时 snapshot，断线轮询 `/state` 兜底。
- 🟡 右栏模型/对话、阶段状态 / 证据映射 / 变更历史 tab 为占位（M1.3/M1.4）。**不造假数据。**
- 红线：结论只来自 artifact；证据映射必须接 `claimEvidenceGate` 真数据（M1.4）。
