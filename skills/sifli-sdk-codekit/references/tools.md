# CodeKit MCP Tool Guide

Use this reference to choose tools and operation order.

## Quick Reference

Use the spelling exposed by the current agent. The table below uses Codex wrapper names because they are readable in this repository's Codex environment.

| Category | Tool | Purpose | Run First |
|----------|------|---------|-----------|
| **State** | `sifli_project_getState` | Inspect project, SDK, board, serial, monitor, workflows | ✅ Always first |
| **SDK** | `sifli_sdk_list` | List configured SDKs | Before activate |
| | `sifli_sdk_activate` | Activate SDK by path or version | |
| **Board** | `sifli_board_list` | List available boards | Before select |
| | `sifli_board_select` | Select active board (+ optional thread count) | |
| | `sifli_project_configureClangd` | Update clangd args + `.clangd` for selected board | After board select |
| **Project** | `sifli_project_listTemplates` | List creatable SDK example templates | |
| | `sifli_project_createFromExample` | Create project from SDK example | |
| **Build** | `sifli_build_compile` | Incremental compile | Prefer over rebuild |
| | `sifli_build_rebuild` | Clean + compile | Only when outputs stale |
| | `sifli_build_clean` | Delete build output | Only when requested |
| | `sifli_build_download` | Flash to selected serial device | After board + port selected |
| | `sifli_build_menuconfig` | Open menuconfig in VS Code terminal | |
| **Serial** | `sifli_serial_listPorts` | List serial ports | Before select |
| | `sifli_serial_selectPort` | Select download/log serial port | |
| | `sifli_serial_connect` | Connect MCP-driven serial session | |
| | `sifli_serial_write` | Write text or hex bytes | |
| | `sifli_serial_read` | Read buffered serial logs | |
| | `sifli_serial_status` | Inspect active serial session | |
| | `sifli_serial_reset` | Pulse DTR/RTS to reset device | |
| | `sifli_serial_disconnect` | Disconnect active serial session | |
| **Monitor** | `sifli_monitor_open` | Open VS Code serial monitor | For user-visible logs |
| | `sifli_monitor_close` | Close active monitor | |
| **Workflow** | `sifli_workflow_list` | List workflows | |
| | `sifli_workflow_get` | Inspect one workflow + compatibility | Before run |
| | `sifli_workflow_validate` | Validate workflow JSON | Before save/run |
| | `sifli_workflow_run` | Run workflow by ref (+ optional inputs) | |

## Tool Name Mapping

Different agents expose the same CodeKit capability with different names. Match by purpose and schema.

| Purpose | Raw MCP Tool | Codex Wrapper | VS Code LM Tool |
|---------|--------------|---------------|-----------------|
| Project state | `sifli.project.getState` | `sifli_project_getState` | `sifli-sdk-codekit_getProjectState` |
| List SDKs | `sifli.sdk.list` | `sifli_sdk_list` | Not exposed |
| Activate SDK | `sifli.sdk.activate` | `sifli_sdk_activate` | Not exposed |
| List boards | `sifli.board.list` | `sifli_board_list` | `sifli-sdk-codekit_listBoards` |
| Select board | `sifli.board.select` | `sifli_board_select` | `sifli-sdk-codekit_selectBoard` |
| Configure clangd | `sifli.project.configureClangd` | `sifli_project_configureClangd` | Not exposed |
| List templates | `sifli.project.listTemplates` | `sifli_project_listTemplates` | Not exposed |
| Create from example | `sifli.project.createFromExample` | `sifli_project_createFromExample` | Not exposed |
| Compile | `sifli.build.compile` | `sifli_build_compile` | `sifli-sdk-codekit_compile` |
| Rebuild | `sifli.build.rebuild` | `sifli_build_rebuild` | `sifli-sdk-codekit_rebuild` |
| Clean | `sifli.build.clean` | `sifli_build_clean` | `sifli-sdk-codekit_clean` |
| Download | `sifli.build.download` | `sifli_build_download` | `sifli-sdk-codekit_download` |
| Menuconfig | `sifli.build.menuconfig` | `sifli_build_menuconfig` | Not exposed |
| List serial ports | `sifli.serial.listPorts` | `sifli_serial_listPorts` | `sifli-sdk-codekit_listSerialPorts` |
| Select serial port | `sifli.serial.selectPort` | `sifli_serial_selectPort` | `sifli-sdk-codekit_selectSerialPort` |
| Serial connect | `sifli.serial.connect` | `sifli_serial_connect` | Not exposed |
| Serial read | `sifli.serial.read` | `sifli_serial_read` | Not exposed |
| Serial write | `sifli.serial.write` | `sifli_serial_write` | Not exposed |
| Serial reset | `sifli.serial.reset` | `sifli_serial_reset` | Not exposed |
| Serial status | `sifli.serial.status` | `sifli_serial_status` | Not exposed |
| Serial disconnect | `sifli.serial.disconnect` | `sifli_serial_disconnect` | Not exposed |
| Open monitor | `sifli.monitor.open` | `sifli_monitor_open` | `sifli-sdk-codekit_openMonitor` |
| Close monitor | `sifli.monitor.close` | `sifli_monitor_close` | `sifli-sdk-codekit_closeMonitor` |
| List workflows | `sifli.workflow.list` | `sifli_workflow_list` | `sifli-sdk-codekit_listWorkflows` |
| Get workflow | `sifli.workflow.get` | `sifli_workflow_get` | Not exposed |
| Validate workflow | `sifli.workflow.validate` | `sifli_workflow_validate` | Not exposed |
| Run workflow | `sifli.workflow.run` | `sifli_workflow_run` | `sifli-sdk-codekit_runWorkflow` |

Notes:

- VS Code LM tools are available only in VS Code language model contexts and may be gated by `when` clauses such as `sifli.isProject`.
- Raw MCP clients may show dotted names exactly as registered by the CodeKit MCP server.
- Codex and some other agents normalize MCP names into function-safe wrapper names.
- If a tool is missing in one surface, use the nearest CodeKit MCP equivalent rather than shelling out.

## Operation Order

### SDK → Board → Clangd

```
sifli_sdk_list → sifli_sdk_activate
              → sifli_board_list → sifli_board_select
                                 → sifli_project_configureClangd
```

Do not guess board names. Use `sifli_board_list` or ask the user.

### Build → Download

```
sifli_project_getState (confirm selectedBoard + selectedSerialPort exist)
→ sifli_build_compile (prefer over rebuild)
→ sifli_build_download
```

Use `compile` for incremental builds, `rebuild` for suspected stale outputs, and `clean` only when requested or needed.

### Serial: Agent-Driven vs User-Visible

| Goal | Tool |
|------|------|
| Agent reads device logs | `sifli_serial_connect` → read/write/disconnect |
| User watches serial output | `sifli_monitor_open` / `sifli_monitor_close` |

Some MCP clients do not support experimental task tools. If `menuconfig` or `monitor.open` reports `input_required`, starts a host-side UI, or cannot be polled by the client, tell the user what opened in VS Code and ask whether to continue, wait, or use the VS Code command palette fallback.

## Project Creation

Required decisions for `sifli_project_createFromExample`:

- `exampleId`
- `targetPath`
- optional `sdkPath` or `sdkVersion`
- optional `initializeGit`

Do not overwrite an existing target path unless the user explicitly approves.

*Last updated: 2026-06-09*
