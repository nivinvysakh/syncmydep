import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as exec from '@actions/exec';
import { detectWorkspace } from '../src/workspace';
import { detectPackageManager } from '../src/detector';
import { syncLockfile, runDedupe } from '../src/fixer';

jest.mock('@actions/exec');

describe('monorepo workflows & lockfile synchronization', () => {
  let tmpDir: string;

  beforeEach(() => {
    jest.clearAllMocks();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'syncmydep-monorepo-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('handles npm monorepo initial lockfile creation via fallback', async () => {
    // Arrange: Create monorepo structure without package-lock.json
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({
        name: '@monorepo/root',
        private: true,
        workspaces: ['apps/*', 'packages/*']
      })
    );

    const apiDir = path.join(tmpDir, 'apps', 'api');
    const utilsDir = path.join(tmpDir, 'packages', 'utils');
    fs.mkdirSync(apiDir, { recursive: true });
    fs.mkdirSync(utilsDir, { recursive: true });

    fs.writeFileSync(path.join(apiDir, 'package.json'), JSON.stringify({ name: '@monorepo/api', version: '1.0.0' }));
    fs.writeFileSync(path.join(utilsDir, 'package.json'), JSON.stringify({ name: '@monorepo/utils', version: '1.0.0' }));

    const workspaceInfo = detectWorkspace(tmpDir);
    expect(workspaceInfo.isMonorepo).toBe(true);
    expect(workspaceInfo.packages).toHaveLength(2);

    // Mock initial --package-lock-only failing with ENOENT, and retry succeeding
    (exec.exec as jest.Mock)
      .mockResolvedValueOnce(1) // First attempt fails
      .mockImplementationOnce(async (_cmd, _args, _opts) => {
        // Create mock lockfile on fallback execution
        fs.writeFileSync(path.join(tmpDir, 'package-lock.json'), JSON.stringify({ name: '@monorepo/root', lockfileVersion: 3 }));
        return 0;
      });

    // Act
    const result = await syncLockfile(tmpDir, 'npm');

    // Assert
    expect(exec.exec).toHaveBeenCalledTimes(2);
    expect(exec.exec).toHaveBeenNthCalledWith(
      1,
      'npm',
      ['install', '--package-lock-only', '--no-audit', '--no-fund'],
      expect.any(Object)
    );
    expect(exec.exec).toHaveBeenNthCalledWith(
      2,
      'npm',
      ['install', '--ignore-scripts', '--no-audit', '--no-fund'],
      expect.any(Object)
    );
    expect(result.success).toBe(true);
  });

  test('handles pnpm monorepo synchronization', async () => {
    fs.writeFileSync(path.join(tmpDir, 'pnpm-workspace.yaml'), 'packages:\n  - "packages/*"\n');
    fs.writeFileSync(path.join(tmpDir, 'pnpm-lock.yaml'), 'lockfileVersion: "9.0"\n');
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ name: '@pnpm/root', private: true }));

    const pkgDir = path.join(tmpDir, 'packages', 'core');
    fs.mkdirSync(pkgDir, { recursive: true });
    fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({ name: '@pnpm/core', version: '1.0.0' }));

    const pm = detectPackageManager(tmpDir);
    expect(pm).toBe('pnpm');

    (exec.exec as jest.Mock).mockResolvedValue(0);

    const result = await syncLockfile(tmpDir, 'pnpm');
    expect(result.success).toBe(true);
    expect(exec.exec).toHaveBeenCalledWith(
      'pnpm',
      ['install', '--lockfile-only', '--no-frozen-lockfile', '--config.confirmModulesPurge=false'],
      expect.any(Object)
    );
  });

  test('runs deduplication across monorepo workspace packages', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'root', workspaces: ['apps/*'] })
    );

    (exec.exec as jest.Mock).mockResolvedValue(0);

    const result = await runDedupe(tmpDir, 'npm');
    expect(result.success).toBe(true);
    expect(exec.exec).toHaveBeenCalledWith('npm', ['dedupe'], expect.any(Object));
  });

  test('handles EBADPLATFORM cross-platform fallback in Turborepo / Next.js monorepos', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'turborepo-app', workspaces: ['apps/*'] })
    );

    // Mock initial attempt failing with EBADPLATFORM in output
    (exec.exec as jest.Mock)
      .mockImplementationOnce(async (_cmd, _args, opts) => {
        if (opts && opts.listeners && opts.listeners.stderr) {
          opts.listeners.stderr(Buffer.from('npm error code EBADPLATFORM\nUnsupported platform for @next/swc-darwin-arm64'));
        }
        return 1;
      })
      .mockResolvedValueOnce(0);

    const result = await syncLockfile(tmpDir, 'npm');

    expect(result.success).toBe(true);
    expect(exec.exec).toHaveBeenNthCalledWith(
      2,
      'npm',
      ['install', '--package-lock-only', '--no-audit', '--no-fund', '--force'],
      expect.any(Object)
    );
  });
});
