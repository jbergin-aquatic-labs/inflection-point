export const workspace = {
    workspaceFolders: undefined as any,
    getConfiguration: () => ({
        get: (_key: string, fallback: any) => fallback,
    }),
};

export const debug = {
    activeDebugSession: undefined,
    activeStackItem: undefined,
    breakpoints: [],
};

export const window = {
    createOutputChannel: () => ({
        appendLine: () => {},
        dispose: () => {},
    }),
};

export class EventEmitter {
    event = () => {};
    fire() {}
    dispose() {}
}

export class TreeItem {
    label: string;
    collapsibleState: number;
    description?: string;
    tooltip?: string;
    iconPath?: any;
    command?: any;
    constructor(label: string, collapsibleState?: number) {
        this.label = label;
        this.collapsibleState = collapsibleState ?? 0;
    }
}

export const TreeItemCollapsibleState = { None: 0, Collapsed: 1, Expanded: 2 };
export class ThemeIcon { constructor(public id: string, public color?: any) {} }
export class ThemeColor { constructor(public id: string) {} }
export class Disposable { constructor(private fn: () => void) {} dispose() { this.fn(); } }
export class Uri { static file(p: string) { return { fsPath: p, toString: () => p }; } }
export const env = { clipboard: { writeText: async () => {} } };
export const commands = { registerCommand: () => ({ dispose: () => {} }) };

export type WorkspaceConfiguration = ReturnType<typeof workspace.getConfiguration>;
export type WorkspaceFolder = { uri: { fsPath: string }; name: string; index: number };
export type DebugSession = { id: string; name: string; type: string; workspaceFolder?: WorkspaceFolder };
export class DebugThread { constructor(public session: any, public threadId: number) {} }
export class DebugStackFrame extends DebugThread { constructor(session: any, threadId: number, public frameId: number) { super(session, threadId); } }
