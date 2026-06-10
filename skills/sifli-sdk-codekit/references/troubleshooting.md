# Troubleshooting

## MCP Tools Are Missing

First detect whether the current agent already has CodeKit MCP access:

1. Check whether tools named like `sifli_project_getState`, `sifli_sdk_list`, or `sifli_build_compile` are available in the current tool list.
2. If raw MCP tools are visible instead, look for dotted names like `sifli.project.getState`, `sifli.sdk.list`, or `sifli.build.compile`.
3. If VS Code LM tools are visible instead, look for extension names like `sifli-sdk-codekit_getProjectState`, `sifli-sdk-codekit_listBoards`, or `sifli-sdk-codekit_compile`.
4. If any equivalent tools are available, call the current environment's project-state tool to verify the server responds.
5. If the tools are not available, inspect the current workspace MCP configuration when allowed, such as `.mcp.json`, to see whether a `codekit` MCP server is already configured. Do not print bearer tokens.
6. If no CodeKit MCP server is installed or configured for the current agent, ask the user whether they want to install/connect it before making hardware-affecting changes.

When the user agrees to install or connect CodeKit MCP:

1. Confirm VS Code is open with the SiFli SDK CodeKit extension installed.
2. Ask the user to start the server with `Start SiFli MCP Server`.
3. Ask the user to show connection info with `Show SiFli MCP Connection Info`.
4. Ask the user for the exact MCP URL and Bearer token.
5. Ask which agent/client should be configured and whether to write the configuration to a workspace-local file, user-level config, or client MCP registry.
6. Restart or reload the agent session after configuration changes so MCP tools are re-discovered.

The embedded server runs inside the VS Code extension host. If VS Code closes, external MCP clients lose access.

## Unauthorized Or 401

- Refresh connection info in VS Code.
- Confirm the header is `Authorization: Bearer <token>`.
- If using Codex CLI, confirm the environment variable named by `--bearer-token-env-var` exists in the launching environment.
- If `fixedToken` changed, restart the MCP server and update clients.

## Port Or URL Mismatch

- CodeKit serves `/mcp`, not `/`.
- If `mcp.port` is `0`, CodeKit chooses a random available port each start. Use `Show SiFli MCP Connection Info`.
- Use a fixed port only when the user needs stable configuration.

## Build Fails

Check state in this order:

1. Current environment's project-state tool
2. Active SDK exists.
3. Selected board exists.
4. Current workspace is a SiFli project.
5. Try `sifli_build_compile` before `sifli_build_rebuild`.

If the failure is toolchain/path related, use CodeKit SDK activation and clangd configuration before shell-level fixes.

## Download Or Serial Fails

- Run `sifli_serial_listPorts`.
- Select the exact port with `sifli_serial_selectPort`.
- Close conflicting serial monitors or tools.
- Confirm baud rates in project state.
- Use `sifli_monitor_close` or `sifli_serial_disconnect` before reconnecting if the port is busy.

## When To Switch To `sftool`

Use the `sftool` skill for raw flash operations, explicit address/size readbacks, `sftool` JSON configs, compatibility flags, chip-memory matrix decisions, or any request that names the `sftool` CLI directly.

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Rebuilding when compile would suffice | Try `sifli_build_compile` first; escalate to `rebuild` only if stale. |
| Skipping state check before troubleshooting | Always start with the project-state tool — it reveals SDK/board/serial state. |
| Assuming MCP tools are available without checking | Check the client tool list or `.mcp.json` before trying MCP commands. |
| Treating Codex wrapper names as universal | Map by purpose: Codex uses underscores, raw MCP uses dotted names, VS Code LM tools use `sifli-sdk-codekit_*`. |
| Attempting serial download without closing monitor | Call `sifli_monitor_close` or `sifli_serial_disconnect` before reconnecting. |
| Guessing port/URL when connection info is stale | Re-run `Show SiFli MCP Connection Info` in VS Code for current values. |

*Last updated: 2026-06-09*
