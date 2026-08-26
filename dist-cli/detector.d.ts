import { PackageManager, YarnVariant, AuditInspectionResult, VulnerabilityAdvisory } from './types';
/**
 * Detects the appropriate package manager for the workspace.
 */
export declare function detectPackageManager(workspaceDir: string, specifiedPm?: string): PackageManager;
/**
 * Detects whether a Yarn project is using Yarn Classic (v1) or Yarn Berry (v2-v4).
 */
export declare function detectYarnVariant(workspaceDir: string): YarnVariant;
/**
 * Checks if package manifest exists in the specified directory.
 */
export declare function checkPackageJsonExists(workspaceDir: string, pm?: PackageManager): boolean;
/**
 * Gets primary lockfile name associated with a package manager.
 */
export declare function getLockfileName(pm: PackageManager): string;
/**
 * Extracts vulnerability advisories from npm audit JSON output.
 */
export declare function parseNpmAuditAdvisories(raw: Record<string, unknown>): VulnerabilityAdvisory[];
/**
 * Extracts vulnerability advisories from yarn audit JSON lines.
 */
export declare function parseYarnAuditAdvisories(stdout: string): VulnerabilityAdvisory[];
/**
 * Runs a quick audit query to inspect vulnerabilities before/after fixing.
 */
export declare function inspectAudit(workspaceDir: string, pm: PackageManager): Promise<AuditInspectionResult>;
