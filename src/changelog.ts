import * as fs from 'fs';
import * as path from 'path';
import { ChangelogSummary, DependencyDiff, PackageReleaseInfo } from './types';

/**
 * Cleans and standardizes git and repository URLs to standard HTTPS web links.
 */
export function normalizeRepositoryUrl(rawUrl?: string): string | undefined {
  if (!rawUrl || typeof rawUrl !== 'string') return undefined;

  let url = rawUrl.trim();

  // Strip git+ and ssh prefixes
  url = url.replace(/^git\+/, '');
  url = url.replace(/^git:\/\//, 'https://');
  url = url.replace(/^ssh:\/\/git@github\.com/, 'https://github.com');
  url = url.replace(/^git@github\.com:/, 'https://github.com/');
  url = url.replace(/\.git$/, '');

  if (url.startsWith('github:')) {
    url = `https://github.com/${url.slice(7)}`;
  }

  if (url.startsWith('https://github.com/') || url.startsWith('https://gitlab.com/')) {
    return url;
  }

  return undefined;
}

/**
 * Attempts to resolve the repository URL for a package from node_modules.
 */
export function resolvePackageRepoUrl(workspaceDir: string, pkgName: string): string | undefined {
  try {
    const pkgJsonPath = path.join(workspaceDir, 'node_modules', pkgName, 'package.json');
    if (fs.existsSync(pkgJsonPath)) {
      const content = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
      if (content.repository) {
        if (typeof content.repository === 'string') {
          return normalizeRepositoryUrl(content.repository);
        }
        if (typeof content.repository === 'object' && content.repository.url) {
          return normalizeRepositoryUrl(content.repository.url);
        }
      }
      if (content.homepage && content.homepage.includes('github.com')) {
        return normalizeRepositoryUrl(content.homepage.split('#')[0]);
      }
    }
  } catch {
    // Ignore resolution errors
  }

  return undefined;
}

/**
 * Generates release notes, changelog, and compare diff links for a changed dependency.
 */
export function generatePackageReleaseInfo(
  workspaceDir: string,
  pkgName: string,
  fromVersion?: string,
  toVersion?: string
): PackageReleaseInfo {
  const repoUrl = resolvePackageRepoUrl(workspaceDir, pkgName);
  const cleanFrom = fromVersion ? fromVersion.replace(/^[^\d]*/, '').trim() : undefined;
  const cleanTo = toVersion ? toVersion.replace(/^[^\d]*/, '').trim() : undefined;

  let releaseUrl: string | undefined;
  let diffUrl: string | undefined;
  let changelogUrl: string | undefined;

  if (repoUrl) {
    if (cleanTo) {
      releaseUrl = `${repoUrl}/releases/tag/v${cleanTo}`;
    } else {
      releaseUrl = `${repoUrl}/releases`;
    }

    if (cleanFrom && cleanTo && cleanFrom !== cleanTo) {
      diffUrl = `${repoUrl}/compare/v${cleanFrom}...v${cleanTo}`;
    }

    changelogUrl = `${repoUrl}/releases`;
  } else {
    changelogUrl = `https://www.npmjs.com/package/${pkgName}`;
  }

  return {
    name: pkgName,
    fromVersion: cleanFrom,
    toVersion: cleanTo,
    repositoryUrl: repoUrl,
    changelogUrl,
    releaseUrl,
    diffUrl
  };
}

/**
 * Builds changelog summary objects for all upgraded or changed dependencies.
 */
export function buildChangelogSummaries(
  workspaceDir: string,
  diffs: DependencyDiff[] = []
): ChangelogSummary[] {
  const results: ChangelogSummary[] = [];

  for (const diff of diffs) {
    if (diff.changeType === 'removed') continue;

    const info = generatePackageReleaseInfo(
      workspaceDir,
      diff.name,
      diff.oldVersion,
      diff.newVersion
    );

    results.push({
      package: diff.name,
      fromVersion: info.fromVersion,
      toVersion: info.toVersion,
      diffUrl: info.diffUrl,
      releaseUrl: info.releaseUrl || info.changelogUrl,
      notesSummary: info.diffUrl
        ? `[View Compare Diff (v${info.fromVersion} ➔ v${info.toVersion})](${info.diffUrl})`
        : info.releaseUrl
        ? `[View Release Notes](${info.releaseUrl})`
        : `[View Package on npm](${info.changelogUrl})`
    });
  }

  return results;
}
