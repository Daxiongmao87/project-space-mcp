/**
 * Tool registry module for managing dynamic tool definitions
 */

import { EventEmitter } from 'node:events';
import type { ToolDefinition, ToolsConfig } from './types.js';

/**
 * Registry for managing tool definitions loaded from tools.json
 */
export class ToolRegistry extends EventEmitter {
    private tools: Map<string, ToolDefinition> = new Map();

    /**
     * Get all registered tools
     */
    getTools(): ToolDefinition[] {
        return Array.from(this.tools.values());
    }

    /**
     * Get a tool by name
     * @param name - Tool name
     */
    getTool(name: string): ToolDefinition | undefined {
        return this.tools.get(name);
    }

    /**
     * Check if a tool exists
     * @param name - Tool name
     */
    hasTool(name: string): boolean {
        return this.tools.has(name);
    }

    /**
     * Update the registry with a new tools configuration
     * @param config - Parsed tools.json configuration
     */
    updateFromConfig(config: ToolsConfig): void {
        const oldTools = new Set(this.tools.keys());
        const newTools = new Set(config.tools.map((t) => t.name));

        // Clear and repopulate
        this.tools.clear();
        for (const tool of config.tools) {
            this.tools.set(tool.name, tool);
        }

        // Log changes
        const added = config.tools.filter((t) => !oldTools.has(t.name));
        const removed = Array.from(oldTools).filter((name) => !newTools.has(name));
        const updated = config.tools.filter((t) => oldTools.has(t.name));

        if (added.length > 0) {
            console.error(`[registry] Added tools: ${added.map((t) => t.name).join(', ')}`);
        }
        if (removed.length > 0) {
            console.error(`[registry] Removed tools: ${removed.join(', ')}`);
        }
        if (updated.length > 0) {
            console.error(`[registry] Updated tools: ${updated.map((t) => t.name).join(', ')}`);
        }

        // Emit update event
        this.emit('update', this.getTools());
    }

    /**
     * Clear all tools from the registry
     */
    clear(): void {
        const hadTools = this.tools.size > 0;
        this.tools.clear();
        if (hadTools) {
            console.error('[registry] Cleared all tools');
            this.emit('update', []);
        }
    }

    /**
     * Get tool count
     */
    get size(): number {
        return this.tools.size;
    }
}

/**
 * Singleton registry instance
 */
export const registry = new ToolRegistry();
