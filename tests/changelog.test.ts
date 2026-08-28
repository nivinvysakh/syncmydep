import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  normalizeRepositoryUrl,
  resolvePackageRepoUrl,
  generatePackageReleaseInfo,
  buildChangelogSummaries
} from '../src/changelog';
import { DependencyDiff } from '../src/types';

describe('changelog module', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'syncmydep-changelog-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('normalizeRepositoryUrl handles various git/github URL formats', () => {
    expect(normalizeRepositoryUrl('git+https://github.com/uuidjs/uuid.git')).toBe('https://github.com/uuidjs/uuid');
    expect(normalizeRepositoryUrl('git://github.com/facebook/react.git')).toBe('https://github.com/facebook/react');
    expect(normalizeRepositoryUrl('ssh://git@github.com/actions/toolkit.git')).toBe('https://github.com/actions/toolkit');
    expect(normalizeRepositoryUrl('github:chalk/chalk')).toBe('https://github.com/chalk/chalk');
    expect(normalizeRepositoryUrl(undefined)).toBeUndefined();
    expect(normalizeRepositoryUrl('https://example.com/other')).toBeUndefined();
  });

  test('resolvePackageRepoUrl extracts repository from node_modules package.json', () => {
    const pkgDir = path.join(tmpDir, 'node_modules', 'my-pkg');
    fs.mkdirSync(pkgDir, { recursive: true });
    fs.writeFileSync(
      path.join(pkgDir, 'package.json'),
      JSON.stringify({
        name: 'my-pkg',
        repository: { type: 'git', url: 'git+https://github.com/org/my-pkg.git' }
      })
    );

    const repoUrl = resolvePackageRepoUrl(tmpDir, 'my-pkg');
    expect(repoUrl).toBe('https://github.com/org/my-pkg');
  });

  test('generatePackageReleaseInfo generates compare and release URLs', () => {
    const pkgDir = path.join(tmpDir, 'node_modules', 'test-lib');
    fs.mkdirSync(pkgDir, { recursive: true });
    fs.writeFileSync(
      path.join(pkgDir, 'package.json'),
      JSON.stringify({
        name: 'test-lib',
        repository: 'https://github.com/owner/test-lib'
      })
    );

    const info = generatePackageReleaseInfo(tmpDir, 'test-lib', '1.0.0', '1.1.0');
    expect(info.diffUrl).toBe('https://github.com/owner/test-lib/compare/v1.0.0...v1.1.0');
    expect(info.releaseUrl).toBe('https://github.com/owner/test-lib/releases/tag/v1.1.0');
  });

  test('buildChangelogSummaries generates summary list for changed packages', () => {
    const diffs: DependencyDiff[] = [
      { name: 'lodash', oldVersion: '4.17.20', newVersion: '4.17.21', changeType: 'upgraded', type: 'prod' }
    ];

    const summaries = buildChangelogSummaries(tmpDir, diffs);
    expect(summaries.length).toBe(1);
    expect(summaries[0].package).toBe('lodash');
    expect(summaries[0].fromVersion).toBe('4.17.20');
    expect(summaries[0].toVersion).toBe('4.17.21');
  });
});
