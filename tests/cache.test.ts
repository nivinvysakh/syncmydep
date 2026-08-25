import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as cache from '@actions/cache';
import {
  computeLockfileHash,
  getCacheDirectories,
  restorePackageCache,
  savePackageCache
} from '../src/cache';

jest.mock('@actions/cache', () => ({
  isFeatureAvailable: jest.fn(),
  restoreCache: jest.fn(),
  saveCache: jest.fn()
}), { virtual: true });

describe('cache acceleration', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'syncmydep-cache-test-'));
    jest.clearAllMocks();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('computeLockfileHash computes deterministic hash from lockfiles', () => {
    const pkgPath = path.join(tmpDir, 'package.json');
    fs.writeFileSync(pkgPath, JSON.stringify({ name: 'my-app', dependencies: { react: '^18.0.0' } }));

    const hash1 = computeLockfileHash(tmpDir);
    expect(hash1).toHaveLength(16);

    const hash2 = computeLockfileHash(tmpDir);
    expect(hash1).toBe(hash2);
  });

  test('getCacheDirectories returns correct paths for npm, pnpm, yarn, bun, deno', () => {
    const npmDirs = getCacheDirectories(tmpDir, 'npm');
    expect(npmDirs.length).toBeGreaterThan(0);

    const pnpmDirs = getCacheDirectories(tmpDir, 'pnpm');
    expect(pnpmDirs.length).toBeGreaterThan(0);

    const yarnDirs = getCacheDirectories(tmpDir, 'yarn', 'berry');
    expect(yarnDirs[0]).toContain(path.join('.yarn', 'cache'));

    const bunDirs = getCacheDirectories(tmpDir, 'bun');
    expect(bunDirs.length).toBeGreaterThan(0);

    const denoDirs = getCacheDirectories(tmpDir, 'deno');
    expect(denoDirs.length).toBeGreaterThan(0);
  });

  test('restorePackageCache calls @actions/cache restoreCache when available', async () => {
    (cache.isFeatureAvailable as jest.Mock).mockReturnValue(true);
    (cache.restoreCache as jest.Mock).mockResolvedValue('syncmydep-npm-key');

    const result = await restorePackageCache(tmpDir, 'npm');
    expect(result.restored).toBe(true);
    expect(cache.restoreCache).toHaveBeenCalled();
  });

  test('savePackageCache calls @actions/cache saveCache for existing directories', async () => {
    (cache.isFeatureAvailable as jest.Mock).mockReturnValue(true);
    (cache.saveCache as jest.Mock).mockResolvedValue(12345);

    // Create mock cache directory
    const yarnCacheDir = path.join(tmpDir, '.yarn', 'cache');
    fs.mkdirSync(yarnCacheDir, { recursive: true });

    const saved = await savePackageCache(tmpDir, 'yarn', 'my-cache-key', 'berry');
    expect(saved).toBe(true);
    expect(cache.saveCache).toHaveBeenCalledWith([yarnCacheDir], 'my-cache-key');
  });
});
