const esbuild = require("esbuild");

esbuild
    .build({
        entryPoints: ["src/extension_entry.ts"],
        bundle: true,
        outfile: "out/extension_entry.js",
        external: ["vscode"],
        format: "cjs",
        platform: "node",
        target: "node18",
        sourcemap: true,
        minify: process.argv.includes("--production"),
    })
    .catch(() => process.exit(1));
