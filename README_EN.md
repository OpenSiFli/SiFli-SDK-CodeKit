<a href="https://marketplace.visualstudio.com/items?itemName=SiFli.sifli-sdk-codekit">
  <img src="images/readme/SiFli.png" alt="SiFli SDK" title="SiFli" align="right" height="100" />
</a>

# sifli-sdk-codekit - VS Code Extension

[中文](./README.md)

![Version](https://img.shields.io/github/package-json/v/OpenSiFli/SiFli-SDK-CodeKit)
[![Releases](https://img.shields.io/badge/Github-main-blue)](https://github.com/OpenSiFli/SiFli-SDK-CodeKit)
[![Forum](https://img.shields.io/badge/Forum-sifli.com-blue)](https://www.sifli.com//viewforum.php?f=40)

`sifli-sdk-codekit` is a Visual Studio Code extension designed to simplify the development process of SiFli-SDK projects. It provides a series of convenient operation entries to help users efficiently complete project management, compilation, downloading, and configuration tasks.

---

## How to Use

Please refer to our [User Guide](https://docs.sifli.com/projects/codekit) to learn how to install and use the extension.

## Serial Monitor

CodeKit includes a standalone serial monitor panel and no longer depends on the VS Code terminal as the primary serial interaction UI.

- Send data as String or HEX
- Switch between text logs and HEX byte view
- Pulse DTR/RTS control lines for device reset
- Configure the default line ending, open-state DTR/RTS levels, and reset pulse parameters with `sifli-sdk-codekit.serialMonitor.*`

## MCP Server

CodeKit now includes an optional embedded MCP Server so agent tools (Claude Code, GitHub Copilot, etc.) or IDEs can call extension capabilities through the MCP protocol. All tools are organized into six functional categories.

### Quick Start

- Click `Status` in the extension panel to start the server
- Click `Copy Connection Info` to get the URL and Bearer token
- Enable `Auto Start` in settings to start MCP automatically on extension activation

### Tool Overview

| Category | Description |
|----------|-------------|
| 📦 SDK Management | List configured SDKs, switch active version |
| 🔧 Board Management | Scan for boards, select active board |
| 📁 Project Management | Get project state, create from template, configure clangd |
| 🛠 Build | Compile, rebuild, clean, download firmware, open menuconfig |
| 🔌 Serial Communication | List ports, connect, read/write, reset, query status |
| 📺 Serial Monitor | Open/close the serial monitor panel |
| ⚙️ Automation Workflows | List, get, validate, run workflows |

::: tip
For complete tool names, parameters, and usage, refer to the [MCP & Skills](https://docs.sifli.com/projects/codekit/Feature/mcp-and-skills.html) documentation.
:::

### Architecture

The current implementation runs inside the VS Code extension host, so the VS Code instance hosting CodeKit must remain running while external clients use the MCP connection. The MCP Server uses Bearer Token authentication and supports both fixed and auto-generated tokens for secure connections.
