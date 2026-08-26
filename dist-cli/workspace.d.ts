import { WorkspaceInfo } from './types';
/**
 * Inspects a workspace directory to detect monorepo toolchains and multi-package setups.
 */
export declare function detectWorkspace(workspaceDir: string): WorkspaceInfo;
/**
 * Scans nested workspace package directories and cleans up any "ghost" lockfiles
 * (e.g. package-lock.json, pnpm-lock.yaml, yarn.lock, bun.lock, bun.lockb, deno.lock)
 * that violate monorepo hoisting and break dependency resolution.
 *
 * @returns Array of relative paths of deleted ghost lockfiles.
 */
export declare function sanitizeWorkspaceLockfiles(workspaceDir: string, workspaceInfo: WorkspaceInfo): string[];
