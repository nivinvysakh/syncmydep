import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { detectWorkspace, sanitizeWorkspaceLockfiles } from '../src/workspace';

describe('workspace detector', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'syncmydep-workspace-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('detects single package (non-monorepo)', () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ name: 'single-app' }));
    const info = detectWorkspace(tmpDir);

    expect(info.isMonorepo).toBe(false);
    expect(info.type).toBe('none');
    expect(info.packages).toEqual([]);
  });

  test('detects pnpm workspace', () => {
    fs.writeFileSync(path.join(tmpDir, 'pnpm-workspace.yaml'), 'packages:\n  - "packages/*"\n');
    const pkgDir = path.join(tmpDir, 'packages', 'core');
    fs.mkdirSync(pkgDir, { recursive: true });
    fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({ name: '@monorepo/core' }));

    const info = detectWorkspace(tmpDir);
    expect(info.isMonorepo).toBe(true);
    expect(info.type).toBe('pnpm');
    expect(info.patterns).toContain('packages/*');
    expect(info.packages).toContain('packages/core');
  });

  test('detects turborepo setup', () => {
    fs.writeFileSync(path.join(tmpDir, 'turbo.json'), JSON.stringify({ pipeline: {} }));
    const info = detectWorkspace(tmpDir);

    expect(info.isMonorepo).toBe(true);
    expect(info.type).toBe('turbo');
  });

  test('detects lerna monorepo', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'lerna.json'),
      JSON.stringify({ version: '1.0.0', packages: ['packages/*'] })
    );
    const info = detectWorkspace(tmpDir);

    expect(info.isMonorepo).toBe(true);
    expect(info.type).toBe('lerna');
    expect(info.patterns).toContain('packages/*');
  });

  test('detects package.json workspaces (npm/yarn/bun)', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'root', workspaces: ['apps/*', 'packages/*'] })
    );
    const appDir = path.join(tmpDir, 'apps', 'web');
    fs.mkdirSync(appDir, { recursive: true });
    fs.writeFileSync(path.join(appDir, 'package.json'), JSON.stringify({ name: 'web' }));

    const info = detectWorkspace(tmpDir);
    expect(info.isMonorepo).toBe(true);
    expect(info.type).toBe('npm');
    expect(info.patterns).toEqual(['apps/*', 'packages/*']);
    expect(info.packages).toContain('apps/web');
  });

  describe('sanitizeWorkspaceLockfiles (Ghost Lockfile Cleanup)', () => {
    test('purges ghost nested lockfiles in subpackages', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ name: 'root', workspaces: ['apps/*', 'packages/*'] })
      );

      const apiDir = path.join(tmpDir, 'apps', 'api');
      const uiDir = path.join(tmpDir, 'packages', 'ui');
      fs.mkdirSync(apiDir, { recursive: true });
      fs.mkdirSync(uiDir, { recursive: true });

      fs.writeFileSync(path.join(apiDir, 'package.json'), JSON.stringify({ name: '@monorepo/api' }));
      fs.writeFileSync(path.join(uiDir, 'package.json'), JSON.stringify({ name: '@monorepo/ui' }));

      // Create ghost nested lockfiles
      fs.writeFileSync(path.join(apiDir, 'package-lock.json'), '{}');
      fs.writeFileSync(path.join(uiDir, 'yarn.lock'), '');

      const info = detectWorkspace(tmpDir);
      const purged = sanitizeWorkspaceLockfiles(tmpDir, info);

      expect(purged).toHaveLength(2);
      expect(purged).toContain('apps/api/package-lock.json');
      expect(purged).toContain('packages/ui/yarn.lock');

      // Verify files were actually deleted from disk
      expect(fs.existsSync(path.join(apiDir, 'package-lock.json'))).toBe(false);
      expect(fs.existsSync(path.join(uiDir, 'yarn.lock'))).toBe(false);
    });

    test('does nothing for non-monorepos or clean workspaces', () => {
      const nonMonorepoInfo = { isMonorepo: false, type: 'none' as const, patterns: [], packages: [] };
      const purged = sanitizeWorkspaceLockfiles(tmpDir, nonMonorepoInfo);
      expect(purged).toEqual([]);
    });
  });
});
