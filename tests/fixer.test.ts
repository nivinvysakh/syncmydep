import { getGitStatus, syncLockfile, parseDependencyDiffs } from '../src/fixer';
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

  test('getGitStatus returns hasChanges: false when no dependency files are modified', async () => {
    (exec.exec as jest.MockedFunction<typeof exec.exec>).mockImplementation((_cmd: string, _args?: string[], options?: exec.ExecOptions) => {
      if (options && options.listeners && options.listeners.stdout) {
        options.listeners.stdout(Buffer.from('?? README.md\n'));
      }
      return Promise.resolve(0);
    });

    const status = await getGitStatus('/fake/dir');
    expect(status.hasChanges).toBe(false);
    expect(status.changedFiles).toEqual([]);
  });
});
