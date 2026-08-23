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

  test('loads and parses .syncmydeprc.json properly', () => {
    const configContent = {
      packageManager: 'pnpm',
      syncLockfile: true,
      fixAudit: false,
      auditLevel: 'high',
      prBranch: 'custom/deps-sync',
      prLabels: ['dependencies', 'auto']
    };
    fs.writeFileSync(path.join(tmpDir, '.syncmydeprc.json'), JSON.stringify(configContent));

    const config = loadConfigFile(tmpDir);
    expect(config.packageManager).toBe('pnpm');
    expect(config.syncLockfile).toBe(true);
    expect(config.fixAudit).toBe(false);
    expect(config.auditLevel).toBe('high');
    expect(config.prBranch).toBe('custom/deps-sync');
    expect(config.prLabels).toEqual(['dependencies', 'auto']);
  });

  test('loads custom config path if provided', () => {
    const customConfig = {
      commitMessage: 'build(deps): auto update'
    };
    fs.writeFileSync(path.join(tmpDir, 'custom.json'), JSON.stringify(customConfig));

    const config = loadConfigFile(tmpDir, 'custom.json');
    expect(config.commitMessage).toBe('build(deps): auto update');
  });

  test('handles corrupt JSON gracefully by returning empty object', () => {
    fs.writeFileSync(path.join(tmpDir, '.syncmydeprc.json'), '{ broken: json');
    const config = loadConfigFile(tmpDir);
    expect(config).toEqual({});
  });
});
