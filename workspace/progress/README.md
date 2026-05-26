# ResearchClaw 开发进度追踪

> 本文件随开发实时更新，记录各里程碑、任务、阻塞项和负责人。

---

## 总览

| 里程碑 | 状态 | 负责人 | 目标日期 | 实际完成 |
|--------|------|--------|----------|----------|
| M1：OpenClaw → Gateway | ⬜ 未开始 | A | — | — |
| M2：Contract → Orchestrator | ⬜ 未开始 | B | — | — |
| M3：Workflow Mock | ⬜ 未开始 | C | — | — |
| M4：OMC 接入 | ⬜ 未开始 | A + C | — | — |

图例：⬜ 未开始 / 🟡 进行中 / 🟢 已完成 / 🔴 阻塞

---

## Milestone 1：OpenClaw → Gateway

**目标**：OpenClaw 事件能稳定打到 ResearchClaw gateway，输出 ResearchSignal。

### 任务清单

| # | 任务 | 负责人 | 状态 | 备注 |
|---|------|--------|------|------|
| 1.1 | 配置 `configs/omc_config.openclaw.json` | A | ⬜ | 路由科研相关 hook |
| 1.2 | 实现 `researchclaw/gateway.ts` | A | ⬜ | payload → ResearchSignal |
| 1.3 | 编写 payload schema 校验 | A | ⬜ | zod / 手写校验 |
| 1.4 | 维护 `fixtures/openclaw/session-start.json` | A | ⬜ | 真实 payload 样本 |
| 1.5 | 维护 `fixtures/openclaw/post-tool-use.json` | A | ⬜ | 真实 payload 样本 |
| 1.6 | 维护 `fixtures/openclaw/stop.json` | A | ⬜ | 真实 payload 样本 |
| 1.7 | 维护 `fixtures/openclaw/ask-user-question.json` | A | ⬜ | 真实 payload 样本 |
| 1.8 | Server smoke test | A | ⬜ | 部署 + 日志验证 |
| 1.9 | 环境变量配置文档 | A | ⬜ | `OMC_OPENCLAW=1` 等 |

### 验收标准
- [ ] `session-start` 能打到 gateway
- [ ] `post-tool-use` 能打到 gateway
- [ ] `stop` 能打到 gateway
- [ ] gateway 能输出符合 schema 的 ResearchSignal
- [ ] 不泄漏 OpenClaw 未白名单字段

### 阻塞项
- 无

---

## Milestone 2：Contract → Orchestrator

**目标**：科研状态机可运行，phase 能推进、能回退、有 gate 约束。

### 任务清单

| # | 任务 | 负责人 | 状态 | 备注 |
|---|------|--------|------|------|
| 2.1 | 定义 `researchclaw/contract.ts` | B | ⬜ | ResearchContract schema |
| 2.2 | 定义 artifact schema | B | ⬜ | 各 phase 产出结构 |
| 2.3 | 定义 phase schema | B | ⬜ | 阶段枚举 + 准入条件 |
| 2.4 | 实现 `researchclaw/orchestrator.ts` | B | ⬜ | 状态机核心 |
| 2.5 | 实现 `researchclaw/state/` | B | ⬜ | 状态读写 |
| 2.6 | 实现 `researchclaw/policies/` | B | ⬜ | baseline/evidence/review gate |
| 2.7 | contract fixture tests | B | ⬜ | valid / missing-field / invalid-phase |
| 2.8 | phase transition tests | B | ⬜ | 推进 + 回退路径 |
| 2.9 | schema version 变更测试 | B | ⬜ | 显式版本化验证 |
| 2.10 | 编写 `docs/contracts/schema.md` | B | ⬜ | 文档化 |
| 2.11 | 编写关键 ADR | B | ⬜ | `docs/adr/` |

### 验收标准
- [ ] contract 缺少 hypothesis / metrics / success_criteria 时失败
- [ ] 非法 phase 必须失败
- [ ] baseline reproduction 失败能回退到 baseline_selection 或 deep_literature_research
- [ ] idea review 不通过能回退到 deep_literature_research 或 idea_generation
- [ ] evidence 不足时阻止进入 summary
- [ ] artifact schema 变更显式版本化
- [ ] claim 能追溯到 evidence

### 阻塞项
- 无（依赖 M1 完成后可联调）

---

## Milestone 3：Workflow Mock

**目标**：workflow 可独立运行、可测试，不依赖真实模型调用。

### 任务清单

| # | 任务 | 负责人 | 状态 | 备注 |
|---|------|--------|------|------|
| 3.1 | 实现 `adapters/claude.ts` | C | ⬜ | mock + real 双模式 |
| 3.2 | 实现 `adapters/gemini.ts` | C | ⬜ | mock + real 双模式 |
| 3.3 | 实现 `adapters/codex.ts` | C | ⬜ | mock + real 双模式 |
| 3.4 | adapter 结构化错误输出 | C | ⬜ | 统一错误格式 |
| 3.5 | 实现 `workflows/literature.ts` | C | ⬜ | 文献侦察 + 深度调研 |
| 3.6 | 实现 `workflows/baseline.ts` | C | ⬜ | 选择 + 复现 |
| 3.7 | 实现 `workflows/experiment.ts` | C | ⬜ | 执行 + 记录 |
| 3.8 | 实现 `workflows/review.ts` | C | ⬜ | idea review + 结果评审 |
| 3.9 | workflow fixture tests | C | ⬜ | input → mock → output |
| 3.10 | adapter mock tests | C | ⬜ | 失败/成功场景 |
| 3.11 | 编写 research skill 模板 | C | ⬜ | `researchclaw/skills/` |
| 3.12 | 维护 `fixtures/workflows/` | C | ⬜ | 输入/预期输出样本 |

### 验收标准
- [ ] 不真实调用模型也能跑通 workflow fixture
- [ ] workflow 输出符合 artifact schema
- [ ] adapter 失败返回结构化错误（不含 API key）
- [ ] workflow 不直接修改全局 state
- [ ] workflow 不绕过 orchestrator 推进阶段

### 阻塞项
- 无（依赖 M2 的 contract / artifact schema 定义）

---

## Milestone 4：OMC 接入

**目标**：ResearchClaw 能驱动 OMC runtime 执行科研任务并回收结果。

### 任务清单

| # | 任务 | 负责人 | 状态 | 备注 |
|---|------|--------|------|------|
| 4.1 | 实现 `adapters/omc.ts` | A + C | ⬜ | ResearchTask → OMC task |
| 4.2 | ResearchTask → OMC task 映射 | A + C | ⬜ | 字段对齐 |
| 4.3 | 调用 OMC team runtime / task router | A + C | ⬜ | 走公开 API |
| 4.4 | 收集 OMC summary / worker result | A + C | ⬜ | 结果解析 |
| 4.5 | Orchestrator 根据 OMC 结果推进/回退 | A + C | ⬜ | 端到端闭环 |
| 4.6 | 端到端 baseline reproduction 测试 | A + C | ⬜ | 真实 OMC 调用 |
| 4.7 | 部署脚本更新 | A | ⬜ | `deploy/` |
| 4.8 | 运行日志收集方案 | A | ⬜ | `logs/` |

### 验收标准
- [ ] 能把一个 baseline reproduction task 发给 OMC
- [ ] 能拿回 worker summary
- [ ] Orchestrator 能根据 summary 推进或回退状态
- [ ] adapters/omc.ts 不绕过 Research Orchestrator 直接写结论

### 阻塞项
- 依赖 M1（gateway 通）、M2（orchestrator 就绪）、M3（workflow 就绪）

---

## 日常事务

| # | 事务 | 负责人 | 状态 | 备注 |
|---|------|--------|------|------|
| D1 | 建立 CODEOWNERS 规则 | 共同 | ⬜ | 路径 → owner 映射 |
| D2 | PR Template 落地 | 共同 | ⬜ | 按规范模板 |
| D3 | CI / 自动化测试 | 共同 | ⬜ | PR 时跑 fixture tests |
| D4 | 开发环境搭建文档 | 共同 | ⬜ | 本地运行指引 |

---

## 会议 / 同步记录

| 日期 | 主题 | 决议 |
|------|------|------|
| — | — | — |

---

## 当前聚焦

> 更新本区域，标明当前 sprint 的重点。

**本周重点**：
1. 
2. 
3. 

---

## 变更日志

| 日期 | 变更内容 | 更新人 |
|------|----------|--------|
| 2026-05-26 | 初始化开发进度文档 | WHC |

---

> 💡 使用方式：每次有进展时直接编辑本文件，把 ⬜ 改为 🟡 或 🟢。遇到阻塞更新"阻塞项"区域，需要同步时更新"会议记录"。
