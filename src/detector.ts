import * as fs from 'fs';
import * as path from 'path';
import * as exec from '@actions/exec';
import { PackageManager, AuditInspectionResult } from './types';

/**
 * Detects the appropriate package manager for the workspace.
 */
export function detectPackageManager(
  workspaceDir: string,
  specifiedPm: string = 'auto'
): PackageManager {
  if (specifiedPm && specifiedPm !== 'auto') {
    const lower = specifiedPm.toLowerCase();
    if (lower === 'npm' || lower === 'yarn' || lower === 'pnpm') {
      return lower;
    }
  }

  const pnpmLock = path.join(workspaceDir, 'pnpm-lock.yaml');
  if (fs.existsSync(pnpmLock)) return 'pnpm';

  const yarnLock = path.join(workspaceDir, 'yarn.lock');
  if (fs.existsSync(yarnLock)) return 'yarn';

  const npmLock = path.join(workspaceDir, 'package-lock.json');
  if (fs.existsSync(npmLock)) return 'npm';

  return 'npm';
}

/**
 * Checks if package.json exists in the specified directory.
 */
export function checkPackageJsonExists(workspaceDir: string): boolean {
  return fs.existsSync(path.join(workspaceDir, 'package.json'));
}

/**
 * Gets the lockfile name associated with a package manager.
 */
export function getLockfileName(pm: PackageManager): string {
  switch (pm) {
    case 'pnpm':
      return 'pnpm-lock.yaml';
    case 'yarn':
      return 'yarn.lock';
    case 'npm':
    default:
      return 'package-lock.json';
  }
}

/**
 * Runs a quick audit query to inspect vulnerabilities before/after fixing.
 */
export async function inspectAudit(
  workspaceDir: string,
  pm: PackageManager
): Promise<AuditInspectionResult> {
  let stdout = '';

  const options = {
    cwd: workspaceDir,
    ignoreReturnCode: true,
    silent: true,
    listeners: {
      stdout: (data: Buffer) => {
        stdout += data.toString();
      }
    }
  };

  try {
    if (pm === 'npm') {
      await exec.exec('npm', ['audit', '--json'], options);
      if (stdout) {
        const parsed = JSON.parse(stdout);
        const metadata = parsed.metadata || {};
        const vulnCounts: Record<string, number> = metadata.vulnerabilities || parsed.vulnerabilities || {};
        const total = typeof metadata.vulnerabilities === 'object'
          ? Object.values(metadata.vulnerabilities as Record<string, number>).reduce((a, b) => a + b, 0)
          : (parsed.auditReportVersion ? Object.keys(parsed.vulnerabilities || {}).length : 0);

        return {
          total: total || 0,
          summary: vulnCounts,
          raw: parsed
        };
      }
    }
  } catch {
    // If parsing fails, return empty
  }

  return { total: 0, summary: {}, raw: null };
}
