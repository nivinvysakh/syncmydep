import * as exec from '@actions/exec';
import * as core from '@actions/core';
import { PackageManager, SyncResult, GitStatusResult } from './types';

/**
 * Synchronizes the lockfile with package.json specifications.
 */
export async function syncLockfile(
  workspaceDir: string,
  pm: PackageManager
): Promise<SyncResult> {
  core.info(`[SyncMyDep] Synchronizing lockfile using ${pm}...`);
  let output = '';
  let errorOutput = '';

  const options = {
    cwd: workspaceDir,
    ignoreReturnCode: true,
    listeners: {
      stdout: (data: Buffer) => {
        output += data.toString();
      },
      stderr: (data: Buffer) => {
        errorOutput += data.toString();
      }
    }
  };

  let exitCode = 0;
  if (pm === 'npm') {
    exitCode = await exec.exec('npm', ['install', '--package-lock-only', '--no-audit', '--no-fund'], options);
  } else if (pm === 'yarn') {
    exitCode = await exec.exec('yarn', ['install', '--mode', 'update-lockfile'], options);
    if (exitCode !== 0) {
      exitCode = await exec.exec('yarn', ['install'], options);
    }
  } else if (pm === 'pnpm') {
    exitCode = await exec.exec('pnpm', ['install', '--lockfile-only'], options);
  }

  return {
    success: exitCode === 0,
    output: output + errorOutput
  };
}

/**
 * Runs security audit fix to update vulnerable packages.
 */
export async function runAuditFix(
  workspaceDir: string,
  pm: PackageManager,
  auditLevel: string = 'moderate'
): Promise<SyncResult> {
  core.info(`[SyncMyDep] Running security audit fix using ${pm} (level: ${auditLevel})...`);
  let output = '';
  let errorOutput = '';

  const options = {
    cwd: workspaceDir,
    ignoreReturnCode: true,
    listeners: {
      stdout: (data: Buffer) => {
        output += data.toString();
      },
      stderr: (data: Buffer) => {
        errorOutput += data.toString();
      }
    }
  };

  let exitCode = 0;
  if (pm === 'npm') {
    exitCode = await exec.exec('npm', ['audit', 'fix', `--audit-level=${auditLevel}`], options);
  } else if (pm === 'pnpm') {
    exitCode = await exec.exec('pnpm', ['audit', '--fix'], options);
  } else if (pm === 'yarn') {
    core.info('[SyncMyDep] yarn audit does not support native auto-fix; lockfile sync was applied.');
  }

  return {
    success: exitCode === 0 || exitCode === 1, // npm audit fix may return 1 if unfixable vulnerabilities remain
    output: output + errorOutput
  };
}

/**
 * Checks git status for any modified or untracked dependency files.
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
    if (
      filePath.endsWith('package.json') ||
      filePath.endsWith('package-lock.json') ||
      filePath.endsWith('yarn.lock') ||
      filePath.endsWith('pnpm-lock.yaml')
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
 * Gets git diff summary for the changed dependency files.
 */
export async function getGitDiffStat(
  workspaceDir: string,
  files: string[] = []
): Promise<string> {
  let diffStat = '';

  const options = {
    cwd: workspaceDir,
    ignoreReturnCode: true,
    silent: true,
    listeners: {
      stdout: (data: Buffer) => {
        diffStat += data.toString();
      }
    }
  };

  const args = ['diff', '--stat'];
  if (files.length > 0) {
    args.push('--', ...files);
  }

  await exec.exec('git', args, options);
  return diffStat.trim();
}
