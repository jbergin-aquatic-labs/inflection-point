import * as crypto from "node:crypto";
import type * as vscode from "vscode";

export type workspace_session_identity = {
    session_id: string;
    session_name: string;
    workspace_path: string;
};

export function workspace_session_identity_from_folder(folder: vscode.WorkspaceFolder): workspace_session_identity {
    const workspace_path = folder.uri.fsPath;
    const session_name = folder.name;
    const hash = crypto.createHash("sha256").update(workspace_path.toLowerCase()).digest("hex");
    const session_id = hash.substring(0, 8);
    return { session_id, session_name, workspace_path };
}

export function create_workspace_session_identity_resolver(
    fallback_no_folder: workspace_session_identity
): (session?: vscode.DebugSession) => workspace_session_identity {
    return (session?: vscode.DebugSession): workspace_session_identity => {
        const folder = session?.workspaceFolder ?? vscode.workspace.workspaceFolders?.[0];
        if (!folder) return fallback_no_folder;
        return workspace_session_identity_from_folder(folder);
    };
}
