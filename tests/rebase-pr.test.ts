import * as exec from '@actions/exec';
import {
  deleteLocalBranch,
  deleteRemoteBranch,
  recreateFreshBranch
} from '../src/rebase-pr';
import { OctokitClient } from '../src/types';

jest.mock('@actions/exec');

describe('rebase-pr helpers', () => {
  const mockedExec = exec.exec as jest.MockedFunction<typeof exec.exec>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('deleteLocalBranch calls git branch -D', async () => {
    mockedExec.mockResolvedValue(0);

    const success = await deleteLocalBranch('/dummy/workspace', 'stale-branch');

    expect(success).toBe(true);
    expect(mockedExec).toHaveBeenCalledWith(
      'git',
      ['branch', '-D', 'stale-branch'],
      expect.objectContaining({ cwd: '/dummy/workspace' })
    );
  });

  test('deleteRemoteBranch deletes ref via Octokit', async () => {
    const mockOctokit = {
      rest: {
        git: {
          deleteRef: jest.fn().mockResolvedValue({ status: 204 })
        }
      }
    } as unknown as OctokitClient;

    const success = await deleteRemoteBranch(
      '/dummy/workspace',
      'stale-branch',
      mockOctokit,
      'my-owner',
      'my-repo'
    );

    expect(success).toBe(true);
    expect(mockOctokit.rest.git.deleteRef).toHaveBeenCalledWith({
      owner: 'my-owner',
      repo: 'my-repo',
      ref: 'heads/stale-branch'
    });
  });

  test('deleteRemoteBranch falls back to git push origin --delete if octokit fails', async () => {
    const mockOctokit = {
      rest: {
        git: {
          deleteRef: jest.fn().mockRejectedValue(new Error('API 404'))
        }
      }
    } as unknown as OctokitClient;

    mockedExec.mockResolvedValue(0);

    const success = await deleteRemoteBranch(
      '/dummy/workspace',
      'stale-branch',
      mockOctokit,
      'my-owner',
      'my-repo'
    );

    expect(success).toBe(true);
    expect(mockedExec).toHaveBeenCalledWith(
      'git',
      ['push', 'origin', '--delete', 'stale-branch'],
      expect.objectContaining({ cwd: '/dummy/workspace' })
    );
  });

  test('recreateFreshBranch fetches base and checks out target branch', async () => {
    mockedExec.mockResolvedValue(0);

    await recreateFreshBranch('/dummy/workspace', 'main', 'syncmydep/dependency-fix');

    expect(mockedExec).toHaveBeenCalledWith(
      'git',
      ['reset', '--hard'],
      expect.objectContaining({ cwd: '/dummy/workspace' })
    );
    expect(mockedExec).toHaveBeenCalledWith(
      'git',
      ['clean', '-fd'],
      expect.objectContaining({ cwd: '/dummy/workspace' })
    );
    expect(mockedExec).toHaveBeenCalledWith(
      'git',
      ['checkout', '-B', 'syncmydep/dependency-fix', 'origin/main'],
      expect.objectContaining({ cwd: '/dummy/workspace' })
    );
  });
});
