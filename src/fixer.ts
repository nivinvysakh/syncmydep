import * as exec from '@actions/exec';
import * as core from '@actions/core';
import { PackageManager, YarnVariant, SyncResult, GitStatusResult, DependencyDiff } from './types';

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
 * Parses package.json diffs to extract added, upgraded, or removed dependency items.
 */
export async function parseDependencyDiffs(
  workspaceDir: string,
  changedFiles: string[]
): Promise<DependencyDiff[]> {
  const pkgFiles = changedFiles.filter((f) => f.endsWith('package.json'));
  if (pkgFiles.length === 0) return [];

  let diffText = '';
  const options = {
    cwd: workspaceDir,
    ignoreReturnCode: true,
    silent: true,
    listeners: {
      stdout: (data: Buffer) => {
        diffText += data.toString();
      }
    }
  };

  await exec.exec('git', ['diff', '-U1', '--', ...pkgFiles], options);
  if (!diffText) return [];

  const diffs: DependencyDiff[] = [];
  const lines = diffText.split('\n');
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
    if (removedMap.has(pkg)) {
      const oldVer = removedMap.get(pkg)!;
      removedMap.delete(pkg);
      diffs.push({
        name: pkg,
        type: 'prod',
        oldVersion: oldVer,
        newVersion: newVer,
        changeType: 'upgraded'
      });
    } else {
      diffs.push({
        name: pkg,
        type: 'prod',
        newVersion: newVer,
        changeType: 'added'
      });
    }
  }

  // Remaining in removedMap are deletions
  for (const [pkg, oldVer] of removedMap.entries()) {
    diffs.push({
      name: pkg,
      type: 'prod',
      oldVersion: oldVer,
      changeType: 'removed'
    });
  }

  return diffs;
}
