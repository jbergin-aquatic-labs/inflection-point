/**
 * Manual mock of the `vscode` module for Jest unit tests.
 * Provides just enough surface for our tests to run.
 */

export class SourceBreakpoint {
    readonly location: {
        uri: { fsPath: string };
        range: { start: { line: number; character: number } };
    };
    readonly enabled: boolean;
    readonly condition: string | undefined;

    constructor(
        location: {
            uri: { fsPath: string };
            range: { start: { line: number; character: number } };
        },
        enabled: boolean = true,
        condition?: string
    ) {
        this.location = location;
        this.enabled = enabled;
        this.condition = condition;
    }
}

export const debug = {
    activeDebugSession: undefined as any,
    breakpoints: [] as any[],
    registerDebugAdapterTrackerFactory: jest.fn(),
    onDidStartDebugSession: jest.fn(() => ({ dispose: jest.fn() })),
    onDidTerminateDebugSession: jest.fn(() => ({ dispose: jest.fn() })),
};

export const window = {
    createOutputChannel: jest.fn(() => ({
        appendLine: jest.fn(),
        dispose: jest.fn(),
    })),
};

export const workspace = {
    workspaceFolders: undefined as any,
    getConfiguration: jest.fn(() => ({
        get: jest.fn((key: string, defaultValue: any) => defaultValue),
    })),
};

export type DebugSession = {
    customRequest(command: string, args?: any): Thenable<any>;
    name: string;
    type: string;
    id: string;
};

export type DebugAdapterTracker = {
    onDidSendMessage?(message: any): void;
    onWillStopSession?(): void;
};

export type DebugAdapterTrackerFactory = {
    createDebugAdapterTracker(session: any): any;
};

export type OutputChannel = {
    appendLine(value: string): void;
    dispose(): void;
};

export type Disposable = {
    dispose(): void;
};
