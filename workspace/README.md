# ResearchClaw 开发思路

> 基于《ResearchClaw三人分工与协作规范》的落地执行路线图。
> 核心原则：**OMC 代码零修改**，ResearchClaw 作为独立模块通过 hook/gateway 接入。

---

## 一、项目定位

ResearchClaw = 面向科研流程的 AI 助手。不是替代 OMC，而是**借 OMC 的 event 入口和 multi-agent runtime，跑科研状态机**。

```text
OpenClaw (OMC)          ResearchClaw              OMC Runtime
   hook event    ──▶    gateway.ts               (team / worker)
     signal     ──▶    orchestrator.ts    ──▶    adapters/omc.ts
                            │                           │
                            ▼                           ▼
                      workflows/*.ts              Claude/Gemini/Codex
                    (literature/baseline/
                     experiment/review)
```

- **OpenClaw**：只当事件入口，不改源码。
- **ResearchClaw**：科研大脑，状态机 + workflow 编排。
- **OMC Runtime**：执行层，team dispatch / task router。
- **Providers**：可替换的 worker（Claude / Gemini / Codex）。

---

## 二、目录结构规划

在 `openclaw/` 仓库中，**新建** `researchclaw/` 目录，与 `oh-my-claude-code/` 平级：

```text
openclaw/
  oh-my-claude-code/          # OMC 源码，只读不改
    src/
      hooks/                  # 已有 hook 体系
      openclaw/               # event / signal / dispatcher
      autoresearch/           # 现有 autoresearch 可参考，但不耦合
      ...

  researchclaw/               # 本项目的全部代码
    gateway.ts                # 接收 OpenClaw payload → ResearchSignal
    orchestrator.ts           # 科研状态机，阶段推进/回退
    contract.ts               # ResearchContract / Artifact / Phase schema
    state/                    # 状态持久化（内存 + 可选文件）
    policies/                 # gate 策略（baseline gate / evidence gate / review gate）
    workflows/
      literature.ts           # 文献侦察、文献卡片、深度调研
      baseline.ts             # baseline 选择、复现、日志记录
      experiment.ts           # 实验执行、结果记录
      review.ts               # idea review、结果评审、证据检查
    adapters/
      omc.ts                  # 对接 OMC team runtime / task router
      claude.ts               # Claude provider 适配
      gemini.ts               # Gemini provider 适配
      codex.ts                # Codex provider 适配
    skills/                   # OMC research skill 模板
    __tests__/                # 单元测试 + fixture tests

  fixtures/
    openclaw/                 # 真实 OpenClaw payload fixture（A 维护）
    workflows/                # workflow 输入/输出 fixture（C 维护）
    contracts/                # contract valid/invalid fixture（B 维护）

  configs/
    omc_config.openclaw.json  # OMC hook 配置（A 维护）

  deploy/                     # 部署脚本（A 维护）
  logs/                       # 运行日志（A 维护）
  docs/
    contracts/                # contract schema 文档（B 维护）
    adr/                      # 架构决策记录（B 维护）
```

---

## 三、四层架构边界

| 层级 | 职责 | 能做 | 绝对不能做 |
|------|------|------|-----------|
| **Gateway** | 接收 OpenClaw payload | 校验 schema、转 ResearchSignal | 决定科研阶段 |
| **Contract** | 定义 schema | 约束字段、版本、evidence 追溯 | — |
| **Orchestrator** | 状态机 | 推进/回退 phase、检查 gate | 直接调 Claude/Gemini/Codex |
| **Workflow** | 具体科研动作 | 读 contract/state、输出 artifact | 绕过 contract、改全局 state |
| **Adapter** | 外部调用 | 调模型/OMC、返回结构化错误 | 做科研判断、改 research state |

---

## 四、科研状态机（Phase Flow）

```text
contract_draft
  └──▶ literature_scouting          # 文献侦察
         └──▶ baseline_selection    # 选 baseline
                └──▶ baseline_reproduction   # 复现 baseline
                       ├──▶ [失败] ──▶ back to baseline_selection / deep_literature_research
                       └──▶ [成功] ──▶ deep_literature_research
                                              └──▶ idea_generation
                                                     └──▶ idea_review
                                                            ├──▶ [不通过] ──▶ back to deep_literature_research
                                                            └──▶ [通过] ──▶ implementation
                                                                                └──▶ experiment
                                                                                         └──▶ result_review
                                                                                                  ├──▶ [不通过] ──▶ back to experiment / implementation
                                                                                                  └──▶ [通过] ──▶ summary
```

关键点：
- 每个 phase 有**准入条件（gate）**，由 orchestrator 检查。
- 失败必须能**回退**，不能死锁。
- evidence 不足时，不能进入 summary。

---

## 五、开发节奏：四阶段里程碑

### Milestone 1：OpenClaw → Gateway（A 主导）

目标：让 OpenClaw 的事件能稳定打到 ResearchClaw。

- 配置 `omc_config.openclaw.json`，把科研相关 hook 路由到 ResearchClaw。
- 实现 `gateway.ts`：接收 payload → 校验 → 转 ResearchSignal。
- 维护 `fixtures/openclaw/` 下的真实 payload fixture（session-start / post-tool-use / stop / ask-user-question）。
- server smoke test，贴日志。

### Milestone 2：Contract → Orchestrator（B 主导）

目标：科研状态机跑通，phase 能推进能回退。

- 定义 `contract.ts`：ResearchContract schema（hypothesis / metrics / success_criteria）。
- 实现 `orchestrator.ts`：phase 流转 + gate 检查。
- 写 phase transition tests：baseline 失败回退、idea review 不通过回退、evidence 不足阻止 summary。
- 写 contract fixture tests：缺字段失败、非法 phase 失败、schema 版本变更显式化。
- 维护 `docs/contracts/` 和 `docs/adr/`。

### Milestone 3：Workflow Mock（C 主导）

目标：workflow 可执行、可测试，不依赖真实模型。

- 实现 `workflows/literature.ts`、`baseline.ts`、`review.ts`。
- 实现 `adapters/claude.ts`、`gemini.ts`、`codex.ts`。
- 所有 adapter 支持 **mock 模式**，用 fixture 代替真实 API 调用。
- 写 workflow fixture tests：输入 fixture → mock provider → 输出 artifact，验证符合 schema。
- 维护 `fixtures/workflows/` 和 `researchclaw/skills/`。

### Milestone 4：OMC 接入（A + C 协作）

目标：ResearchClaw 能真正驱动 OMC runtime 干活。

- 实现 `adapters/omc.ts`：ResearchTask → OMC task 映射。
- 对接 OMC team runtime / task router。
- 收集 OMC summary / worker result。
- 端到端测试：把一个 baseline reproduction task 发给 OMC → 拿结果 → Orchestrator 推进/回退。

---

## 六、技术选型与约束

| 项 | 选择 | 理由 |
|----|------|------|
| 语言 | TypeScript | 与 OMC 同构，便于类型共享 |
| 状态存储 | 内存优先 + 可选 JSON 文件 | 简单可控，避免引入数据库复杂度 |
| 测试 | Vitest / Node Test Runner | fixture-based 测试为主 |
| 模型调用 | Adapter 模式 | 统一接口，provider 可替换 |
| OMC 集成 | Hook + Task Router | 不改 OMC 源码，只走公开机制 |

---

## 七、协作红线

1. **OMC 源码（`oh-my-claude-code/src/`）默认不动**。必须修改时，三人共同 review，并写清理由。
2. **Gateway 不做阶段判断**，只做 payload 转换。
3. **Workflow 不改全局 state**，输出 artifact 交给 orchestrator 处理。
4. **Adapter 不做科研判断**，只负责调用和错误包装。
5. **修改别人负责的模块，必须对应 owner review**。
6. **改 contract / schema / phase，必须 B review**。

---

## 八、日常开发流程

```text
feature branch (本地)
  └──▶ 开发 / 单元测试
         └──▶ PR
                └──▶ Owner Review
                       └──▶ Fixture / Mock Tests 通过
                              └──▶ A 在服务器部署/拉取
                                     └──▶ A 贴回真实 OpenClaw logs
                                            └──▶ 根据日志修复 → 循环
```

- A 负责部署和采样，**不替别人修 bug**。
- B 和 C 应该能在本地通过 fixture 复现大部分逻辑，**不依赖服务器**。

---

## 九、风险与应对

| 风险 | 应对 |
|------|------|
| OMC hook event 不够用 | 先用 gateway 层 workaround，确实不行再提 OMC 修改 PR |
| 模型输出不稳定 | workflow 用结构化输出（JSON mode），adapter 做容错 |
| 状态机过于复杂 | 先跑通主路径（contract → baseline → experiment → summary），再补分支 |
| 多人修改冲突 | CODEOWNERS + PR template + 明确 scope |
| 测试依赖真实模型 | mock adapter + fixture，CI 不跑真实调用 |

---

## 十、一句话总结

> **OpenClaw 是门铃，ResearchClaw 是大脑，OMC 是手脚，Claude/Gemini/Codex 是可替换的肌肉。**
> 
> 先把门铃连到大脑（M1），再让大脑学会思考（M2），再让手脚能动作（M3），最后真正跑起来（M4）。
