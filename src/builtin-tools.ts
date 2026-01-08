/**
 * Built-in tools that are always available, regardless of tools.json
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * The current tools.json schema - embedded so it's always available
 * and stays in sync with the application version
 */
export const TOOLS_SCHEMA = {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "$id": "https://project-mcp/schemas/tools.json",
    "title": "Project MCP Tools Configuration",
    "description": "Schema for .mcp/tools.json configuration file",
    "type": "object",
    "properties": {
        "version": {
            "type": "string",
            "description": "Schema version for forward compatibility",
            "enum": ["1.0"]
        },
        "tools": {
            "type": "array",
            "description": "Array of tool definitions",
            "items": {
                "$ref": "#/definitions/tool"
            }
        }
    },
    "required": ["version", "tools"],
    "additionalProperties": false,
    "definitions": {
        "tool": {
            "type": "object",
            "description": "A single tool definition",
            "properties": {
                "name": {
                    "type": "string",
                    "description": "Tool identifier (alphanumeric + underscores, must start with letter or underscore)",
                    "pattern": "^[a-zA-Z_][a-zA-Z0-9_]*$"
                },
                "description": {
                    "type": "string",
                    "description": "Human-readable description shown to LLM"
                },
                "parameters": {
                    "type": "object",
                    "description": "JSON Schema for tool input parameters",
                    "properties": {
                        "type": {
                            "type": "string",
                            "const": "object"
                        },
                        "properties": {
                            "type": "object",
                            "additionalProperties": {
                                "type": "object",
                                "properties": {
                                    "type": { "type": "string" },
                                    "description": { "type": "string" },
                                    "default": {},
                                    "enum": { "type": "array" }
                                },
                                "required": ["type"]
                            }
                        },
                        "required": {
                            "type": "array",
                            "items": { "type": "string" }
                        }
                    }
                },
                "executor": {
                    "type": "object",
                    "description": "Executor configuration",
                    "properties": {
                        "type": {
                            "type": "string",
                            "description": "Executor type",
                            "enum": ["bash", "python"]
                        },
                        "code": {
                            "type": "string",
                            "description": "Inline code to execute"
                        },
                        "file": {
                            "type": "string",
                            "description": "Path to script file (relative to .mcp/)"
                        },
                        "timeout": {
                            "type": "integer",
                            "description": "Execution timeout in milliseconds (-1 for infinite)",
                            "default": -1,
                            "minimum": -1,
                            "maximum": 300000
                        }
                    },
                    "required": ["type"],
                    "oneOf": [
                        {
                            "required": ["code"],
                            "not": { "required": ["file"] }
                        },
                        {
                            "required": ["file"],
                            "not": { "required": ["code"] }
                        }
                    ]
                }
            },
            "required": ["name", "description", "executor"],
            "additionalProperties": false
        }
    }
};

export interface BuiltinTool {
    name: string;
    description: string;
    inputSchema: {
        type: 'object';
        properties: Record<string, unknown>;
        required?: string[];
    };
    execute: (args: Record<string, unknown>, mcpDir: string) => Promise<{
        content: Array<{ type: 'text'; text: string }>;
        isError?: boolean;
    }>;
}

/**
 * Bootstrap tool - creates tools.schema.json in the MCP directory
 */
const bootstrapTool: BuiltinTool = {
    name: 'bootstrap_tools',
    description: 'Creates the tools.schema.json file in the MCP directory with the current schema. Use this to get started with creating custom tools for this project.',
    inputSchema: {
        type: 'object',
        properties: {},
    },
    execute: async (_args, mcpDir) => {
        const schemaPath = join(mcpDir, 'tools.schema.json');

        try {
            // Create MCP directory if it doesn't exist
            await mkdir(mcpDir, { recursive: true });

            // Write the schema file (overwrites if exists to ensure latest version)
            await writeFile(schemaPath, JSON.stringify(TOOLS_SCHEMA, null, 4), 'utf-8');

            const instructions = `Successfully created tools.schema.json in ${mcpDir}

## What is tools.json?

The tools.json file allows you to define custom tools that become available through this MCP server. Each tool you define can execute bash scripts or Python code, enabling project-specific automation and functionality.

## How to Create Tools

1. Create a file named "tools.json" in the ${mcpDir} directory

2. Reference the schema file (tools.schema.json) to understand the structure:
   - "version": Must be "1.0"
   - "tools": Array of tool definitions

3. Each tool requires:
   - "name": Unique identifier (alphanumeric + underscores)
   - "description": Human-readable description for the LLM
   - "executor": How to run the tool (bash or python, with inline code or file reference)
   - "parameters": (optional) JSON Schema defining input parameters

4. Tools receive parameters as environment variables:
   - PROJECT_ROOT: The project directory
   - MCP_TOOLS_DIR: The MCP directory path
   - TOOL_NAME: The executing tool's name
   - PARAM_<NAME>: Each parameter value

## Example tools.json

{
    "version": "1.0",
    "tools": [
        {
            "name": "list_files",
            "description": "List files in the project directory",
            "executor": {
                "type": "bash",
                "code": "ls -la $PROJECT_ROOT"
            }
        }
    ]
}

Read tools.schema.json for the complete schema definition.`;

            return {
                content: [{ type: 'text', text: instructions }],
            };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return {
                content: [{ type: 'text', text: `Error creating schema file: ${message}` }],
                isError: true,
            };
        }
    },
};

/**
 * All built-in tools
 */
export const builtinTools: BuiltinTool[] = [bootstrapTool];

/**
 * Get a built-in tool by name
 */
export function getBuiltinTool(name: string): BuiltinTool | undefined {
    return builtinTools.find(t => t.name === name);
}
