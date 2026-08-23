import { PackageManager, YarnVariant, SyncResult, GitStatusResult, DependencyDiff } from './types';
/**
 * Runs the appropriate command to synchronize the lockfile without running build scripts.
 */
export declare function syncLockfile(workspaceDir: string, pm: PackageManager, yarnVariant?: YarnVariant): Promise<SyncResult>;
/**
 * Runs security audit fix commands if available for the package manager.
 */
export declare function runAuditFix(workspaceDir: string, pm: PackageManager, auditLevel?: string): Promise<SyncResult>;
/**
 * Inspects git status to identify modified manifest and lockfiles in single-package or monorepo setups.
 */
export declare function getGitStatus(workspaceDir: string): Promise<GitStatusResult>;
/**
 * Computes git diff stat summary for changed files.
 */
export declare function getGitDiffStat(workspaceDir: string, files: string[]): Promise<string>;
/**
 * Parses package.json diffs to extract added, upgraded, or removed dependency items.
 */
export declare function parseDependencyDiffs(workspaceDir: string, changedFiles: string[]): Promise<DependencyDiff[]>;
