# ResearchClaw 第一版项目结构说明

ResearchClaw 是一个基于 OpenClaw 入口触发的本地研究工作流 demo。第一版的目标是验证端到端闭环：在 OpenClaw 聊天面板中用 `/researchclaw` 打开或启动工作流，在 ResearchClaw 面板中审阅契约、推进阶段，并把每一步产物写入本地 evidence store。

当前版本不依赖 OMC，也不需要修改 OpenClaw 源码。OpenClaw 只作为入口和命令触发器，ResearchClaw 自己维护工作流状态、产物和可视化面板。

## 快速运行

从仓库根目录执行：

```bash
npm run dev
```

默认服务地址：

- 项目列表：`http://127.0.0.1:8787/`
- 默认项目面板：`http://127.0.0.1:8787/panel/proj_openclaw`

远程 SSH 环境下，如果浏览器不在服务器上，可以用 SSH 端口转发查看 `8787` 端口，或显式监听外部地址：

```bash
RESEARCHCLAW_HOST=0.0.0.0 npm run dev
```

对外暴露端口前需要确认防火墙、安全组和访问权限设置。

## OpenClaw 触发方式

OpenClaw 侧通过本地插件注册 `/researchclaw` slash command。先启动 ResearchClaw 服务，再安装并启用插件：

```bash
openclaw plugins install --link /home/wj/openclaw/researchclaw/openclaw-plugin
openclaw plugins enable researchclaw
openclaw gateway restart
```

在 OpenClaw 聊天面板中使用：

```text
/researchclaw
/researchclaw <研究方向>
/researchclaw status
```

命令行为：

- `/researchclaw`：打开或创建当前 OpenClaw session 对应的 ResearchClaw 项目。
- `/researchclaw <研究方向>`：用输入的研究方向启动或重启该 session 的研究工作流，并生成契约草稿。
- `/researchclaw status`：返回当前项目阶段、下一步人工动作和面板链接。

插件默认连接 `http://127.0.0.1:8787`。如果 ResearchClaw 面板需要给远程浏览器打开，可以设置：

```bash
RESEARCHCLAW_PUBLIC_URL=<浏览器可访问的地址>
```

也可以在 OpenClaw 插件配置中设置 `serverUrl`、`publicUrl` 和 `requestTimeoutMs`。

## 目录结构

```text
researchclaw/
  README.md
  server.js
  ui.js
  gateway.js
  demo-fixture.js
  util.js
  adapters/
    mock.js
    types.js
  contract/
    contract.js
    schema.js
  engine/
    gates.js
    orchestrator.js
    phases.js
    state.js
  evidence/
    store.js
    types.js
  openclaw-plugin/
    index.js
    openclaw.plugin.json
    package.json
    README.md
  tests/
    contract.test.js
    engine.test.js
    gateway.test.js
    helpers.js
    ui.test.js
    workflow.test.js
  workflows/
    baseline.js
    contractDraft.js
    idea.js
    literature.js
    review.js
    summary.js
```

### 顶层文件

- `server.js`：ResearchClaw 本地 HTTP 服务入口，负责挂载面板页面、项目状态 API、artifact API、OpenClaw hook API，以及 approve/revise/advance 等 workflow 操作。
- `ui.js`：内置 Web 控制面板。当前支持中文和英文切换，语言选择保存在浏览器 `localStorage` 中。
- `gateway.js`：OpenClaw hook payload 的校验和转换层，把 OpenClaw 事件转换成 ResearchClaw 内部的 `ResearchSignal`。
- `demo-fixture.js`：离线演示脚本，读取 fixture payload，模拟一次从触发到 summary 的完整流程。
- `util.js`：通用工具函数，包括 ID、时间、脱敏、slug、project id 推导和状态摘要。

### `engine/`

工作流状态机核心。

- `orchestrator.js`：第一版的主调度器，负责启动研究、起草契约、处理人工批准或修改、推进各阶段，并写入状态和 artifact。
- `state.js`：定义初始 state，以及 phase history、signal history 的记录逻辑。
- `phases.js`：ResearchClaw 支持的阶段枚举。
- `gates.js`：各阶段的质量门检查，例如契约、文献、基线、复现清单和评审结果是否满足进入下一阶段的最低条件。

### `contract/`

研究契约相关逻辑。

- `schema.js`：契约结构和校验规则。
- `contract.js`：契约批准、修改和版本状态处理。

契约是第一版 workflow 的关键人工 gate。生成契约草稿后，用户必须在面板中批准或修改，系统才会进入文献侦察阶段。

### `workflows/`

每个文件对应一个可推进的研究阶段：

- `contractDraft.js`：根据研究方向生成契约草稿。
- `literature.js`：生成文献侦察产物。
- `baseline.js`：生成基线选择和复现清单。
- `idea.js`：生成研究想法卡片。
- `review.js`：评审研究想法并推荐后续方向。
- `summary.js`：汇总完整 demo 结果。

第一版中这些 workflow 通过 adapter 生成结构化 demo 产物。后续接真实模型或工具时，优先替换 adapter 或 workflow 内部调用，不需要改变 orchestrator 的状态边界。

### `adapters/`

模型或外部能力适配层。

- `mock.js`：当前第一版使用的 mock adapter，返回稳定、可测试的结构化结果。
- `types.js`：adapter 返回值的基础类型约定。

### `evidence/`

本地证据和产物存储层。

- `store.js`：文件系统实现，默认写入仓库根目录下的 `.researchclaw/`。
- `types.js`：artifact 的统一结构。

运行时数据结构：

```text
.researchclaw/
  projects/
    <project-id>/
      state.json
      raw_payloads/
      artifacts/
        intake/
        contract_draft/
        contract_review/
        literature_scouting/
        baseline_selection/
        baseline_reproduction_checklist/
        idea_generation/
        idea_review/
        summary/
        tool_results/
      contracts/
      logs/
```

其中：

- `state.json`：项目当前阶段、历史阶段、当前 artifact 引用和待办人工动作。
- `raw_payloads/`：OpenClaw 或手动启动传入的原始 payload，保存前会做基础脱敏。
- `artifacts/<phase>/`：每个阶段产出的结构化 artifact。
- `contracts/`：契约 artifact 的按版本快照。

### `openclaw-plugin/`

OpenClaw 本地插件。

- `index.js`：注册 `/researchclaw` 命令，计算当前 OpenClaw session 对应的 project id，并调用 ResearchClaw 服务。
- `openclaw.plugin.json`：插件 manifest。
- `package.json`：插件包元数据。
- `README.md`：插件单独使用说明。

这个插件只负责把 OpenClaw 聊天命令转成 ResearchClaw HTTP 请求，不承载 workflow 状态。

### `tests/`

第一版测试覆盖：

- `contract.test.js`：契约校验、批准和修改。
- `gateway.test.js`：OpenClaw payload 校验、intent 识别和信号转换。
- `engine.test.js`：状态机推进、人工 gate 和 artifact 写入。
- `workflow.test.js`：各 workflow 输出结构。
- `ui.test.js`：双语 UI 关键文案和页面渲染。
- `helpers.js`：测试辅助方法。

运行测试：

```bash
npm test
```

## 工作流阶段

当前阶段顺序：

```text
idle
intake
contract_draft
contract_review
literature_scouting
baseline_selection
baseline_reproduction_checklist
idea_generation
idea_review
summary
blocked
```

主流程：

1. OpenClaw 中输入 `/researchclaw <研究方向>`。
2. ResearchClaw 创建或重置项目，写入 intake artifact。
3. 系统生成 contract draft。
4. 用户在面板中批准或修改 contract。
5. 批准后，用户在面板中逐步推进 literature、baseline、checklist、idea、review、summary。
6. 每一步都会写入 artifact，并更新 `state.json`。

如果某一步 gate 检查失败，项目会进入 `blocked`，需要根据 pending human action 或 artifact 内容修订。

## HTTP API 概览

`server.js` 暴露的主要接口：

- `GET /`：项目列表页面。
- `GET /panel`：打开最新项目面板，没有项目时默认打开 `proj_openclaw`。
- `GET /panel/:projectId`：指定项目的可视化面板。
- `POST /openclaw/hooks`：OpenClaw hook 入口。
- `GET /projects`：项目摘要列表。
- `GET /projects/:id/state`：读取项目状态。
- `GET /projects/:id/artifact?ref=<artifact-ref>`：读取指定 artifact。
- `POST /projects/:id/start`：从研究方向启动项目。
- `POST /projects/:id/advance`：推进当前可运行阶段。
- `POST /projects/:id/approve`：批准契约。
- `POST /projects/:id/revise`：修改契约。



