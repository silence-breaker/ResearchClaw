# Settings 界面开发进度

> 对应 Plan: `docs/progress/settings-plan.md`
> 分支: `WHC`

---

## 当前状态

**阶段**: SecuritySettings 完成 — 全部 8 个一级分类 UI 已落地

**一句话**: 设置页 8 个分类全部可用（通用/外观/模型/通知/安全/个人资料与账户/辅助功能/系统）；59/59 测试通过 + typecheck 绿色；外观支持 draft preview 实时预览；模型为 QQ-list 占位 UI；安全包含密码/API 密钥/隐私/2FA 完整表单。

---

## 已完成

| 步骤 | 内容 | 文件 | 测试 |
|------|------|------|------|
| Plan | 完成 Settings 界面开发 Plan | `workspace/docs/progress/settings-plan.md` | — |
| Step 1 | 删除 oh-my-claude-code/ (~20MB, 1470 files) | `.gitignore` | — |
| Step 1 | 将 plan/进度文档移入 workspace 避免污染 | `workspace/docs/progress/settings-dev.md` | — |
| Step 2 | 新增 `/settings` 路由 | `router.tsx` | 浏览器手验 |
| Step 2 | 左栏「设置」从 placeholder 变为可点击路由 | `LeftColumn.tsx` | 浏览器手验 |
| Step 3 | Zustand settings store + localStorage persist middleware | `stores/settings.ts` | 浏览器手验 |
| Step 3 | Settings 纯函数工具（defaults/validation/migration） | `lib/settings.ts` | `settings.test.ts` 4/4 |
| Step 3 | 全局 SettingsEffect（CSS 变量实时应用） | `components/SettingsEffect.tsx` + `main.tsx` | 浏览器手验 |
| Step 3 | GeneralSettings 表单绑定 store（保存/取消/恢复默认） | `routes/SettingsPage.tsx` | 浏览器手验 |
| Step 4 | SettingsPage 布局（左分类菜单 + 右内容卡片） | `routes/SettingsPage.tsx` | 浏览器手验 |
| Step 5 | GeneralSettings UI（语言/时区/日期/主题/字体/密度/代码字体/强调色） | `routes/SettingsPage.tsx` | 浏览器手验 |
| Step 6 | 模型配置/通知/集成/账户占位 | `routes/SettingsPage.tsx` | — |
| Step 7 | 重构为 8 个一级分类 | `routes/SettingsPage.tsx` | 浏览器手验 |
| Step 7 | 新增辅助功能字段 + Toggle UI | `lib/settings.ts` + `SettingsPage.tsx` | `settings.test.ts` 4/4 |
| Step 7 | 外观设置独立分类 | `routes/SettingsPage.tsx` | 浏览器手验 |
| Step 7 | 系统分类（版本/缓存/恢复默认/导入导出占位） | `routes/SettingsPage.tsx` | 浏览器手验 |
| Step 7 | SettingsEffect 接入辅助功能 CSS 类 | `components/SettingsEffect.tsx` + `tailwind.css` | 浏览器手验 |
| Step 8 | 个人资料与账户完整 UI | `components/ProfileSettings.tsx` | 浏览器手验 |
| Step 8 | UserProfile 类型 + 工具 + 测试 | `lib/user.ts` + `lib/user.test.ts` | 10/10 |
| Step 8 | User Zustand store（多账户、头像上传、编辑） | `stores/user.ts` | 浏览器手验 |
| Step 9 | GeneralSettings 丰富化（时区/导出路径/自动保存/启动页/删除确认） | `lib/settings.ts` + `SettingsPage.tsx` | 4/4 |
| Step 10 | Edge 风格分层级卡片布局（首页卡片 + 面包屑子页面） | `SettingsPage.tsx` + `ProfileSettings.tsx` | 浏览器手验 |
| Step 11 | AppearanceSettings overhaul（draft preview + 亮度/夜间模式/背景色/字体） | `SettingsPage.tsx` + `SettingsEffect.tsx` | 浏览器手验 |
| Step 12 | ModelSettings QQ-list UI + demo data + M2 API stubs | `components/ModelSettings.tsx` + `lib/model.ts` | `model.test.ts` 7/7 |
| Step 13 | NotificationSettings（消息/声音/弹窗/邮件 + 频率/免打扰） | `components/NotificationSettings.tsx` + `lib/notification.ts` | 浏览器手验 |
| Step 14 | SecuritySettings（密码修改/API 密钥/隐私/2FA） | `components/SecuritySettings.tsx` + `lib/security.ts` + `stores/security.ts` | `security.test.ts` 8/8 |
| Step 14 | 移除未使用的 PlaceholderSettings，修复 password validator 大写检查 | `routes/SettingsPage.tsx` + `lib/security.ts` | typecheck + 59/59 |

---

## 进行中

无

---

## 待开始

全部完成。当前 8 个一级分类 UI 均已落地，等待后续 M2/M3 后端接口对接。

- [x] Step 1: 删除 `oh-my-claude-code/` + commit
- [x] Step 2: 新增 `/settings` 路由 + LeftColumn 导航
- [x] Step 3: Zustand settings store + localStorage persist（绑定 GeneralSettings 表单）
- [x] Step 4: SettingsPage 布局（左菜单 + 右内容）
- [x] Step 5: GeneralSettings UI 骨架
- [x] Step 6: 模型配置占位 + 其他分类占位
- [x] Step 7: 8 分类重构 + 辅助功能字段 + push WHC
- [x] Step 8: 个人资料与账户完整 UI
- [x] Step 9: GeneralSettings 丰富化
- [x] Step 10: Edge 风格分层级卡片布局
- [x] Step 11: AppearanceSettings overhaul + draft preview
- [x] Step 12: ModelSettings QQ-list UI + M2 stubs
- [x] Step 13: NotificationSettings 完整 UI
- [x] Step 14: SecuritySettings 完整 UI + 清理

---

## 已知阻塞 / 风险

| 风险 | 状态 | 应对方案 |
|------|------|---------|
| oh-my-claude-code 删除后他人环境 | 已处理 | commit `a06dd0b` 明确说明 |
| light 主题全面回归测试成本高 | 延后 | Phase 1 只做 dark + system 骨架 |
| 模型配置无后端接口 | 占位 | QQ-list UI + `lib/model.ts` M2 API stubs |
| SecuritySettings 无后端接口 | 占位 | Zustand localStorage 持久化，标注 M3 API |
| 密码/密钥等敏感数据 | 进行中 | 前端仅 masked 展示，真实加密等 M3 后端 |

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
