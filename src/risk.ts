import { DependencyDiff, RiskFactor, RiskLevel, RiskScoreResult } from './types';

/**
 * Parses a semver-like version string into major, minor, patch numbers.
 */
export function parseSemVer(versionStr?: string): { major: number; minor: number; patch: number; valid: boolean } {
  if (!versionStr) return { major: 0, minor: 0, patch: 0, valid: false };

  // Strip leading ^, ~, =, v, >=, etc.
  const cleaned = versionStr.replace(/^[^\d]*/, '').split('-')[0].split('+')[0].trim();
  const parts = cleaned.split('.').map((p) => parseInt(p, 10));

  if (parts.length >= 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
    return { major: parts[0], minor: parts[1], patch: parts[2], valid: true };
  }
  if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    return { major: parts[0], minor: parts[1], patch: 0, valid: true };
  }
  if (parts.length === 1 && !isNaN(parts[0])) {
    return { major: parts[0], minor: 0, patch: 0, valid: true };
  }

  return { major: 0, minor: 0, patch: 0, valid: false };
}

/**
 * Analyzes the semver distance between old and new version.
 */
export function evaluateVersionRisk(
  pkgName: string,
  oldVersion?: string,
  newVersion?: string,
  changeType: DependencyDiff['changeType'] = 'upgraded'
): RiskFactor {
  if (changeType === 'removed') {
    return {
      package: pkgName,
      level: 'moderate',
      reason: 'Package was removed; ensure no imports remain in codebase.',
      fromVersion: oldVersion,
      toVersion: newVersion
    };
  }

  if (changeType === 'added') {
    return {
      package: pkgName,
      level: 'low',
      reason: 'New package added to dependency tree.',
      fromVersion: oldVersion,
      toVersion: newVersion
    };
  }

  if (changeType === 'downgraded') {
    return {
      package: pkgName,
      level: 'moderate',
      reason: 'Package downgraded; check for missing newer features.',
      fromVersion: oldVersion,
      toVersion: newVersion
    };
  }

  const oldSem = parseSemVer(oldVersion);
  const newSem = parseSemVer(newVersion);

  if (!oldSem.valid || !newSem.valid) {
    return {
      package: pkgName,
      level: 'low',
      reason: 'Lockfile drift / synchronization without major version bump.',
      fromVersion: oldVersion,
      toVersion: newVersion
    };
  }

  // 0.x.x versions treat minor bumps as breaking changes per SemVer spec
  if (oldSem.major === 0 && newSem.major === 0) {
    if (newSem.minor > oldSem.minor) {
      return {
        package: pkgName,
        level: 'high',
        reason: `Initial development major shift (v0.${oldSem.minor} ➔ v0.${newSem.minor}); potential breaking changes.`,
        fromVersion: oldVersion,
        toVersion: newVersion
      };
    }
    if (newSem.patch > oldSem.patch) {
      return {
        package: pkgName,
        level: 'low',
        reason: `Safe patch update (v0.${oldSem.minor}.${oldSem.patch} ➔ v0.${newSem.minor}.${newSem.patch}).`,
        fromVersion: oldVersion,
        toVersion: newVersion
      };
    }
  }

  if (newSem.major > oldSem.major) {
    return {
      package: pkgName,
      level: 'high',
      reason: `Major SemVer jump (v${oldSem.major} ➔ v${newSem.major}); breaking API changes likely.`,
      fromVersion: oldVersion,
      toVersion: newVersion
    };
  }

  if (newSem.minor > oldSem.minor) {
    return {
      package: pkgName,
      level: 'moderate',
      reason: `Minor feature update (v${oldSem.major}.${oldSem.minor} ➔ v${newSem.major}.${newSem.minor}); backwards compatible.`,
      fromVersion: oldVersion,
      toVersion: newVersion
    };
  }

  return {
    package: pkgName,
    level: 'low',
    reason: `Patch / bug-fix update (v${oldSem.major}.${oldSem.minor}.${oldSem.patch} ➔ v${newSem.major}.${newSem.minor}.${newSem.patch}).`,
    fromVersion: oldVersion,
    toVersion: newVersion
  };
}

/**
 * Calculates the overall risk score and recommendation for the Pull Request.
 */
export function calculateRiskScore(diffs: DependencyDiff[] = []): RiskScoreResult {
  if (diffs.length === 0) {
    return {
      overallLevel: 'low',
      score: 1,
      badge: '🟢 **Low Risk (Lockfile Sync)**',
      summary: 'Safe lockfile synchronization. No breaking dependency changes detected.',
      factors: [],
      safeToAutoMerge: true
    };
  }

  const factors: RiskFactor[] = diffs.map((d) =>
    evaluateVersionRisk(d.name, d.oldVersion, d.newVersion, d.changeType)
  );

  const hasHigh = factors.some((f) => f.level === 'high');
  const hasModerate = factors.some((f) => f.level === 'moderate');

  let overallLevel: RiskLevel = 'low';
  let score = 2;
  let badge = '🟢 **Low Risk**';
  let summary = 'Changes consist of backward-compatible patch updates or lockfile reconciliation.';
  let safeToAutoMerge = true;

  if (hasHigh) {
    overallLevel = 'high';
    score = 8;
    badge = '🔴 **High Risk (Major Breaking Changes)**';
    summary = 'One or more dependencies underwent a major version upgrade. Review changelogs carefully before merging.';
    safeToAutoMerge = false;
  } else if (hasModerate) {
    overallLevel = 'moderate';
    score = 4;
    badge = '🟡 **Moderate Risk (Minor / Feature Updates)**';
    summary = 'Changes include minor version bumps or new dependencies. Safe, but verify feature compatibility.';
    safeToAutoMerge = true;
  }

  return {
    overallLevel,
    score,
    badge,
    summary,
    factors,
    safeToAutoMerge
  };
}
