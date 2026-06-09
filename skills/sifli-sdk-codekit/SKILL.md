---
name: sifli-sdk-codekit
description: Use when the task mentions CodeKit, SiFli SDK CodeKit, the CodeKit MCP server, SiFli board/project/build/download/serial/monitor workflows, or VS Code extension-hosted SiFli tooling.
---

# CodeKit

Use this skill to drive SiFli SDK CodeKit as the high-level orchestration layer for SiFli development. CodeKit runs inside the VS Code extension host and exposes MCP tools for SDK, board, project, build, serial, monitor, and workflow operations.

## First Choice

Prefer CodeKit-hosted tools over shell commands when the task can be expressed through the extension. Use the exact tool names exposed by the current agent environment:

- SDK setup or switching: use `sifli_sdk_*`.
- Board discovery or selection: use `sifli_board_*`.
- Project creation or clangd setup: use `sifli_project_*`.
- Build, rebuild, clean, download, or menuconfig: use `sifli_build_*`.
- Serial port selection or monitor interaction: use `sifli_serial_*` or `sifli_monitor_*`.
- Workflow validation, listing, inspection, or execution: use `sifli_workflow_*`.

These underscore names are Codex-style wrappers. Other agents may expose raw MCP names such as `sifli.project.getState` or VS Code LM tool names such as `sifli-sdk-codekit_getProjectState`. If names differ, map by purpose rather than spelling. See `references/tools.md`.

Use shell commands only for repository development tasks, direct file edits, explicit user-requested shell examples, or after the user approves a non-CodeKit fallback. Do not silently replace build, download, board, or serial operations with shell commands when CodeKit MCP is missing; first diagnose or connect CodeKit.

## Multi-Agent Compatibility

CodeKit can appear differently depending on the host agent:

| Environment | Typical Tool Surface | Example State Tool |
|-------------|----------------------|--------------------|
| Codex MCP wrapper | Function-style names | `sifli_project_getState` |
| Raw MCP clients | Server tool names | `sifli.project.getState` |
| VS Code LM tools | Extension-contributed LM names | `sifli-sdk-codekit_getProjectState` |
| Generic agents | Adapter-specific aliases | Check the current tool list |

Before calling a tool:

1. Inspect the current available tool list or MCP server capabilities.
2. Prefer the current environment's exact CodeKit tool name.
3. If several equivalent tools exist, prefer MCP tools for external agents and VS Code LM tools only inside VS Code chat/LM contexts.
4. If no CodeKit tools are visible, follow `references/installation.md` for the current client. Do not guess tool names.

## Core Pattern

Instead of composing shell commands that bypass CodeKit state:

```text
# ❌ Shell: bypasses CodeKit SDK/board/port state, fragile paths
cd ~/sifli-project
./build.sh --board sf32lb52-lcd_n16r8
sftool write_flash --port /dev/ttyUSB0 --addr 0x12000000 app.bin
```

Drive the same flow through CodeKit MCP tools, using the current agent's exposed names:

```text
# ✅ CodeKit: stateful, no path guessing, integrated
project state                   # e.g. sifli_project_getState or sifli.project.getState
SDK activate                    # or list SDKs, then activate
board select                    # or list boards, then select
build compile                   # narrowest tool
build download                  # uses selected board + serial port
```

CodeKit preserves selected SDK, board, serial port, and project across operations. Shell commands require re-deriving this context each time.

## Decision Flowchart

```
Is CodeKit MCP available?
├── No  → Follow references/installation.md to set up connection.
│         If still unavailable → ask before using non-CodeKit fallback.
├── Yes → Does the task match an MCP tool?
│         ├── SDK/board/project setup    → sifli_sdk_*, sifli_board_*, sifli_project_*
│         ├── Build/download/menuconfig  → sifli_build_*
│         ├── Serial/monitor             → sifli_serial_*, sifli_monitor_*
│         ├── Workflow                   → sifli_workflow_*
│         └── No match → Is it raw flash/sftool territory?
│                       ├── Yes → Use sftool skill
│                       └── No  → Use shell commands
```

## Safe Workflow

1. Check CodeKit state with the current environment's project-state tool.
2. If no CodeKit tools are available, follow `references/installation.md` for the current agent/client.
3. For existing projects, select or activate prerequisites before build actions:
   - Activate SDK before board-dependent work.
   - Select a board before build/download/menuconfig.
   - Select a serial port before download or serial operations.
4. Use the narrowest tool that matches the request. Do not run a full rebuild when compile is enough.
5. Treat tools that open UI or require host interaction (e.g. menuconfig or monitor-open tools) as stateful operations. After launching, tell the user what opened and what they need to do, then ask whether to wait or continue. Do not assume the action completed just because the tool returned.
6. After build/download/serial operations, read the returned status or logs before claiming success.

## When NOT to Use

- **Raw flash readback, explicit address/size operations, chip-memory compatibility** → Use the separate `sftool` skill instead.
- **Developing or debugging the CodeKit extension itself** → This is repository development work, use shell commands.
- **CI/CD pipeline setup, bulk file operations, or git workflows** → Shell commands are more appropriate.
- **When the CodeKit MCP server is unreachable** → Follow `references/installation.md` to set up the connection; use shell fallback only with user approval or for repository development work.
- **If the user explicitly asks for shell/build/sftool commands** → Honor the request; do not override with MCP tools.

## Red Flags

Stop and re-evaluate when you catch yourself thinking or doing any of these:

| Thought / Action | Why It's Wrong |
|-----------------|----------------|
| "I'll just guess the serial port — it's probably /dev/ttyUSB0" | Wrong port causes download failures or bricking. Always list ports. |
| "The board name is probably..." | Board names vary by SDK version and config. Always call `sifli_board_list`. |
| "Let me run a full rebuild to be safe" | Wastes time; use `sifli_build_compile` first, rebuild only if stale. |
| "I'll just run the MCP tool without checking state first" | Without the project-state tool you don't know what's active. |
| "This token is just for config, I can show it" | Bearer tokens grant control; expose only when user explicitly needs connection details. |
| "The shell command is faster than finding the right MCP tool" | Bypassing CodeKit loses state and creates fragile ad-hoc workflows. |
| "The tool name must be `sifli_project_getState` everywhere" | Tool names differ by agent. Match by purpose and current tool list. |

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Activating SDK or selecting board without checking current state first | Always call the project-state tool before making changes. |
| Running `sifli_build_rebuild` when `sifli_build_compile` would suffice | Use compile for incremental builds; rebuild only when outputs are suspected stale. |
| Guessing serial port paths or board names | Always use `sifli_serial_listPorts` and `sifli_board_list` to discover available options. |
| Attempting download without confirming board and serial port selection | Check `selectedBoard` and `selectedSerialPort` in project state before download. |
| Exposing or committing bearer tokens in config files | Keep tokens local; add `.mcp.json` to `.gitignore` if needed. |
| Printing `.mcp.json` to prove the server exists | Report only server name, host/port, and whether a token is present; do not echo the token. |
| Calling workflows without prior validation | Always call the workflow-validation tool before saving or running a workflow. |
| Ignoring `sifli_build_menuconfig` return status or logs | Menuconfig opens in a VS Code terminal and returns once launched; read the output before claiming success. |

## Task Map

- For MCP installation, connection info, `.mcp.json`, and Codex CLI setup, read `references/installation.md`.
- For tool names, required inputs, and common operation order, read `references/tools.md`.
- For reusable CodeKit workflows and workflow JSON shape, read `references/workflows.md`.
- For serial/MCP/build failure handling, read `references/troubleshooting.md`.
- For OpenAI/Codex agent interface description, see `agents/openai.yaml`.

## Boundaries

- Use the separate `sftool` skill for low-level raw flash readback, JSON flash configs, explicit flash addresses, chip-memory compatibility, or direct `sftool` CLI usage.
- Prefer CodeKit for normal extension-managed build/download/monitor flows because it preserves selected SDK, board, project, and serial state.
- Do not guess SDK paths, board names, serial ports, workflow refs, baud rates, or destructive erase operations.
- Do not expose bearer tokens in final answers unless the user explicitly asks for connection configuration details.
- Do not assume one agent's CodeKit tool spelling applies to another agent. Check the current tool surface first.

*Last updated: 2026-06-09*
