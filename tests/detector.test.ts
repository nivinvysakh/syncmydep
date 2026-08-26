import * as fs from 'fs';
import * as path from 'path';
import {
  detectPackageManager,
  detectYarnVariant,
  checkPackageJsonExists,
  checkGitRepository,
  getLockfileName,
  parseNpmAuditAdvisories,
  parseYarnAuditAdvisories
} from '../src/detector';

describe('detector', () => {
  const tempDir = path.join(__dirname, 'fixtures');

  beforeAll(() => {
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
  });

  afterAll(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('checkGitRepository correctly identifies git repositories', async () => {
    const isGit = await checkGitRepository(process.cwd());
    expect(isGit).toBe(true);
  });

  test('getLockfileName returns corresponding lockfile for all managers', () => {
    expect(getLockfileName('npm')).toBe('package-lock.json');
    expect(getLockfileName('yarn')).toBe('yarn.lock');
    expect(getLockfileName('pnpm')).toBe('pnpm-lock.yaml');
    expect(getLockfileName('bun')).toBe('bun.lock');
    expect(getLockfileName('deno')).toBe('deno.lock');
  });

  test('detectPackageManager respects explicit package manager input', () => {
    expect(detectPackageManager(tempDir, 'yarn')).toBe('yarn');
    expect(detectPackageManager(tempDir, 'pnpm')).toBe('pnpm');
    expect(detectPackageManager(tempDir, 'npm')).toBe('npm');
    expect(detectPackageManager(tempDir, 'bun')).toBe('bun');
    expect(detectPackageManager(tempDir, 'deno')).toBe('deno');
  });

  test('checkPackageJsonExists returns true if file exists', () => {
    const pkgPath = path.join(tempDir, 'package.json');
    fs.writeFileSync(pkgPath, JSON.stringify({ name: 'test' }));
    expect(checkPackageJsonExists(tempDir)).toBe(true);
    fs.unlinkSync(pkgPath);
    expect(checkPackageJsonExists(tempDir)).toBe(false);
  });

  test('detectPackageManager detects bun from bun.lock / bun.lockb', () => {
    const bunPath = path.join(tempDir, 'bun.lock');
    fs.writeFileSync(bunPath, '');
    expect(detectPackageManager(tempDir, 'auto')).toBe('bun');
    fs.unlinkSync(bunPath);

    const bunbPath = path.join(tempDir, 'bun.lockb');
    fs.writeFileSync(bunbPath, '');
    expect(detectPackageManager(tempDir, 'auto')).toBe('bun');
    fs.unlinkSync(bunbPath);
  });

  test('detectPackageManager detects deno from deno.lock', () => {
    const denoPath = path.join(tempDir, 'deno.lock');
    fs.writeFileSync(denoPath, '');
    expect(detectPackageManager(tempDir, 'auto')).toBe('deno');
    fs.unlinkSync(denoPath);
  });

  test('detectPackageManager detects pnpm from pnpm-lock.yaml', () => {
    const pnpmPath = path.join(tempDir, 'pnpm-lock.yaml');
    fs.writeFileSync(pnpmPath, '');
    expect(detectPackageManager(tempDir, 'auto')).toBe('pnpm');
    fs.unlinkSync(pnpmPath);
  });

  test('detectPackageManager detects yarn from yarn.lock', () => {
    const yarnPath = path.join(tempDir, 'yarn.lock');
    fs.writeFileSync(yarnPath, '');
    expect(detectPackageManager(tempDir, 'auto')).toBe('yarn');
    fs.unlinkSync(yarnPath);
  });

  test('detectYarnVariant identifies Berry vs Classic', () => {
    const yarnRc = path.join(tempDir, '.yarnrc.yml');
    fs.writeFileSync(yarnRc, 'nodeLinker: node-modules\n');
    expect(detectYarnVariant(tempDir)).toBe('berry');
    fs.unlinkSync(yarnRc);

    const yarnLock = path.join(tempDir, 'yarn.lock');
    fs.writeFileSync(yarnLock, '# yarn lockfile v1\n');
    expect(detectYarnVariant(tempDir)).toBe('classic');
    fs.unlinkSync(yarnLock);
  });

  test('detectPackageManager defaults to npm if package-lock.json exists or no lockfile', () => {
    expect(detectPackageManager(tempDir, 'auto')).toBe('npm');
  });

  test('parseNpmAuditAdvisories extracts GHSA / CVE from npm v7+ report', () => {
    const mockReport = {
      vulnerabilities: {
        lodash: {
          name: 'lodash',
          severity: 'high',
          via: [
            {
              source: 1084,
              name: 'lodash',
              title: 'Prototype Pollution in lodash',
              url: 'https://github.com/advisories/GHSA-p6mc-m468-83gw',
              severity: 'high'
            }
          ],
          fixAvailable: {
            name: 'lodash',
            version: '4.17.21'
          }
        }
      }
    };

    const advisories = parseNpmAuditAdvisories(mockReport);
    expect(advisories).toHaveLength(1);
    expect(advisories[0].package).toBe('lodash');
    expect(advisories[0].id).toBe('GHSA-p6mc-m468-83gw');
    expect(advisories[0].severity).toBe('high');
    expect(advisories[0].patchedVersions).toBe('4.17.21');
  });

  test('parseYarnAuditAdvisories extracts advisories from yarn audit JSON stream', () => {
    const yarnJsonLine = JSON.stringify({
      type: 'auditAdvisory',
      data: {
        advisory: {
          id: 1084,
          title: 'Prototype Pollution in lodash',
          module_name: 'lodash',
          severity: 'high',
          cves: ['CVE-2020-8203'],
          github_advisory_id: 'GHSA-p6mc-m468-83gw',
          patched_versions: '>=4.17.21',
          url: 'https://npmjs.com/advisories/1084'
        }
      }
    });

    const advisories = parseYarnAuditAdvisories(yarnJsonLine);
    expect(advisories).toHaveLength(1);
    expect(advisories[0].package).toBe('lodash');
    expect(advisories[0].id).toBe('GHSA-p6mc-m468-83gw');
    expect(advisories[0].patchedVersions).toBe('>=4.17.21');
  });
});
