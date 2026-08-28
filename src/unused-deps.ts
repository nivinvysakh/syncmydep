import * as fs from 'fs';
import * as path from 'path';
import { UnusedDependencyResult } from './types';

// Default list of dev/build tooling packages that are executed via CLI and never directly imported
const DEFAULT_IGNORED_DEV_PACKAGES = new Set([
  'typescript',
  'ts-node',
  'ts-jest',
  'jest',
  'eslint',
  'prettier',
  'rimraf',
  'husky',
  'lint-staged',
  'cross-env',
  'concurrently',
  'nodemon',
  'vite',
  'webpack',
  'rollup',
  'turbo',
  'lerna',
  'nx'
]);

const IGNORED_DIRS = new Set([
  'node_modules',
  'dist',
  'dist-cli',
  'coverage',
  '.git',
  '.yarn',
  '.next',
  '.nuxt',
  '.turbo',
  '.cache',
  'build',
  'out'
]);

const SOURCE_EXTENSIONS = new Set([
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.mjs',
  '.cjs',
  '.vue',
  '.svelte',
  '.astro'
]);

/**
 * Extracts the base package name from an import/require specifier.
 * E.g., '@actions/core/lib/foo' -> '@actions/core', 'lodash/map' -> 'lodash'
 */
export function extractPackageName(specifier: string): string | null {
  const clean = specifier.trim().replace(/^['"]|['"]$/g, '');

  // Skip relative, absolute, protocol, or empty paths
  if (
    !clean ||
    clean.startsWith('.') ||
    clean.startsWith('/') ||
    clean.startsWith('node:') ||
    clean.startsWith('bun:') ||
    clean.startsWith('deno:') ||
    clean.startsWith('http://') ||
    clean.startsWith('https://')
  ) {
    return null;
  }

  // Scoped package (@org/pkg/subpath)
  if (clean.startsWith('@')) {
    const parts = clean.split('/');
    if (parts.length >= 2) {
      return `${parts[0]}/${parts[1]}`;
    }
    return clean;
  }

  // Regular package (pkg/subpath)
  const parts = clean.split('/');
  return parts[0];
}

/**
 * Parses all imports, requires, and dynamic imports from source text using fast regex parsing.
 */
export function extractImportsFromCode(code: string): Set<string> {
  const found = new Set<string>();

  // match: import ... from 'pkg' or import 'pkg' or export ... from 'pkg'
  const importRegex = /(?:import\s+(?:[\s\S]*?from\s+)?['"]([^'"]+)['"])|(?:export\s+[\s\S]*?from\s+['"]([^'"]+)['"])/g;
  let match: RegExpExecArray | null;
  while ((match = importRegex.exec(code)) !== null) {
    const spec = match[1] || match[2];
    const pkg = extractPackageName(spec);
    if (pkg) found.add(pkg);
  }

  // match: require('pkg') or import('pkg')
  const dynamicRegex = /(?:require|import)\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = dynamicRegex.exec(code)) !== null) {
    const spec = match[1];
    const pkg = extractPackageName(spec);
    if (pkg) found.add(pkg);
  }

  return found;
}

/**
 * Recursively scans directory for source files.
 */
function scanSourceFiles(dir: string, fileList: string[] = []): string[] {
  if (!fs.existsSync(dir)) return fileList;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
        scanSourceFiles(path.join(dir, entry.name), fileList);
      }
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (SOURCE_EXTENSIONS.has(ext)) {
        fileList.push(path.join(dir, entry.name));
      }
    }
  }

  return fileList;
}

/**
 * Detects unused dependencies in package.json by scanning source files.
 */
export function detectUnusedDependencies(
  workspaceDir: string,
  options: {
    ignorePackages?: string[];
    checkDevDeps?: boolean;
  } = {}
): UnusedDependencyResult {
  const pkgJsonPath = path.join(workspaceDir, 'package.json');
  if (!fs.existsSync(pkgJsonPath)) {
    return { unusedProd: [], unusedDev: [], totalUnused: 0, scannedFilesCount: 0 };
  }

  const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
  const prodDeps = Object.keys(pkgJson.dependencies || {});
  const devDeps = Object.keys(pkgJson.devDependencies || {});

  const customIgnore = new Set(options.ignorePackages || []);
  const sourceFiles = scanSourceFiles(workspaceDir);
  const usedPackages = new Set<string>();

  for (const file of sourceFiles) {
    try {
      const code = fs.readFileSync(file, 'utf8');
      const imports = extractImportsFromCode(code);
      imports.forEach((pkg) => usedPackages.add(pkg));
    } catch {
      // ignore unreadable files
    }
  }

  // Also check package.json scripts or binary commands if referenced
  const scriptsContent = JSON.stringify(pkgJson.scripts || {});
  for (const dep of [...prodDeps, ...devDeps]) {
    if (scriptsContent.includes(dep)) {
      usedPackages.add(dep);
    }
  }

  // Filter unused production dependencies
  const unusedProd = prodDeps.filter((pkg) => {
    if (customIgnore.has(pkg)) return false;
    return !usedPackages.has(pkg);
  });

  // Filter unused dev dependencies (skip tooling & @types)
  const unusedDev = options.checkDevDeps
    ? devDeps.filter((pkg) => {
        if (customIgnore.has(pkg)) return false;
        if (DEFAULT_IGNORED_DEV_PACKAGES.has(pkg)) return false;
        if (pkg.startsWith('@types/')) return false;
        if (pkg.startsWith('@vercel/')) return false;
        if (pkg.startsWith('eslint-') || pkg.startsWith('@typescript-eslint/')) return false;
        return !usedPackages.has(pkg);
      })
    : [];

  return {
    unusedProd,
    unusedDev,
    totalUnused: unusedProd.length + unusedDev.length,
    scannedFilesCount: sourceFiles.length
  };
}

/**
 * Prunes the specified unused dependencies from package.json.
 */
export function pruneUnusedDependencies(
  workspaceDir: string,
  unusedPackages: string[]
): { pruned: string[]; modified: boolean } {
  const pkgJsonPath = path.join(workspaceDir, 'package.json');
  if (!fs.existsSync(pkgJsonPath) || unusedPackages.length === 0) {
    return { pruned: [], modified: false };
  }

  const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
  const toRemove = new Set(unusedPackages);
  const pruned: string[] = [];

  if (pkgJson.dependencies) {
    for (const pkg of Object.keys(pkgJson.dependencies)) {
      if (toRemove.has(pkg)) {
        delete pkgJson.dependencies[pkg];
        pruned.push(pkg);
      }
    }
  }

  if (pkgJson.devDependencies) {
    for (const pkg of Object.keys(pkgJson.devDependencies)) {
      if (toRemove.has(pkg)) {
        delete pkgJson.devDependencies[pkg];
        pruned.push(pkg);
      }
    }
  }

  if (pruned.length > 0) {
    fs.writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 2) + '\n');
    return { pruned, modified: true };
  }

  return { pruned: [], modified: false };
}
