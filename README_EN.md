<a href="https://marketplace.visualstudio.com/items?itemName=SiFli.sifli-sdk-codekit">
  <img src="images/readme/SiFli.png" alt="SiFli SDK" title="SiFli" align="right" height="100" />
</a>

# sifli-sdk-codek**Q3: Terminal doesn't automatically enter the project folder?**

- Please ensure that a subfolder named `project` exists in the root directory.- VS Code Extension

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

CodeKit now includes an optional embedded MCP Server so other agent tools or IDEs can call extension capabilities through MCP.

- Run `Start SiFli MCP Server` from the command palette to start the server
- Run `Show SiFli MCP Connection Info` to get the URL and Bearer token
- Enable `sifli-sdk-codekit.mcp.autoStart` to start it automatically on activation
- Serial MCP tools include `sifli.serial.listPorts`, `sifli.serial.connect`, `sifli.serial.write`, `sifli.serial.read`, `sifli.serial.reset`, `sifli.serial.status`, and `sifli.serial.disconnect`

The current implementation runs inside the VS Code extension host, so the VS Code instance that hosts CodeKit must remain running while external clients use the MCP connection.
