/**
 * Type definitions for project-mcp server
 */

/**
 * Executor configuration for a tool
 */
export interface ToolExecutor {
    /** Executor type: bash or python */
    type: 'bash' | 'python';
    /** Inline code to execute (mutually exclusive with file) */
    code?: string;
    /** Path to script file relative to .mcp/ directory (mutually exclusive with code) */
    file?: string;
    /** Execution timeout in milliseconds (default: 30000) */
    timeout?: number;
}

/**
 * Tool definition from tools.json
 */
export interface ToolDefinition {
    /** Tool identifier (alphanumeric + underscores) */
    name: string;
    /** Human-readable description shown to LLM */
    description: string;
    /** JSON Schema for tool input parameters */
    parameters?: {
        type: 'object';
        properties?: Record<string, {
            type: string;
            description?: string;
            default?: unknown;
            enum?: unknown[];
        }>;
        required?: string[];
    };
    /** Executor configuration */
    executor: ToolExecutor;
}

/**
 * Root structure of tools.json
 */
export interface ToolsConfig {
    /** Schema version */
    version: '1.0';
    /** Array of tool definitions */
    tools: ToolDefinition[];
}

/**
 * Result of tool execution
 */
export interface ExecutionResult {
    /** Whether execution succeeded */
    success: boolean;
    /** Standard output from the command */
    stdout: string;
    /** Standard error from the command */
    stderr: string;
    /** Exit code (0 for success) */
    exitCode: number;
    /** Error message if execution failed */
    error?: string;
}

/**
 * Events emitted by the file watcher
 */
export interface WatcherEvents {
    /** Emitted when tools.json is created or modified */
    change: (config: ToolsConfig) => void;
    /** Emitted when tools.json is deleted */
    delete: () => void;
    /** Emitted on parse/validation errors */
    error: (error: Error) => void;
}

/**
 * Events emitted by the tool registry
 */
export interface RegistryEvents {
    /** Emitted when tools are updated */
    update: (tools: ToolDefinition[]) => void;
}
