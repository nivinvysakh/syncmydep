import * as fs from 'fs';
import * as path from 'path';
import * as exec from '@actions/exec';
import { PackageManager, YarnVariant, AuditInspectionResult, VulnerabilityAdvisory } from './types';

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
 * Checks if the specified directory is inside an initialized Git repository.
 */
export async function checkGitRepository(workspaceDir: string): Promise<boolean> {
  const options = { cwd: workspaceDir, silent: true, ignoreReturnCode: true };
  const exitCode = await exec.exec('git', ['rev-parse', '--is-inside-work-tree'], options);
  return exitCode === 0;
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
 * Normalizes advisory severity strings.
 */
function normalizeSeverity(
  sev?: string,
): 'critical' | 'high' | 'moderate' | 'low' | 'info' {
  const s = (sev || 'moderate').toLowerCase();
  if (s === 'critical') return 'critical';
  if (s === 'high') return 'high';
  if (s === 'moderate' || s === 'medium') return 'moderate';
  if (s === 'low') return 'low';
  return 'info';
}

/**
 * Extracts vulnerability advisories from npm audit JSON output.
 */
export function parseNpmAuditAdvisories(raw: Record<string, unknown>): VulnerabilityAdvisory[] {
  const advisories: VulnerabilityAdvisory[] = [];
  const seenIds = new Set<string>();

  // npm v7+ format (raw.vulnerabilities)
  if (raw && raw.vulnerabilities && typeof raw.vulnerabilities === 'object') {
    const vulns = raw.vulnerabilities as Record<string, unknown>;
    for (const [pkgName, vulnData] of Object.entries(vulns)) {
      if (!vulnData || typeof vulnData !== 'object') continue;
      const vObj = vulnData as Record<string, unknown>;
      const severity = normalizeSeverity(vObj.severity as string);
      const fixAvailable = vObj.fixAvailable as Record<string, unknown> | boolean | undefined;
      const patched =
        typeof fixAvailable === 'object' && fixAvailable?.version
          ? String(fixAvailable.version)
          : undefined;

      const viaList = Array.isArray(vObj.via) ? vObj.via : [];
      for (const via of viaList) {
        if (typeof via === 'object' && via !== null) {
          const viaObj = via as Record<string, unknown>;
          const id =
            String(viaObj.url || '')
              .split('/')
              .pop() ||
            (viaObj.source ? `GHSA-${viaObj.source}` : `ADV-${pkgName}`);
          const title = String(viaObj.title || `${severity} vulnerability in ${pkgName}`);
          const url = typeof viaObj.url === 'string' ? viaObj.url : undefined;

          const key = `${id}-${pkgName}`;
          if (!seenIds.has(key)) {
            seenIds.add(key);
            advisories.push({
              id,
              package: pkgName,
              severity: normalizeSeverity(viaObj.severity as string || severity),
              title,
              patchedVersions: patched,
              url
            });
          }
        }
      }
    }
  }

  // Legacy npm v6 format (raw.advisories)
  if (raw && raw.advisories && typeof raw.advisories === 'object') {
    const advMap = raw.advisories as Record<string, Record<string, unknown>>;
    for (const adv of Object.values(advMap)) {
      if (!adv || typeof adv !== 'object') continue;
      const cves = Array.isArray(adv.cves) ? adv.cves.map(String) : [];
      const id = String(adv.github_advisory_id || cves[0] || adv.id || 'ADVISORY');
      const pkg = String(adv.module_name || adv.package || 'unknown');
      const key = `${id}-${pkg}`;
      if (!seenIds.has(key)) {
        seenIds.add(key);
        advisories.push({
          id,
          package: pkg,
          severity: normalizeSeverity(adv.severity as string),
          title: String(adv.title || 'Security Advisory'),
          patchedVersions: adv.patched_versions ? String(adv.patched_versions) : undefined,
          url: adv.url ? String(adv.url) : undefined
        });
      }
    }
  }

  return advisories;
}

/**
 * Extracts vulnerability advisories from yarn audit JSON lines.
 */
export function parseYarnAuditAdvisories(stdout: string): VulnerabilityAdvisory[] {
  const advisories: VulnerabilityAdvisory[] = [];
  const seenIds = new Set<string>();
  const lines = stdout.trim().split('\n');

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line);
      if (parsed.type === 'auditAdvisory' && parsed.data?.advisory) {
        const adv = parsed.data.advisory;
        const cves = Array.isArray(adv.cves) ? adv.cves.map(String) : [];
        const id = String(adv.github_advisory_id || cves[0] || adv.id || 'ADVISORY');
        const pkg = String(adv.module_name || 'unknown');
        const key = `${id}-${pkg}`;
        if (!seenIds.has(key)) {
          seenIds.add(key);
          advisories.push({
            id,
            package: pkg,
            severity: normalizeSeverity(adv.severity),
            title: String(adv.title || 'Security Advisory'),
            patchedVersions: adv.patched_versions ? String(adv.patched_versions) : undefined,
            url: adv.url ? String(adv.url) : undefined
          });
        }
      }
    } catch {
      // ignore
    }
  }

  return advisories;
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

        const advisories = parseNpmAuditAdvisories(parsed);

        return {
          total: total || 0,
          summary: vulnCounts,
          advisories,
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
        const advisories = parseNpmAuditAdvisories(parsed);

        return {
          total: total || 0,
          summary: vulnCounts,
          advisories,
          raw: parsed
        };
      }
    } else if (pm === 'yarn') {
      await exec.exec('yarn', ['audit', '--json'], options);
      if (stdout) {
        const advisories = parseYarnAuditAdvisories(stdout);
        return {
          total: advisories.length,
          summary: { advisories: advisories.length },
          advisories,
          raw: null
        };
      }
    } else if (pm === 'bun') {
      await exec.exec('bun', ['pm', 'scan'], options);
      return { total: 0, summary: {}, advisories: [], raw: null };
    }
  } catch {
    // If parsing fails, return empty
  }

  return { total: 0, summary: {}, advisories: [], raw: null };
}
