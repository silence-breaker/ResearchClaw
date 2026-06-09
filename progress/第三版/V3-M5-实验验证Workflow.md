# ResearchClaw V3-M5 实验验证 Workflow

> 阶段：V3-M5
> 目标：在 `idea_review` 后、`summary` 前插入正式实验验证 workflow
> 前置：V3-M3 多 CLI router 完成，V3-M4 多 CLI 展示完成

---

## 0. 一句话目标

```text
实验验证不再是旁路 execution layer，而是 Research Workflow Engine 中 idea_review 后的正式 phase：实验计划、实验执行、实验评审都产出 gated artifact，并决定 summary 如何表述结论。
```

V3-M5 是第三版的科研价值核心。

---

## 1. 范围

### 1.1 必须做

- phase enum 增加 `experiment_planning`、`experiment_execution`、`experiment_review`。
- `idea_review(pass)` 后进入实验阶段。
- 新增三个 workflow：experimentPlanning、experimentExecution、experimentReview。
- 新增三个 artifact 类型：experiment_plan、experiment_run、experiment_review。
- 新增三个 gate。
- experiment planning/execution 默认走 Codex CLI。
- experiment review 默认走 Claude Code。
- summary 必须消费 experiment_review。
- 前端 pipeline、phase card、右栏展示实验阶段。

### 1.2 明确不做

- 不做完整强 sandbox/runner 平台，V3 最小版先用受控目录 + 命令记录。
- 不允许实验失败被 mock 成成功。
- 不做长时间训练或外部集群调度。
- 不把实验作为第二状态源。
- 不让 summary 绕过实验阶段。

---

## 2. Phase 顺序

V3 正式顺序：

```js
const RESEARCH_PHASES = [
  'contract_draft',
  'contract_review',
  'literature_scouting',
  'baseline_selection',
  'baseline_reproduction_checklist',
  'idea_generation',
  'idea_review',
  'experiment_planning',
  'experiment_execution',
  'experiment_review',
  'summary'
];
```

状态流：

```text
idea_review(pass)
  → experiment_planning
  → experiment_execution
  → experiment_review
  → summary
```

如果 `idea_review` 不通过，不进入实验。

---

## 3. experiment_planning

目标：把通过评审的 idea 转成可运行验证计划。

输入：

- contract artifact
- literature artifact
- baseline artifact
- reproduction checklist
- idea artifact
- idea_review artifact

输出 artifact：`experiment_plan`

建议 content：

```js
{
  hypothesis,
  idea_ref,
  baseline_ref,
  dataset_requirements,
  environment_requirements,
  commands,
  expected_outputs,
  metrics,
  success_criteria,
  failure_criteria,
  risks
}
```

Gate：

- 必须引用一个 passed/recommended idea。
- 必须有可执行 command 或明确 manual step。
- metrics 必须与 contract metric 或 baseline metric 对齐。
- success/failure criteria 必须可判定。

默认 CLI：Codex CLI。

---

## 4. experiment_execution

目标：执行或记录实验验证过程。

输出 artifact：`experiment_run`

建议 content：

```js
{
  plan_ref,
  status: 'passed' | 'failed' | 'blocked',
  commands_executed: [
    { command, cwd, exit_code, stdout_ref, stderr_ref, duration_ms }
  ],
  produced_files,
  raw_log_ref,
  metrics_observed,
  failure_reason,
  ended_at
}
```

Gate：

- 所有命令、输出、错误必须落 raw_log。
- exit_code 非 0 时不能标记 passed。
- 没有 metrics_observed 时不能进入“实验支持结论”。
- 失败可以进入 experiment_review，但 summary 必须诚实说明失败。

默认 CLI：Codex CLI。

安全要求：

- 限制 cwd。
- 记录每条 command。
- 设置 timeout。
- 阻止越权路径。
- 危险命令 blocked，不 mock 成功。

---

## 5. experiment_review

目标：判断实验结果是否支持 idea claim。

输出 artifact：`experiment_review`

建议 content：

```js
{
  run_ref,
  claim_support: [
    {
      claim_id,
      metric_ref,
      support_type: 'supports' | 'does_not_support' | 'inconclusive',
      rationale,
      evidence_excerpt
    }
  ],
  decision: 'accept_idea' | 'revise_idea' | 'reject_idea' | 'rerun_experiment',
  next_actions
}
```

Gate：

- 每条支持判断必须引用 experiment_run 或 metric。
- `inconclusive` 不能被 summary 写成 supports。
- `rerun_experiment` 应回退到 planning 或 execution。

默认 CLI：Claude Code。

---

## 6. Orchestrator 改造

需要改造：

- phase enum。
- `phaseRunLabels`。
- `retreatTargets`。
- `artifactTypeByStateKey`。
- `advance()` 分支。
- summary 前置输入。
- blocked/recover 目标。

建议 retreat：

| failed phase | retreat_to |
| --- | --- |
| experiment_planning | idea_review |
| experiment_execution | experiment_planning |
| experiment_review | experiment_execution 或 experiment_planning |
| summary | experiment_review |

---

## 7. 前端任务

- PipelineProgress 增加实验三阶段。
- CurrentPhaseCard 展示 plan/run/review 摘要。
- RightColumn 展示 commands、exit_code、metrics、failure_reason。
- EvidenceMapTab 增加实验 evidence 状态。
- ArtifactDetailDrawer 支持 experiment artifact 类型。
- ActionBar 支持运行实验阶段。

---

## 8. 关键文件

| 文件 | 改造方向 |
| --- | --- |
| `researchclaw/engine/phases.js` | 增加实验 phase |
| `researchclaw/engine/orchestrator.js` | 插入实验状态流 |
| `researchclaw/engine/gates.js` | 增加实验 gates |
| `researchclaw/evidence/types.js` | 增加实验 artifact types |
| `researchclaw/workflows/experimentPlanning.js` | 新增 |
| `researchclaw/workflows/experimentExecution.js` | 新增 |
| `researchclaw/workflows/experimentReview.js` | 新增 |
| `researchclaw/web/src/lib/phase.ts` | 增加 phase label/order |
| `researchclaw/web/src/components/PipelineProgress.tsx` | 展示实验节点 |
| `researchclaw/web/src/components/RightColumn.tsx` | 展示实验运行信息 |

---

## 9. 测试要求

- idea_review fail 不进入 experiment。
- idea_review pass 进入 experiment_planning。
- experiment_plan 缺 command/manual step 被 gate 拦截。
- experiment_execution exit_code 非 0 不能 passed。
- experiment_run 无 metrics_observed 时不能支持 claim。
- experiment_review inconclusive 不可被 summary 写 verified。
- rerun_experiment 可回退到 planning/execution。
- mock fixture 仍可跑完整 V3 流程。

---

## 10. 验收标准

- workflow 中正式出现实验三阶段。
- 实验 plan/run/review 都是 artifact。
- 实验失败、blocked、不确定都能诚实进入后续判断。
- summary 不再只基于 idea_review。
- 前端能看到实验计划、命令、结果、评审。

---

## 11. 红线

1. experiment 是 workflow phase，不是旁路状态源。
2. execution raw log 不能当结论，必须经 experiment_review。
3. exit_code 非 0 不可伪装成功。
4. 无 metrics 不可宣称验证通过。
5. summary 必须消费 experiment_review。
6. 实验失败要诚实呈现。
