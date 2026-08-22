import { PackageManager, AuditInspectionResult } from './types';
/**
 * Detects the appropriate package manager for the workspace.
 */
export declare function detectPackageManager(workspaceDir: string, specifiedPm?: string): PackageManager;
/**
 * Checks if package.json exists in the specified directory.
 */
export declare function checkPackageJsonExists(workspaceDir: string): boolean;
/**
 * Gets the lockfile name associated with a package manager.
 */
export declare function getLockfileName(pm: PackageManager): string;
/**
 * Runs a quick audit query to inspect vulnerabilities before/after fixing.
 */
export declare function inspectAudit(workspaceDir: string, pm: PackageManager): Promise<AuditInspectionResult>;
