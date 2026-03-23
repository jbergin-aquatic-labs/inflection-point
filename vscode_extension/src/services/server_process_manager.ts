import * as fs from "node:fs";
import * as path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import type { i_extension_logger } from "../abstractions/i_extension_logger";
import { server_lock_file } from "./server_lock_file";
import { type result, success, failure, server_binary_not_found_error } from "../types";

const max_restarts = 5;

interface resolved_start_info {
    command: string;
    args: string[];
    cwd: string;
}

/**
 * Starts the TypeScript MCP server (Node). Release builds may ship server/principal_mcp_server.cjs.
 */
export class server_process_manager {
    private readonly logger: i_extension_logger;
    private readonly extension_dir: string;
    private process: ChildProcess | null = null;
    private port = 0;
    private restart_count = 0;
    private disposed = false;

    constructor(logger: i_extension_logger, extension_dir?: string) {
        this.logger = logger;
        this.extension_dir = extension_dir ?? path.resolve(__dirname, "..");
    }

    get_port(): number {
        return this.port;
    }

    async start(port: number): Promise<void> {
        if (this.disposed) return;
        this.port = port;
        this.restart_count = 0;

        const lock_result = server_lock_file.try_acquire(port);
        if (!lock_result.ok) {
            this.logger.log(`${lock_result.error.description} waiting for health...`);
            const healthy = await server_process_manager.is_server_running(port, 10_000);
            if (healthy) this.logger.log("MCP server is ready (started by another instance).");
            else this.logger.log("timed out waiting for server started by another instance.");
            return;
        }

        const start_info = this.resolve_start_info();
        if (!start_info.ok) {
            this.logger.log(start_info.error.description);
            server_lock_file.remove(port);
            return;
        }

        this.start_process(start_info.value);

        if (this.process && !this.process.killed && this.process.pid) {
            server_lock_file.write_and_release(lock_result.value, this.process.pid);
            const healthy = await server_process_manager.is_server_running(port, 10_000);
            if (healthy) this.logger.log("MCP server is ready.");
            else this.logger.log("timed out waiting for MCP server to become healthy.");
        } else {
            server_lock_file.remove(port);
        }
    }

    private start_process(info: resolved_start_info): void {
        this.logger.log(`starting MCP server: ${info.command} ${info.args.join(" ")} (cwd ${info.cwd})`);
        this.process = spawn(info.command, info.args, {
            stdio: ["ignore", "pipe", "pipe"],
            detached: true,
            cwd: info.cwd,
        });
        this.process.stdout?.on("data", (data: Buffer) => {
            this.logger.log(data.toString().trimEnd());
        });
        this.process.stderr?.on("data", (data: Buffer) => {
            this.logger.log(`[stderr] ${data.toString().trimEnd()}`);
        });
        this.process.on("exit", (code) => this.on_process_exited(code));
        this.process.unref();
        this.logger.log(`MCP server started (PID ${this.process.pid}) on http://127.0.0.1:${this.port}/`);
    }

    private resolve_start_info(): result<resolved_start_info> {
        const port_args = ["--port", String(this.port)];
        const bundled = path.join(this.extension_dir, "server", "principal_mcp_server.cjs");
        if (fs.existsSync(bundled)) {
            this.logger.log(`using bundled server: ${bundled}`);
            return success({
                command: "node",
                args: [bundled, ...port_args],
                cwd: this.extension_dir,
            });
        }

        const repo_root = path.resolve(this.extension_dir, "..");
        const dev_main = path.join(repo_root, "mcp_server", "dist", "main.js");
        if (fs.existsSync(dev_main)) {
            this.logger.log(`dev mode: node ${dev_main}`);
            return success({
                command: "node",
                args: [dev_main, ...port_args],
                cwd: repo_root,
            });
        }

        return failure(
            new server_binary_not_found_error(
                `looked for ${bundled} and ${dev_main}. build mcp_server first (npm run build -w mcp_server).`
            )
        );
    }

    private on_process_exited(code: number | null): void {
        if (this.disposed) return;
        if (code === 0) {
            this.logger.log("MCP server exited normally.");
            return;
        }
        this.restart_count++;
        if (this.restart_count > max_restarts) {
            this.logger.log(`MCP server crashed too many times; giving up.`);
            return;
        }
        this.logger.log(`MCP server crashed (exit ${code}); restarting (${this.restart_count}/${max_restarts})...`);
        const info = this.resolve_start_info();
        if (info.ok) this.start_process(info.value);
    }

    static async is_server_running(port: number, timeout_ms: number): Promise<boolean> {
        const deadline = Date.now() + timeout_ms;
        while (Date.now() < deadline) {
            try {
                const resp = await fetch(`http://127.0.0.1:${port}/api/health`, {
                    signal: AbortSignal.timeout(2000),
                });
                if (resp.ok) return true;
            } catch {
                /* retry */
            }
            await new Promise((r) => setTimeout(r, 500));
        }
        return false;
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.logger.log("detaching from MCP server.");
        this.process = null;
    }
}
