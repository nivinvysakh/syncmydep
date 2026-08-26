import * as fs from 'fs';
import * as path from 'path';
import { WorkspaceInfo, WorkspaceType } from './types';

/**
 * Inspects a workspace directory to detect monorepo toolchains and multi-package setups.
 */
export function detectWorkspace(workspaceDir: string): WorkspaceInfo {
  let type: WorkspaceType = 'none';
  const patterns: string[] = [];

  // Check pnpm-workspace.yaml
  const pnpmWorkspacePath = path.join(workspaceDir, 'pnpm-workspace.yaml');
  if (fs.existsSync(pnpmWorkspacePath)) {
    type = 'pnpm';
    try {
      const content = fs.readFileSync(pnpmWorkspacePath, 'utf8');
      const lines = content.split('\n');
      let inPackages = false;
      for (const line of lines) {
        if (line.trim().startsWith('packages:')) {
          inPackages = true;
          continue;
        }
        if (inPackages && line.trim().startsWith('-')) {
          const pattern = line.replace(/^\s*-\s*['"]?/, '').replace(/['"]?\s*$/, '');
          if (pattern) patterns.push(pattern);
        } else if (inPackages && line.trim() && !line.startsWith(' ') && !line.startsWith('\t')) {
          inPackages = false;
        }
      }
    } catch {
      // ignore parsing errors
    }
  }

  // Check Turborepo
  if (fs.existsSync(path.join(workspaceDir, 'turbo.json'))) {
    type = 'turbo';
  }

  // Check Lerna
  if (fs.existsSync(path.join(workspaceDir, 'lerna.json'))) {
    type = 'lerna';
    try {
      const lernaJson = JSON.parse(fs.readFileSync(path.join(workspaceDir, 'lerna.json'), 'utf8'));
      if (Array.isArray(lernaJson.packages)) {
        patterns.push(...lernaJson.packages);
      }
    } catch {
      // ignore
    }
  }

  // Check Nx
  if (fs.existsSync(path.join(workspaceDir, 'nx.json'))) {
    type = 'nx';
  }

  // Check Deno workspaces (deno.json or deno.jsonc)
  for (const denoConfigFile of ['deno.json', 'deno.jsonc']) {
    const denoJsonPath = path.join(workspaceDir, denoConfigFile);
    if (fs.existsSync(denoJsonPath)) {
      try {
        const denoConfig = JSON.parse(fs.readFileSync(denoJsonPath, 'utf8'));
        const wsMembers = denoConfig.workspace || denoConfig.workspaces;
        if (wsMembers) {
          if (type === 'none') {
            type = 'deno';
          }
          if (Array.isArray(wsMembers)) {
            patterns.push(...wsMembers);
          }
        }
      } catch {
        // ignore
      }
    }
  }

  // Check package.json workspaces (npm, yarn, bun)
  const pkgJsonPath = path.join(workspaceDir, 'package.json');
  if (fs.existsSync(pkgJsonPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
      if (pkg.workspaces) {
        if (type === 'none') {
          type = 'npm';
        }
        if (Array.isArray(pkg.workspaces)) {
          patterns.push(...pkg.workspaces);
        } else if (Array.isArray(pkg.workspaces.packages)) {
          patterns.push(...pkg.workspaces.packages);
        }
      }
    } catch {
      // ignore
    }
  }

  const isMonorepo = type !== 'none' || patterns.length > 0;
  const packages = isMonorepo ? findWorkspacePackages(workspaceDir, patterns) : [];

  return {
    isMonorepo,
    type,
    patterns: Array.from(new Set(patterns)),
    packages
  };
}

/**
 * Resolves directory paths containing package.json or deno.json for standard glob patterns (e.g. packages/*).
 */
function findWorkspacePackages(workspaceDir: string, patterns: string[]): string[] {
  const discovered: string[] = [];
  const searchDirs = patterns.length > 0 ? patterns : ['packages/*', 'apps/*', 'libs/*'];

  for (const pattern of searchDirs) {
    // If the pattern is an exact directory without wildcards (e.g. 'apps/api', './packages/ui')
    if (!pattern.includes('*')) {
      const cleanDir = pattern.replace(/^\.\//, '').trim();
      const fullDir = path.join(workspaceDir, cleanDir);
      if (fs.existsSync(fullDir) && fs.statSync(fullDir).isDirectory()) {
        const hasManifest =
          fs.existsSync(path.join(fullDir, 'package.json')) ||
          fs.existsSync(path.join(fullDir, 'deno.json')) ||
          fs.existsSync(path.join(fullDir, 'deno.jsonc'));
        if (hasManifest) {
          discovered.push(cleanDir.replace(/\\/g, '/'));
        }
      }
      continue;
    }

    // Pattern is a wildcard (e.g. 'packages/*', 'apps/*')
    const baseDirName = pattern.replace(/\/\*.*$/, '').replace(/^\.\//, '').trim();
    const fullBaseDir = path.join(workspaceDir, baseDirName);

    if (fs.existsSync(fullBaseDir) && fs.statSync(fullBaseDir).isDirectory()) {
      try {
        const entries = fs.readdirSync(fullBaseDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const childDir = path.join(fullBaseDir, entry.name);
            const hasManifest =
              fs.existsSync(path.join(childDir, 'package.json')) ||
              fs.existsSync(path.join(childDir, 'deno.json')) ||
              fs.existsSync(path.join(childDir, 'deno.jsonc'));
            if (hasManifest) {
              discovered.push(path.join(baseDirName, entry.name).replace(/\\/g, '/'));
            }
          }
        }
      } catch {
        // ignore read errors
      }
    }
  }

  return Array.from(new Set(discovered));
}

/**
 * Scans nested workspace package directories and cleans up any "ghost" lockfiles
 * (e.g. package-lock.json, pnpm-lock.yaml, yarn.lock, bun.lock, bun.lockb, deno.lock)
 * that violate monorepo hoisting and break dependency resolution.
 *
 * @returns Array of relative paths of deleted ghost lockfiles.
 */
export function sanitizeWorkspaceLockfiles(
  workspaceDir: string,
  workspaceInfo: WorkspaceInfo
): string[] {
  if (!workspaceInfo.isMonorepo || workspaceInfo.packages.length === 0) {
    return [];
  }

  const ghostLockfileNames = [
    'package-lock.json',
    'pnpm-lock.yaml',
    'yarn.lock',
    'bun.lock',
    'bun.lockb',
    'deno.lock'
  ];

  const removedGhostFiles: string[] = [];

  for (const pkgRelPath of workspaceInfo.packages) {
    const pkgFullPath = path.join(workspaceDir, pkgRelPath);
    for (const lockfile of ghostLockfileNames) {
      const nestedLockfilePath = path.join(pkgFullPath, lockfile);
      if (fs.existsSync(nestedLockfilePath)) {
        try {
          fs.unlinkSync(nestedLockfilePath);
          const relGhost = path.join(pkgRelPath, lockfile).replace(/\\/g, '/');
          removedGhostFiles.push(relGhost);
        } catch {
          // ignore unlink error
        }
      }
    }
  }

  return removedGhostFiles;
}

