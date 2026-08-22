import { getGitStatus } from '../src/fixer';
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
