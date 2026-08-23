import * as fs from 'fs';
import * as path from 'path';
import * as exec from '@actions/exec';
import { PackageManager, YarnVariant, AuditInspectionResult } from './types';

/**
 * Detects the appropriate package manager for the workspace.
 */
export function detectPackageManager(
  workspaceDir: string,
  specifiedPm: string = 'auto'
): PackageManager {
  if (specifiedPm && specifiedPm !== 'auto') {
    const lower = specifiedPm.toLowerCase();
    if (
      lower === 'npm' ||
      lower === 'yarn' ||
      lower === 'pnpm' ||
      lower === 'bun' ||
      lower === 'deno'
    ) {
      return lower as PackageManager;
    }
  }

  // Bun check
  const bunLock = path.join(workspaceDir, 'bun.lock');
  const bunLockb = path.join(workspaceDir, 'bun.lockb');
  if (fs.existsSync(bunLock) || fs.existsSync(bunLockb)) return 'bun';

  // Deno check
  const denoLock = path.join(workspaceDir, 'deno.lock');
  const denoJson = path.join(workspaceDir, 'deno.json');
  const denoJsonc = path.join(workspaceDir, 'deno.jsonc');
  if (fs.existsSync(denoLock) || fs.existsSync(denoJson) || fs.existsSync(denoJsonc)) {
    // If deno.lock exists or pure deno project without package-lock/yarn.lock/pnpm-lock
    if (
      fs.existsSync(denoLock) ||
      (!fs.existsSync(path.join(workspaceDir, 'package-lock.json')) &&
        !fs.existsSync(path.join(workspaceDir, 'yarn.lock')) &&
        !fs.existsSync(path.join(workspaceDir, 'pnpm-lock.yaml')))
    ) {
      return 'deno';
    }
  }

  // pnpm check
  const pnpmLock = path.join(workspaceDir, 'pnpm-lock.yaml');
  if (fs.existsSync(pnpmLock)) return 'pnpm';

  // yarn check
  const yarnLock = path.join(workspaceDir, 'yarn.lock');
  const yarnRcYml = path.join(workspaceDir, '.yarnrc.yml');
  if (fs.existsSync(yarnLock) || fs.existsSync(yarnRcYml)) return 'yarn';

  // npm check
  const npmLock = path.join(workspaceDir, 'package-lock.json');
  if (fs.existsSync(npmLock)) return 'npm';

  return 'npm';
}

/**
 * Detects whether a Yarn project is using Yarn Classic (v1) or Yarn Berry (v2-v4).
 */
export function detectYarnVariant(workspaceDir: string): YarnVariant {
  const yarnRcYml = path.join(workspaceDir, '.yarnrc.yml');
  const yarnDir = path.join(workspaceDir, '.yarn');
  if (fs.existsSync(yarnRcYml) || fs.existsSync(yarnDir)) {
    return 'berry';
  }

  const yarnLock = path.join(workspaceDir, 'yarn.lock');
  if (fs.existsSync(yarnLock)) {
    try {
      const header = fs.readFileSync(yarnLock, 'utf8').slice(0, 100);
      if (header.includes('# yarn lockfile v1')) {
        return 'classic';
      }
      if (header.includes('__metadata') || header.includes('yarnPath') || header.includes('specVersion')) {
        return 'berry';
      }
    } catch {
      // ignore
    }
  }

  return 'classic';
}

/**
 * Checks if package manifest exists in the specified directory.
 */
export function checkPackageJsonExists(workspaceDir: string, pm: PackageManager = 'npm'): boolean {
  if (pm === 'deno') {
    return (
      fs.existsSync(path.join(workspaceDir, 'deno.json')) ||
      fs.existsSync(path.join(workspaceDir, 'deno.jsonc')) ||
      fs.existsSync(path.join(workspaceDir, 'package.json'))
    );
  }
  return fs.existsSync(path.join(workspaceDir, 'package.json'));
}

/**
 * Gets primary lockfile name associated with a package manager.
 */
export function getLockfileName(pm: PackageManager): string {
  switch (pm) {
    case 'bun':
      return 'bun.lock';
    case 'deno':
      return 'deno.lock';
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
    } else if (pm === 'pnpm') {
      await exec.exec('pnpm', ['audit', '--json'], options);
      if (stdout) {
        const parsed = JSON.parse(stdout);
        const metadata = parsed.metadata || {};
        const vulnCounts: Record<string, number> = metadata.vulnerabilities || {};
        const total = Object.values(vulnCounts).reduce((a, b) => a + b, 0);
        return {
          total: total || 0,
          summary: vulnCounts,
          raw: parsed
        };
      }
    } else if (pm === 'yarn') {
      await exec.exec('yarn', ['audit', '--json'], options);
      if (stdout) {
        let total = 0;
        const lines = stdout.trim().split('\n');
        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            if (data.type === 'auditAdvisory') {
              total++;
            }
          } catch {
            // ignore
          }
        }
        return {
          total,
          summary: { advisories: total },
          raw: null
        };
      }
    } else if (pm === 'bun') {
      await exec.exec('bun', ['pm', 'scan'], options);
      // bun pm scan output is parsed or treated as scanned
      return { total: 0, summary: {}, raw: null };
    }
  } catch {
    // If parsing fails, return empty
  }

  return { total: 0, summary: {}, raw: null };
}
