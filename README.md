# project-mcp

A Node.js MCP server that enables project-specific tool extensibility via `.mcp/tools.json`.

## Features

- **Dynamic tool loading**: Define tools in `.mcp/tools.json` and they become available via MCP
- **Hot-reload**: Tools are automatically reloaded when `tools.json` changes
- **Bash & Python executors**: Run inline code or external scripts
- **Environment injection**: Project root and parameters are available as environment variables

## Installation

```bash
npm install
npm run build
```

## Usage

### As an MCP server in VS Code

Add to your `.vscode/mcp.json`:

```json
{
  "servers": {
    "projectTools": {
      "type": "stdio",
      "command": "node",
      "args": [
        "/path/to/project-mcp/dist/index.js",
        "--project-root",
        "${workspaceFolder}"
      ],
      "env": {
        "DEBUG_LOG": "/tmp/project-mcp.log"
      }
    }
  }
}
```

> [!NOTE]
> We use the `--project-root` argument with `${workspaceFolder}` to ensure the project root is passed immediately upon server startup. This is required for the server to load tools before the client requests them.

### Universal / CLI Usage

For other clients (Claude Desktop, MCP CLI, etc.), you can run the server directly. The server defaults to using the **current working directory** as the project root if no argument is provided.

**Method 1: Run from project directory (Recommended)**
```bash
cd /path/to/my-project
node /path/to/project-mcp/dist/index.js
```

**Method 2: Specify absolute path**
```bash
node /path/to/project-mcp/dist/index.js --project-root /path/to/my-project
```

### Customizing MCP Directory

By default, the server looks for `tools.json` in the `.mcp` directory inside the project root. You can customize this name using the `--mcp-dir` argument:

```bash
# Looks in /path/to/project/custom_mcp/tools.json
node /path/to/project-mcp/dist/index.js --project-root /path/to/project --mcp-dir custom_mcp
```

### Manual testing

```bash
PROJECT_ROOT=/path/to/your/project npm start
```

## Configuration

Create `.mcp/tools.json` in your project:

```json
{
  "version": "1.0",
  "tools": [
    {
      "name": "hello_world",
      "description": "A simple hello world tool",
      "parameters": {
        "type": "object",
        "properties": {
          "name": {
            "type": "string",
            "description": "Name to greet",
            "default": "World"
          }
        }
      },
      "executor": {
        "type": "bash",
        "code": "echo \"Hello, ${name:-World}!\""
      }
    }
  ]
}
```

## Tool Definition Schema

Each tool in the `tools` array has the following structure:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Tool identifier (alphanumeric + underscores) |
| `description` | string | Yes | Human-readable description |
| `parameters` | object | No | JSON Schema for input parameters |
| `executor` | object | Yes | Execution configuration |

### Executor Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"bash"` or `"python"` | Yes | Executor type |
| `code` | string | One of code/file | Inline code to execute |
| `file` | string | One of code/file | Script file path (relative to `.mcp/`) |
| `timeout` | number | No | Timeout in milliseconds (-1 for infinite, default: -1) |

## Environment Variables

The following environment variables are available in your scripts:

| Variable | Description |
|----------|-------------|
| `PROJECT_ROOT` | Absolute path to the project directory |
| `MCP_TOOLS_DIR` | Absolute path to `.mcp/` directory |
| `TOOL_NAME` | Name of the executing tool |
| `PARAM_<NAME>` | Each parameter (uppercase) |
| `<name>` | Each parameter (original case, for shell variable access) |

## Configuration Options

| Environment Variable | Description | Default |
|---------------------|-------------|---------|
| `PROJECT_ROOT` | Project directory path | Current directory |
| `POLL_INTERVAL_MS` | Polling interval for file changes | 5000 |

## License

MIT
