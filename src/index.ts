#!/usr/bin/env node

/**
 * Entry point for project-mcp server
 *
 * Starts an MCP server that loads tools from .mcp/tools.json in the project
 * directory. The project directory is determined by:
 * 1. MCP roots capability (client provides workspace folders)
 * 2. --project-root CLI argument
 * 3. PROJECT_ROOT environment variable
 * 4. Current working directory
 */

import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { startServer, stopServer } from './server.js';

/**
 * Parse command line arguments
 */
function parseArgs(): { projectRoot: string | undefined; mcpDirName: string } {
    const args = process.argv.slice(2);
    let projectRoot: string | undefined;
    let mcpDirName = '.mcp';

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--project-root' && args[i + 1]) {
            projectRoot = args[i + 1];
            i++;
        } else if (args[i]?.startsWith('--project-root=')) {
            projectRoot = args[i].split('=')[1];
        } else if (args[i] === '--mcp-dir' && args[i + 1]) {
            mcpDirName = args[i + 1];
            i++;
        } else if (args[i]?.startsWith('--mcp-dir=')) {
            mcpDirName = args[i].split('=')[1];
        }
    }

    // Fall back to environment variable for PROJECT_ROOT
    if (!projectRoot) {
        projectRoot = process.env.PROJECT_ROOT;
    }

    // Fall back to environment variable for MCP_DIR
    // Note: We don't use this as primary to avoid confusion, but support it
    if (process.env.MCP_DIR_NAME) {
        mcpDirName = process.env.MCP_DIR_NAME;
    }

    // Resolve to absolute path if provided
    if (projectRoot) {
        projectRoot = resolve(projectRoot);

        // Validate it exists
        if (!existsSync(projectRoot)) {
            console.error(`[main] Warning: Specified project root does not exist: ${projectRoot}`);
            console.error('[main] Will attempt to get root from MCP client...');
            projectRoot = undefined;
        }
    }

    return { projectRoot, mcpDirName };
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
    const { projectRoot, mcpDirName } = parseArgs();

    console.error('[main] ================================');
    console.error('[main] project-mcp server starting');
    console.error(`[main] MCP Directory: ${mcpDirName}`);
    if (projectRoot) {
        console.error(`[main] Fallback project root: ${projectRoot}`);
    } else {
        console.error('[main] Will request project root from MCP client');
    }
    console.error('[main] ================================');

    // Start MCP server - it will request roots from client
    await startServer(projectRoot, mcpDirName);

    // Handle shutdown
    const shutdown = async () => {
        console.error('[main] Shutting down...');
        await stopServer();
        process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}

// Run
main().catch((err) => {
    console.error('[main] Fatal error:', err);
    process.exit(1);
});
