# UI 概念图 → 组件 → 数据源 逐元素对照表

配合 `M1技术路线-前端详化.md` 使用。把 `UI概念图.png` 上**每一个可见元素**映射到：实现组件、数据来源（state 字段 / 接口）、M1 落地状态、注意事项。

接手的人对着概念图就能开工，并且一眼能看出**哪些有真数据、哪些必须先占位**。

## M1 状态图例

| 标记 | 含义 |
| --- | --- |
| ✅ 真实 | M1 直接接后端真实数据 |
| 🔁 派生 | M1 由 state 计算得出（无需新接口） |
| 🟡 占位 | M1 渲染但 disabled / 标注「M2/M3 接入」，**不许造假数据** |
| ⚪ 静态 | 配置 / 写死文案，无数据源 |
| 🔮 后置 | 概念图有、但属 M2/M3+，M1 不显示或显「—」 |

> ⚠️ 概念图画的是**比 M1 更靠后的产品形态**（多模型实时协作、每模型产物、成本、预计剩余时间）。表里凡标 🟡/🔮 的，都是概念图「超前」于 M1 后端能力的部分。**红线：这些地方 M1 要么占位、要么显「—」，绝不允许写死假数据冒充已接入。**

> 另：概念图的契约示例是 **Diffusion/TimeGrad**（时间序列），而当前 fixture 是 **retrieval/reranking**。契约内容一律来自项目真实 contract artifact，概念图文案只是示意，不要照抄写死。

---

## 一、左栏 Sidebar

| 概念图元素 | 组件 | 数据源 | M1 | 说明 |
| --- | --- | --- | --- | --- |
| `OpenClaw Research Assistant` Logo + 标题 | `left/Brand` | — | ⚪ | 静态 |
| 工作空间下拉 `Time Series Lab` | `left/WorkspaceSwitcher` | — | ⚪ | M1 先写死单工作空间；多工作空间非 M1 范围 |
| 导航 `概览`（选中） | `left/ProjectNav` | 路由 | ⚪ | 默认页 |
| 导航 `研究工作流` | `left/ProjectNav` | 路由 | ⚪ | 指向面板主视图 |
| 导航 `文献库` / `实验管理` / `记忆库` | `left/ProjectNav` | — | 🔮 | **灰显占位**，tooltip「后续版本」。实验管理=实验阶段(M2+)，记忆库=分层记忆(v3) |
| 导航 `设置` | `left/ProjectNav` | 路由 | ⚪ | 语言切换等 |
| 当前研究 `Diffusion Models for…` | `left/CurrentResearch` | `state.current.research_direction` / contract.topic | ✅ | 标题取研究方向或契约 topic |
| 当前研究 `运行中` 徽标 | `left/CurrentResearch` | `state.phase`（≠ idle/blocked → 运行中） | 🔁 | phase 映射徽标 |
| 当前研究 `1h 23m` 已用时 | `left/CurrentResearch` | `now - state.created_at` | 🔁 | 前端计时 |
| 历史研究列表项 `RL for LLM Reasoning` 等 | `left/HistoryList` | `GET /projects` → `{project_id, phase, updated_at}` | ✅ | 每行一个 project |
| 历史项状态 `已完成` | `left/HistoryList/StatusBadge` | `phase === "idle"` 且有 summary | 🔁 | 完成=已产出 summary |
| 历史项状态 `已终止` | `left/HistoryList/StatusBadge` | `phase === "blocked"` | 🔁 | **「已终止」=blocked**，但 M0 后 blocked 可恢复 → 该项要给 **recover** 入口（点击「可回退到 X」） |
| 历史项相对时间 `2天前` | `left/HistoryList` | `updated_at` | 🔁 | 相对时间格式化 |
| `OpenClaw Gateway · 连接正常` | `left/GatewayStatus` | 健康检查（M1 可先写死「正常」） | 🟡 | 真实健康探测可放 M1 末或 M2 |
| 最近事件 `User Query 10:24:31` 等 | `left/RecentEvents` | `state.signals`（尾部 N 条） | ✅ | signal.event/intent + timestamp |
| `查看所有事件` 按钮 | `left/RecentEvents` | 打开 ActivityFeed | 🔁 | 跳中栏事件流 |

---

## 二、顶栏 Top Bar

| 概念图元素 | 组件 | 数据源 | M1 | 说明 |
| --- | --- | --- | --- | --- |
| 项目标题 `Diffusion Models for Time Series Forecasting` + 编辑笔 | `center/PanelHeader` | contract.topic / research_direction | ✅ | 编辑笔（改标题）可 M1 末做或占位 |
| `研究会话 sess_20250522_001` | `center/PanelHeader` | `state.signals[].sessionId` / project_id | ✅ | 会话标识 |
| `运行中` 徽标 | `center/PanelHeader` | `state.phase` | 🔁 | 同左栏映射 |
| `已用时 1h 23m` | `center/PanelHeader` | `now - state.created_at` | 🔁 | — |

---

## 三、中栏 · 研究工作流进展

| 概念图元素 | 组件 | 数据源 | M1 | 说明 |
| --- | --- | --- | --- | --- |
| `总体进度 38%` + 进度条 | `center/PipelineProgress` | `phase_history.filter(pass).length / 总phase数` | 🔁 | 见指标节 |
| 横向 phase 节点（圆形 icon + 连线） | `center/PipelineProgress/PhaseNode` | `state.phase` + `phase_history` | ✅ | 节点状态见下 |
| 节点「已完成」（绿勾） | `PhaseNode` | 该 phase 在 phase_history 且 gate_result=pass | 🔁 | — |
| 节点「进行中」（高亮） | `PhaseNode` | `=== state.phase` | 🔁 | — |
| 节点「待运行」 | `PhaseNode` | 在枚举顺序之后 | 🔁 | — |
| 节点「需修订/已终止」 | `PhaseNode` | `state.phase==="blocked"` → 高亮 `state.block.failed_phase` | 🔁 | 显「可回退到 `block.retreat_to`」 |
| 概念图节点 `深度调研` / `实验执行` | `PhaseNode` | — | 🔮 | **不在 v2 demo phase 枚举内**。M1 要么不画，要么画成灰色「后续」节点，**不能显示成可推进** |

**概念图节点 ↔ 实际 phase 枚举对照**（M1 pipeline 用实际枚举）：

| 概念图节点（示意） | 实际 ResearchPhase | M1 是否在流程内 |
| --- | --- | --- |
| 契约 | `contract_draft` / `contract_review` | ✅ |
| 文献侦察 | `literature_scouting` | ✅ |
| 基线选择 | `baseline_selection` | ✅ |
| 复现清单 | `baseline_reproduction_checklist` | ✅ |
| 想法生成 | `idea_generation` | ✅ |
| 想法评审 | `idea_review` | ✅ |
| 总结 | `summary` | ✅ |
| 深度调研 | （枚举预留，未实现） | 🔮 |
| 实验执行 / 结果评审 | （枚举预留，未实现） | 🔮 |

---

## 四、中栏 · 当前阶段卡片

| 概念图元素 | 组件 | 数据源 | M1 | 说明 |
| --- | --- | --- | --- | --- |
| `当前阶段 · 基线选择 (In Progress)` | `center/CurrentPhaseCard` | `state.phase` | ✅ | phase → 中文名映射表 |
| 阶段副标题（一句话描述） | `CurrentPhaseCard` | phase → 文案映射 | ⚪ | 写死的 phase 说明文案 |
| `开始时间 10:15:42` | `CurrentPhaseCard` | `phase_history` 中该 phase 的 timestamp | 🔁 | — |
| `预计剩余 20m` | `CurrentPhaseCard` | — | 🔮 | 无估时数据源，M1 显「—」或隐藏 |
| `查看详情` | `CurrentPhaseCard` | 打开 ArtifactDetailDrawer | 🔁 | — |
| 「阶段任务」列表（候选基线列表 12个候选…） | `CurrentPhaseCard/TaskList` | phase → 任务模板 | ⚪ | M1 写死阶段任务清单文案；真实子任务进度是 M2（CLI 产出） |
| 「当前任务」勾选项 | `CurrentPhaseCard/Checklist` | 同上 | ⚪/🔮 | 勾选状态无真实数据源 → M1 静态展示，**不要伪装实时勾选** |
| 「关键产物预览」JSON 代码块 | `center/ArtifactPreview` | 当前 phase 对应 artifact 的 `content`（截断） | ✅ | 例：baseline artifact 的 `selected` 字段 |
| `查看完整产物` | `ArtifactPreview` | `GET /artifact?ref=` → Drawer | ✅ | — |

---

## 五、中栏 · 契约/证据 四 Tab

| 概念图元素 | 组件 | 数据源 | M1 | 说明 |
| --- | --- | --- | --- | --- |
| Tab `研究契约 (v1.0)` | `center/ContractTab` | contract artifact `content` + `content.version` | ✅ | — |
| 研究问题 | `ContractTab` | `contract.research_question` | ✅ | — |
| 假设 | `ContractTab` | `contract.hypothesis` | ✅ | — |
| 成功标准 | `ContractTab` | `contract.success_criteria[]` | ✅ | — |
| 失败信号 | `ContractTab` | `contract.failure_signals[]` | ✅ | — |
| 关键指标 `MSE↓ MAE↓ MAPE↓` | `ContractTab/MetricChips` | `contract.metrics[]`（name+direction） | ✅ | direction → 箭头 |
| 数据划分 `Train/Valid/Test` | `ContractTab` | `contract.data_split` | ✅ | — |
| 契约 approve / revise 操作 | `ContractTab/ActionButton` | `POST /approve` · `POST /revise` | ✅ | 仅 phase=contract_review 时可用 |
| Tab `阶段状态` | `center/PhaseStatusTab` | `state.phase_history` | ✅ | 每 phase 的 gate_result + artifact_refs |
| Tab `证据映射` | `center/EvidenceMapTab` | summary artifact 的 `content.evidence_index`（`EvidenceIndexEntry[]`） | ✅ | **必须真实**：逐条 claim → satisfied/pending，缺口高亮。summary 前显「待生成总结后可见」或调只读预览 |
| 证据映射 缺口高亮 | `EvidenceMapTab` | `entry.pending[]` | ✅ | pending 项标黄 + reason |
| Tab `变更历史` | `center/ChangeHistoryTab` | `state.contract_versions[]` + 各版本 artifact 的 `human_notes` | ✅ | revise feedback 在 human_notes 里 |

---

## 六、中栏 · 实时事件流

| 概念图元素 | 组件 | 数据源 | M1 | 说明 |
| --- | --- | --- | --- | --- |
| 分流 tab `全部/OpenClaw/系统/Claude/Gemini/Codex` | `center/ActivityFeed/Tabs` | 客户端过滤 | 🔁 | Claude/Gemini/Codex 分流 M1 基本为空（无真实模型事件）→ 这几个 tab 可灰显 |
| 事件行 `10:16:00 Claude 3.5 进入基线选择` | `center/ActivityFeed/Row` | `phase_history` + `signals`（+ 可选 SSE 增强事件） | ✅/🟡 | 系统/阶段事件 ✅；带「Claude/Gemini/Codex」来源的事件 🟡（M2 才有真实模型来源） |
| 事件挂载文件名 | `ActivityFeed/Row` | artifact ref | ✅ | 点击开 Drawer |

---

## 七、右栏 · 模型互动 / 实时视图（M1 多为占位）

| 概念图元素 | 组件 | 数据源 | M1 | 说明 |
| --- | --- | --- | --- | --- |
| `实时模式` 开关 | `right/Header/RealtimeToggle` | SSE 连接态 | 🔁 | 控制是否订阅 SSE |
| 模型按钮 `Claude 3.5` | `right/ModelLane` | — | 🟡 | **M1 disabled**，tooltip「M2 接入 Claude Code (Haiku)」 |
| 模型按钮 `Gemini 1.5` / `Codex` | `right/ModelLane` | — | 🟡 | **disabled 占位**，标注「未接入」。v2 只接 Claude |
| 聊天 feed 条目（模型名+时间+角色标签+摘要） | `right/ProcessFeed/Item` | M1：`raw_log` 类 artifact；M2：CLI transcript 摘要 | 🟡 | M1 只渲染已有 raw_log（mock 流程产出的有限内容），**不要伪造多模型对话** |
| 角色标签 `规划分析/文献检索/代码验证/汇总决策` | `ProcessFeed/RoleTag` | — | 🔮 | 角色分工是 M2（per-phase adapter）。M1 无此数据 → 不显示或显通用标签 |
| feed 挂载产物 `baseline_analysis.md 12.3 KB` | `ProcessFeed/Item` | artifact ref + 文件大小 | 🟡 | 大小可由 artifact JSON 字节数算；多模型来源是 M2 |
| 底部输入框 + 发送按钮 | `right/ConsultInput` | — | 🟡 | **渲染但 disabled**，placeholder「M3 开放与 Claude 一问一答」 |
| 底部 `产物/数据/图表` tab | `right/ArtifactList/Tabs` | 全 artifact 列表 | ✅/🔮 | 「产物」✅（列全 artifact）；「数据/图表」🔮（无数据源，占位） |
| 产物列表行 `12.3KB Claude 3.5` | `right/ArtifactList/Row` | artifact `producer.adapter` + 字节数 + created_at | ✅/🟡 | M1 来源基本是 `mock`/`manual`；「Claude/Gemini」来源是 M2 |

---

## 八、概念图 vs M1 一图速览（给 PM / 评审）

| 概念图区域 | M1 真实程度 | 一句话 |
| --- | --- | --- |
| 左栏（导航/项目/事件） | 🟩 大部分真实 | 项目列表、当前研究、最近事件都接真数据 |
| 中栏 pipeline + 契约 + 证据映射 | 🟩 **全真实**（C 位） | 这是 M1 的护城河展示，每个字段都有据可查 |
| 中栏 当前阶段卡片 | 🟨 半真实 | 阶段名/产物预览真实；子任务勾选、预计剩余是占位/后置 |
| 中栏 事件流 | 🟨 半真实 | 系统/阶段事件真实；多模型来源事件 M2 |
| 右栏 模型互动 | 🟥 **基本占位** | 多模型对话/角色分工/一问一答全是 M2/M3，M1 仅 raw_log + 占位按钮 |

> 核心提醒沿用 M1 红线：**右栏越像"三个 AI 在协作"，越要小心——M1 它必须诚实地"还没接入"。** 先让中栏（契约+证据+pipeline）这条真实链路立住，右栏等 M2/M3 接了 Claude Code 再点亮。
