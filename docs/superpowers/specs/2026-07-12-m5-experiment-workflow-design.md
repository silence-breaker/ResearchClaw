# V3-M5 实验验证 Workflow（后端）设计

> 日期：2026-07-12 · 里程碑：V3-M5a（后端）· 状态：已批准，待实现
> 关联 spec：`progress/第三版/V3-M5-实验验证Workflow.md`（目标设计）
> 边界：M6 做深度证据化（claim_support 门控、EvidenceReference、EvidenceMapTab），M5 不碰。

## 目标

在研究状态机 `idea_review → summary` 之间插入三个实验阶段，让"想法"真正被跑一遍实验来验证：

```
idea_review → experiment_planning → experiment_execution → experiment_review → summary
```

- **experiment_planning**：LLM（codex）读合同/文献/基线/复现清单/想法/评审，产出可执行的实验计划。
- **experiment_execution**：**非 LLM**。由 RC 自建受控 CommandRunner 真跑计划里的命令，如实记录 exit_code / stdout / stderr / 产物，产出实验运行记录。
- **experiment_review**：LLM（claude）读计划/运行记录/合同/想法/评审，判断实验结果是否支持各 claim，给出决策。

M5 是"科研价值核心"——第一次让 pipeline 产生真实实验证据。但**深度证据门控留给 M6**：M5 的 summary 只把 experiment_review 作为**必需输入**，不做 claim_support 的结构化门控。

## 核心设计决策（已批准）

1. **执行模型：RC 自建受控 runner**。现有 adapter 全是 LLM-task adapter，sandbox 刻意排除 Bash（CLI 无 shell 自主权是红线）。实验执行是净新增能力，由 RC 自己拥有的 CommandRunner 承担，受控、可审计。
2. **执行触发：需人工确认后跑**。执行阶段不自动跑命令——复用现有 `advance()` 的人工触发点（面板确认），pending action 携带命令清单，label「确认并执行实验命令」。面板必须先展示命令再确认（M5b）。
3. **工作目录：持久项目目录** `<storeRoot>/experiments/<projectId>/`，cwd 锁死其内，跨命令保留产物（不是一次性 sandbox）。
4. **mock 策略：CI 真跑无害命令**。execution 不 mock——runner 真跑。plan fixture 的命令是无害的 `node -e` 写 `metrics.json`，CI 里真跑、真写产物、真 exit 0 → passed。
5. **诚实红线**：`exit_code≠0` 永不判 passed；执行失败如实进 review（不阻塞），让 review 判断"失败说明了什么"。

## 文件改动清单

### 状态机与类型

- **`researchclaw/engine/phases.js`**：`researchPhases` 在 `idea_review` 与 `summary` 之间插入 `experiment_planning, experiment_execution, experiment_review`。
- **`researchclaw/evidence/types.js`**：`artifactTypes` Set 增加 `experiment_plan, experiment_run, experiment_review`。

### 新增：受控命令执行器

- **`researchclaw/experiment/runner.js`（CommandRunner，净新增）**：
  - 持久 workdir：`<storeRoot>/experiments/<projectId>/`，首次 `mkdirSync(recursive)`；cwd 锁死其内。
  - `runCommands({ commands, cwd, timeoutMs })`：逐条 `spawn`（shell 模式）执行，每条：
    - **denylist**：`rm -rf` / `sudo` / `curl|wget` 管道进 shell / `dd` / `mkfs` / `shutdown` / `del` / `format` / 重定向到 `/dev/` 等 → 拦截，`status: blocked`，停止后续命令。
    - **路径逃逸拦截**：绝对路径逃出 cwd、`..` 上跳 → 拦截。
    - **per-command 超时**：`setTimeout` + `child.kill("SIGTERM")`，超时 → blocked。
    - 捕获 `exit_code / stdout / stderr`（截断）/ `duration_ms`；stdout/stderr 落 raw payload ref。
    - **status 判定**：全部 exit 0 → `passed`；任一非零 → `failed`；被拦截/超时 → `blocked`。**exit_code≠0 永不 passed**。
    - 每条命令 emit `cli_chunk`（`kind:"workflow"`）供 M5b 右栏展示。
  - runner 不接触密钥、不进 argv/日志红线沿用。

### 三个 workflow

- **`researchclaw/workflows/experimentPlanning.js`**：LLM workflow（codex），结构同 `review.js`（`producerFields` + 阶段 landCliRawLog）。inputs：contract / literature / baseline / checklist / idea / review。output_schema：`ExperimentPlanV1`。产出 `experiment_plan`。
- **`researchclaw/workflows/experimentExecution.js`**：**非 LLM**。取 plan，调 CommandRunner 跑 `plan.commands`，构建 `experiment_run`，producer `adapter:"runner"`；`metrics_observed` 从 cwd 约定文件 `metrics.json` 读取（不存在则空对象）。
- **`researchclaw/workflows/experimentReview.js`**：LLM workflow（claude），结构同 review.js。inputs：plan / run / contract / idea / review。output_schema：`ExperimentReviewV1`。产出 `experiment_review`。

### 三个 gate（`researchclaw/engine/gates.js`）

- **`experimentPlanGate`**：计划引用了推荐的 idea；至少 1 条可执行命令或显式的人工步骤；metrics 与合同/基线对齐；success/failure 判据非空且可判定。
- **`experimentRunGate`**：每条命令都有 `exit_code` + raw_log；`passed` 要求全部 exit 0 **且** `metrics_observed` 非空；`failed`/`blocked` **不阻塞**（诚实失败继续进 review）。
- **`experimentReviewGate`**：每条 `claim_support` 引用 `run_ref`/`metric_ref`；`support_type`/`decision` 在枚举内；`inconclusive` 不能标 `supports`。

### 编排（`researchclaw/engine/orchestrator.js`）

- `advance()` 增加 3 个 case + 3 个 `runStep`。
- `retreatTargets`：`experiment_planning→idea_review`，`experiment_execution→experiment_planning`，`experiment_review→experiment_execution`，`summary→experiment_review`。
- 执行阶段：复用现有 advance() 人工触发（面板确认），pending action 携带命令清单，label「确认并执行实验命令」。
- `runSummaryStep`：`evidenceGate` 把 experiment_review 加为必需输入；summary inputs 增加 plan / run / review。
- `artifactTypeByStateKey` +3 条目。
- `evidenceRegistry` 的 experiment 条目**保持 `inScope:false`**（翻成 true 是 M6）。

### mock 与 schema

- **`researchclaw/adapters/mock.js` + fixtures**：新增 `experiment_planning` / `experiment_review` fixture；execution 不 mock。plan fixture 命令：`node -e "require('fs').writeFileSync('metrics.json', JSON.stringify({accuracy:0.9}))"` → CI runner 真跑 → 写 metrics → exit 0 → passed。
- **`researchclaw/adapters/schemas.js`**：注册 `ExperimentPlanV1` / `ExperimentReviewV1`（真 CLI 路径校验用）。
- **`researchclaw/settings/cliPolicy.js`**：无改动（已预置 planning=codex / execution=codex / review=claude）。

## artifact content 形状

**experiment_plan**（planning 产出）：
```
{ hypothesis, idea_ref, baseline_ref, dataset_requirements, environment_requirements,
  commands: [string], expected_outputs, metrics, success_criteria, failure_criteria, risks }
```

**experiment_run**（execution 产出）：
```
{ plan_ref, status: 'passed'|'failed'|'blocked',
  commands_executed: [{ command, cwd, exit_code, stdout_ref, stderr_ref, duration_ms }],
  produced_files, raw_log_ref, metrics_observed, failure_reason, ended_at }
```

**experiment_review**（review 产出）：
```
{ run_ref, claim_support: [{ claim_id, metric_ref,
    support_type: 'supports'|'does_not_support'|'inconclusive', rationale, evidence_excerpt }],
  decision: 'accept_idea'|'revise_idea'|'reject_idea'|'rerun_experiment', next_actions }
```

## 验收

- 后端 `npm test`（node --test）全绿，含三个 workflow / 三个 gate / runner 的新测试。
- mock pipeline 能从 idea_review 一路推进到 summary：planning（mock）→ execution（真跑无害命令、真写 metrics、passed）→ review（mock）→ summary。
- 诚实性：注入非零 exit 命令 → run status=failed、不阻塞、进 review。
- 红线：runner 无密钥泄漏，denylist 拦截危险命令并置 blocked。

## 不做（M5 边界外）

- claim_support 结构化门控（M6）。
- EvidenceReference 升级、EvidenceMapTab（M6）。
- `evidenceRegistry` experiment 条目翻 inScope（M6）。
- M5b 前端（独立 spec/plan，M5a 落地后再做）。
