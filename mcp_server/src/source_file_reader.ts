import * as fs from "node:fs";

export function read_source_lines(file_path: string): string[] | undefined {
    try {
        const text = fs.readFileSync(file_path, "utf-8");
        return text.split(/\r?\n/);
    } catch {
        return undefined;
    }
}
