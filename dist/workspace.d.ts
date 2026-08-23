import { WorkspaceInfo } from './types';
/**
 * Inspects a workspace directory to detect monorepo toolchains and multi-package setups.
 */
export declare function detectWorkspace(workspaceDir: string): WorkspaceInfo;
