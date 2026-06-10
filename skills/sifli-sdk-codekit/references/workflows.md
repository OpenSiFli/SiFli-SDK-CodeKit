# CodeKit Workflows

Use workflows for repeatable CodeKit actions such as clean-build-download-monitor or board-specific setup.

## Workflow Shape

Workflow payloads contain:

- `id`: stable identifier.
- `name`: user-facing name.
- `description`: optional summary.
- `inputs`: optional prompted values.
- `steps`: ordered step list.
- `failurePolicy`: `stop` or `continue`.

### Supported Step Types

| Step Type | Purpose |
|-----------|---------|
| `build.compile` | Incremental compile |
| `build.rebuild` | Clean + compile |
| `build.clean` | Delete build output |
| `build.download` | Flash to selected serial device |
| `build.menuconfig` | Open menuconfig in VS Code terminal |
| `shell.command` | Run a shell command |
| `monitor.open` | Open VS Code serial monitor |
| `monitor.close` | Close active monitor |
| `serial.selectPort` | Select serial port |

### Step Fields

| Field | Required | Description |
|-------|----------|-------------|
| `type` | ✅ | Step type from table above |
| `name` | ❌ | Optional label |
| `args` | ❌ | Step-specific arguments (e.g. `monitorBaud`, `command`) |
| `wait` | ❌ | Whether to wait for completion |
| `continueOnError` | ❌ | Override `failurePolicy` for this step |
| `runIf` | ❌ | Conditions: `boardSelected`, `serialPortSelected`, `monitorActive` |

## Validation First

Always call the current environment's equivalent of `sifli_workflow_validate` before saving or recommending a workflow payload. Prefer validating the exact object the user will use.

Tool name examples:

- Codex wrapper: `sifli_workflow_validate`
- Raw MCP: `sifli.workflow.validate`
- VS Code LM tools: not exposed; use CodeKit UI or MCP validation instead

## Example: Build → Download → Monitor

```json
{
  "id": "build-download-monitor",
  "name": "Build, Download, Monitor",
  "description": "Compile the active project, download it, then open the serial monitor.",
  "failurePolicy": "stop",
  "steps": [
    {
      "name": "Compile",
      "type": "build.compile",
      "wait": true,
      "runIf": {
        "boardSelected": true
      }
    },
    {
      "name": "Download",
      "type": "build.download",
      "wait": true,
      "runIf": {
        "boardSelected": true,
        "serialPortSelected": true
      }
    },
    {
      "name": "Open monitor",
      "type": "monitor.open",
      "args": {
        "monitorBaud": 1000000
      },
      "wait": false
    }
  ]
}
```

> **Baud rate note:** The `monitorBaud` value (e.g., `1000000`) depends on the target device and firmware configuration. Check the device datasheet or `sifli_serial_status` output before choosing a rate. Common SiFli baud rates: `921600`, `1000000`, `2000000`. Do not guess — ask the user or inspect the current project configuration.

## Running a Workflow

Use the current environment's equivalent of `sifli_workflow_get` to inspect compatibility, then run with the workflow ref. If the workflow defines `inputs`, provide an `inputs` map keyed by input `key`.

If only VS Code LM tools are available, `runWorkflow` may be available but `get` and `validate` may not be. In that case, prefer the CodeKit workflow UI or connect the MCP server before recommending or running a new workflow payload.

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Saving or running a workflow without validation | Always call the current environment's workflow-validation tool first. |
| Using a non-existent step type | Check the supported step types table above. |
| Forgetting `runIf` conditions for download steps | Add `boardSelected` and `serialPortSelected` gates. |
| Hard-coding port names or baud rates | Use `serial.selectPort` step or user inputs instead. |
| Setting `failurePolicy: continue` without `continueOnError` on specific steps | Either keep `failurePolicy: stop` or add `continueOnError` per step. |

*Last updated: 2026-06-09 • CodeKit workflow format v1*
