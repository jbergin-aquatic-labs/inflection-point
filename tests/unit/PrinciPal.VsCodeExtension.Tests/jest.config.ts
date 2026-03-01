import type { Config } from "jest";
import * as path from "path";

const repoRoot = path.resolve(__dirname, "../../..");
const extensionSrc = path.join(repoRoot, "src/PrinciPal.VsCodeExtension");

const config: Config = {
    preset: "ts-jest",
    testEnvironment: "node",
    roots: ["<rootDir>"],
    testMatch: ["**/*.test.ts"],
    transform: {
        "^.+\\.ts$": [
            "ts-jest",
            {
                tsconfig: "tsconfig.json",
                diagnostics: false,
            },
        ],
    },
    moduleNameMapper: {
        // Map vscode import to the manual mock (absolute path)
        "^vscode$": path.join(extensionSrc, "__mocks__/vscode.ts"),
        // Strip .js extensions from TS imports within the source tree
        // (the source uses Node16 module resolution which requires .js extensions)
        "^(.+)\\.js$": "$1",
    },
    moduleDirectories: ["node_modules"],
};

export default config;
