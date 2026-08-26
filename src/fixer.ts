import * as fs from 'fs';
import * as path from 'path';
import * as exec from '@actions/exec';
import * as core from '@actions/core';
import {
  PackageManager,
  YarnVariant,
  SyncResult,
  GitStatusResult,
  DependencyDiff,
  BuildVerificationResult
} from './types';

/**
 * Runs the appropriate command to synchronize the lockfile without running build scripts.
 */
export async function syncLockfile(
  workspaceDir: string,
  pm: PackageManager,
  yarnVariant: YarnVariant = 'classic'
): Promise<SyncResult> {
  let output = '';
  let command = 'npm';
  let args: string[] = [];

  switch (pm) {
    case 'bun':
      command = 'bun';
      args = ['install', '--lockfile-only'];
      break;

    case 'deno':
      command = 'deno';
      args = ['install'];
      break;

    case 'pnpm':
      command = 'pnpm';
      args = ['install', '--lockfile-only', '--no-frozen-lockfile'];
      break;

    case 'yarn':
      command = 'yarn';
      if (yarnVariant === 'berry') {
        args = ['install', '--mode', 'update-lockfile'];
      } else {
        args = ['install', '--prefer-offline', '--ignore-scripts'];
      }
      break;

    case 'npm':
    default:
      command = 'npm';
      args = ['install', '--package-lock-only', '--no-audit', '--no-fund'];
      break;
  }

  core.info(`[SyncMyDep] Synchronizing lockfile using ${command} ${args.join(' ')}...`);

  const options = {
    cwd: workspaceDir,
    ignoreReturnCode: true,
    silent: process.env.SYNCMYDEP_SILENT === 'true',
    listeners: {
      stdout: (data: Buffer) => {
        output += data.toString();
      },
      stderr: (data: Buffer) => {
        output += data.toString();
      }
    }
  };

  const exitCode = await exec.exec(command, args, options);
  const lockfilePath = path.join(workspaceDir, 'package-lock.json');

  // Fallback for npm (e.g. monorepo workspaces or cross-platform packages with EBADPLATFORM)
  if (pm === 'npm' && (exitCode !== 0 || !fs.existsSync(lockfilePath))) {
    const isBadPlatform = output.includes('EBADPLATFORM');
    const fallbackArgs = isBadPlatform
      ? ['install', '--package-lock-only', '--no-audit', '--no-fund', '--force']
      : ['install', '--ignore-scripts', '--no-audit', '--no-fund'];
    core.info(`[SyncMyDep] Retrying npm synchronization with npm ${fallbackArgs.join(' ')}...`);
    output = '';
    let retryCode = await exec.exec('npm', fallbackArgs, options);
    if (retryCode !== 0 && !isBadPlatform) {
      core.info('[SyncMyDep] Retrying npm synchronization with npm install --ignore-scripts --no-audit --no-fund --force...');
      retryCode = await exec.exec('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--force'], options);
    }
    return {
      success: retryCode === 0,
      output
    };
  }

  // Fallback for Bun if --lockfile-only is not supported on older versions
  if (exitCode !== 0 && pm === 'bun') {
    core.info('[SyncMyDep] Retrying Bun synchronization with bun install...');
    const retryCode = await exec.exec('bun', ['install'], options);
    return {
      success: retryCode === 0,
      output
    };
  }

  // Fallback for Yarn Berry if --mode update-lockfile fails
  if (exitCode !== 0 && pm === 'yarn' && yarnVariant === 'berry') {
    core.info('[SyncMyDep] Retrying Yarn Berry synchronization with yarn install...');
    const retryCode = await exec.exec('yarn', ['install'], options);
    return {
      success: retryCode === 0,
      output
    };
  }

  return {
    success: exitCode === 0,
    output
  };
}

/**
 * Runs security audit fix commands if available for the package manager.
 */
export async function runAuditFix(
  workspaceDir: string,
  pm: PackageManager,
  auditLevel: string = 'moderate'
): Promise<SyncResult> {
  let output = '';
  let command = '';
  let args: string[] = [];

  switch (pm) {
    case 'npm':
      command = 'npm';
      args = ['audit', 'fix', `--audit-level=${auditLevel}`];
      break;

    case 'pnpm':
      command = 'pnpm';
      args = ['audit', '--fix'];
      break;

    case 'yarn':
      command = 'yarn';
      args = ['audit', '--fix'];
      break;

    case 'bun':
      command = 'bun';
      args = ['update'];
      break;

    case 'deno':
    default:
      core.info(`[SyncMyDep] Automated security audit fix is not supported for ${pm}. Skipping audit fix step.`);
      return { success: true, output: '' };
  }

  core.info(`[SyncMyDep] Running dependency fix/update using ${command} ${args.join(' ')} (level: ${auditLevel})...`);

  const options = {
    cwd: workspaceDir,
    ignoreReturnCode: true,
    silent: process.env.SYNCMYDEP_SILENT === 'true',
    listeners: {
      stdout: (data: Buffer) => {
        output += data.toString();
      },
      stderr: (data: Buffer) => {
        output += data.toString();
      }
    }
  };

  const exitCode = await exec.exec(command, args, options);

  if (exitCode !== 0 && pm === 'npm' && (output.includes('EBADPLATFORM') || output.includes('ENOLOCK'))) {
    core.info(`[SyncMyDep] Retrying npm audit fix with --force...`);
    output = '';
    const retryCode = await exec.exec('npm', ['audit', 'fix', `--audit-level=${auditLevel}`, '--force'], options);
    return {
      success: retryCode === 0,
      output
    };
  }

  return {
    success: exitCode === 0,
    output
  };
}

/**
 * Runs lockfile deduplication to clean up duplicate sub-dependencies.
 */
export async function runDedupe(
  workspaceDir: string,
  pm: PackageManager,
  yarnVariant: YarnVariant = 'classic'
): Promise<SyncResult> {
  let output = '';
  let command = '';
  let args: string[] = [];

  switch (pm) {
    case 'npm':
      command = 'npm';
      args = ['dedupe'];
      break;

    case 'pnpm':
      command = 'pnpm';
      args = ['dedupe'];
      break;

    case 'yarn':
      command = 'yarn';
      if (yarnVariant === 'berry') {
        args = ['dedupe'];
      } else {
        // Classic yarn doesn't have a native built-in dedupe command, runs standard install
        args = ['install', '--prefer-offline'];
      }
      break;

    case 'bun':
      command = 'bun';
      args = ['install'];
      break;

    case 'deno':
    default:
      core.info(`[SyncMyDep] Deduplication is not applicable for ${pm}.`);
      return { success: true, output: '' };
  }

  core.info(`[SyncMyDep] Running lockfile deduplication using ${command} ${args.join(' ')}...`);

  const options = {
    cwd: workspaceDir,
    ignoreReturnCode: true,
    silent: process.env.SYNCMYDEP_SILENT === 'true',
    listeners: {
      stdout: (data: Buffer) => {
        output += data.toString();
      },
      stderr: (data: Buffer) => {
        output += data.toString();
      }
    }
  };

  const exitCode = await exec.exec(command, args, options);

  return {
    success: exitCode === 0,
    output
  };
}

/**
 * Inspects git status to identify modified manifest and lockfiles in single-package or monorepo setups.
 */
export async function getGitStatus(workspaceDir: string): Promise<GitStatusResult> {
  let statusOutput = '';

  const options = {
    cwd: workspaceDir,
    ignoreReturnCode: true,
    silent: true,
    listeners: {
      stdout: (data: Buffer) => {
        statusOutput += data.toString();
      }
    }
  };

  await exec.exec('git', ['status', '--porcelain'], options);

  const changedFiles: string[] = [];
  const lines = statusOutput.split(/\r?\n/);

  for (const line of lines) {
    if (!line || line.length < 4) continue;
    const match = line.match(/^.{2}\s+(.+)$/);
    if (!match) continue;
    const filePath = match[1].trim().replace(/^"|"$/g, '');

    // Check relevant manifest & lockfiles
    if (
      filePath.endsWith('package.json') ||
      filePath.endsWith('package-lock.json') ||
      filePath.endsWith('yarn.lock') ||
      filePath.endsWith('.yarnrc.yml') ||
      filePath.endsWith('pnpm-lock.yaml') ||
      filePath.endsWith('pnpm-workspace.yaml') ||
      filePath.endsWith('bun.lock') ||
      filePath.endsWith('bun.lockb') ||
      filePath.endsWith('deno.lock') ||
      filePath.endsWith('deno.json') ||
      filePath.endsWith('deno.jsonc')
    ) {
      changedFiles.push(filePath);
    }
  }

  return {
    hasChanges: changedFiles.length > 0,
    changedFiles
  };
}

/**
 * Computes git diff stat summary for changed files.
 */
export async function getGitDiffStat(workspaceDir: string, files: string[]): Promise<string> {
  if (!files || files.length === 0) return '';

  let diffOutput = '';
  const options = {
    cwd: workspaceDir,
    ignoreReturnCode: true,
    silent: true,
    listeners: {
      stdout: (data: Buffer) => {
        diffOutput += data.toString();
      }
    }
  };

  await exec.exec('git', ['diff', '--stat', '--', ...files], options);
  return diffOutput.trim();
}

/**
 * Parses package.json and lockfile diffs to extract added, upgraded, or removed dependency items.
 */
export async function parseDependencyDiffs(
  workspaceDir: string,
  changedFiles: string[]
): Promise<DependencyDiff[]> {
  const diffs: DependencyDiff[] = [];
  const handledPackages = new Set<string>();

  // 1. Direct dependencies from package.json
  const pkgFiles = changedFiles.filter((f) => f.endsWith('package.json'));
  if (pkgFiles.length > 0) {
    let pkgDiffText = '';
    const options = {
      cwd: workspaceDir,
      ignoreReturnCode: true,
      silent: true,
      listeners: {
        stdout: (data: Buffer) => {
          pkgDiffText += data.toString();
        }
      }
    };

    await exec.exec('git', ['diff', '-U1', '--', ...pkgFiles], options);

    if (pkgDiffText) {
      const lines = pkgDiffText.split('\n');
      const removedMap = new Map<string, string>();
      const addedMap = new Map<string, string>();

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('-') && !trimmed.startsWith('---')) {
          const match = trimmed.match(/^-\s*"([^"]+)":\s*"([^"]+)"/);
          if (match) {
            removedMap.set(match[1], match[2]);
          }
        } else if (trimmed.startsWith('+') && !trimmed.startsWith('+++')) {
          const match = trimmed.match(/^\+\s*"([^"]+)":\s*"([^"]+)"/);
          if (match) {
            addedMap.set(match[1], match[2]);
          }
        }
      }

      // Detect upgrades/downgrades & added
      for (const [pkg, newVer] of addedMap.entries()) {
        handledPackages.add(pkg);
        if (removedMap.has(pkg)) {
          const oldVer = removedMap.get(pkg)!;
          removedMap.delete(pkg);
          diffs.push({
            name: pkg,
            type: 'prod',
            oldVersion: oldVer,
            newVersion: newVer,
            changeType: 'upgraded',
            reason: 'Direct Update'
          });
        } else {
          diffs.push({
            name: pkg,
            type: 'prod',
            newVersion: newVer,
            changeType: 'added',
            reason: 'Direct Update'
          });
        }
      }

      // Remaining in removedMap are deletions
      for (const [pkg, oldVer] of removedMap.entries()) {
        handledPackages.add(pkg);
        diffs.push({
          name: pkg,
          type: 'prod',
          oldVersion: oldVer,
          changeType: 'removed',
          reason: 'Direct Update'
        });
      }
    }
  }

  // 2. Lockfile diffs for transitive dependencies or lockfile drift
  const lockFiles = changedFiles.filter(
    (f) =>
      f.endsWith('package-lock.json') ||
      f.endsWith('yarn.lock') ||
      f.endsWith('pnpm-lock.yaml') ||
      f.endsWith('bun.lock')
  );

  if (lockFiles.length > 0) {
    let lockDiffText = '';
    const lockOptions = {
      cwd: workspaceDir,
      ignoreReturnCode: true,
      silent: true,
      listeners: {
        stdout: (data: Buffer) => {
          lockDiffText += data.toString();
        }
      }
    };

    await exec.exec('git', ['diff', '-U3', '--', ...lockFiles], lockOptions);

    if (lockDiffText) {
      const lockLines = lockDiffText.split('\n');
      let currentPkg: string | null = null;
      let oldVersion: string | null = null;
      let newVersion: string | null = null;

      for (let i = 0; i < lockLines.length; i++) {
        const line = lockLines[i];

        // Match package-lock node_modules entry
        const nodeModulesMatch = line.match(/"node_modules\/((?:@[^/]+\/)?[^/"]+)":/);
        if (nodeModulesMatch) {
          currentPkg = nodeModulesMatch[1];
          oldVersion = null;
          newVersion = null;
        }

        // Match yarn.lock or pnpm header
        const yarnPkgMatch = line.match(/^"?((?:@[^/]+\/)?[^@\s"]+)@/);
        if (yarnPkgMatch && !line.startsWith('-') && !line.startsWith('+')) {
          currentPkg = yarnPkgMatch[1];
          oldVersion = null;
          newVersion = null;
        }

        // Version changes
        if (line.startsWith('-') && !line.startsWith('---')) {
          const vMatch = line.match(/version["\s:]+([0-9a-zA-Z.-]+)/);
          if (vMatch) oldVersion = vMatch[1];
        } else if (line.startsWith('+') && !line.startsWith('+++')) {
          const vMatch = line.match(/version["\s:]+([0-9a-zA-Z.-]+)/);
          if (vMatch) newVersion = vMatch[1];
        }

        if (currentPkg && oldVersion && newVersion && oldVersion !== newVersion) {
          if (!handledPackages.has(currentPkg)) {
            handledPackages.add(currentPkg);
            diffs.push({
              name: currentPkg,
              type: 'transitive',
              oldVersion,
              newVersion,
              changeType: 'upgraded',
              reason: 'Lockfile Drift'
            });
          }
          oldVersion = null;
          newVersion = null;
        }
      }
    }
  }

  return diffs;
}

/**
 * Runs a dry-run / frozen check to verify that the generated lockfile is structurally integral.
 */
export async function verifyLockfileIntegrity(
  workspaceDir: string,
  pm: PackageManager,
  yarnVariant: YarnVariant = 'classic'
): Promise<{ success: boolean; output: string }> {
  let command = 'npm';
  let args: string[] = [];

  switch (pm) {
    case 'pnpm':
      command = 'pnpm';
      args = ['install', '--frozen-lockfile', '--prefer-offline'];
      break;

    case 'yarn':
      command = 'yarn';
      if (yarnVariant === 'berry') {
        args = ['install', '--immutable'];
      } else {
        args = ['install', '--frozen-lockfile', '--prefer-offline'];
      }
      break;

    case 'bun':
      command = 'bun';
      args = ['install', '--frozen-lockfile'];
      break;

    case 'deno':
      command = 'deno';
      args = ['install', '--frozen'];
      break;

    case 'npm':
    default:
      command = 'npm';
      args = ['ci', '--dry-run'];
      break;
  }

  core.info(`[SyncMyDep] Verifying lockfile integrity using ${command} ${args.join(' ')}...`);

  let output = '';
  const options = {
    cwd: workspaceDir,
    ignoreReturnCode: true,
    silent: true,
    listeners: {
      stdout: (data: Buffer) => {
        output += data.toString();
      },
      stderr: (data: Buffer) => {
        output += data.toString();
      }
    }
  };

  let exitCode = await exec.exec(command, args, options);

  // Fallback for npm if `npm ci --dry-run` is not supported on older npm
  if (exitCode !== 0 && pm === 'npm') {
    core.info('[SyncMyDep] Falling back to npm ls for integrity check...');
    exitCode = await exec.exec('npm', ['ls', '--depth=0'], options);
  }

  return {
    success: exitCode === 0,
    output: output.trim()
  };
}

/**
 * Runs a custom build smoke test command if configured (e.g. `npm run build`).
 */
export async function runBuildSmokeTest(
  workspaceDir: string,
  buildCommand: string
): Promise<BuildVerificationResult> {
  if (!buildCommand || !buildCommand.trim()) {
    return { command: '', success: true, output: '' };
  }

  const trimmed = buildCommand.trim();
  core.info(`[SyncMyDep] Running build smoke test: ${trimmed}...`);

  let output = '';
  const options = {
    cwd: workspaceDir,
    ignoreReturnCode: true,
    listeners: {
      stdout: (data: Buffer) => {
        output += data.toString();
      },
      stderr: (data: Buffer) => {
        output += data.toString();
      }
    }
  };

  const exitCode = await exec.exec(trimmed, [], options);

  return {
    command: trimmed,
    success: exitCode === 0,
    output: output.trim()
  };
}
