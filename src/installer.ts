import * as path from 'path';
import * as exec from '@actions/exec';
import * as core from '@actions/core';
import * as io from '@actions/io';
import { PackageManager } from './types';

/**
 * Checks if the detected package manager CLI is installed in PATH.
 * If missing, automatically installs it for the GitHub runner.
 */
export async function ensurePackageManagerInstalled(pm: PackageManager): Promise<void> {
  if (pm === 'npm') return; // npm is bundled with Node.js

  try {
    const existing = await io.which(pm, false);
    if (existing) {
      core.info(`[SyncMyDep] Found ${pm} executable in PATH at: ${existing}`);
      return;
    }
  } catch {
    // continue to auto-install
  }

  core.info(`[SyncMyDep] 📦 '${pm}' is not found in PATH. Auto-installing ${pm} for the runner...`);

  const options = { ignoreReturnCode: true };

  switch (pm) {
    case 'bun': {
      // 1. Try global npm install
      const npmCode = await exec.exec('npm', ['install', '-g', 'bun'], options);
      if (npmCode !== 0) {
        // 2. Fallback to official curl script
        await exec.exec('bash', ['-c', 'curl -fsSL https://bun.sh/install | bash'], options);
      }
      const home = process.env.HOME || '/root';
      const bunBin = path.join(home, '.bun', 'bin');
      core.addPath(bunBin);
      process.env.PATH = `${bunBin}:${process.env.PATH}`;
      break;
    }

    case 'pnpm': {
      await exec.exec('npm', ['install', '-g', 'pnpm'], options);
      break;
    }

    case 'yarn': {
      await exec.exec('npm', ['install', '-g', 'yarn'], options);
      break;
    }

    case 'deno': {
      const npmCode = await exec.exec('npm', ['install', '-g', 'deno'], options);
      if (npmCode !== 0) {
        await exec.exec('bash', ['-c', 'curl -fsSL https://deno.land/install.sh | sh'], options);
      }
      const home = process.env.HOME || '/root';
      const denoBin = path.join(home, '.deno', 'bin');
      core.addPath(denoBin);
      process.env.PATH = `${denoBin}:${process.env.PATH}`;
      break;
    }
  }

  try {
    const verified = await io.which(pm, false);
    if (verified) {
      core.info(`[SyncMyDep] ✅ Successfully installed and verified ${pm} (${verified})`);
    }
  } catch {
    core.info(`[SyncMyDep] Auto-installation step completed for ${pm}`);
  }
}
