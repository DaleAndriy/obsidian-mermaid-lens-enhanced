# AGENTS.md

## 项目

Mermaid Lens Enhanced 是一个 Obsidian 插件：统一 Mermaid 配置，并提供可平移、缩放的 SVG 查看器。源码位于 `src/`，构建产物位于被忽略的 `dist/`。

## 常用命令

```bash
npm test
npm run test:coverage
npm run lint
npm run build
npm run deploy
npm run release -- <x.y.z>
```

`npm run lint` 使用 Obsidian 官方 ESLint 规则，预期无警告。

`npm run deploy` 会部署到被忽略的 `ObsidianTestVault/`，复制 `fixtures/acceptance/`，注册并通过 URI 打开测试 Vault。只部署时使用 `--no-open`。

`npm run release` 会归档 changelog、更新版本、运行检查、提交并创建 tag。

## 结构

- `src/main.ts`：插件生命周期、设置保存、重绘与扫描
- `src/config-manager.ts`：包装 Obsidian 的共享 Mermaid 配置，负责应用和回滚
- `src/diagram-registry.ts`：监听异步渲染的 SVG，挂载查看器入口
- `src/viewer.ts` / `viewer-utils.ts`：查看器及可测试的 SVG/视图计算
- `src/settings.ts`：默认配置与设置界面
- `src/i18n.ts` / `src/locales/`：语言选择、参数插值、英文与简体中文词典
- `scripts/prepare-release.mjs`：本地发布入口
- `scripts/prepare-changelog.mjs` / `extract-release-notes.mjs`：归档及提取英文发行说明
- `tests/mocks/obsidian.ts`：Vitest 使用的 Obsidian mock

## 约束

- 默认单击图表打开查看器；图中链接和按钮不得触发。
- 小图保持 Mermaid 的自然尺寸，大图限制在笔记宽度内；不要用 `max-width: 100% !important` 覆盖 Mermaid 的内联尺寸。
- 展开按钮必须避开 Obsidian 的编辑按钮。
- 复杂图表渲染较慢，必须依靠 DOM 变化监听，不能只使用固定延迟扫描。
- 配置应用或持久化失败时必须恢复上一份有效配置。
- JSON 配置输入必须保持草稿语义：只有点击“应用并重绘”后才允许验证、保存和重绘。
- 最低兼容 Obsidian 1.12；保留 `display()` 回退，不要仅为采用新 API 而提高 `minAppVersion`。
- 新增或修改用户可见文本时使用 `t()` 和 `src/locales/`，不要在业务代码中硬编码界面语言；英文是默认回退语言，词典键必须保持完整。
- `CHANGELOG.md` 使用英文，并在发布前更新 `[Unreleased]`；不要手工编写 GitHub Release 正文绕过提取流程。
- 修改后运行 lint、测试和构建；涉及真实 DOM/交互时使用验收 Vault 检查。
