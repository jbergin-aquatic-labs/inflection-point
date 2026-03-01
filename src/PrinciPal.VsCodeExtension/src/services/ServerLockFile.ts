import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { Result } from "../types.js";
import { success, failure, LockHeldError } from "../types.js";

interface LockHandle {
    fd: number;
    path: string;
    close(): void;
}

/**
 * Multi-instance lock coordination via filesystem.
 * Port of C# ServerLockFile — same JSON format, same lock directory.
 */
export class ServerLockFile {
    private static getLockDir(): string {
        const dir =
            process.platform === "win32"
                ? path.join(process.env.LOCALAPPDATA ?? os.tmpdir(), "princiPal")
                : path.join(os.homedir(), ".local", "share", "princiPal");
        fs.mkdirSync(dir, { recursive: true });
        return dir;
    }

    private static getLockFilePath(port: number): string {
        return path.join(this.getLockDir(), `server-${port}.lock`);
    }

    /**
     * Attempts to acquire the startup lock for the given port.
     * Removes stale lock files (PID dead) before trying.
     */
    static tryAcquire(port: number): Result<LockHandle> {
        const lockPath = this.getLockFilePath(port);

        // Check for stale lock
        if (fs.existsSync(lockPath)) {
            try {
                const content = fs.readFileSync(lockPath, "utf-8");
                const parsed = JSON.parse(content) as { pid?: number };
                if (parsed.pid) {
                    try {
                        process.kill(parsed.pid, 0); // signal 0 = existence check
                        // Process is alive — lock is valid
                        return failure(new LockHeldError(port, parsed.pid));
                    } catch {
                        // Process is dead — stale lock, remove it
                        fs.unlinkSync(lockPath);
                    }
                }
            } catch {
                // Can't read/parse — try to delete
                try {
                    fs.unlinkSync(lockPath);
                } catch {
                    return failure(new LockHeldError(port, 0));
                }
            }
        }

        try {
            const fd = fs.openSync(lockPath, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_RDWR);
            return success<LockHandle>({
                fd,
                path: lockPath,
                close() {
                    try {
                        fs.closeSync(fd);
                    } catch { /* ignore */ }
                },
            });
        } catch {
            // Another instance created the file between our check and open
            return failure(new LockHeldError(port, 0));
        }
    }

    /** Writes server PID/port info to the lock file and releases the exclusive handle. */
    static writeAndRelease(handle: LockHandle, pid: number, port: number): void {
        const json = JSON.stringify({
            pid,
            port,
            started: new Date().toISOString(),
        });
        fs.writeSync(handle.fd, json);
        fs.fsyncSync(handle.fd);
        handle.close();
    }

    static remove(port: number): void {
        try {
            fs.unlinkSync(this.getLockFilePath(port));
        } catch { /* ignore */ }
    }
}
