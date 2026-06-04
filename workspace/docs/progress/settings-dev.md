# Settings 界面开发进度

> 对应 Plan: `docs/progress/settings-plan.md`
> 分支: `WHC`

---

## 当前状态

**阶段**: Step 2~4 完成，Step 3 待开始

**一句话**: `/settings` 路由已通，左栏「设置」可点击，设置页面骨架（分类菜单 + 内容区 + 通用/模型/通知/集成/账户 UI）已完成，typecheck + 26/26 测试通过。

---

## 已完成

| 步骤 | 内容 | 文件 | 测试 |
|------|------|------|------|
| Plan | 完成 Settings 界面开发 Plan | `workspace/docs/progress/settings-plan.md` | — |
| Step 1 | 删除 oh-my-claude-code/ (~20MB, 1470 files) | `.gitignore` | — |
| Step 1 | 将 plan/进度文档移入 workspace 避免污染 | `workspace/docs/progress/settings-dev.md` | — |
| Step 2 | 新增 `/settings` 路由 | `router.tsx` | 浏览器手验 |
| Step 2 | 左栏「设置」从 placeholder 变为可点击路由 | `LeftColumn.tsx` | 浏览器手验 |
| Step 4 | SettingsPage 布局（左分类菜单 + 右内容卡片） | `routes/SettingsPage.tsx` | 浏览器手验 |
| Step 5 | GeneralSettings UI 骨架（语言/时区/日期/主题/字体/密度/代码字体/强调色） | `routes/SettingsPage.tsx` | 浏览器手验 |
| Step 6 | 模型配置/通知/集成/账户占位 | `routes/SettingsPage.tsx` | — |

---

## 进行中

无

---

## 待开始

- [x] Step 1: 删除 `oh-my-claude-code/` + commit
- [x] Step 2: 新增 `/settings` 路由 + LeftColumn 导航
- [ ] Step 3: Zustand settings store + localStorage persist（绑定 GeneralSettings 表单）
- [x] Step 4: SettingsPage 布局（左菜单 + 右内容）
- [x] Step 5: GeneralSettings UI 骨架
- [x] Step 6: 模型配置占位 + 其他分类占位
- [ ] Step 7: 回归测试 + push WHC

---

## 已知阻塞 / 风险

| 风险 | 状态 | 应对方案 |
|------|------|---------|
| oh-my-claude-code 删除后他人环境 | 待处理 | commit message 明确说明 |
| light 主题全面回归测试成本高 | 延后 | Phase 1 只做 dark + system 骨架 |
| 模型配置无后端接口 | 占位 | dropdown disabled，标注 M2 接入 |

---

## WJ 红线对照

| 红线 | 本项目是否遵守 |
|------|--------------|
| gateway 不决定科研阶段 | N/A（纯前端） |
| adapters 不改 research state | N/A（纯前端） |
| workflows 不绕过 contract | N/A（纯前端） |
| engine 不直接调用模型 | N/A（纯前端） |
| OMC 源码默认不改 | ✅ 已删除 oh-my-claude-code |
| 结论只来自 artifact | ✅ 设置页不涉及结论 |
| mock 永远能跑 | ✅ 零模型调用 |
| 不改数据契约迁就 UI | ✅ 设置类型为前端本地类型 |
