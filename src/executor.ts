/**
 * Executor module for running bash and python scripts
 */

import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { ToolExecutor, ExecutionResult } from './types.js';

/** Default execution timeout in milliseconds */
const DEFAULT_TIMEOUT = 30000;

/**
 * Execute a tool with the given parameters
 * @param executor - Executor configuration from tool definition
 * @param params - Parameters passed to the tool
 * @param projectRoot - Absolute path to project root
 * @param mcpDir - Absolute path to the configured MCP directory
 * @param toolName - Name of the tool being executed
 */
export async function executeCommand(
    executor: ToolExecutor,
    params: Record<string, unknown>,
    projectRoot: string,
    mcpDir: string,
    toolName: string
): Promise<ExecutionResult> {
    const timeout = executor.timeout ?? DEFAULT_TIMEOUT;

    // Build environment variables
    const env: Record<string, string> = {
        ...process.env,
        PROJECT_ROOT: projectRoot,
        MCP_TOOLS_DIR: mcpDir,
        TOOL_NAME: toolName,
    };

    // Add parameters as PARAM_<name> environment variables
    for (const [key, value] of Object.entries(params)) {
        env[`PARAM_${key.toUpperCase()}`] = String(value ?? '');
        // Also add as lowercase for shell variable access
        env[key] = String(value ?? '');
    }

    // Get code to execute
    let code: string;
    if (executor.code) {
        code = executor.code;
    } else if (executor.file) {
        const scriptPath = join(mcpDir, executor.file);
        if (!existsSync(scriptPath)) {
            return {
                success: false,
                stdout: '',
                stderr: '',
                exitCode: 1,
                error: `Script file not found: ${scriptPath}`,
            };
        }
        code = await readFile(scriptPath, 'utf-8');
    } else {
        return {
            success: false,
            stdout: '',
            stderr: '',
            exitCode: 1,
            error: 'Executor must have either "code" or "file" property',
        };
    }

    // Execute based on type
    if (executor.type === 'bash') {
        return executeBash(code, env, timeout, projectRoot);
    } else if (executor.type === 'python') {
        return executePython(code, env, timeout, projectRoot);
    } else {
        return {
            success: false,
            stdout: '',
            stderr: '',
            exitCode: 1,
            error: `Unknown executor type: ${executor.type}`,
        };
    }
}

/**
 * Execute bash code
 */
function executeBash(
    code: string,
    env: Record<string, string>,
    timeout: number,
    cwd: string
): Promise<ExecutionResult> {
    return new Promise((resolve) => {
        const proc = spawn('bash', ['-c', code], {
            env,
            cwd,
            stdio: ['ignore', 'pipe', 'pipe'],
        });

        let stdout = '';
        let stderr = '';
        let killed = false;

        const timer = setTimeout(() => {
            killed = true;
            proc.kill('SIGTERM');
            setTimeout(() => {
                if (!proc.killed) {
                    proc.kill('SIGKILL');
                }
            }, 1000);
        }, timeout);

        proc.stdout.on('data', (data: Buffer) => {
            stdout += data.toString();
        });

        proc.stderr.on('data', (data: Buffer) => {
            stderr += data.toString();
        });

        proc.on('error', (err) => {
            clearTimeout(timer);
            resolve({
                success: false,
                stdout,
                stderr,
                exitCode: 1,
                error: `Failed to spawn bash: ${err.message}`,
            });
        });

        proc.on('close', (exitCode) => {
            clearTimeout(timer);
            if (killed) {
                resolve({
                    success: false,
                    stdout,
                    stderr,
                    exitCode: exitCode ?? 1,
                    error: `Execution timed out after ${timeout}ms`,
                });
            } else {
                resolve({
                    success: exitCode === 0,
                    stdout,
                    stderr,
                    exitCode: exitCode ?? 0,
                });
            }
        });
    });
}

/**
 * Execute python code
 */
function executePython(
    code: string,
    env: Record<string, string>,
    timeout: number,
    cwd: string
): Promise<ExecutionResult> {
    return new Promise((resolve) => {
        const proc = spawn('python3', ['-c', code], {
            env,
            cwd,
            stdio: ['ignore', 'pipe', 'pipe'],
        });

        let stdout = '';
        let stderr = '';
        let killed = false;

        const timer = setTimeout(() => {
            killed = true;
            proc.kill('SIGTERM');
            setTimeout(() => {
                if (!proc.killed) {
                    proc.kill('SIGKILL');
                }
            }, 1000);
        }, timeout);

        proc.stdout.on('data', (data: Buffer) => {
            stdout += data.toString();
        });

        proc.stderr.on('data', (data: Buffer) => {
            stderr += data.toString();
        });

        proc.on('error', (err) => {
            clearTimeout(timer);
            resolve({
                success: false,
                stdout,
                stderr,
                exitCode: 1,
                error: `Failed to spawn python3: ${err.message}`,
            });
        });

        proc.on('close', (exitCode) => {
            clearTimeout(timer);
            if (killed) {
                resolve({
                    success: false,
                    stdout,
                    stderr,
                    exitCode: exitCode ?? 1,
                    error: `Execution timed out after ${timeout}ms`,
                });
            } else {
                resolve({
                    success: exitCode === 0,
                    stdout,
                    stderr,
                    exitCode: exitCode ?? 0,
                });
            }
        });
    });
}
