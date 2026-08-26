import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { loadConfigFile } from '../src/config';

describe('config loader', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'syncmydep-config-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('returns empty object when no config file exists', () => {
    const config = loadConfigFile(tmpDir);
    expect(config).toEqual({});
  });

  test('loads and parses .syncmydep.yml (YAML format) properly with kebab-case and camelCase', () => {
    const yamlContent = [
      'package-manager: pnpm',
      'sync-lockfile: true',
      'fix-audit: false',
      'audit-level: high',
      'check-only: false',
      'direct-push: true',
      'pr-branch: custom/deps-sync',
      'pr-labels:',
      '  - dependencies',
      '  - automated-pr',
      'require-owner: true',
      'verify-lockfile: true',
      'run-build: "npm run build"',
      'fail-on-build-error: true',
      'auto-merge: true',
      'auto-merge-method: squash',
      'dedupe: true',
      'base-branch: develop',
      'pr-draft: true',
      'step-summary: true',
      'pr-header: "### Custom Header Note"',
      'pr-footer: "### Custom Footer Note"',
      'ignore-packages:',
      '  - lodash',
      '  - axios',
      'monorepo:',
      '  root-only: false',
      '  ignore:',
      '    - packages/legacy'
    ].join('\n');

    fs.writeFileSync(path.join(tmpDir, '.syncmydep.yml'), yamlContent);

    const config = loadConfigFile(tmpDir);
    expect(config.packageManager).toBe('pnpm');
    expect(config.syncLockfile).toBe(true);
    expect(config.fixAudit).toBe(false);
    expect(config.auditLevel).toBe('high');
    expect(config.checkOnly).toBe(false);
    expect(config.directPush).toBe(true);
    expect(config.prBranch).toBe('custom/deps-sync');
    expect(config.prLabels).toEqual(['dependencies', 'automated-pr']);
    expect(config.requireOwner).toBe(true);
    expect(config.verifyLockfile).toBe(true);
    expect(config.runBuild).toBe('npm run build');
    expect(config.failOnBuildError).toBe(true);
    expect(config.autoMerge).toBe(true);
    expect(config.autoMergeMethod).toBe('squash');
    expect(config.dedupe).toBe(true);
    expect(config.baseBranch).toBe('develop');
    expect(config.prDraft).toBe(true);
    expect(config.stepSummary).toBe(true);
    expect(config.prHeader).toBe('### Custom Header Note');
    expect(config.prFooter).toBe('### Custom Footer Note');
    expect(config.ignorePackages).toEqual(['lodash', 'axios']);
    expect(config.monorepo?.rootOnly).toBe(false);
    expect(config.monorepo?.ignore).toEqual(['packages/legacy']);
  });

  test('loads and parses .syncmydeprc.json properly', () => {
    const configContent = {
      packageManager: 'bun',
      syncLockfile: true,
      fixAudit: true,
      prBranch: 'bun/deps-fix',
      prLabels: ['bun-deps']
    };
    fs.writeFileSync(path.join(tmpDir, '.syncmydeprc.json'), JSON.stringify(configContent));

    const config = loadConfigFile(tmpDir);
    expect(config.packageManager).toBe('bun');
    expect(config.syncLockfile).toBe(true);
    expect(config.fixAudit).toBe(true);
    expect(config.prBranch).toBe('bun/deps-fix');
    expect(config.prLabels).toEqual(['bun-deps']);
  });

  test('loads custom config path if provided', () => {
    const customConfig = 'commit-message: "build(deps): auto update"\n';
    fs.writeFileSync(path.join(tmpDir, 'custom.yaml'), customConfig);

    const config = loadConfigFile(tmpDir, 'custom.yaml');
    expect(config.commitMessage).toBe('build(deps): auto update');
  });

  test('handles corrupt YAML/JSON gracefully by returning empty object', () => {
    fs.writeFileSync(path.join(tmpDir, '.syncmydep.yml'), '::: broken yaml :::\n  bad indent');
    const config = loadConfigFile(tmpDir);
    expect(config).toEqual({});
  });
});
