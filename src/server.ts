/**
 * MCP Server implementation for project-mcp
 * 
 * Uses the MCP roots capability to dynamically get the project folder from the client.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
    ListRootsResultSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { registry } from './registry.js';
import { executeCommand } from './executor.js';
import { ToolsWatcher } from './watcher.js';
import type { ToolDefinition, ToolsConfig } from './types.js';

let currentProjectRoot: string | null = null;
let currentMcpDir: string | null = null;
let watcher: ToolsWatcher | null = null;

// Track initialization state to block tools/list until ready
let isInitialized = false;
let initResolve: () => void;
let initPromise = new Promise<void>((resolve) => {
    initResolve = resolve;
});

// File-based logging for debugging when stderr isn't visible
import { appendFileSync } from 'node:fs';
const DEBUG_LOG = process.env.DEBUG_LOG;

function debugLog(message: string): void {
    const line = `[${new Date().toISOString()}] ${message}\n`;
    console.error(message);
    if (DEBUG_LOG) {
        try {
            appendFileSync(DEBUG_LOG, line);
        } catch {
            // Ignore write errors
        }
    }
}

/**
 * Create and configure the MCP server
 */
export function createServer(): Server {
    // Dump all environment variables and process info for debugging
    console.error('[debug] ========== INITIALIZATION DEBUG ==========');
    console.error('[debug] Process CWD:', process.cwd());
    console.error('[debug] Process argv:', process.argv);
    console.error('[debug] ========== ENVIRONMENT VARIABLES ==========');
    for (const [key, value] of Object.entries(process.env)) {
        // Skip common noise, show MCP/project related vars
        if (key.startsWith('PROJECT') ||
            key.startsWith('MCP') ||
            key.startsWith('WORKSPACE') ||
            key.startsWith('VSCODE') ||
            key === 'PWD' ||
            key === 'HOME' ||
            key === 'PATH') {
            console.error(`[debug] ${key}=${value}`);
        }
    }
    console.error('[debug] ========== END DEBUG ==========');

    const server = new Server(
        {
            name: 'project-mcp',
            version: '1.0.0',
        },
        {
            capabilities: {
                tools: {},
            },
        }
    );

    // Handle tools/list request
    server.setRequestHandler(ListToolsRequestSchema, async () => {
        // Wait for initialization to complete (up to 5 seconds)
        if (!isInitialized) {
            console.error('[server] Waiting for initialization...');
            const timeoutMs = 5000;
            const timeoutPromise = new Promise<void>((_, reject) => {
                setTimeout(() => resolveTimeout(reject), timeoutMs);
            });

            // Helper to handle timeout rejection safely
            const resolveTimeout = (reject: (reason?: any) => void) => {
                if (!isInitialized) {
                    console.error('[server] Timeout waiting for tools initialization');
                    initResolve(); // Force resolve to unblock
                }
            };

            await Promise.race([initPromise, timeoutPromise]).catch(() => {
                // Ignore timeout errors, proceed with what we have
            });
        }

        const tools = registry.getTools();
        console.error(`[server] Returning ${tools.length} tools`);

        return {
            tools: tools.map((tool) => ({
                name: tool.name,
                description: tool.description,
                inputSchema: tool.parameters ?? {
                    type: 'object' as const,
                    properties: {},
                },
            })),
        };
    });

    // Handle tools/call request
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;

        if (!currentProjectRoot || !currentMcpDir) {
            return {
                content: [
                    {
                        type: 'text' as const,
                        text: 'Error: Project root not initialized. The MCP client must provide roots.',
                    },
                ],
                isError: true,
            };
        }

        const tool = registry.getTool(name);
        if (!tool) {
            return {
                content: [
                    {
                        type: 'text' as const,
                        text: `Error: Unknown tool "${name}"`,
                    },
                ],
                isError: true,
            };
        }

        console.error(`[server] Executing tool: ${name}`);

        try {
            const result = await executeCommand(
                tool.executor,
                (args ?? {}) as Record<string, unknown>,
                currentProjectRoot,
                currentMcpDir,
                name
            );

            if (!result.success) {
                const errorMsg = result.error
                    ? `Error: ${result.error}\n\nStderr:\n${result.stderr}`
                    : `Command failed with exit code ${result.exitCode}\n\nStderr:\n${result.stderr}`;

                return {
                    content: [
                        {
                            type: 'text' as const,
                            text: errorMsg,
                        },
                    ],
                    isError: true,
                };
            }

            // Return stdout, or stderr if stdout is empty
            const output = result.stdout || result.stderr || '(no output)';

            return {
                content: [
                    {
                        type: 'text' as const,
                        text: output,
                    },
                ],
            };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.error(`[server] Execution error: ${message}`);

            return {
                content: [
                    {
                        type: 'text' as const,
                        text: `Execution error: ${message}`,
                    },
                ],
                isError: true,
            };
        }
    });

    // Listen for registry updates
    registry.on('update', (tools: ToolDefinition[]) => {
        console.error(`[server] Tools updated (${tools.length} tools available)`);
    });

    return server;
}

/**
 * Initialize project root from MCP roots or fallback
 */
async function initializeProjectRoot(
    server: Server,
    fallbackRoot?: string
): Promise<string> {
    // Try to get roots from the client with a timeout
    try {
        console.error('[server] Requesting roots from client...');

        // Create a timeout promise
        const timeoutMs = 2000;
        const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('Timeout waiting for roots/list')), timeoutMs);
        });

        // Race the request against timeout
        const rootsResult = await Promise.race([
            server.request({ method: 'roots/list' }, ListRootsResultSchema),
            timeoutPromise,
        ]);

        if (rootsResult.roots && rootsResult.roots.length > 0) {
            const firstRoot = rootsResult.roots[0];
            // Convert file:// URI to path
            if (firstRoot.uri.startsWith('file://')) {
                const rootPath = fileURLToPath(firstRoot.uri);
                console.error(`[server] Got root from client: ${rootPath}`);
                return rootPath;
            }
        }
    } catch (err) {
        console.error(`[server] Could not get roots from client: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Fall back to provided root or cwd
    if (fallbackRoot) {
        console.error(`[server] Using fallback root: ${fallbackRoot}`);
        return fallbackRoot;
    }

    const cwd = process.cwd();
    console.error(`[server] Using current directory as root: ${cwd}`);
    return cwd;
}

/**
 * Start the file watcher for the given project root
 */
async function startWatcher(projectRoot: string, mcpDirName: string = '.mcp'): Promise<void> {
    // Stop existing watcher if any
    if (watcher) {
        await watcher.stop();
    }

    currentProjectRoot = projectRoot;
    currentMcpDir = join(projectRoot, mcpDirName);

    const pollInterval = process.env.POLL_INTERVAL_MS
        ? parseInt(process.env.POLL_INTERVAL_MS, 10)
        : undefined;

    watcher = new ToolsWatcher(projectRoot, pollInterval, mcpDirName);

    watcher.on('change', (config: ToolsConfig) => {
        registry.updateFromConfig(config);
    });

    watcher.on('delete', () => {
        registry.clear();
    });

    watcher.on('error', (error: Error) => {
        console.error(`[server] Watcher error: ${error.message}`);
    });

    await watcher.start();
}

/**
 * Start the server with stdio transport
 */
export async function startServer(fallbackProjectRoot?: string, mcpDirName: string = '.mcp'): Promise<void> {
    const server = createServer();
    const transport = new StdioServerTransport();

    console.error('[server] Starting project-mcp server...');

    // Determine initial project root from fallback or cwd
    // We'll load tools first, then connect, then try to get roots from client
    let projectRoot = fallbackProjectRoot || process.cwd();

    console.error('[server] ================================');
    console.error(`[server] Initial project root: ${projectRoot}`);
    console.error('[server] ================================');

    // Start watching and load tools BEFORE connecting
    await startWatcher(projectRoot, mcpDirName);

    // Mark initialization as partially complete (tools loaded from initial root)
    if (!isInitialized) {
        isInitialized = true;
        if (initResolve) initResolve();
    }

    console.error('[server] Tools loaded, now connecting to transport...');

    // Now connect - tools are already available
    await server.connect(transport);
    console.error('[server] Server connected via stdio');

    // Try to get roots from client (for future reference / dynamic switching)
    // This happens after connect so client can respond
    try {
        const clientRoot = await initializeProjectRoot(server, fallbackProjectRoot);
        if (clientRoot !== projectRoot) {
            console.error(`[server] Client provided different root: ${clientRoot}`);
            console.error('[server] Reloading tools from client root...');

            // Reset initialization state briefly while reloading
            isInitialized = false;
            initPromise = new Promise<void>((resolve) => { initResolve = resolve; });

            await startWatcher(clientRoot, mcpDirName);

            // Mark initialized again
            isInitialized = true;
            if (initResolve) initResolve();
        }
    } catch (err) {
        console.error(`[server] Could not get roots from client, using initial root`);
    }

    // Ensure we always resolve eventually
    if (!isInitialized) {
        isInitialized = true;
        if (initResolve) initResolve();
    }
}

/**
 * Stop the server and cleanup
 */
export async function stopServer(): Promise<void> {
    if (watcher) {
        await watcher.stop();
        watcher = null;
    }
}
