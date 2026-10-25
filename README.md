# MR Review CLI

一个基于 TypeScript、Git 和 Moonshot Kimi API 的本地代码变更审查命令行工具。它会对指定项目执行静态检查，并审查目标分支与当前 `HEAD` 之间新增或修改的前端代码。

## 功能与亮点

- **按分支审查变更**：使用 `git diff <目标分支>...HEAD` 获取变更文件和差异，适合在功能分支上对比 `main`、`dev` 等基准分支。
- **过滤审查范围**：展示新增、修改、删除文件；仅将新增（`A`）和修改（`M`）的 `.ts`、`.tsx`、`.js`、`.jsx`、`.vue` 文件提交 AI 审查。
- **本地静态检查**：在目标项目中运行 TypeScript 类型检查和 ESLint，并汇总通过、警告或失败状态。类型检查优先使用 `vue-tsc`（若已安装），否则使用 `tsc`；通过 build mode 支持带项目引用的 tsconfig。
- **结构化 AI 审查**：将筛选后的 Git diff 发送给 Kimi，要求聚焦有依据的 Bug、异常处理、边界条件、安全风险和回归问题，并返回摘要及 P1/P2/P3 问题列表。
- **校验模型响应**：检查 AI 返回结果的字段、严重级别和行号类型，避免把格式错误的响应当作有效审查结果。
- **本地运行**：无需将项目代码上传到其他审查平台；启用 AI 审查时，变更 diff 会发送到配置的 Moonshot API。

## 环境要求

- Node.js（建议使用当前受支持的 LTS 版本）和 npm
- Git；目标项目必须是 Git 仓库
- Moonshot API Key（调用 Kimi 审查时需要）
- 目标项目应安装可用的 TypeScript 检查器（`tsc` 或 `vue-tsc`）和 ESLint。检查命令从目标项目目录运行

## 快速开始

在本仓库根目录执行：

```bash
npm install
```

创建本地环境变量文件：

```bash
cp .env.example .env
```

Windows PowerShell 可使用：

```powershell
Copy-Item .env.example .env
```

编辑 `.env` 并填写 Moonshot API Key：

```dotenv
MOONSHOT_API_KEY=你的Moonshot_API_Key
MOONSHOT_BASE_URL=https://api.moonshot.cn/v1
MOONSHOT_MODEL=kimi-k3
```

不要将真实 API Key 提交到版本库。

在要审查的项目中，先确保基准分支已存在于本地，并切换到包含待审查提交的分支。然后从本仓库目录运行：

```bash
npx tsx src/index.ts "<目标项目路径>" <目标分支>
```

例如，在 Windows PowerShell 中：

```powershell
npx tsx src/index.ts "D:\workspace\water-drop-pc" main
```

第二个参数可省略，默认目标分支为 `dev`：

```bash
npx tsx src/index.ts "../water-drop-pc"
```

比较范围是 `<目标分支>...HEAD`，即目标分支与当前 `HEAD` 的共同祖先之后的提交。目标分支必须能被目标仓库中的 Git 解析；如需比较远端分支，可先获取远端更新，再传入相应引用（例如 `origin/main`）。

## 执行流程与结果

1. 在目标项目目录运行 TypeScript 检查和 ESLint 检查。
2. 列出目标分支与当前 `HEAD` 间的变更文件及 Git 状态。
3. 仅针对新增和修改的受支持代码文件获取 diff。
4. 将 diff 发送给 Kimi，输出审查摘要和问题详情（严重级别、文件、行号、描述、修复建议及判断依据）。
5. 输出本地检查结果汇总。

如果没有符合条件的代码变更，会跳过 AI 审查。AI 请求失败时会打印错误并继续输出本地检查结果；目前检查汇总会显示失败项，但 CLI 不会仅因检查项失败而设置非零退出码。

## 开发与测试

运行测试：

```bash
npm test
```

运行 TypeScript 编译检查：

```bash
npx tsc --noEmit
```

使用本仓库示例脚本单独调用 Kimi（需要先配置 `.env`）：

```bash
npx tsx src/test-kimi.ts
```

## 当前范围与注意事项

- 当前只对 `.ts`、`.tsx`、`.js`、`.jsx` 和 `.vue` 文件做 AI diff 审查；删除文件以及其他类型文件会显示在变更列表中，但不会提交 AI 审查。
- 静态检查作用于目标项目整体，而不是仅作用于本次变更文件。
- ESLint 检查当前使用 `pnpm exec eslint .`，因此目标项目需要可用的 pnpm 与 ESLint 配置。
- AI 审查质量取决于 diff 内容和所配置的 Moonshot 模型；模型输出不替代人工审查或项目 CI。

## 读取json文件

- python3 -c 'import json; print(json.dumps(json.load(open("report.json", encoding="utf-8")), ensure_ascii=False, indent=2))'
