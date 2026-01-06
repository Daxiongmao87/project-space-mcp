/**
 * Parser module for tools.json validation and parsing
 */

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Ajv } from 'ajv';
import type { ToolsConfig } from './types.js';

// Import schema - we'll load it dynamically to avoid JSON import issues
const SCHEMA_PATH = new URL('../schemas/tools.schema.json', import.meta.url);

// Type for the validate function
type ValidateFn = (data: unknown) => boolean;
interface ValidateFnWithErrors extends ValidateFn {
    errors?: Array<{ instancePath?: string; message?: string }> | null;
}

let ajvInstance: InstanceType<typeof Ajv> | null = null;
let validateFn: ValidateFnWithErrors | null = null;

/**
 * Initialize the JSON Schema validator
 */
async function initValidator(): Promise<ValidateFnWithErrors> {
    if (validateFn) {
        return validateFn;
    }

    const schemaContent = await readFile(SCHEMA_PATH, 'utf-8');
    const schema = JSON.parse(schemaContent);

    ajvInstance = new Ajv({
        allErrors: true,
        verbose: true,
    });

    validateFn = ajvInstance.compile(schema) as ValidateFnWithErrors;
    return validateFn;
}

/**
 * Result of parsing tools.json
 */
export interface ParseResult {
    success: boolean;
    config?: ToolsConfig;
    errors?: string[];
}

/**
 * Parse and validate a tools.json file
 * @param toolsJsonPath - Absolute path to tools.json
 */
export async function parseToolsJson(toolsJsonPath: string): Promise<ParseResult> {
    // Check if file exists
    if (!existsSync(toolsJsonPath)) {
        return {
            success: false,
            errors: [`File not found: ${toolsJsonPath}`],
        };
    }

    // Read file content
    let content: string;
    try {
        content = await readFile(toolsJsonPath, 'utf-8');
    } catch (err) {
        return {
            success: false,
            errors: [`Failed to read file: ${err instanceof Error ? err.message : String(err)}`],
        };
    }

    // Parse JSON
    let parsed: unknown;
    try {
        parsed = JSON.parse(content);
    } catch (err) {
        return {
            success: false,
            errors: [`Invalid JSON: ${err instanceof Error ? err.message : String(err)}`],
        };
    }

    // Validate against schema
    const validate = await initValidator();
    const valid = validate(parsed);

    if (!valid) {
        const errors = validate.errors?.map((err: { instancePath?: string; message?: string }) => {
            const path = err.instancePath || '/';
            return `${path}: ${err.message}`;
        }) ?? ['Unknown validation error'];

        return {
            success: false,
            errors,
        };
    }

    return {
        success: true,
        config: parsed as ToolsConfig,
    };
}

/**
 * Get the path to tools.json for a given project root
 * @param projectRoot - Absolute path to project root
 * @param mcpDirName - Name of the MCP directory (default: .mcp)
 */
export function getToolsJsonPath(projectRoot: string, mcpDirName: string = '.mcp'): string {
    return join(projectRoot, mcpDirName, 'tools.json');
}

/**
 * Check if tools.json exists for a project
 * @param projectRoot - Absolute path to project root
 * @param mcpDirName - Name of the MCP directory (default: .mcp)
 */
export function toolsJsonExists(projectRoot: string, mcpDirName: string = '.mcp'): boolean {
    return existsSync(getToolsJsonPath(projectRoot, mcpDirName));
}
