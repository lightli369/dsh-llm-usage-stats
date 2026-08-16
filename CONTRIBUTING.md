# 贡献指南

欢迎提交 Issue 与 Pull Request。

## 本地开发

```bash
git clone https://github.com/lightli369/dsh-llm-usage-stats.git
cd dsh-llm-usage-stats
node --check lib/index.js   # 语法检查（host 插件）
node --check lib/client.js  # 语法检查（client bundle）
```

接入本机验证：

```bash
cd ~/.dsh/profiles/web
pnpm add file:~/dsh-llm-usage-stats
# package.json 的 dsh.profile.bundles 加 "dsh-llm-usage-stats"
pnpm install
# 重启 dsh → 设置 → 模型用量
```

## 提交规范

- 提交信息使用 Conventional Commits 风格：`feat:` / `fix:` / `docs:` / `chore:`
- 提交前本地跑一遍语法检查与 CI 相同命令
- 不要提交 node_modules、日志文件

## 代码结构

- `lib/index.js`：Host 插件（数据采集、落盘、HTTP API、附带网页仪表盘）
- `lib/client.js`：Client bundle（设置面板「模型用量」页面，React 组件）

## 发布流程

1. 修改代码并自测（本地接入 dsh 验证）
2. 更新 `package.json` 的 `version`
3. `git commit` + 打 tag（如 `v1.1.0`）
4. 在 GitHub Releases 页面基于该 tag 创建 Release
