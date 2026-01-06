/**
 * File watcher module for monitoring tools.json changes
 */

import { EventEmitter } from 'node:events';
import { watch, type FSWatcher } from 'chokidar';
import { stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { parseToolsJson, getToolsJsonPath } from './parser.js';
import type { ToolsConfig } from './types.js';

/** Default poll interval in milliseconds */
const DEFAULT_POLL_INTERVAL = 5000;

/** Debounce delay for rapid changes */
const DEBOUNCE_DELAY = 300;

/**
 * Watcher for .mcp/tools.json file changes
 */
export class ToolsWatcher extends EventEmitter {
    private projectRoot: string;
    private toolsJsonPath: string;
    private fsWatcher: FSWatcher | null = null;
    private pollTimer: NodeJS.Timeout | null = null;
    private pollInterval: number;
    private lastMtime: number = 0;
    private debounceTimer: NodeJS.Timeout | null = null;
    private lastConfig: ToolsConfig | null = null;

    private mcpDirName: string;

    constructor(projectRoot: string, pollInterval?: number, mcpDirName: string = '.mcp') {
        super();
        this.projectRoot = projectRoot;
        this.mcpDirName = mcpDirName;
        this.toolsJsonPath = getToolsJsonPath(projectRoot, mcpDirName);
        this.pollInterval = pollInterval ?? DEFAULT_POLL_INTERVAL;
    }

    /**
     * Start watching for changes
     */
    async start(): Promise<void> {
        console.error(`[watcher] Watching for changes: ${this.toolsJsonPath}`);

        // Do initial load
        await this.loadAndEmit();

        // Set up chokidar file watcher
        this.fsWatcher = watch(this.toolsJsonPath, {
            persistent: true,
            ignoreInitial: true,
            awaitWriteFinish: {
                stabilityThreshold: 200,
                pollInterval: 100,
            },
        });

        this.fsWatcher.on('add', () => this.handleChange('add'));
        this.fsWatcher.on('change', () => this.handleChange('change'));
        this.fsWatcher.on('unlink', () => this.handleDelete());
        this.fsWatcher.on('error', (err) => {
            console.error(`[watcher] FSWatcher error: ${err instanceof Error ? err.message : String(err)}`);
        });

        // Set up polling fallback
        this.pollTimer = setInterval(() => this.poll(), this.pollInterval);
        console.error(`[watcher] Polling fallback enabled (${this.pollInterval}ms interval)`);
    }

    /**
     * Stop watching
     */
    async stop(): Promise<void> {
        if (this.fsWatcher) {
            await this.fsWatcher.close();
            this.fsWatcher = null;
        }

        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }

        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }

        console.error('[watcher] Stopped');
    }

    /**
     * Handle file change event
     */
    private handleChange(event: 'add' | 'change'): void {
        console.error(`[watcher] Detected ${event} event`);
        this.debouncedLoad();
    }

    /**
     * Handle file deletion
     */
    private handleDelete(): void {
        console.error('[watcher] tools.json deleted');
        this.lastMtime = 0;
        this.lastConfig = null;
        this.emit('delete');
    }

    /**
     * Debounced load to prevent rapid reloads
     */
    private debouncedLoad(): void {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }

        this.debounceTimer = setTimeout(() => {
            this.debounceTimer = null;
            this.loadAndEmit();
        }, DEBOUNCE_DELAY);
    }

    /**
     * Poll for file changes (fallback mechanism)
     */
    private async poll(): Promise<void> {
        if (!existsSync(this.toolsJsonPath)) {
            if (this.lastMtime !== 0) {
                // File was deleted
                this.lastMtime = 0;
                this.lastConfig = null;
                this.emit('delete');
            }
            return;
        }

        try {
            const stats = await stat(this.toolsJsonPath);
            const mtime = stats.mtimeMs;

            if (mtime !== this.lastMtime) {
                console.error('[watcher] Poll detected change');
                this.lastMtime = mtime;
                await this.loadAndEmit();
            }
        } catch (err) {
            // File might have been deleted between exists check and stat
            if (this.lastMtime !== 0) {
                this.lastMtime = 0;
                this.lastConfig = null;
                this.emit('delete');
            }
        }
    }

    /**
     * Load tools.json and emit change event
     */
    private async loadAndEmit(): Promise<void> {
        if (!existsSync(this.toolsJsonPath)) {
            console.error('[watcher] tools.json does not exist');
            return;
        }

        // Update mtime
        try {
            const stats = await stat(this.toolsJsonPath);
            this.lastMtime = stats.mtimeMs;
        } catch {
            // Ignore stat errors
        }

        const result = await parseToolsJson(this.toolsJsonPath);

        if (!result.success) {
            const error = new Error(`Failed to parse tools.json: ${result.errors?.join(', ')}`);
            console.error(`[watcher] ${error.message}`);
            this.emit('error', error);
            return;
        }

        if (result.config) {
            console.error(`[watcher] Loaded ${result.config.tools.length} tools`);
            this.lastConfig = result.config;
            this.emit('change', result.config);
        }
    }

    /**
     * Get the last loaded configuration
     */
    getLastConfig(): ToolsConfig | null {
        return this.lastConfig;
    }
}
