# ResearchClaw 三人分工与协作规范

本文档用于约定 ResearchClaw 项目的工程分工、代码边界、合并规则和校验方式。

当前项目目标：基于 OpenClaw 的 hook / gateway 机制，开发一个面向科研流程的 AI 助手。OpenClaw 作为事件入口，ResearchClaw 负责科研工作流编排，OMC 负责多 agent / team runtime / task router 执行层。

## 一、整体架构边界

推荐项目结构：

```text
openclaw/
  dist/ 或 src/                 # 原 OpenClaw，默认不乱改
  researchclaw/
    gateway.ts                  # 接 OpenClaw payload
    orchestrator.ts             # 科研状态机
    contract.ts                 # research contract schema
    workflows/
      literature.ts             # 文献侦察、文献卡片、深度调研
      baseline.ts               # baseline 选择、复现、日志
      experiment.ts             # 实验执行、实验结果记录
      review.ts                 # idea review、结果评审、证据检查
    adapters/
      omc.ts                    # 对接 OMC team runtime / task router
      claude.ts                 # Claude 调用适配
      gemini.ts                 # Gemini 调用适配
      codex.ts                  # Codex 调用适配
```

核心边界：

- OpenClaw：只负责 hook event -> signal -> gateway payload。
- gateway：只负责接收 OpenClaw payload，并转换成 ResearchSignal。
- orchestrator：负责科研状态机、阶段流转、contract 检查。
- workflows：负责具体科研动作，比如文献、baseline、实验、review。
- adapters：只负责外部系统和模型调用，不直接决定科研阶段。
- contract：定义 research contract、artifact schema、phase schema。

## 二、三人角色分工

### A：OpenClaw Edge / Server Owner

适合由能直接摸到服务器的人负责。

负责目录：

```text
openclaw/dist/ 或 openclaw/src/     # 默认不改，只有必要时 patch
researchclaw/gateway.ts
researchclaw/adapters/omc.ts
configs/
deploy/
logs/
fixtures/openclaw/
```

主要职责：

- 配置 `omc_config.openclaw.json`。
- 配置 `OMC_OPENCLAW=1` 和服务器环境变量。
- 保证 OpenClaw 能把 hook event 打到 ResearchClaw gateway。
- 维护真实 OpenClaw payload fixture。
- 维护服务器启动、部署、日志、密钥和运行状态。
- 提供 smoke test 结果和真实运行日志。
- 和 C 协作对接 `adapters/omc.ts`。

A 的核心目标：

> 保证 OpenClaw 能稳定唤醒 ResearchClaw，并且服务器环境可复现、可观测、可回滚。

### B：Research Core / Contract Owner

负责科研流程的大脑。

负责目录：

```text
researchclaw/orchestrator.ts
researchclaw/contract.ts
researchclaw/state/
researchclaw/policies/
docs/contracts/
docs/adr/
```

主要职责：

- 定义 research contract schema。
- 定义科研阶段状态机。
- 定义 baseline gate、evidence gate、review gate。
- 维护 phase transition tests。
- 维护 artifact schema 和 claim-to-evidence 规则。
- 确保所有 workflow 不能绕过 contract。
- 记录关键架构决策到 `docs/adr/`。

B 的核心目标：

> 保证科研流程不会被 AI 生成代码写散，每一步都有 contract、state 和 evidence 约束。

### C：Workflow / Model Adapter Owner

负责具体科研动作和模型调用。

负责目录：

```text
researchclaw/workflows/
  literature.ts
  baseline.ts
  experiment.ts
  review.ts

researchclaw/adapters/
  claude.ts
  gemini.ts
  codex.ts

researchclaw/skills/
fixtures/workflows/
```

主要职责：

- 实现 literature scouting workflow。
- 实现 baseline selection / reproduction workflow。
- 实现 experiment workflow。
- 实现 idea review / result review workflow。
- 实现 Claude / Gemini / Codex provider adapter。
- 编写 OMC research skill 模板。
- 用 mock provider 写 workflow fixture tests。
- 和 A 协作对接 OMC runtime。

C 的核心目标：

> 把科研任务变成可执行、可复查、可复用的 workflow，而不是一次性 prompt。

## 三、代码所有权建议

建议用 CODEOWNERS 或人工 review 规则约束：

```text
/researchclaw/gateway.ts              @A
/configs/                             @A
/deploy/                              @A
/logs/                                @A
/fixtures/openclaw/                   @A

/researchclaw/contract.ts             @B
/researchclaw/orchestrator.ts         @B
/researchclaw/state/                  @B
/researchclaw/policies/               @B
/docs/contracts/                      @B
/docs/adr/                            @B

/researchclaw/workflows/              @B @C
/researchclaw/adapters/omc.ts         @A @C
/researchclaw/adapters/claude.ts      @C
/researchclaw/adapters/gemini.ts      @C
/researchclaw/adapters/codex.ts       @C
/researchclaw/skills/                 @C
/fixtures/workflows/                  @C

/openclaw/src/                        @A @B @C
/openclaw/dist/                       @A @B @C
```

原则：

- 修改自己负责模块，可以自己发 PR，但不能绕过 review。
- 修改别人负责模块，必须让对应 owner review。
- 修改 OpenClaw 源码，必须三人共同 review。
- 修改 contract / schema / phase transition，必须 B review。
- 修改服务器配置和部署方式，必须 A review。
- 修改 provider 调用、workflow prompt、skill 模板，必须 C review。

## 四、协作流程

远程开发成员不要直接在服务器上改代码。

推荐流程：

```text
feature branch
  -> 本地测试
  -> PR
  -> owner review
  -> mock / fixture tests 通过
  -> A 在服务器部署或拉取
  -> A 贴回真实 OpenClaw logs / payload
  -> 根据日志修复
```

A 负责部署和采样，不负责替所有人修 bug。

B 和 C 应该能在本地通过 fixture 复现大部分逻辑，不依赖服务器。

## 五、模块校验方式

### `gateway.ts`

校验目标：

- 能接收 OpenClaw payload。
- 能校验 payload schema。
- 能转换成 ResearchSignal。
- 不能泄漏 OpenClaw 未白名单字段。
- 不能在 gateway 层做科研阶段判断。

测试方式：

```text
fixtures/openclaw/session-start.json
fixtures/openclaw/post-tool-use.json
fixtures/openclaw/stop.json
fixtures/openclaw/ask-user-question.json
```

### `contract.ts`

校验目标：

- 缺少 hypothesis / metrics / success_criteria 时必须失败。
- 非法 phase 必须失败。
- artifact schema 变更必须显式版本化。
- claim 必须能追溯到 evidence。

测试方式：

```text
valid contract fixture
missing-field fixture
invalid-phase fixture
schema-version fixture
```

### `orchestrator.ts`

校验目标：

- 能正确推进科研阶段。
- 能在 baseline reproduction 失败时回退。
- 能在 idea review 不通过时回到 deep research 或 idea generation。
- 能在 evidence 不足时阻止 summary / writing。

建议状态流：

```text
contract_draft
  -> literature_scouting
  -> baseline_selection
  -> baseline_reproduction
  -> deep_literature_research
  -> idea_generation
  -> idea_review
  -> implementation
  -> experiment
  -> result_review
  -> summary
```

### `workflows/*`

校验目标：

- 输入必须来自 contract / state / artifact。
- 输出必须符合 artifact schema。
- 不允许 workflow 直接修改全局 state。
- 不允许 workflow 绕过 orchestrator 推进阶段。

测试方式：

```text
input fixture
mock provider response
expected artifact fixture
```

### `adapters/*`

校验目标：

- provider adapter 只负责调用，不负责科研判断。
- 支持 mock 模式。
- 失败时返回结构化错误。
- 不把 API key 写进日志。

### `adapters/omc.ts`

校验目标：

- 能把 ResearchTask 映射到 OMC task。
- 能调用 team runtime / task router。
- 能收集 OMC summary / worker result。
- 不能绕过 Research Orchestrator 直接写最终结论。

## 六、硬性边界规则

以下规则必须遵守：

```text
gateway 不能决定科研阶段
adapters 不能改 research state
workflows 不能绕过 contract
orchestrator 不能直接调用 Claude/Gemini/Codex
OpenClaw 源码默认不改
```

如果必须打破规则，需要在 PR 里写清楚：

- 为什么现有边界不够？
- 为什么不能通过 gateway / adapter / workflow 解决？
- 这个例外以后会不会变成正式设计？
- 谁负责后续清理？

## 七、什么时候可以改 OpenClaw 源码

默认不要改 OpenClaw 源码。

只有以下情况才考虑改：

- 现有 hook event 不够用。
- OpenClaw payload whitelist 缺少必要字段。
- 现有 signal 分类无法表达关键科研事件。
- dedupe 逻辑误合并关键科研事件。
- 需要 OpenClaw 从非阻塞通知变成阻塞式决策门。

改 OpenClaw 源码前，必须先确认配置 gateway 无法解决。

## 八、PR 模板

建议每个 PR 都按这个模板写：

```md
## Goal
这次 PR 解决什么问题？

## Layer
属于哪一层？
- [ ] OpenClaw edge
- [ ] gateway
- [ ] contract
- [ ] orchestrator
- [ ] workflow
- [ ] adapter
- [ ] docs

## Scope
改了哪些文件？明确不改哪些东西？

## Contract Impact
是否改变 payload / research contract / artifact schema / phase transition？

## Verification
- [ ] unit tests
- [ ] fixture tests
- [ ] mock provider tests
- [ ] server smoke test
- [ ] manual log attached

## Risk
最可能坏在哪里？

## Reviewer Focus
希望 reviewer 重点看什么？
```

## 九、第一阶段里程碑

第一阶段不要追求完整科研助手，先跑通闭环。

### Milestone 1：OpenClaw -> Gateway

Owner：A

交付物：

- `omc_config.openclaw.json`
- `gateway.ts`
- 至少 3 个真实 OpenClaw payload fixture
- server smoke test log

验收标准：

- `session-start` 能打到 gateway。
- `post-tool-use` 能打到 gateway。
- `stop` 能打到 gateway。
- gateway 能输出 ResearchSignal。

### Milestone 2：Contract -> Orchestrator

Owner：B

交付物：

- `contract.ts`
- `orchestrator.ts`
- phase transition tests
- contract fixture tests

验收标准：

- contract 缺字段会失败。
- baseline reproduction 失败会回退。
- evidence 不足不能进入 summary。

### Milestone 3：Workflow Mock

Owner：C

交付物：

- `workflows/literature.ts`
- `workflows/baseline.ts`
- `workflows/review.ts`
- `adapters/claude.ts`
- `adapters/gemini.ts`
- `adapters/codex.ts`
- mock provider tests

验收标准：

- 不真实调用模型也能跑通 workflow fixture。
- workflow 输出符合 artifact schema。
- adapter 失败返回结构化错误。

### Milestone 4：OMC 接入

Owner：A + C

交付物：

- `adapters/omc.ts`
- ResearchTask -> OMC task 映射
- OMC summary / worker result 收集

验收标准：

- 能把一个 baseline reproduction task 发给 OMC。
- 能拿回 worker summary。
- Orchestrator 能根据 summary 推进或回退状态。

## 十、最终原则

这个项目最怕的不是模型不够强，而是工程边界被写乱。

团队协作时优先保证：

- 每个模块知道自己负责什么。
- 每个阶段有明确 contract。
- 每个结论有 evidence。
- 每个 PR 有测试和日志。
- OpenClaw 不被改成科研大脑。

一句话：

> OpenClaw 是 ResearchClaw 的事件入口，ResearchClaw 是科研状态机，OMC 是执行层，Claude/Gemini/Codex 是可替换的 worker。
