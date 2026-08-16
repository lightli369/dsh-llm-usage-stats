# dsh-llm-usage-stats

[![license](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)

DeepSeek Harness（DSH）大模型用量统计插件：自动记录每个大模型的 token 消耗与缓存命中率，在**设置面板**的「模型用量」页面用图表查看，数据按天持久化为 JSON 文件，可随时清空。

> 本项目按 DSH web plugin 规范发布（`dsh.client` 机制），安装方式与 [dsh-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar) 等社区插件一致。

## ✨ 功能特性

- **汇总卡片**：总输入（未缓存）/ 缓存读取 / 缓存写入 / 总输出 / 缓存命中率 / 请求次数
- **图表**：Token 消耗趋势柱状图（输入构成堆叠 + 输出）、缓存命中率折线图 —— 手写 SVG，零外部依赖
- **时间范围**：天 / 周 / 月 / 自定义起止日期（超过 90 天自动按月聚合）
- **模型筛选**：下拉自动列出当前已配置的模型（默认模型带「默认」标记），兼容历史上出现过的模型
- **模型明细**：响应式卡片布局，任意窗口宽度无横向溢出
- **性能友好**：监听 `llm/stream` 只做纯内存聚合（流完全透传、每次调用零 I/O），定时落盘默认 300 秒（页面可调 30 秒–24 小时），不影响 Harness 运行效率
- **容错**：某指标取不到（如 DeepSeek 不报告缓存写入）显示 `—`，不报错、不中断
- **附带网页版仪表盘**：浏览器访问 `http://127.0.0.1:3080/llm-usage-stats/`

## 📦 安装

前置条件：`~/.dsh/profiles/web/` 是 pnpm 项目（DSH 默认结构，未改动的机器直接可用）。

### 方式一：从 GitHub 安装（推荐）

```bash
cd ~/.dsh/profiles/web
pnpm add github:lightli369/dsh-llm-usage-stats
```

然后编辑 `package.json`，在 `dsh.profile.bundles` 数组里加一项：

```json
{
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        "dsh-llm-usage-stats"
      ]
    }
  }
}
```

```bash
pnpm install
```

重启 dsh，打开 **设置 → 模型用量**。

### 方式二：本地源码安装（二次开发）

```bash
git clone https://github.com/lightli369/dsh-llm-usage-stats.git ~/dsh-llm-usage-stats
cd ~/.dsh/profiles/web
pnpm add file:~/dsh-llm-usage-stats
# 同样在 dsh.profile.bundles 里加 "dsh-llm-usage-stats"，然后 pnpm install，重启
```

## 🗂 数据说明

- **目录**：`~/.dsh/llm-usage-stats/`，按天一个文件：`usage-YYYY-MM-DD.json`
- **格式**：

```json
{
  "models": {
    "deepseek-modlens/deepseek-v4-pro": {
      "input": 41905,
      "output": 18443,
      "cacheRead": 10245888,
      "cacheWrite": null,
      "reasoning": 9988,
      "requests": 63
    }
  }
}
```

- **统计语义**：`input` 为未缓存输入；计费输入 = `input + cacheRead + cacheWrite`；缓存命中率 = `cacheRead ÷ 计费输入`
- **清空**：页面底部「清空所有记录」，或直接删除目录下所有 `usage-*.json` 文件
- **重启安全**：内存增量按周期落盘，重启最多丢失一个落盘周期（默认 5 分钟）的数据

## 🔌 HTTP API

供二次开发同源调用（返回 JSON）：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/llm-usage-stats/api/query?from=YYYY-MM-DD&to=YYYY-MM-DD&model=all` | 按天 × 模型的聚合数据 |
| GET | `/llm-usage-stats/api/status` | 数据目录、落盘间隔、上次落盘时间 |
| GET | `/llm-usage-stats/api/models` | 已配置模型列表 + 默认模型 |
| POST | `/llm-usage-stats/api/flush` | 立即落盘 |
| POST | `/llm-usage-stats/api/clear` | 清空全部记录 |
| POST | `/llm-usage-stats/api/set-interval?n=300` | 修改落盘间隔（30–86400 秒） |

## 🗂 项目结构

```
├── lib
│   ├── index.js     # Host 插件：数据采集、定时落盘、HTTP API
│   └── client.js    # Client bundle：设置面板「模型用量」页面
├── package.json     # dsh.client 声明（platform: web）
├── LICENSE
└── README.md
```

## 📄 License

[MIT](./LICENSE)
