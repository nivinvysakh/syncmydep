import { getGitHubAppToken } from '../src/app-auth';

jest.mock('crypto', () => {
  const actualCrypto = jest.requireActual('crypto');
  return {
    ...actualCrypto,
    createSign: jest.fn().mockReturnValue({
      update: jest.fn(),
      sign: jest.fn().mockReturnValue('mock_signature')
    })
  };
});

describe('app-auth', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  test('successfully mints GitHub App installation access token', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 98765 })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: 'ghs_installation_token_abc123' })
      }) as jest.Mock;

    const token = await getGitHubAppToken('12345', 'mock_private_key', 'testowner', 'testrepo');

    expect(token).toBe('ghs_installation_token_abc123');
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test('throws error if App is not installed on target repo', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: false,
      status: 404
    }) as jest.Mock;

    await expect(
      getGitHubAppToken('12345', 'mock_private_key', 'testowner', 'testrepo')
    ).rejects.toThrow(/App is not installed on testowner\/testrepo/);
  });
});
