---
title: MCP 与 Skills
icon: fa-solid fa-plug
order: 3
---

CodeKit 内置了 MCP Server，让 Claude Code、GitHub Copilot 等 AI 编程工具可以直接通过 MCP 协议调用插件能力，支持通过社区 `skills` CLI 一键安装专用 Skill。

## Skills

::: note
推荐在使用 CodeKit MCP 前，先安装此专用 Skill。安装此 Skill 能充分发挥 Agent 与 CodeKit 的最大协同能力。
:::

CodeKit Skills 是一组给 Agent 的 **嵌入式开发 Harness**。安装后，Agent 可以通过 MCP 工具直接操作开发板，无需人为干预每个步骤。

Skill 提供的核心能力：

- **可调用的动作** — SDK 切换、板型选择、编译、烧录、复位、串口读写、日志分析
- **可读取的反馈** — 编译错误、烧录结果、设备启动日志、串口输出
- **可继承的状态** — 当前 SDK 版本、目标芯片、串口号、上次构建结果
- **可重复的开发循环** — 写代码 → 编译 → 烧录 → 运行 → 观察 → 判断 → 修改

与直接暴露 CLI 给 Agent 不同，Skill 提供了结构化的工程上下文和结果反馈，让 Agent 全盘接手开发循环，你只管验收成果。

### 安装

```bash
npx skills add OpenSiFli/SiFli-SDK-CodeKit
```

为支持的 agent 单独安装：

| Agent | 命令 |
|-------|------|
| Claude Code | `npx skills add OpenSiFli/SiFli-SDK-CodeKit -a claude-code` |
| Codex | `npx skills add OpenSiFli/SiFli-SDK-CodeKit -a codex` |
| GitHub Copilot | `npx skills add .OpenSiFli/SiFli-SDK-CodeKit -a github-copilot` |

## MCP Server

从当前版本开始，CodeKit 内置了一个可选的 MCP Server，供外部 agent 工具或 IDE 通过 MCP 协议调用插件能力。所有工具按功能分为六大类别。

### 快速开始

- 在扩展面板中点击 `状态` 启动服务
- 点击 `复制连接信息` 获取连接地址和 Bearer Token
- 可通过设置 `自动启动` 让扩展激活时自动启动 MCP

### 工具概览

#### 📦 SDK 管理

| 工具 | 功能说明 |
|------|---------|
| `sifli.sdk.list` | 列出已配置的 SiFli SDK 及当前激活的 SDK |
| `sifli.sdk.activate` | 按路径或版本切换激活的 SDK |

#### 🔧 开发板管理

| 工具 | 功能说明 |
|------|---------|
| `sifli.board.list` | 从 SDK、自定义路径和项目中扫描可用开发板 |
| `sifli.board.select` | 选择当前活动开发板，可选指定编译线程数 |

#### 📁 项目管理

| 工具 | 功能说明 |
|------|---------|
| `sifli.project.getState` | 获取项目、SDK、开发板、串口、监视器和工作流的综合状态 |
| `sifli.project.listTemplates` | 列出 SDK 示例树中可创建的项目模板 |
| `sifli.project.createFromExample` | 基于 SDK 示例模板创建新项目（支持 Git 初始化） |
| `sifli.project.configureClangd` | 为当前活动开发板生成 clangd 配置 |

#### 🛠 项目构建

| 工具 | 功能说明 |
|------|---------|
| `sifli.build.compile` | 编译当前项目（后台任务） |
| `sifli.build.rebuild` | 清理构建目录后重新编译 |
| `sifli.build.clean` | 删除当前构建输出目录 |
| `sifli.build.download` | 烧录固件到目标设备 |
| `sifli.build.menuconfig` | 在 VS Code 终端中打开 menuconfig 配置界面 |

#### 🔌 串口通信

| 工具 | 功能说明 |
|------|---------|
| `sifli.serial.listPorts` | 列出可用串口及当前下载/日志波特率 |
| `sifli.serial.selectPort` | 选择下载串口，可选更新下载波特率 |
| `sifli.serial.connect` | 连接串口用于 MCP 驱动的设备交互 |
| `sifli.serial.disconnect` | 断开当前串口 MCP 会话 |
| `sifli.serial.write` | 向串口发送字符串或 HEX 字节数据 |
| `sifli.serial.read` | 读取串口日志缓冲区内容 |
| `sifli.serial.reset` | 通过 DTR/RTS 控制线发送复位脉冲 |
| `sifli.serial.status` | 查询串口会话状态和日志条目数 |

#### 📺 串口监视器

| 工具 | 功能说明 |
|------|---------|
| `sifli.monitor.open` | 打开串口监视器面板 |
| `sifli.monitor.close` | 关闭当前串口监视器会话 |

#### ⚙️ 自动化工作流

| 工具 | 功能说明 |
|------|---------|
| `sifli.workflow.list` | 列出工作空间或用户设置中的工作流 |
| `sifli.workflow.get` | 获取单个工作流定义及运行时兼容性详情 |
| `sifli.workflow.validate` | 验证工作流配置或提供的定义是否正确 |
| `sifli.workflow.run` | 按引用运行工作流，可传入输入参数 |

#### ⚙️ Kconfig 配置

| 工具 | 功能说明 |
|------|---------|
| `sifli.kconfig.snapshot` | 读取当前项目的完整 Kconfig 配置树 |
| `sifli.kconfig.setValue` | 设置单个 Kconfig 配置项并持久化 |
| `sifli.kconfig.saveChanges` | 批量保存 Kconfig 变更并触发重新生成头文件 |

### 架构说明

MCP Server 运行在 VS Code 扩展宿主内，因此外部客户端连接时需要本插件所在的 VS Code 实例保持运行。服务采用 Bearer Token 认证，支持固定 Token 和自动生成 Token 两种方式，确保连接安全。

### 压缩模式

Agent 调用 MCP 时，大量冗余字段会浪费 Token、拖慢响应。`压缩模式` 开启后，扩展会自动精简 MCP 响应内容，只保留 agent 真正需要的信息：

- **节省 70%+ Token** — 一次典型会话消耗更低，费用更省
- **交互更快** — 响应体积大幅缩减，agent 获取结果和做出下一步决策都更迅速
- **开箱即用** — 默认开启，无需额外配置

#### 使用方式

扩展侧边栏 MCP 区域提供 **压缩模式** 开关（默认开启），点击即可切换。也可通过命令面板运行 `切换 SiFli MCP 压缩模式`，或修改设置 `sifli-sdk-codekit.mcp.compactResponses`。

### 事件推送（试验性）

CodeKit MCP 支持 **Resources 订阅机制**。Agent 订阅资源后，状态变更时会自动收到推送通知，无需轮询。

| Resource URI | 内容 | 推送时机 |
|---|---|---|
| `codekit://build/status` | 编译/烧录状态 | 构建开始或结束 |
| `codekit://state/summary` | 项目状态快照 | SDK/Board/Port 变更 |

#### Agent 工作流

1. Agent 通过 `resources/subscribe` 订阅资源
2. CodeKit 状态变更时通过 `notifications/resources/updated` 通知
3. Agent 调用 `resources/read` 获取最新数据

