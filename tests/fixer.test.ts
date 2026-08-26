import {
  getGitStatus,
  syncLockfile,
  parseDependencyDiffs,
  verifyLockfileIntegrity,
  runBuildSmokeTest,
  runDedupe
} from '../src/fixer';
import * as exec from '@actions/exec';

jest.mock('@actions/exec');

describe('fixer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('getGitStatus correctly parses modified lockfile and package.json', async () => {
    (exec.exec as jest.MockedFunction<typeof exec.exec>).mockImplementation((_cmd: string, _args?: string[], options?: exec.ExecOptions) => {
      if (options && options.listeners && options.listeners.stdout) {
        options.listeners.stdout(Buffer.from(' M package-lock.json\n M package.json\n?? some-unrelated-file.txt\n'));
      }
      return Promise.resolve(0);
    });

    const status = await getGitStatus('/fake/dir');
    expect(status.hasChanges).toBe(true);
    expect(status.changedFiles).toEqual(['package-lock.json', 'package.json']);
  });

  test('getGitStatus detects bun, deno, and pnpm lockfiles', async () => {
    (exec.exec as jest.MockedFunction<typeof exec.exec>).mockImplementation((_cmd: string, _args?: string[], options?: exec.ExecOptions) => {
      if (options && options.listeners && options.listeners.stdout) {
        options.listeners.stdout(Buffer.from(' M bun.lock\n M deno.lock\n M pnpm-lock.yaml\n'));
      }
      return Promise.resolve(0);
    });

    const status = await getGitStatus('/fake/dir');
    expect(status.hasChanges).toBe(true);
    expect(status.changedFiles).toEqual(['bun.lock', 'deno.lock', 'pnpm-lock.yaml']);
  });

  test('syncLockfile executes appropriate commands for bun and yarn berry', async () => {
    (exec.exec as jest.MockedFunction<typeof exec.exec>).mockResolvedValue(0);

    const bunResult = await syncLockfile('/fake/dir', 'bun');
    expect(bunResult.success).toBe(true);
    expect(exec.exec).toHaveBeenCalledWith('bun', ['install', '--lockfile-only'], expect.any(Object));

    const berryResult = await syncLockfile('/fake/dir', 'yarn', 'berry');
    expect(berryResult.success).toBe(true);
    expect(exec.exec).toHaveBeenCalledWith('yarn', ['install', '--mode', 'update-lockfile'], expect.any(Object));
  });

  test('parseDependencyDiffs extracts version upgrade diffs', async () => {
    (exec.exec as jest.MockedFunction<typeof exec.exec>).mockImplementation((_cmd: string, _args?: string[], options?: exec.ExecOptions) => {
      if (options && options.listeners && options.listeners.stdout) {
        options.listeners.stdout(Buffer.from('-"react": "^18.2.0"\n+"react": "^18.3.1"\n+"lucide-react": "^0.300.0"\n'));
      }
      return Promise.resolve(0);
    });

    const diffs = await parseDependencyDiffs('/fake/dir', ['package.json']);
    expect(diffs).toHaveLength(2);

    const reactDiff = diffs.find((d) => d.name === 'react');
    expect(reactDiff).toBeDefined();
    expect(reactDiff?.oldVersion).toBe('^18.2.0');
    expect(reactDiff?.newVersion).toBe('^18.3.1');
    expect(reactDiff?.changeType).toBe('upgraded');

    const lucideDiff = diffs.find((d) => d.name === 'lucide-react');
    expect(lucideDiff).toBeDefined();
    expect(lucideDiff?.newVersion).toBe('^0.300.0');
    expect(lucideDiff?.changeType).toBe('added');
  });

  test('verifyLockfileIntegrity calls dry-run or frozen check', async () => {
    (exec.exec as jest.MockedFunction<typeof exec.exec>).mockResolvedValue(0);

    const npmResult = await verifyLockfileIntegrity('/fake/dir', 'npm');
    expect(npmResult.success).toBe(true);
    expect(exec.exec).toHaveBeenCalledWith('npm', ['ci', '--dry-run'], expect.any(Object));

    const pnpmResult = await verifyLockfileIntegrity('/fake/dir', 'pnpm');
    expect(pnpmResult.success).toBe(true);
    expect(exec.exec).toHaveBeenCalledWith('pnpm', ['install', '--frozen-lockfile', '--prefer-offline', '--config.confirmModulesPurge=false'], expect.any(Object));

    const bunResult = await verifyLockfileIntegrity('/fake/dir', 'bun');
    expect(bunResult.success).toBe(true);
    expect(exec.exec).toHaveBeenCalledWith('bun', ['install', '--frozen-lockfile'], expect.any(Object));
  });

  test('runBuildSmokeTest executes build command', async () => {
    (exec.exec as jest.MockedFunction<typeof exec.exec>).mockResolvedValue(0);

    const result = await runBuildSmokeTest('/fake/dir', 'npm run build');
    expect(result.success).toBe(true);
    expect(result.command).toBe('npm run build');
    expect(exec.exec).toHaveBeenCalledWith('npm run build', [], expect.any(Object));
  });

  test('runDedupe executes dedupe commands correctly for npm, pnpm, and yarn berry', async () => {
    (exec.exec as jest.MockedFunction<typeof exec.exec>).mockResolvedValue(0);

    const npmResult = await runDedupe('/fake/dir', 'npm');
    expect(npmResult.success).toBe(true);
    expect(exec.exec).toHaveBeenCalledWith('npm', ['dedupe'], expect.any(Object));

    const pnpmResult = await runDedupe('/fake/dir', 'pnpm');
    expect(pnpmResult.success).toBe(true);
    expect(exec.exec).toHaveBeenCalledWith('pnpm', ['dedupe'], expect.any(Object));

    const berryResult = await runDedupe('/fake/dir', 'yarn', 'berry');
    expect(berryResult.success).toBe(true);
    expect(exec.exec).toHaveBeenCalledWith('yarn', ['dedupe'], expect.any(Object));
  });
});
