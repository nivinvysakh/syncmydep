const fs = require('fs');
const path = require('path');
const exec = require('@actions/exec');

/**
 * Detects the appropriate package manager for the workspace.
 * @param {string} workspaceDir
 * @param {string} specifiedPm
 * @returns {string} 'npm' | 'yarn' | 'pnpm'
 */
function detectPackageManager(workspaceDir, specifiedPm = 'auto') {
  if (specifiedPm && specifiedPm !== 'auto') {
    const valid = ['npm', 'yarn', 'pnpm'];
    if (valid.includes(specifiedPm.toLowerCase())) {
      return specifiedPm.toLowerCase();
    }
  }

  const pnpmLock = path.join(workspaceDir, 'pnpm-lock.yaml');
  if (fs.existsSync(pnpmLock)) return 'pnpm';

  const yarnLock = path.join(workspaceDir, 'yarn.lock');
  if (fs.existsSync(yarnLock)) return 'yarn';

  const npmLock = path.join(workspaceDir, 'package-lock.json');
  if (fs.existsSync(npmLock)) return 'npm';

  return 'npm';
}

/**
 * Checks if package.json exists in the specified directory.
 * @param {string} workspaceDir
 * @returns {boolean}
 */
function checkPackageJsonExists(workspaceDir) {
  return fs.existsSync(path.join(workspaceDir, 'package.json'));
}

/**
 * Gets the lockfile name associated with a package manager.
 * @param {string} pm
 * @returns {string}
 */
function getLockfileName(pm) {
  switch (pm) {
    case 'pnpm':
      return 'pnpm-lock.yaml';
    case 'yarn':
      return 'yarn.lock';
    case 'npm':
    default:
      return 'package-lock.json';
  }
}

/**
 * Runs a quick audit query to inspect vulnerabilities before/after fixing.
 * @param {string} workspaceDir
 * @param {string} pm
 * @returns {Promise<{total: number, vulnerabilities: object}>}
 */
async function inspectAudit(workspaceDir, pm) {
  let stdout = '';

  const options = {
    cwd: workspaceDir,
    ignoreReturnCode: true,
    silent: true,
    listeners: {
      stdout: (data) => {
        stdout += data.toString();
      }
    }
  };

  try {
    if (pm === 'npm') {
      await exec.exec('npm', ['audit', '--json'], options);
      if (stdout) {
        const parsed = JSON.parse(stdout);
        const metadata = parsed.metadata || {};
        const vulnCounts = metadata.vulnerabilities || parsed.vulnerabilities || {};
        const total = typeof metadata.vulnerabilities === 'object'
          ? Object.values(metadata.vulnerabilities).reduce((a, b) => a + b, 0)
          : (parsed.auditReportVersion ? Object.keys(parsed.vulnerabilities || {}).length : 0);

        return {
          total: total || 0,
          summary: vulnCounts,
          raw: parsed
        };
      }
    }
  } catch {
    // If parsing fails, return empty
  }

  return { total: 0, summary: {}, raw: null };
}

module.exports = {
  detectPackageManager,
  checkPackageJsonExists,
  getLockfileName,
  inspectAudit
};
