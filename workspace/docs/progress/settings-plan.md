# Settings 界面开发 Plan

> Owner: WHC | 基线分支: `WHC` | 代码风格: 严格遵循 WJ（TDD、TS strict、Tailwind panel/accent 色系、纯函数组件、逻辑进 lib/）
> 创建时间: 2026-06-04

---

## 0. 前置清理（按组长危靖要求）

### 0.1 删除 oh-my-claude-code/
- `oh-my-claude-code/` 有 1470 个 tracked 文件、~20MB
- 按危靖要求：工作区不要有不相关代码，避免污染模型上下文
- 操作：`git rm -rf oh-my-claude-code/` + commit
- **注意**：先确认 `.gitignore` 已排除，防止后续 re-add

### 0.2 代码同步确认
- `WHC` 已包含 `WJ` 最新代码（M1.0~M1.3，49/49 后端测试 + 26/26 前端测试）
- `origin/PRJ` 仅 initial commit，无新代码需同步
- 基线确认：当前 `npm test`（后端）+ `npm run test`（前端 web）全部绿色后再开始

---

## 1. 设置页面路由与导航

### 1.1 新增 `/settings` 路由
```
/app/           → ProjectList（不变）
/app/panel/:id  → Panel（三栏，不变）
/app/settings   → SettingsPage（新增）
```

### 1.2 左栏「设置」从灰显变成可点击
- `LeftColumn.tsx`：`NAV_PLACEHOLDER` 移除「设置」，新增可点击导航项
- 设置项使用 `<Link to="/settings">`，与「概览」「研究工作流」平级
- 当前路由匹配时高亮（`useLocation`）

### 1.3 设置页面布局
- **外层**：复用现有三栏框架（`LeftColumn` + 主内容区 + `RightColumn`）
- **中栏内部分栏**：左侧设置分类菜单 + 右侧设置内容卡片（参考设计图）
- `RightColumn` 在设置页面下仍可显示（模型占位不变），或根据设计图决定是否隐藏
- 无需 SSE 订阅（设置页无 projectId）

---

## 2. 设置状态管理

### 2.1 技术选型：Zustand
- 项目已安装 `zustand ^5.0.0`（package.json），WJ 预留但未使用
- 设置状态需要跨组件共享（设置页写入、LeftColumn/Panel 读取）
- 持久化：`zustand` + 自定义 middleware 写 `localStorage`

### 2.2 Settings Schema（前端本地状态）
```ts
interface AppSettings {
  // 通用
  theme: "dark" | "light" | "system";      // 主题模式
  language: "zh-CN" | "en";                // 界面语言
  dateFormat: "YYYY-MM-DD" | "MM/DD/YYYY" | "DD/MM/YYYY";
  fontSize: number;                         // 界面字体大小 (12~18)
  density: "compact" | "comfortable" | "spacious"; // 界面密度
  codeFont: string;                         // 代码块字体
  accentColor: "blue" | "cyan" | "pink" | "orange" | "green"; // 强调色

  // 模型配置（目前只能占位或读现有 env，等后端接口）
  defaultModel?: string;
  maxTokens?: number;
}
```

### 2.3 现有 UI 的适配
- 主题切换：`tailwind.config.js` 目前只支持 dark（`darkMode: "class"`）
- 浅色主题需扩展 tailwind 配置（新增 light 色系）
- **风险**：扩展 tailwind 颜色系统可能影响现有所有组件 → 用 CSS 变量方案更安全
- 实际决策：Phase 1 先做 dark-only 的主题切换骨架（system/light/dark 选项存在，但 light 主题样式在 Phase 2 补齐），避免一次改动过大

---

## 3. 设置项分阶段实现

### Phase 1：骨架 + 纯前端本地状态（立即做）

| 设置分类 | 具体项 | 实现方式 | 后端依赖 |
|---------|--------|---------|---------|
| **通用** | 界面语言 | localStorage + Zustand | 无 |
| | 时区 | localStorage（先占位选项） | 无 |
| | 日期格式 | localStorage + 格式化函数 | 无 |
| | 主题模式 | localStorage + `<html class="dark/light">` | 无 |
| | 界面字体大小 | localStorage + CSS 变量 | 无 |
| | 界面密度 | localStorage + Tailwind spacing 调整 | 无 |
| | 代码块字体 | localStorage + font-family | 无 |
| | 强调色 | localStorage + CSS 变量映射 | 无 |
| **模型配置** | 默认模型 | 占位（dropdown  Disabled） | M2 后端接口 |
| | Token 上限 | 占位（slider Disabled） | M2 后端接口 |
| **通知** | 全部 | 占位卡片，标注「后续版本」 | M3+ |
| **集成** | 全部 | 占位卡片，标注「后续版本」 | M3+ |
| **账户** | 全部 | 占位卡片，标注「后续版本」 | M3+ |
| **数据与隐私** | 全部 | 占位卡片，标注「后续版本」 | M3+ |
| **快捷键** | 全部 | 占位卡片，标注「后续版本」 | M3+ |

> **红线**：没有后端接口的设置项，只能做前端本地状态或诚实占位，绝不造假数据。

### Phase 2：主题 light 模式样式（可选，不阻塞）
- 扩展 `tailwind.config.js` light 配色
- 或切换为 CSS 变量驱动的动态主题
- **建议延后**：当前 M1 所有组件按 dark 设计，加 light 需全面回归测试，ROI 不高

### Phase 3：后端配置接口对接（等 M2）
- 模型配置（defaultModel、maxTokens、allowedTools 等）
- 后端需新增 `GET/POST /settings` 或类似接口
- 当前先留好 adapter 接口位置

---

## 4. 新增文件清单

```
researchclaw/web/src/
  routes/
    SettingsPage.tsx           # 设置页面主组件
  components/settings/
    SettingsSidebar.tsx        # 设置分类菜单（通用/模型/通知...）
    SettingsContent.tsx        # 右侧内容区（根据分类切换）
    GeneralSettings.tsx        # 通用设置表单
    ModelSettings.tsx          # 模型配置（占位）
    PlaceholderSettings.tsx    # 通知/集成/账户/隐私/快捷键 占位复用组件
  stores/
    settings.ts                # Zustand settings store + localStorage persist
  lib/
    settings.ts                # 纯函数：settings validation、defaults、migration
    settings.test.ts           # 测试
  api/
    types.ts                   # 追加 AppSettings 类型（前端本地类型，不污染后端契约）
```

---

## 5. 开发进度文档机制

### 5.1 文档位置
`docs/progress/settings-dev.md`（新建）

### 5.2 更新规则
- **每完成一个子任务 → 更新文档 → commit**
- 文档结构参考 `M1进度交接.md`：
  - 当前阶段 / 一句话现状
  - 已完成清单（带文件和测试数）
  - 下一步（明确到文件名）
  - 已知阻塞 / 风险
  - 与 WJ 红线的对照检查

### 5.3 示例条目
```md
## 2026-06-04 — Phase 1.1 路由与导航
- ✅ `router.tsx` 新增 `/settings` 路由
- ✅ `LeftColumn.tsx` 「设置」从 placeholder 变为可点击 Link
- ✅ `SettingsPage.tsx` 骨架组件（左菜单 + 右内容分栏）
- 测试：无新增 lib 纯函数，无需单测；路由用浏览器手验
- 下一步：`stores/settings.ts` Zustand store + persist
```

---

## 6. 测试策略

| 层级 | 内容 | 工具 |
|------|------|------|
| lib 纯函数 | `settings.ts`（validation、defaults、migration） | vitest |
| store | settings store 的 CRUD + persist | vitest（mock localStorage） |
| 组件 | Settings 页面渲染、表单交互 | 浏览器手验为主（M1 风格） |
| 回归 | 现有 26/26 vitest + 49/49 后端测试不能破 | `npm run test` + `npm test` |

---

## 7. 本地开发 → 效果更新流程

### 7.1 推荐工作流（服务器上直接开发）
```
1. 在服务器 WHC 分支改代码
2. npm run typecheck   # TS 校验
3. npm run test        # vitest 26 测试
4. 浏览器刷新 localhost:5173/app/settings  # Vite HMR 自动更新
5. 确认效果 OK → git add → git commit
6. git push origin WHC
```

### 7.2 如果你本地开发（电脑 clone 了仓库）
```
1. 本地 WHC 分支开发
2. npm run typecheck + npm run test
3. git push origin WHC
4. 服务器上：git pull origin WHC
5. 服务器上：cd researchclaw/web && npm run build
6. 浏览器访问 http://服务器IP:8787/app/（后端托管的构建产物）
```

### 7.3 关键提醒
- **开发时用 Vite dev server（:5173）**，HMR 实时刷新，效率最高
- **最终效果更新**需要 `npm run build` 构建产物到 `web/dist/`，后端 `server.js` 从 `:8787` 托管
- 如果要让其他同学也能看到最新效果，必须 push + 服务器 build

---

## 8. 与现有前端的兼容性保证

| 检查项 | 措施 |
|--------|------|
| 颜色系统 | 只扩展，不破坏现有 `panel-*` / `accent-*` 语义 |
| Tailwind 配置 | 新增 CSS 变量或 extend，不改现有颜色值 |
| 路由 | 新增 `/settings`，不影响 `/` 和 `/panel/:id` |
| LeftColumn | 设置导航项只在非 project 上下文时显示或正常响应 |
| Zustand | settings store 独立，不碰现有 QueryClient / SSE 流 |
| 测试 | 每步 commit 前跑 `npm run test`，26/26 必须绿 |

---

## 9. 风险与应对

| 风险 | 应对 |
|------|------|
| light 主题扩展影响现有 dark UI | Phase 1 不做 light，只做 dark + system（system 实际还是 dark） |
| Zustand 版本冲突 | 项目已装 v5，直接按 v5 API 写 |
| 设计图功能超前（账户/集成/通知） | 诚实占位，标注「后续版本」，不造假 |
| oh-my-claude-code 删除后他人环境出错 | 在 commit message 中明确说明，PR 时通知全员 |

---

## 10. 执行顺序（推荐）

```
Step 1: 删除 oh-my-claude-code + commit
Step 2: 新增 /settings 路由 + LeftColumn 导航 → commit + 更新进度文档
Step 3: Zustand settings store + localStorage persist → commit + 写 test
Step 4: SettingsPage 布局（左菜单 + 右内容）→ commit
Step 5: GeneralSettings 表单（语言/日期/主题/字体/密度/代码字体/强调色）→ commit + test
Step 6: 模型配置占位 + 其他分类占位 → commit
Step 7: 回归测试全部绿色 → push origin WHC → 写最终进度总结
```
