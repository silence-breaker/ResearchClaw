# OpenClaw-first Demo 开发指南

本文档面向不熟悉 ResearchClaw 业务背景的开发者，用于实现第一版 `OpenClaw-first` 科研助手 demo。

来源依据：

- `科研助手架构批判分析.md`
- `科研方法论.md`
- `ResearchClaw三人分工与协作规范.md`
- `oh-my-claude-code/dist/openclaw/*` 中已有 OpenClaw gateway 实现

## 0. 如何使用本文档

如果你是第一次接触这个业务，建议按下面顺序阅读：

| 角色 | 先读章节 |
| --- | --- |
| 项目负责人 | 1、2、3、17、18、21 |
| Gateway 开发 | 6、7、14、16.1、17 |
| Workflow Engine 开发 | 8、9、10、11、16.2、16.3 |
| Workflow / Adapter 开发 | 12、13、16.4 |
| 联调与验收 | 15、16.5、18 |

最终交付物至少包括：

- `researchclaw/` demo 代码骨架。
- `/openclaw/hooks` HTTP endpoint。
- `configs/omc_config.openclaw.example.json`。
- `fixtures/openclaw/*.json`。
- `research contract` schema。
- phase state machine。
- mock adapter。
- filesystem evidence store。
- `pnpm demo:fixture` 或等价离线回放脚本。
- gateway、contract、engine transition、workflow fixture 测试。

## 1. 一句话目标

第一版 demo 要证明：

```text
OpenClaw 可以触发 ResearchClaw；
ResearchClaw 可以用 contract、state、evidence 管住科研流程；
人在关键节点可以 approve / revise；
OMC 不进入 demo 核心链路。
```

不要把第一版做成完整自动科研系统。第一版只跑通一个可解释、可验收、可回放的小闭环。

## 2. 开发者先理解这三件事

### 2.1 OpenClaw-first 是什么

`OpenClaw-first` 不是把科研流程写进 OpenClaw 源码，而是让 OpenClaw 只做入口层：

```text
OpenClaw hook event
  -> OpenClaw gateway payload
  -> Research Gateway
  -> Research Workflow Engine
  -> Workflow
  -> Model Adapter
  -> Artifact / Evidence Store
```

OpenClaw 只负责告诉我们“外部发生了什么”。它不判断科研阶段，不决定 idea 是否可行，也不写最终结论。

真正的科研状态源是：

```text
Research Workflow Engine 的 state
```

### 2.2 demo 的业务本质

这个科研助手不是为了“让 AI 写一篇看起来像论文的东西”，而是把科研中容易失控的部分结构化：

- 研究方向输入
- research contract 起草
- 文献侦察
- baseline 选择
- baseline 复现清单
- idea 生成
- idea 独立评审
- summary 和 evidence memory

系统必须阻止“先看到结果，再倒推故事”。所以第一版的核心不是 agent 数量，而是 `contract`、`state`、`evidence` 三件事。

### 2.3 第一版暂时不接 OMC

OMC 是多 agent / team runtime，可以后续作为 adapter 接入。但 demo 阶段不要把它放进核心链路。

原因：

- 会引入第三套状态：OMC team task / worker / summary。
- 会增加 tmux、CLI、worker 生命周期、部署和 debug 成本。
- demo 当前只需要证明科研状态机闭环，不需要多 worker 并行。

注意：OpenClaw 现有实现里启用开关叫 `OMC_OPENCLAW=1`，这是历史变量名，不代表本 demo 要接入 OMC。

## 3. Demo 范围

### 3.1 必须做

第一版 demo 的最小闭环：

```text
用户输入研究方向
  -> 生成 research contract
  -> literature scouting
  -> baseline selection
  -> baseline reproduction checklist
  -> idea generation
  -> idea review
  -> summary + evidence memory
```

必须具备：

- OpenClaw gateway 能把 hook event 打到 Research Gateway。
- Research Gateway 能校验 OpenClaw payload，并转换成 ResearchSignal。
- Workflow Engine 能维护 phase state，并按 gate 推进或停住。
- Research Contract 是可机器校验的 JSON schema。
- 每个 workflow 输出结构化 artifact。
- Evidence Store 能保存 raw payload、artifact、阶段摘要和 gate 结论。
- 人类能在 contract、baseline、idea review 这些关键点 approve / revise。
- mock model adapter 能跑通全链路，不依赖真实模型 API。

### 3.2 第一版明确不做

- 不接 OMC team runtime。
- 不做多 worker 并行。
- 不自动实现代码。
- 不跑长时间训练实验。
- 不做复杂 agent 投票。
- 不做无限互相 review。
- 不把所有日志塞进一个 memory。
- 默认不改 OpenClaw 源码。

## 4. 推荐项目结构

如果没有现成实现，建议按下面结构创建：

```text
researchclaw/
  server.ts                      # HTTP server, exposes /openclaw/hooks
  gateway.ts                     # OpenClawPayload -> ResearchSignal

  engine/
    orchestrator.ts              # phase state machine
    phases.ts                    # phase enum and transition table
    gates.ts                     # contract / baseline / review / evidence gates
    state.ts                     # project state read/write

  contract/
    schema.ts                    # JSON schema / Zod schema
    contract.ts                  # validate, version, summarize contract

  workflows/
    contractDraft.ts
    literature.ts
    baseline.ts
    idea.ts
    review.ts
    summary.ts

  adapters/
    types.ts                     # common ModelAdapter interface
    mock.ts                      # deterministic mock adapter for tests/demo
    claude.ts                    # optional real adapter
    gemini.ts                    # optional real adapter
    codex.ts                     # optional real adapter

  evidence/
    store.ts                     # append/read artifacts and raw logs
    types.ts

configs/
  omc_config.openclaw.example.json

fixtures/
  openclaw/
    session-start.json
    keyword-detector.json
    post-tool-use.json
    stop.json
    ask-user-question.json
  contracts/
    valid.json
    missing-hypothesis.json
  workflows/
    literature-input.json
    literature-output.json

docs/
  contracts/
    research-contract-v1.md
  adr/
```

推荐 TypeScript / Node.js，因为 OpenClaw 现有实现是 JS/TS，类型可以直接对齐。若开发者使用 Python，也必须保留本文约定的 HTTP payload、ResearchSignal、state、artifact schema。

## 5. 核心名词表

| 名词 | 含义 |
| --- | --- |
| OpenClaw | 入口层，接收 Claude hooks / tool events，并发送 gateway payload |
| Hook Event | OpenClaw 捕获的事件，如 `session-start`、`post-tool-use`、`stop` |
| Gateway Payload | OpenClaw 发给 ResearchClaw 的 JSON 请求 |
| Research Gateway | ResearchClaw 的入口，负责 payload 校验和信号转换 |
| ResearchSignal | ResearchClaw 内部的标准化事件 |
| Workflow Engine | 科研状态机，唯一 state source of truth |
| Research Contract | 实验前写好的研究契约，包含假设、指标、成功/失败标准 |
| Gate | 阶段推进前的硬性检查 |
| Workflow | 某个科研动作，如文献侦察、baseline 选择、idea review |
| Artifact | workflow 生成的结构化产物 |
| Evidence Store | 保存 raw log、artifact、实验结果、阶段摘要的存储层 |
| Model Adapter | Claude / Gemini / Codex / mock 的调用适配层 |

## 6. OpenClaw 接口事实

OpenClaw 现有类型位于：

```text
oh-my-claude-code/dist/openclaw/types.d.ts
```

### 6.1 可触发的 Hook Event

```ts
type OpenClawHookEvent =
  | "session-start"
  | "session-end"
  | "pre-tool-use"
  | "post-tool-use"
  | "stop"
  | "keyword-detector"
  | "ask-user-question";
```

第一版建议只接这些：

| Event | demo 用法 |
| --- | --- |
| `session-start` | 创建或恢复 project session，不自动推进科研阶段 |
| `keyword-detector` | 用户明确提交研究方向时，触发 intake / contract draft |
| `ask-user-question` | 人类 revise / approve 的入口之一 |
| `post-tool-use` | 记录外部工具结果、日志、测试或搜索摘要 |
| `stop` | 当前 session 停止时写 checkpoint summary |

### 6.2 OpenClawPayload 关键字段

Research Gateway 只允许使用白名单字段，不要假设 payload 里有任意上下文。

```ts
interface OpenClawPayload {
  event: OpenClawHookEvent;
  instruction: string;
  timestamp: string;
  sessionId?: string;
  projectPath?: string;
  projectName?: string;
  tmuxSession?: string;
  tmuxTail?: string;
  channel?: string;
  to?: string;
  threadId?: string;
  signal: OpenClawSignal;
  context: OpenClawContext;
}
```

`signal.routeKey` 是后续路由的重要输入，例如：

- `session.started`
- `tool.finished`
- `test.failed`
- `pull-request.created`
- `question.requested`
- `keyword.detected`

具体值由 OpenClaw 根据 event / tool input / tool output 归一化生成。

### 6.3 OpenClaw 配置示例

创建 `configs/omc_config.openclaw.example.json`：

```json
{
  "enabled": true,
  "gateways": {
    "researchclaw-local": {
      "type": "http",
      "url": "http://127.0.0.1:8787/openclaw/hooks",
      "method": "POST",
      "timeout": 10000,
      "headers": {
        "Content-Type": "application/json"
      }
    }
  },
  "hooks": {
    "session-start": {
      "gateway": "researchclaw-local",
      "instruction": "ResearchClaw session started for {{projectName}}",
      "enabled": true
    },
    "keyword-detector": {
      "gateway": "researchclaw-local",
      "instruction": "Research request detected: {{prompt}}",
      "enabled": true
    },
    "ask-user-question": {
      "gateway": "researchclaw-local",
      "instruction": "Human input requested: {{question}}",
      "enabled": true
    },
    "post-tool-use": {
      "gateway": "researchclaw-local",
      "instruction": "Tool event: {{toolName}} / {{signalRouteKey}}",
      "enabled": true
    },
    "stop": {
      "gateway": "researchclaw-local",
      "instruction": "Session stopped for {{projectName}}",
      "enabled": true
    }
  }
}
```

运行环境要求：

```text
OMC_OPENCLAW=1
OMC_OPENCLAW_CONFIG=<path-to-omc_config.openclaw.json>
```

HTTP gateway 的 URL 必须是 HTTPS，或者是 localhost / 127.0.0.1。demo 本地服务可以使用 `http://127.0.0.1`。

## 7. Research Gateway 设计

### 7.1 职责

`gateway.ts` 只做四件事：

1. 接收 HTTP POST payload。
2. 校验 payload schema。
3. 保存 raw payload 到 Evidence Store。
4. 转换成 ResearchSignal 并交给 Workflow Engine。

它不能：

- 判断科研阶段。
- 直接调用模型。
- 直接写最终 conclusion。
- 把 OpenClaw 未白名单字段传进长期 state。

### 7.2 ResearchSignal 建议结构

```ts
type ResearchSignalIntent =
  | "start_or_resume"
  | "start_research"
  | "human_feedback"
  | "record_tool_result"
  | "checkpoint"
  | "noop";

interface ResearchSignal {
  id: string;
  source: "openclaw" | "manual";
  intent: ResearchSignalIntent;
  event: OpenClawHookEvent;
  routeKey: string;
  priority: "high" | "low";
  timestamp: string;
  projectId: string;
  sessionId?: string;
  projectPath?: string;
  userText?: string;
  toolName?: string;
  rawPayloadRef: string;
}
```

### 7.3 Event 到 Intent 的建议映射

| OpenClaw event | 条件 | ResearchSignal intent |
| --- | --- | --- |
| `session-start` | 总是 | `start_or_resume` |
| `keyword-detector` | `context.prompt` 包含研究方向或显式触发词 | `start_research` |
| `ask-user-question` | `context.question` 或 reply channel 存在 | `human_feedback` |
| `post-tool-use` | `signal.kind` 是 `tool` / `test` / `pull-request` | `record_tool_result` |
| `stop` / `session-end` | 总是 | `checkpoint` |
| 其他 | 无法识别 | `noop` |

`noop` 也要记录 raw payload，但不推进科研状态。

## 8. Workflow Engine 设计

### 8.1 核心原则

Workflow Engine 是唯一可以改变科研阶段的模块。

其他模块只能返回 artifact 或 signal，不能直接改 state。

硬性边界：

```text
gateway 不能决定科研阶段
adapters 不能改 research state
workflows 不能绕过 contract
engine 不能直接调用 Claude/Gemini/Codex
OpenClaw 源码默认不改
```

### 8.2 Demo phase enum

第一版只实现到 summary，不做实现和实验：

```ts
type ResearchPhase =
  | "idle"
  | "intake"
  | "contract_draft"
  | "contract_review"
  | "literature_scouting"
  | "baseline_selection"
  | "baseline_reproduction_checklist"
  | "idea_generation"
  | "idea_review"
  | "summary"
  | "blocked";
```

后续版本可追加：

```text
deep_literature_research
implementation_plan
implementation
experiment
result_review
writing
```

### 8.3 Phase transition table

| 当前阶段 | 输入 | Gate | 产物 | 下一阶段 |
| --- | --- | --- | --- | --- |
| `idle` | `start_research` | 用户输入非空 | intake record | `intake` |
| `intake` | engine tick | 研究方向可解析 | draft contract | `contract_draft` |
| `contract_draft` | workflow output | contract schema valid | `ResearchContract` | `contract_review` |
| `contract_review` | human approve | contract gate pass | approved contract | `literature_scouting` |
| `contract_review` | human revise | revise request valid | contract v2 draft | `contract_draft` |
| `literature_scouting` | workflow output | paper cards >= minimum | `PaperCard[]` | `baseline_selection` |
| `baseline_selection` | workflow output | selected baseline has code/repro info | `BaselineDecision` | `baseline_reproduction_checklist` |
| `baseline_reproduction_checklist` | workflow output | checklist complete | `ReproductionChecklist` | `idea_generation` |
| `idea_generation` | workflow output | idea cards >= minimum | `IdeaCard[]` | `idea_review` |
| `idea_review` | workflow output | at least one `go` or `revise` | `IdeaReviewReport` | `summary` |
| `idea_review` | no viable idea | review gate fail | failure evidence | `literature_scouting` 或 `blocked` |
| `summary` | engine tick | evidence gate pass | demo summary | `idle` |

### 8.4 Gate 定义

#### Contract Gate

必须检查：

- `hypothesis` 非空。
- `metrics` 非空。
- `success_criteria` 非空。
- `failure_signals` 非空。
- `data_split` 非空或显式标记为 `not_applicable`。
- `claim_evidence_map` 至少有占位结构。
- `schema_version` 存在。

#### Baseline Gate

必须检查：

- 至少有 2 个 baseline candidate。
- selected baseline 有论文来源、代码来源或明确说明无法开源。
- 复现清单包含环境、数据、指标、运行命令、预期输出、失败报警。

#### Review Gate

必须检查 idea review 是否覆盖：

- novelty
- feasibility
- reproducibility
- baseline compatibility
- experiment design
- evidence consistency

每个 idea 必须有 `go`、`revise` 或 `kill` 结论。

#### Evidence Gate

summary 前必须检查：

- 每个阶段都有 artifact。
- 关键结论能追溯到 artifact id。
- raw OpenClaw payload 已保存。
- contract 版本已记录。

## 9. Research Contract Schema

Contract 必须是“人类可读内容 + 机器可校验 schema”。第一版建议用 Zod 或 JSON Schema。

### 9.1 最小字段

```ts
interface ResearchContractV1 {
  schema_version: "research-contract/v1";
  contract_id: string;
  project_id: string;
  status: "draft" | "approved" | "superseded";
  version: number;

  topic: string;
  research_question: string;
  hypothesis: string;
  setting: {
    domain: string;
    task: string;
    constraints: string[];
  };

  metrics: Array<{
    name: string;
    direction: "higher_is_better" | "lower_is_better" | "qualitative";
    reason: string;
  }>;

  data_split: {
    train?: string;
    validation?: string;
    test?: string;
    note?: string;
  };

  success_criteria: Array<{
    id: string;
    description: string;
    metric?: string;
    threshold?: string;
  }>;

  failure_signals: Array<{
    id: string;
    description: string;
    metric?: string;
    threshold?: string;
  }>;

  baseline_requirements: {
    must_have_code: boolean;
    acceptable_venues: string[];
    reproduction_requirements: string[];
  };

  claim_evidence_map: Array<{
    claim_id: string;
    claim: string;
    required_evidence: string[];
  }>;

  human_notes?: string;
  created_at: string;
  updated_at: string;
}
```

### 9.2 Contract 示例

```json
{
  "schema_version": "research-contract/v1",
  "contract_id": "contract_demo_001",
  "project_id": "proj_demo_001",
  "status": "draft",
  "version": 1,
  "topic": "Vision-language model evaluation for domain-specific retrieval",
  "research_question": "Can a lightweight reranking method improve domain-specific retrieval quality over a published baseline?",
  "hypothesis": "A task-aware reranker using structured negative examples will improve recall@10 without materially increasing inference cost.",
  "setting": {
    "domain": "vision-language retrieval",
    "task": "reranking",
    "constraints": ["must compare against an open-source baseline", "must keep inference overhead measurable"]
  },
  "metrics": [
    {
      "name": "recall@10",
      "direction": "higher_is_better",
      "reason": "Primary retrieval quality metric"
    }
  ],
  "data_split": {
    "train": "to be selected during baseline scouting",
    "validation": "to be selected during baseline scouting",
    "test": "held-out split from selected baseline"
  },
  "success_criteria": [
    {
      "id": "S1",
      "description": "Improves recall@10 over selected baseline",
      "metric": "recall@10",
      "threshold": ">= baseline + 1.0 absolute point"
    }
  ],
  "failure_signals": [
    {
      "id": "F1",
      "description": "No measurable retrieval improvement under same split",
      "metric": "recall@10",
      "threshold": "< baseline + 0.3 absolute point"
    }
  ],
  "baseline_requirements": {
    "must_have_code": true,
    "acceptable_venues": ["CVPR", "ICCV", "ECCV", "NeurIPS", "ICML", "ICLR"],
    "reproduction_requirements": ["environment", "dataset", "command", "expected metric"]
  },
  "claim_evidence_map": [
    {
      "claim_id": "C1",
      "claim": "The proposed reranker improves domain-specific retrieval quality.",
      "required_evidence": ["baseline result", "same-split comparison", "main metric table"]
    }
  ],
  "created_at": "2026-05-31T00:00:00.000Z",
  "updated_at": "2026-05-31T00:00:00.000Z"
}
```

## 10. Artifact Schema

所有 workflow 输出必须是 artifact，不允许只返回自然语言。

```ts
interface ResearchArtifact<T = unknown> {
  artifact_id: string;
  project_id: string;
  phase: ResearchPhase;
  type:
    | "contract"
    | "paper_cards"
    | "baseline_decision"
    | "reproduction_checklist"
    | "idea_cards"
    | "idea_review_report"
    | "summary"
    | "raw_log";
  created_at: string;
  producer: {
    workflow: string;
    adapter: "mock" | "claude" | "gemini" | "codex" | "manual";
  };
  input_refs: string[];
  evidence_refs: string[];
  content: T;
  status: "draft" | "accepted" | "rejected" | "superseded";
}
```

Artifact 写入规则：

- 每次 workflow 输出都写入 Evidence Store。
- artifact 不直接覆盖旧版本，新版本生成新 id。
- state 中只保存当前采用的 artifact id。
- summary 必须引用前面阶段的 artifact id。

## 11. Evidence Store 设计

第一版可以用文件系统，不必上数据库。

推荐布局：

```text
.researchclaw/
  projects/
    <project-id>/
      state.json
      contracts/
        contract.v1.json
        contract.v2.json
      raw_payloads/
        <timestamp>-<event>.json
      artifacts/
        literature/
        baseline/
        idea/
        review/
        summary/
      logs/
        gateway.log
        engine.log
```

要求：

- raw payload append-only。
- artifact append-only。
- `state.json` 可以覆盖，但必须包含 `state_version` 和 `updated_at`。
- 不把 API key、完整敏感环境变量、未白名单 tool input 写进 evidence。
- 可通过 project id 回放 demo 全过程。

## 12. Model Adapter 设计

### 12.1 统一接口

```ts
interface ModelAdapterRequest {
  task_id: string;
  project_id: string;
  phase: ResearchPhase;
  instructions: string;
  inputs: Array<{
    ref: string;
    type: string;
    content: unknown;
  }>;
  output_schema: unknown;
}

interface ModelAdapterResult<T = unknown> {
  ok: boolean;
  adapter: "mock" | "claude" | "gemini" | "codex";
  output?: T;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
  raw_ref?: string;
}

interface ModelAdapter {
  name: "mock" | "claude" | "gemini" | "codex";
  run<T>(request: ModelAdapterRequest): Promise<ModelAdapterResult<T>>;
}
```

### 12.2 第一版必须有 mock adapter

mock adapter 用固定 fixture 返回结构化输出，保证没有 API key 也能跑完 demo。

第一版真实模型可以晚一点接。开发顺序应该是：

```text
mock adapter
  -> workflow fixture tests
  -> demo run stable
  -> optional real Claude/Gemini/Codex adapter
```

### 12.3 模型建议分工

真实 adapter 接入时按下面分工：

| Adapter | 推荐任务 |
| --- | --- |
| Claude | contract 起草、阶段整合、最终裁决 |
| Gemini | literature scouting、搜索扩展、idea 发散 |
| Codex | idea review、复现 checklist、实现可行性判断 |
| Mock | 本地测试、CI、离线 demo |

关键不是每一步都换模型，而是保证每一步输入输出结构化，并且由 Workflow Engine 决定状态。

## 13. Workflow 逐项要求

### 13.1 Contract Draft Workflow

输入：

- 用户研究方向
- project context

输出：

- `ResearchContractV1`

验收：

- schema 校验通过。
- 缺少 hypothesis、metrics、success_criteria、failure_signals 时失败。
- 初始 status 是 `draft`，必须等 human approve 才能进入文献侦察。

### 13.2 Literature Scouting Workflow

输入：

- approved contract
- baseline requirements

输出：

```ts
interface PaperCard {
  id: string;
  title: string;
  venue?: string;
  year?: number;
  url?: string;
  code_url?: string;
  relevance: "high" | "medium" | "low";
  why_relevant: string;
  baseline_potential: "strong" | "possible" | "weak";
  notes: string[];
}
```

验收：

- 至少输出 5 张 paper card，mock demo 至少 3 张也可接受。
- 优先中高水平会议和带开源代码的工作。
- 每张卡必须说明为什么相关。

### 13.3 Baseline Selection Workflow

输入：

- approved contract
- `PaperCard[]`

输出：

```ts
interface BaselineDecision {
  selected: {
    paper_id: string;
    name: string;
    code_url?: string;
    reason: string;
  };
  candidates: Array<{
    paper_id: string;
    name: string;
    pros: string[];
    cons: string[];
    reproducibility_risk: "low" | "medium" | "high";
  }>;
  rejected: Array<{
    paper_id: string;
    reason: string;
  }>;
}
```

验收：

- 至少比较 2 个候选 baseline。
- selected baseline 必须说明复现风险。
- 如果没有合格 baseline，不能继续 idea generation，必须回到 literature scouting 或 blocked。

### 13.4 Baseline Reproduction Checklist Workflow

第一版不真实复现 baseline，但必须生成复现清单，作为 demo 硬门槛。

输出：

```ts
interface ReproductionChecklist {
  baseline_name: string;
  repository?: string;
  environment: string[];
  data_requirements: string[];
  commands: string[];
  expected_metrics: string[];
  progress_signals: string[];
  failure_alerts: string[];
  fingerprint_checks: string[];
  human_preparation_needed: string[];
}
```

验收：

- 必须包含环境、数据、运行命令、预期指标。
- 必须包含卡住报警和下载/数据指纹校验。
- 必须说明哪些需要 human in the loop。

### 13.5 Idea Generation Workflow

输入：

- approved contract
- selected baseline
- literature artifacts
- reproduction checklist

输出：

```ts
interface IdeaCard {
  id: string;
  title: string;
  description: string;
  expected_gain: string;
  mechanism: string;
  baseline_compatibility: string;
  required_changes: string[];
  risks: string[];
  evidence_refs: string[];
}
```

验收：

- mock demo 至少输出 3 个 idea。
- 每个 idea 必须明确和 baseline 的关系。
- 每个 idea 必须能回溯到文献或 contract。

### 13.6 Idea Review Workflow

输入：

- `IdeaCard[]`
- approved contract
- selected baseline

输出：

```ts
interface IdeaReviewReport {
  reviews: Array<{
    idea_id: string;
    scores: {
      novelty: number;
      feasibility: number;
      reproducibility: number;
      baseline_compatibility: number;
      experiment_design: number;
      evidence_consistency: number;
    };
    decision: "go" | "revise" | "kill";
    rationale: string;
    required_revisions?: string[];
  }>;
  ranking: string[];
  recommended_idea_id?: string;
}
```

验收：

- 每个 idea 单独评估，避免互相污染。
- 必须给出 `go` / `revise` / `kill`。
- 如果全是 `kill`，engine 不得进入 summary success，而是回到 scouting 或 blocked。

### 13.7 Summary Workflow

输出：

```ts
interface DemoSummary {
  project_id: string;
  contract_ref: string;
  selected_baseline_ref: string;
  recommended_idea_ref?: string;
  phase_history: Array<{
    phase: ResearchPhase;
    artifact_refs: string[];
    gate_result: "pass" | "fail" | "manual";
  }>;
  evidence_index: Array<{
    claim: string;
    evidence_refs: string[];
  }>;
  next_human_actions: string[];
}
```

验收：

- summary 必须引用前面 artifact id。
- 必须列出下一步人工动作。
- 不允许凭空新增前面没有 evidence 的结论。

## 14. HTTP API 建议

第一版最少需要这些接口：

### 14.1 接收 OpenClaw hook

```http
POST /openclaw/hooks
Content-Type: application/json
```

行为：

- 校验 OpenClawPayload。
- 保存 raw payload。
- 转成 ResearchSignal。
- 调用 `orchestrator.handle(signal)`。
- 返回当前 project state 摘要。

响应示例：

```json
{
  "ok": true,
  "project_id": "proj_demo_001",
  "phase": "contract_review",
  "signal_id": "sig_001",
  "actions": ["human_approval_required"]
}
```

### 14.2 查看项目状态

```http
GET /projects/:projectId/state
```

返回：

- current phase
- active contract
- latest artifacts
- pending human actions
- gate status

### 14.3 人工 approve

```http
POST /projects/:projectId/approve
Content-Type: application/json
```

请求：

```json
{
  "target": "contract",
  "artifact_id": "artifact_contract_001",
  "approved_by": "human",
  "note": "Looks good for demo"
}
```

### 14.4 人工 revise

```http
POST /projects/:projectId/revise
Content-Type: application/json
```

请求：

```json
{
  "target": "contract",
  "artifact_id": "artifact_contract_001",
  "feedback": "Add a clearer failure signal for inference overhead."
}
```

## 15. Demo 运行脚本

建议提供两种启动方式。

### 15.1 本地 HTTP 服务

```text
pnpm install
pnpm dev
```

服务默认：

```text
http://127.0.0.1:8787
```

### 15.2 离线 fixture demo

不依赖 OpenClaw，直接用 fixture 回放：

```text
pnpm demo:fixture
```

预期输出：

```text
1. loaded fixtures/openclaw/keyword-detector.json
2. created project proj_demo_001
3. generated contract draft
4. waiting for human approval
5. approved contract
6. generated literature scouting artifact
7. selected baseline
8. generated reproduction checklist
9. generated idea cards
10. generated idea review report
11. wrote demo summary
```

这个脚本是交付验收的底线。即使真实 OpenClaw 或真实模型不可用，也要能演示完整科研状态机。

## 16. 测试要求

### 16.1 Gateway tests

必须覆盖：

- valid `session-start` payload。
- valid `keyword-detector` payload。
- valid `post-tool-use` payload。
- valid `stop` payload。
- invalid payload 缺少 `event`。
- 未识别 event 不崩溃，转为 `noop` 或返回 400。
- raw payload 被保存。

### 16.2 Contract tests

必须覆盖：

- valid contract 通过。
- 缺 `hypothesis` 失败。
- 缺 `metrics` 失败。
- 缺 `success_criteria` 失败。
- 缺 `failure_signals` 失败。
- version update 生成新 contract，不覆盖旧 contract。

### 16.3 Engine transition tests

必须覆盖：

- `idle -> intake -> contract_draft`。
- contract 未 approve 不能进入 literature。
- contract approve 后进入 literature。
- baseline gate fail 回到 literature 或 blocked。
- idea review 全 kill 不进入 success summary。
- evidence 不足不能 summary。

### 16.4 Workflow fixture tests

必须覆盖：

- mock adapter 返回符合 schema。
- workflow 输出 artifact。
- workflow 不直接修改 state。
- adapter 错误返回结构化 error。

### 16.5 Smoke test

至少提供一次真实或本地 OpenClaw payload 请求日志：

```text
OpenClaw -> /openclaw/hooks -> ResearchSignal -> state changed
```

## 17. 开发里程碑

### Milestone 0：项目骨架

交付物：

- `researchclaw/` 基础目录。
- package scripts。
- mock adapter。
- evidence store 文件系统实现。

验收：

- `pnpm test` 能运行。
- `pnpm demo:fixture` 能启动但可以只跑到 idle。

### Milestone 1：OpenClaw -> Research Gateway

交付物：

- `/openclaw/hooks` endpoint。
- OpenClawPayload schema。
- ResearchSignal schema。
- `configs/omc_config.openclaw.example.json`。
- `fixtures/openclaw/*.json`。

验收：

- `session-start`、`keyword-detector`、`post-tool-use`、`stop` 都能进入 gateway。
- gateway 能保存 raw payload。
- gateway 能输出 ResearchSignal。
- gateway 不做科研阶段判断。

### Milestone 2：Contract -> Engine

交付物：

- contract schema。
- orchestrator phase state。
- contract gate。
- approval / revise API。

验收：

- 缺字段 contract 失败。
- contract 未 approve 不推进。
- approve 后进入 literature scouting。

### Milestone 3：Workflow Mock 闭环

交付物：

- literature workflow。
- baseline workflow。
- reproduction checklist workflow。
- idea generation workflow。
- idea review workflow。
- summary workflow。
- mock provider fixtures。

验收：

- 无真实模型 API 也能完整跑完 demo。
- 每个阶段都有 artifact。
- summary 有 evidence index。

### Milestone 4：OpenClaw 真实联调

交付物：

- 本地或服务器 OpenClaw 配置。
- smoke test log。
- 一组真实 OpenClaw payload fixture。

验收：

- OpenClaw event 能打到 ResearchClaw。
- ResearchClaw 能回写 state。
- 可以从 evidence store 回放 demo。

### Milestone 5：可选真实模型 Adapter

交付物：

- Claude / Gemini / Codex 至少一个真实 adapter。
- fallback 到 mock 的配置。
- API error 的结构化处理。

验收：

- 真实 adapter 失败时不破坏 state。
- 不把 API key 写入日志。
- mock mode 仍然稳定。

## 18. 最终验收标准

一个 demo 版本只有满足下面条件才算完成：

- 能启动 ResearchClaw HTTP server。
- 能通过 OpenClaw config 把事件打到 `/openclaw/hooks`。
- 能通过 fixture 离线跑完整闭环。
- 有机器可校验的 research contract。
- 有明确 phase state。
- 有 baseline reproduction checklist。
- 有 idea review report。
- 有 evidence store。
- 有 human approve / revise 入口。
- 有测试覆盖 gateway、contract、engine transition、workflow fixture。
- 没有把 OMC 放入核心链路。
- 没有默认改 OpenClaw 源码。

## 19. 常见错误

### 错误 1：把 OpenClaw 当科研大脑

OpenClaw 只负责入口和 payload。科研判断必须在 Workflow Engine。

### 错误 2：workflow 直接改 state

workflow 只能输出 artifact。只有 orchestrator 可以改 state。

### 错误 3：先做 idea，再找 baseline

第一版必须先 literature scouting，再 baseline selection，再 reproduction checklist，再 idea。

### 错误 4：contract 只有 Markdown

Markdown 可读，但不能 gate。必须有 JSON schema 或 Zod schema。

### 错误 5：所有日志都塞进 memory

memory 要分层：

- raw payload / raw log
- artifact
- project memory
- long-term distilled memory

第一版至少拆 raw payload、artifact、summary。

### 错误 6：一开始接 OMC

demo 不需要 OMC。等需要多 worker、隔离 worktree、后台 task runtime 时，再做 `omcAdapter`。

## 20. 开发者 PR 检查清单

每个 PR 至少说明：

```md
## Goal
本 PR 要完成什么？

## Layer
- [ ] gateway
- [ ] contract
- [ ] engine
- [ ] workflow
- [ ] adapter
- [ ] evidence
- [ ] config
- [ ] docs

## Boundary
是否违反以下规则？
- [ ] gateway 不决定科研阶段
- [ ] adapters 不改 research state
- [ ] workflows 不绕过 contract
- [ ] engine 不直接调用模型
- [ ] OpenClaw 源码默认不改

## Contract / Schema Impact
是否修改了 payload、ResearchSignal、contract、artifact 或 phase schema？

## Verification
- [ ] unit tests
- [ ] fixture tests
- [ ] mock adapter tests
- [ ] smoke test
- [ ] demo:fixture

## Risk
最可能坏在哪里？
```

## 21. 交付给 demo 使用者时的说明

给业务方或评审者演示时，不要强调“我们有很多 agent”。应该强调：

- OpenClaw 已能触发 ResearchClaw。
- ResearchClaw 有明确 phase，不是一次性 prompt。
- Contract 在实验前锁定假设、指标、成功标准和失败信号。
- Baseline reproduction checklist 是硬门槛。
- Idea review 是结构化评审，不是聊天式评价。
- Summary 中每个结论都有 artifact / evidence ref。
- 人类可以在关键节点 approve / revise。

最小演示话术：

```text
这个 demo 展示的是一个可约束、可回放的科研助手流程。
OpenClaw 负责接收外部事件，ResearchClaw 负责科研状态机。
系统不会直接让模型自由发挥，而是先生成可校验 contract，
再按 literature、baseline、reproduction checklist、idea、review 的顺序推进。
每一步产物都会进入 evidence store，最后 summary 只能引用已有 evidence。
```

## 22. 后续扩展方向

demo 完成后，再考虑：

- 接真实 Claude / Gemini / Codex adapter。
- 加 `deep_literature_research`。
- 加 implementation / experiment / result review。
- 接 OMC 作为可选 `omcAdapter`，用于多 worker 并行。
- 引入数据库或对象存储。
- 做一个简单 dashboard 展示 phase、contract、artifact、gate。

扩展时仍然保持同一原则：

```text
OpenClaw 是入口；
Workflow Engine 是科研状态源；
Model output 是 artifact；
Evidence 决定结论能不能成立。
```
