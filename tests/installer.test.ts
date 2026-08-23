import { ensurePackageManagerInstalled } from '../src/installer';
import * as exec from '@actions/exec';
import * as io from '@actions/io';

jest.mock('@actions/exec');
jest.mock('@actions/io');

describe('installer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('skips installation for npm', async () => {
    await ensurePackageManagerInstalled('npm');
    expect(exec.exec).not.toHaveBeenCalled();
  });

  test('skips installation if package manager is already in PATH', async () => {
    (io.which as jest.MockedFunction<typeof io.which>).mockResolvedValue('/usr/local/bin/bun');
    await ensurePackageManagerInstalled('bun');
    expect(exec.exec).not.toHaveBeenCalled();
  });

  test('auto-installs bun if missing from PATH', async () => {
    (io.which as jest.MockedFunction<typeof io.which>)
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('/usr/local/bin/bun');
    (exec.exec as jest.MockedFunction<typeof exec.exec>).mockResolvedValue(0);

    await ensurePackageManagerInstalled('bun');
    expect(exec.exec).toHaveBeenCalledWith('npm', ['install', '-g', 'bun'], expect.any(Object));
  });

  test('auto-installs pnpm if missing from PATH', async () => {
    (io.which as jest.MockedFunction<typeof io.which>)
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('/usr/local/bin/pnpm');
    (exec.exec as jest.MockedFunction<typeof exec.exec>).mockResolvedValue(0);

    await ensurePackageManagerInstalled('pnpm');
    expect(exec.exec).toHaveBeenCalledWith('npm', ['install', '-g', 'pnpm'], expect.any(Object));
  });

  test('auto-installs deno if missing from PATH', async () => {
    (io.which as jest.MockedFunction<typeof io.which>)
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('/usr/local/bin/deno');
    (exec.exec as jest.MockedFunction<typeof exec.exec>).mockResolvedValue(0);

    await ensurePackageManagerInstalled('deno');
    expect(exec.exec).toHaveBeenCalledWith('npm', ['install', '-g', 'deno'], expect.any(Object));
  });
});
