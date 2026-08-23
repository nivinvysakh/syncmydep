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
 * Resolves directory paths containing package.json for standard glob patterns (e.g. packages/*).
 */
function findWorkspacePackages(workspaceDir: string, patterns: string[]): string[] {
  const discovered: string[] = [];
  const searchDirs = patterns.length > 0 ? patterns : ['packages/*', 'apps/*', 'libs/*'];

  for (const pattern of searchDirs) {
    const baseDirName = pattern.replace(/\/\*.*$/, '').trim();
    const fullBaseDir = path.join(workspaceDir, baseDirName);

    if (fs.existsSync(fullBaseDir) && fs.statSync(fullBaseDir).isDirectory()) {
      try {
        const entries = fs.readdirSync(fullBaseDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const childPkg = path.join(fullBaseDir, entry.name, 'package.json');
            if (fs.existsSync(childPkg)) {
              discovered.push(path.join(baseDirName, entry.name));
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
