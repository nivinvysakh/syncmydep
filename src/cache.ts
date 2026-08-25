import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import * as core from '@actions/core';
import * as cache from '@actions/cache';
import { PackageManager, YarnVariant } from './types';

/**
 * Computes a hash of all manifest and lockfiles in the workspace to serve as cache key.
 */
export function computeLockfileHash(workspaceDir: string): string {
  const hash = crypto.createHash('sha256');
  const targetFiles = [
    'package.json',
    'package-lock.json',
    'yarn.lock',
    '.yarnrc.yml',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    'bun.lock',
    'bun.lockb',
    'deno.lock',
    'deno.json',
    'deno.jsonc'
  ];

  let hasFile = false;
  for (const file of targetFiles) {
    const filePath = path.join(workspaceDir, file);
    if (fs.existsSync(filePath)) {
      try {
        const content = fs.readFileSync(filePath);
        hash.update(file);
        hash.update(content);
        hasFile = true;
      } catch {
        // ignore unreadable files
      }
    }
  }

  return hasFile ? hash.digest('hex').slice(0, 16) : 'default';
}

/**
 * Resolves cache directories for the active package manager.
 */
export function getCacheDirectories(
  workspaceDir: string,
  pm: PackageManager,
  yarnVariant: YarnVariant = 'classic'
): string[] {
  const home = os.homedir();
  const dirs: string[] = [];

  switch (pm) {
    case 'npm':
      if (process.platform === 'win32') {
        dirs.push(path.join(process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'), 'npm-cache'));
      } else {
        dirs.push(path.join(home, '.npm'));
      }
      break;

    case 'pnpm':
      if (process.platform === 'win32') {
        dirs.push(path.join(process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'), 'pnpm', 'store'));
      } else if (process.platform === 'darwin') {
        dirs.push(path.join(home, 'Library', 'pnpm', 'store'));
      } else {
        dirs.push(path.join(home, '.local', 'share', 'pnpm', 'store'));
      }
      dirs.push(path.join(home, '.pnpm-store'));
      break;

    case 'yarn':
      if (yarnVariant === 'berry') {
        dirs.push(path.join(workspaceDir, '.yarn', 'cache'));
      } else {
        if (process.platform === 'win32') {
          dirs.push(path.join(process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'), 'Yarn', 'Cache'));
        } else if (process.platform === 'darwin') {
          dirs.push(path.join(home, 'Library', 'Caches', 'Yarn'));
        } else {
          dirs.push(path.join(home, '.cache', 'yarn'));
        }
      }
      break;

    case 'bun':
      if (process.platform === 'win32') {
        dirs.push(path.join(process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'), 'bun', 'install', 'cache'));
      } else {
        dirs.push(path.join(home, '.bun', 'install', 'cache'));
        dirs.push(path.join(home, '.cache', 'bun'));
      }
      break;

    case 'deno':
      if (process.platform === 'win32') {
        dirs.push(path.join(process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'), 'deno'));
      } else if (process.platform === 'darwin') {
        dirs.push(path.join(home, 'Library', 'Caches', 'deno'));
      } else {
        dirs.push(path.join(home, '.cache', 'deno'));
      }
      break;
  }

  return dirs;
}

/**
 * Restores cached packages for faster subsequent workflow runs.
 */
export async function restorePackageCache(
  workspaceDir: string,
  pm: PackageManager,
  yarnVariant: YarnVariant = 'classic'
): Promise<{ restored: boolean; cacheKey: string }> {
  const fileHash = computeLockfileHash(workspaceDir);
  const primaryKey = `syncmydep-${pm}-${process.platform}-${fileHash}`;
  const restoreKeys = [
    `syncmydep-${pm}-${process.platform}-`,
    `syncmydep-${pm}-`
  ];

  const paths = getCacheDirectories(workspaceDir, pm, yarnVariant);

  if (!cache.isFeatureAvailable()) {
    core.info('[SyncMyDep Cache] Cache feature is not available on this runner. Skipping cache restore.');
    return { restored: false, cacheKey: primaryKey };
  }

  try {
    core.info(`[SyncMyDep Cache] Checking cache for ${pm} (key: ${primaryKey})...`);
    const matchedKey = await cache.restoreCache(paths, primaryKey, restoreKeys);

    if (matchedKey) {
      core.info(`[SyncMyDep Cache] ✅ Cache restored from key: ${matchedKey}`);
      return { restored: true, cacheKey: primaryKey };
    }

    core.info('[SyncMyDep Cache] No existing cache found.');
    return { restored: false, cacheKey: primaryKey };
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    core.info(`[SyncMyDep Cache] Cache restore skipped: ${errMsg}`);
    return { restored: false, cacheKey: primaryKey };
  }
}

/**
 * Saves package manager cache directories for future workflow runs.
 */
export async function savePackageCache(
  workspaceDir: string,
  pm: PackageManager,
  cacheKey: string,
  yarnVariant: YarnVariant = 'classic'
): Promise<boolean> {
  if (!cache.isFeatureAvailable()) {
    return false;
  }

  const paths = getCacheDirectories(workspaceDir, pm, yarnVariant);
  const existingPaths = paths.filter((p) => fs.existsSync(p));

  if (existingPaths.length === 0) {
    core.info('[SyncMyDep Cache] No cache directories created yet to save.');
    return false;
  }

  try {
    core.info(`[SyncMyDep Cache] Saving cache for ${pm} (${existingPaths.join(', ')})...`);
    await cache.saveCache(existingPaths, cacheKey);
    core.info(`[SyncMyDep Cache] ✅ Cache saved successfully: ${cacheKey}`);
    return true;
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    if (errMsg.includes('already exists') || errMsg.includes('reserveCache failed')) {
      core.info(`[SyncMyDep Cache] Cache entry already exists.`);
    } else {
      core.info(`[SyncMyDep Cache] Cache save skipped: ${errMsg}`);
    }
    return false;
  }
}
