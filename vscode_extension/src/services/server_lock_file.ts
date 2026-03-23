import * as fs from "node:fs";
import * as path from "node:path";
import type { result } from "../types";
import { success, failure, lock_held_error } from "../types";

export type acquired_lock = { fd: number; file_path: string };

export class server_lock_file {
    private static path_for(port: number): string {
        const base =
            process.platform === "win32"
                ? process.env.LOCALAPPDATA ?? process.env.TEMP ?? "."
                : process.env.HOME ?? "/tmp";
        return path.join(base, "inflection_point", `mcp-${port}.lock`);
    }

    static try_acquire(port: number): result<acquired_lock> {
        const file_path = this.path_for(port);
        fs.mkdirSync(path.dirname(file_path), { recursive: true });
        try {
            const fd = fs.openSync(file_path, "wx");
            return success({ fd, file_path });
        } catch (e: unknown) {
            const err = e as NodeJS.ErrnoException;
            if (err?.code === "EEXIST") {
                const old = this.read_pid(file_path);
                if (old !== undefined && this.process_alive(old)) {
                    return failure(new lock_held_error(port, old));
                }
                try {
                    fs.unlinkSync(file_path);
                } catch {
                    /* ignore */
                }
                try {
                    const fd = fs.openSync(file_path, "wx");
                    return success({ fd, file_path });
                } catch {
                    return failure(new lock_held_error(port, old ?? -1));
                }
            }
            return failure(new lock_held_error(port, -1));
        }
    }

    static write_and_release(ack: acquired_lock, server_pid: number): void {
        try {
            fs.writeSync(ack.fd, String(server_pid), 0, "utf-8");
        } finally {
            fs.closeSync(ack.fd);
        }
    }

    static remove(port: number): void {
        try {
            fs.unlinkSync(this.path_for(port));
        } catch {
            /* ignore */
        }
    }

    private static read_pid(file_path: string): number | undefined {
        try {
            const text = fs.readFileSync(file_path, "utf-8").trim();
            const pid = parseInt(text, 10);
            return Number.isFinite(pid) ? pid : undefined;
        } catch {
            return undefined;
        }
    }

    private static process_alive(pid: number): boolean {
        try {
            process.kill(pid, 0);
            return true;
        } catch {
            return false;
        }
    }
}
