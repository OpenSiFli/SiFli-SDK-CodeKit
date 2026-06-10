<a href="https://marketplace.visualstudio.com/items?itemName=SiFli.sifli-sdk-codekit">
  <img src="images/readme/SiFli.png" alt="SiFli SDK" title="SiFli" align="right" height="100" />
</a>

# sifli-sdk-codekit - VS Code 插件

[English](./README_EN.md)

![Version](https://img.shields.io/github/package-json/v/OpenSiFli/SiFli-SDK-CodeKit)
[![Releases](https://img.shields.io/badge/Github-main-blue)](https://github.com/OpenSiFli/SiFli-SDK-CodeKit)
[![Forum](https://img.shields.io/badge/Forum-sifli.com-blue)](https://www.sifli.com//viewforum.php?f=40)

`sifli-sdk-codekit` 是一款用于简化 SiFli-SDK 项目开发的 Visual Studio Code 插件。它提供一系列便捷的操作入口，帮助用户高效完成项目管理、编译、下载及配置等工作。

---

## 使用方法

请参考我们的[使用指南](https://docs.sifli.com/projects/codekit)以了解如何安装和使用该插件。

## 串口监视器

CodeKit 内置独立的串口监视器面板，不再依赖 VS Code 终端作为主要交互界面。

- 支持 String 与 HEX 两种发送模式
- 支持文本日志与 HEX 字节视图切换
- 支持通过 DTR/RTS 控制线发送复位脉冲
- 可通过 `sifli-sdk-codekit.serialMonitor.*` 设置默认行尾、打开串口后的 DTR/RTS 空闲电平和复位脉冲参数

## MCP Server

从当前版本开始，CodeKit 内置了一个可选的 MCP Server，供 Claude Code、GitHub Copilot 等 agent 工具或 IDE 通过 MCP 协议调用插件能力。所有工具分为六大功能类别。

### 快速开始

- 在扩展面板中点击 `状态` 启动服务
- 点击 `复制连接信息` 获取连接地址和 Bearer Token
- 可通过设置 `自动启动` 让扩展激活时自动启动 MCP

### 工具概览

| 类别 | 说明 |
|------|------|
| 📦 SDK 管理 | 列出已配置的 SDK、切换激活版本 |
| 🔧 开发板管理 | 扫描可用开发板、选择活动板卡 |
| 📁 项目管理 | 查看项目状态、从模板创建项目、生成 clangd 配置 |
| 🛠 项目构建 | 编译、重新构建、清理、下载固件、打开 menuconfig |
| 🔌 串口通信 | 串口列表、连接、读写、复位、状态查询 |
| 📺 串口监视器 | 打开/关闭串口监视器面板 |
| ⚙️ 自动化工作流 | 列出、查看、验证、运行工作流 |

完整的工具名称、参数及使用说明请参考[进阶功能 - MCP 与 Skills](https://docs.sifli.com/projects/codekit/Feature/mcp-and-skills.html)。

### 架构说明

当前实现运行在 VS Code 扩展宿主内，因此外部客户端连接 MCP 时，需要本插件所在的 VS Code 实例保持运行。MCP Server 采用 Bearer Token 认证，支持固定 Token 和自动生成 Token 两种方式，确保连接安全。

## Skills

本仓库提供一个通用 `sifli-sdk-codekit` skill，可通过社区 `skills` CLI 安装到 Claude Code、Codex 和 GitHub Copilot。

```bash
npx skills add OpenSiFli/SiFli-SDK-CodeKit

# 指定技能和目标 agent
npx skills add OpenSiFli/SiFli-SDK-CodeKit --skill sifli-sdk-codekit -a claude-code
npx skills add OpenSiFli/SiFli-SDK-CodeKit --skill sifli-sdk-codekit -a codex
npx skills add OpenSiFli/SiFli-SDK-CodeKit --skill sifli-sdk-codekit -a github-copilot
```

使用前请确保 VS Code 已安装并启用 SiFli SDK CodeKit 插件，并已启动 CodeKit MCP Server。该 skill 会优先引导 agent 使用 CodeKit 提供的 SDK、开发板、项目、编译、下载、串口监视器和工作流 MCP 工具；如果当前环境无法看到 CodeKit 工具，会提示按连接文档完成配置。

安装内容位于 `skills/sifli-sdk-codekit/`。
