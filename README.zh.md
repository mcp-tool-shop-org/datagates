<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.md">English</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/datagates/readme.png" width="400" alt="datagates" />
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/datagates/actions"><img src="https://github.com/mcp-tool-shop-org/datagates/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/mcp-tool-shop-org/datagates/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License" /></a>
  <a href="https://mcp-tool-shop-org.github.io/datagates/"><img src="https://img.shields.io/badge/docs-landing%20page-blue" alt="Landing Page" /></a>
</p>

受控的数据提升系统。数据通过分层机制获得信任，而不是通过静默清理。

## 功能

Datagates 将数据集清洗视为一种**提升问题**。记录不是通过代码验证而获得信任，而是通过在明确、版本控制、可审计的规则下获得提升而获得信任。

四个信任层，每个层都有自己的验证机制：

| 层级 | 验证机制 | 检测内容 |
|-------|------|-----------------|
| **Row trust** | 模式验证、标准化、精确去重 | 结构错误、无效值、重复项 |
| **Semantic trust** | 跨字段规则、近重复检测 | 矛盾、模糊重复、置信度 |
| **Batch trust** | 指标、漂移检测、留存样本重叠 | 分布漂移、测试集泄露、数据源污染 |
| **Governance trust** | 策略注册、校准、影子模式、覆盖 | 未经测试的策略更改、静默异常、未经审查的数据源 |

每个隔离决策都包含明确的理由。每个覆盖都需要持久的凭证。每个批次决策都可以从其相关文件重建。

## 安装

```bash
npm install datagates
```

## 快速开始

```bash
# Initialize a project
npx datagates init --name my-project

# Edit schema.json and policy.json to match your data

# Ingest a batch
npx datagates run --input data.json

# Calibrate against a gold set
npx datagates calibrate

# Compare policies in shadow mode
npx datagates shadow --input data.json

# Review quarantined items
npx datagates review list
```

## 命令行

| 命令 | 描述 |
|---------|-------------|
| `datagates init` | 使用配置、模式、策略和黄金数据集初始化项目 |
| `datagates run` | 导入一批数据，执行所有验证机制，输出结果 |
| `datagates calibrate` | 运行黄金数据集，测量误报率/漏报率/F1 值，检测回归 |
| `datagates shadow` | 比较活动策略和候选策略，而不影响数据 |
| `datagates review` | 列出、确认、驳回或覆盖审查项目 |
| `datagates source` | 注册、检查、激活或暂停数据源 |
| `datagates artifact` | 导出或检查批次决策相关文件 |
| `datagates promote-policy` | 仅在校准通过后激活策略 |
| `datagates packs` | 列出可用的预构建策略包 |

## 策略包

从预构建的策略开始，而不是从零开始构建治理体系：

- **strict-structured** — 严格的阈值，用于干净的结构化数据
- **text-dedupe** — 积极的近重复检测，用于文本数据集
- **classification-basic** — 标签漂移和类消失检测
- **source-probation-first** — 谨慎的多源数据导入，采用部分恢复机制

```bash
npx datagates init --pack strict-structured
```

## 三层架构

```
Raw (immutable) --> Candidate --> Approved
                        |
                    Quarantine
```

- **Raw (原始)**：不可变的输入，永不修改
- **Candidate (候选)**：通过行级别验证机制，等待批次结果
- **Approved (已批准)**：在通过批次级别验证机制后提升
- **Quarantine (隔离)**：失败于一个或多个验证机制，并提供明确的理由

## 程序化 API

```typescript
import { Pipeline, ZoneStore } from 'datagates';

const store = new ZoneStore('datagates.db');
const pipeline = new Pipeline(schema, policy, store);
const result = pipeline.ingest(records);

console.log(result.summary.verdict);
// { disposition: 'approve', reasons: [], warnings: [], ... }
```

## 退出码

| 代码 | 含义 |
|------|---------|
| 0 | 成功 |
| 1 | 批次隔离 |
| 2 | 校准回归 |
| 3 | 影子结果已更改 |
| 10 | 配置错误 |
| 11 | 文件缺失 |
| 12 | 验证错误 |

## 文档

- [快速开始](docs/QUICKSTART.md) — 端到端的首次运行
- [策略](docs/POLICIES.md) — 规则、继承、生命周期
- [校准](docs/CALIBRATION.md) — 黄金数据集和回归
- [审查](docs/REVIEW.md) — 队列和覆盖凭证
- [导入](docs/ONBOARDING.md) — 数据源试用模型
- [相关文件](docs/ARTIFACTS.md) — 决策证据
- [术语表](docs/GLOSSARY.md) — 术语和概念

## 安全

Datagates 仅在**本地**运行。它读取和写入项目目录中的文件，包括 JSON 配置文件、SQLite 数据库和决策相关文件。它不进行任何网络调用，不收集任何遥测数据，也不处理任何凭证。有关完整的威胁模型和报告说明，请参阅 [SECURITY.md](SECURITY.md)。

## 许可证

MIT

---

由 <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a> 制作。
