import { PackageManager, SyncResult, GitStatusResult } from './types';
/**
 * Synchronizes the lockfile with package.json specifications.
 */
export declare function syncLockfile(workspaceDir: string, pm: PackageManager): Promise<SyncResult>;
/**
 * Runs security audit fix to update vulnerable packages.
 */
export declare function runAuditFix(workspaceDir: string, pm: PackageManager, auditLevel?: string): Promise<SyncResult>;
/**
 * Checks git status for any modified or untracked dependency files.
 */
export declare function getGitStatus(workspaceDir: string): Promise<GitStatusResult>;
/**
 * Gets git diff summary for the changed dependency files.
 */
export declare function getGitDiffStat(workspaceDir: string, files?: string[]): Promise<string>;
