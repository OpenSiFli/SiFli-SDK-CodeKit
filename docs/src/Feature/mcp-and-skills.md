---
title: MCP 与 Skills
icon: fa-solid fa-plug
order: 3
---

CodeKit 内置了 MCP Server，让 Claude Code、GitHub Copilot 等 AI 编程工具可以直接通过 MCP 协议调用插件能力，也支持通过社区 `skills` CLI 一键安装专用 Skill。

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

### 架构说明

MCP Server 运行在 VS Code 扩展宿主内，因此外部客户端连接时需要本插件所在的 VS Code 实例保持运行。服务采用 Bearer Token 认证，支持固定 Token 和自动生成 Token 两种方式，确保连接安全。

## Skills

本仓库提供一个通用 `sifli-sdk-codekit` skill，可通过社区 `skills` CLI 安装到 Claude Code、Codex 和 GitHub Copilot。

```bash
npx skills add OpenSiFli/SiFli-SDK-CodeKit

# 指定技能和目标 agent
npx skills add OpenSiFli/SiFli-SDK-CodeKit --skill sifli-sdk-codekit -a claude-code
npx skills add OpenSiFli/SiFli-SDK-CodeKit --skill sifli-sdk-codekit -a codex
npx skills add OpenSiFli/SiFli-SDK-CodeKit --skill sifli-sdk-codekit -a github-copilot
```

### 使用前提

- VS Code 已安装并启用 SiFli SDK CodeKit 插件
- CodeKit MCP Server 已启动
- 目标 agent 已按连接文档完成 MCP 配置

安装后，Skill 会优先引导 agent 使用 CodeKit 提供的 MCP 工具完成 SDK、开发板、项目、编译、下载、串口监视器和工作流等操作。Skill 的完整安装文件位于仓库 `skills/sifli-sdk-codekit/` 目录下；如果当前环境无法看到 CodeKit 工具，会提示按连接文档完成配置。