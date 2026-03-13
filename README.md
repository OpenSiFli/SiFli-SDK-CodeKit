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

## MCP Server

从当前版本开始，CodeKit 内置了一个可选的 MCP Server，供其他 agent 工具或 IDE 通过 MCP 调用插件能力。

- 在命令面板中执行 `Start SiFli MCP Server` 启动服务
- 执行 `Show SiFli MCP Connection Info` 获取连接地址和 Bearer Token
- 可通过设置 `sifli-sdk-codekit.mcp.autoStart` 让扩展激活时自动启动 MCP

当前实现运行在 VS Code 扩展宿主内，因此外部客户端连接 MCP 时，需要本插件所在的 VS Code 实例保持运行。
