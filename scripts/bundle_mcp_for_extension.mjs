import * as esbuild from "esbuild";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const out_dir = path.join(root, "vscode_extension", "server");
const outfile = path.join(out_dir, "inflection_point_mcp_server.cjs");

fs.mkdirSync(out_dir, { recursive: true });

await esbuild.build({
    entryPoints: [path.join(root, "mcp_server", "src", "main.ts")],
    bundle: true,
    platform: "node",
    target: "node18",
    format: "cjs",
    outfile,
    banner: { js: "/* bundled inflection_point MCP server */" },
    logLevel: "info",
});

console.error(`wrote ${outfile}`);
