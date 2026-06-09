# ResearchClaw V3-M6 实验证据化与 Summary 收边

> 阶段：V3-M6
> 目标：让实验结果成为 summary 的关键证据来源，防止实验失败或不确定被总结成验证成功
> 前置：V3-M5 实验验证 workflow 完成

---

## 0. 一句话目标

```text
summary 的实验相关 claim 必须能追溯到 experiment_run / experiment_review；failed、does_not_support、inconclusive 都必须被诚实表述，不能被包装成 verified。
```

V3-M6 是第三版的证据闭环收边阶段。

---

## 1. 范围

### 1.1 必须做

- EvidenceReference 增加 provider/cli/model/raw_log_ref/support_type。
- `claimEvidenceGate` 支持 experiment evidence。
- summary workflow 强制输入 experiment_review。
- summary gate 检查 experiment_review 的 claim_support。
- failed/inconclusive/does_not_support 不得写成 supports。
- EvidenceMapTab 展示实验 claim support 状态。
- MetricsRow 按 provider/CLI/phase 展示成本。
- mock evidence 明确标注。

### 1.2 明确不做

- 不引入数据库。
- 不做论文写作完整系统。
- 不做长期记忆库重构。
- 不让 consult_note 满足实验 claim evidence。
- 不把文献 evidence 当成实验验证 evidence。

---

## 2. EvidenceReference 升级

建议结构：

```js
EvidenceReference = {
  id,
  claim_id,
  artifact_ref,
  artifact_type,
  content_path,
  excerpt,
  support_type: 'direct' | 'indirect' | 'contradicts' | 'inconclusive' | 'pending',
  provider,
  cli,
  model,
  raw_log_ref
}
```

实验优先 evidence：

- `experiment_run.metrics_observed`
- `experiment_review.claim_support`
- `experiment_run.commands_executed.exit_code`
- `experiment_run.produced_files`
- `experiment_run.failure_reason`

规则：

- 文献 evidence 可以支撑动机和相关工作。
- 实验结论必须优先来自 experiment artifacts。
- consult_note 不满足任何 claim 的 required evidence。

---

## 3. claimEvidenceGate 改造

当前 V2 已有 `claimEvidenceGate`。V3-M6 增强：

- 识别 `experiment_plan`、`experiment_run`、`experiment_review`。
- 对每个 contract claim 查找 experiment_review.claim_support。
- `supports` → 可满足实验类 evidence。
- `does_not_support` → 记录 contradicts，不得满足。
- `inconclusive` → 记录 inconclusive，不得满足。
- experiment_run failed/blocked → 只能作为 failure evidence。

输出建议：

```js
{
  ok,
  errors,
  evidence_index: [
    {
      claim_id,
      claim,
      satisfied: [],
      contradicted: [],
      inconclusive: [],
      pending: []
    }
  ]
}
```

---

## 4. Summary workflow 新约束

summary 输入必须包含：

- approved contract
- selected baseline
- reproduction checklist
- idea review
- experiment plan
- experiment run
- experiment review
- evidence index

summary 输出必须：

- 引用 experiment_review。
- 对每个主要 claim 标注 support 状态。
- 不把 failed/inconclusive 写成 verified。
- 如果实验失败，明确写失败原因和下一步。
- 如果 evidence 包含 mock，明确标注 mock 输入。

禁止：

- 只基于 idea_review 写“验证通过”。
- 用 consult_note 支撑实验 claim。
- 用文献相关性替代实验指标。

---

## 5. Summary Gate

新增或增强 gate：

- 必须存在 experiment_review artifact。
- experiment_review 必须覆盖 recommended idea 的主要 claim。
- summary 中每个 “verified/supports/improves” 类表达必须有 supports evidence。
- does_not_support/inconclusive/failed 不能被改写成成功措辞。
- mock evidence 必须在 summary 中标明。

可以先用结构化字段约束，避免自然语言难以判断：

```js
summary.claims = [
  {
    claim_id,
    statement,
    support_status: 'supported' | 'not_supported' | 'inconclusive' | 'pending',
    evidence_refs
  }
]
```

Gate 先检查 `support_status` 与 evidence_refs，而不是解析整段自然语言。

---

## 6. 前端任务

### 6.1 EvidenceMapTab

展示分组：

```text
Claim C1
  supports: experiment_review -> metric
  does_not_support: ...
  inconclusive: ...
  pending: ...
```

要求：

- supports / does_not_support / inconclusive 用不同视觉状态。
- mock evidence 有明确徽章。
- 点击 evidence 可打开 artifact detail。

### 6.2 Summary 展示

- Summary artifact detail 显示 claim support 状态。
- 对 failed/inconclusive 给醒目标注。
- 展示 experiment_run command、metric、failure reason 的引用。

### 6.3 MetricsRow

- 成本按 phase/provider/CLI 展示。
- experiment phases 单独显示调用/成本。
- over budget 时说明影响哪些后续 phase。

---

## 7. 关键文件

| 文件 | 改造方向 |
| --- | --- |
| `researchclaw/engine/gates.js` | 增强 claimEvidenceGate 与 summary gate |
| `researchclaw/workflows/summary.js` | 输入 experiment evidence，输出 support_status |
| `researchclaw/evidence/types.js` | EvidenceReference/source metadata 扩展 |
| `researchclaw/evidence/store.js` | 确保 experiment artifacts 可检索 |
| `researchclaw/engine/cost.js` | provider/CLI/phase 成本收边 |
| `researchclaw/web/src/components/EvidenceMapTab.tsx` | 展示 supports/contradicts/inconclusive |
| `researchclaw/web/src/components/MetricsRow.tsx` | 成本分维展示 |
| `researchclaw/web/src/components/ArtifactDetailDrawer.tsx` | 展示实验 evidence/source |

---

## 8. 测试要求

- experiment_review supports 时 claim evidence satisfied。
- experiment_review does_not_support 时 claim evidence contradicted，不 satisfied。
- experiment_review inconclusive 时 claim evidence inconclusive，不 satisfied。
- experiment_run failed 时 summary 不可写 verified。
- summary 缺 experiment_review 被 gate 拦截。
- consult_note 不满足 claimEvidenceGate。
- mock experiment evidence 在 summary 中被标注。
- EvidenceMapTab 正确展示三类 support 状态。

---

## 9. 验收标准

- summary 的实验 claim 可追溯到 experiment_run/review。
- failed/inconclusive/does_not_support 不会被总结成 success。
- evidence_index 能展示实验支持、反证、不确定、pending。
- 前端能点开每条实验 evidence。
- 成本/调用能按实验 phase 与 provider/CLI 解释。
- V3 总验收矩阵全部可核查。

---

## 10. 红线

1. summary 不能绕过 experiment_review。
2. 实验失败不能写成验证通过。
3. consult_note 不能满足实验 claim evidence。
4. 文献 evidence 不能替代实验 metrics。
5. mock evidence 必须显式标注。
6. gate 检查结构化字段，不靠自然语言猜测。
