# Installation And MCP Connection

Use this reference when CodeKit MCP tools are missing or the user asks to install/connect the MCP server.

## Prerequisites

- VS Code must have the SiFli SDK CodeKit extension installed and enabled.
- The VS Code window that hosts CodeKit must stay open while external MCP clients use the server.
- The embedded MCP server is HTTP streamable and serves `/mcp`.

## Start CodeKit MCP In VS Code

Use the command palette in the CodeKit-hosting VS Code window:

1. Run `Start SiFli MCP Server`.
2. Run `Show SiFli MCP Connection Info`.
3. Copy the URL and Bearer token.

Optional settings:

- `sifli-sdk-codekit.mcp.enabled`: enable or disable the embedded server.
- `sifli-sdk-codekit.mcp.autoStart`: start automatically when the extension activates.
- `sifli-sdk-codekit.mcp.host`: default `127.0.0.1`.
- `sifli-sdk-codekit.mcp.port`: use `0` for a random available port, or a fixed port such as `12345`.
- `sifli-sdk-codekit.mcp.fixedToken`: set only when a stable token is required.

## Add To MCP Clients

Different agents load MCP servers differently. Use the current client's native configuration path when known; use `.mcp.json` only for clients that explicitly read it.

Before editing any MCP configuration, actively ask the user for the CodeKit MCP URL and Bearer token shown by `Show SiFli MCP Connection Info`. Do not invent, reuse, or copy a token from another workspace unless the user explicitly confirms it.

Ask for:

- MCP URL, for example `http://127.0.0.1:12345/mcp`
- Bearer token
- Which agent/client should be configured
- Whether they want the config written to a workspace-local file, a user-level config, or the client's MCP registry

### Claude Code — Project `.mcp.json`

If the host agent is **Claude Code**, configure CodeKit MCP by creating a `.mcp.json` file in the project root directory (next to this workspace's root). Add or update this streamable HTTP server entry after the user provides values and approves writing the file:

```json
{
  "mcpServers": {
    "codekit": {
      "type": "http",
      "url": "http://127.0.0.1:12345/mcp",
      "headers": {
        "Authorization": "Bearer <TOKEN_FROM_CODEKIT>"
      }
    }
  }
}
```

Claude Code reads `.mcp.json` from the project root on startup. After creating or updating the file, restart the Claude Code session so the tools appear.

Keep tokens local. Do not commit real tokens.

### Codex CLI (Apple)

If using Apple's **Codex CLI** command-line agent, prefer the MCP registry with an environment variable for the token:

```bash
export CODEKIT_MCP_TOKEN="<TOKEN_FROM_CODEKIT>"
/Applications/Codex.app/Contents/Resources/codex mcp add codekit \
  --url http://127.0.0.1:12345/mcp \
  --bearer-token-env-var CODEKIT_MCP_TOKEN
```

Use the actual URL from `Show SiFli MCP Connection Info`.

### Other Agents

For agents other than Claude Code, installation steps depend on the host environment. Follow that agent's own MCP configuration documentation:

- **Codex CLI (Apple):** use the `codex mcp add` command with `--bearer-token-env-var` (see Codex CLI docs).
- **Copilot CLI / Gemini CLI / generic MCP clients:** configure a streamable HTTP MCP server with `Authorization: Bearer <token>` using the client's documented config shape.
- **VS Code MCP clients:** prefer the CodeKit extension's MCP server definition provider when available; otherwise configure a streamable HTTP MCP server pointing to `/mcp`.

When unsure, do not guess the config file format. Ask the user which client they want to configure, or inspect that client's documented config in the workspace.

## Verify The Connection

After adding the server, restart or reload the client session so tools appear. A successful setup exposes tools with names like:

- `sifli_project_getState`
- `sifli_sdk_list`
- `sifli_board_list`
- `sifli_build_compile`
- `sifli_serial_listPorts`
- `sifli_workflow_list`

Raw MCP clients may instead show dotted names such as `sifli.project.getState`; VS Code chat/LM contexts may show extension names such as `sifli-sdk-codekit_getProjectState`. See `tools.md` for the mapping.

If tools do not appear, read `troubleshooting.md`.

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Guessing or reusing a bearer token from another workspace | Actively ask the user for the current token from VS Code. |
| Committing `.mcp.json` with a real token | Add `.mcp.json` to `.gitignore`, or use environment variables. |
| Printing `.mcp.json` while debugging | Report only whether the server entry and token are present; never echo the bearer token. |
| Setting a fixed port without telling the user | Use `mcp.port: 0` for random port, or document the chosen port. |
| Expecting MCP tools to appear without restarting the client | Restart or reload the client session after writing `.mcp.json`. |
| Trying to connect while VS Code is closed | The MCP server runs inside VS Code; VS Code must stay open. |

*Last updated: 2026-06-09*
