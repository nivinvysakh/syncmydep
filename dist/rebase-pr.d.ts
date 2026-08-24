import { OctokitClient, PackageManager, YarnVariant, WorkspaceInfo } from "./types";
export interface RebaseAndRedoOptions {
    workspaceDir: string;
    octokit: OctokitClient;
    owner: string;
    repo: string;
    baseBranch: string;
    targetBranch: string;
    prNumber?: number;
    triggerCommentId?: number;
    commentId?: number;
    commenter?: string;
    pm: PackageManager;
    yarnVariant?: YarnVariant;
    workspaceInfo: WorkspaceInfo;
    syncLockfileOption: boolean;
    fixAuditOption: boolean;
    auditLevel: string;
    commitMessage: string;
    prTitle: string;
    labels?: string[];
    assignees?: string[];
    reviewers?: string[];
}
/**
 * Deletes a local branch if it exists.
 */
export declare function deleteLocalBranch(workspaceDir: string, branch: string): Promise<boolean>;
/**
 * Deletes a remote branch on origin if it exists.
 */
export declare function deleteRemoteBranch(workspaceDir: string, branch: string, octokit?: OctokitClient, owner?: string, repo?: string): Promise<boolean>;
/**
 * Fetches the latest base branch and creates/resets a fresh target branch from it.
 */
export declare function recreateFreshBranch(workspaceDir: string, baseBranch: string, targetBranch: string): Promise<void>;
/**
 * Orchestrates a complete rebase: resets the target branch from the latest base branch,
 * re-executes the dependency synchronization & vulnerability fixes, commits and force pushes,
 * and updates or notifies the PR.
 */
export declare function rebaseAndRedoProcess(options: RebaseAndRedoOptions): Promise<{
    hasChanges: boolean;
    pushed: boolean;
    prNumber?: number;
}>;
