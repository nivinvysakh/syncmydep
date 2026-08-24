import * as crypto from 'crypto';
import * as core from '@actions/core';

/**
 * Generates an installation access token for a GitHub App scoped to the target repository
 * using standard Node.js crypto and GitHub REST API.
 */
export async function getGitHubAppToken(
  appId: string,
  privateKey: string,
  owner: string,
  repo: string
): Promise<string> {
  try {
    core.info(`[SyncMyDep] Authenticating via GitHub App (App ID: ${appId})...`);

    const formattedKey = privateKey.replace(/\\n/g, '\n');
    const now = Math.floor(Date.now() / 1000) - 60; // 1 min in past for clock drift
    const exp = now + 10 * 60; // 10 minutes

    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ iss: appId, iat: now, exp })).toString('base64url');

    const sign = crypto.createSign('RSA-SHA256');
    sign.update(`${header}.${payload}`);
    const signature = sign.sign(formattedKey, 'base64url');
    const jwt = `${header}.${payload}.${signature}`;

    // 1. Get repository installation
    const instRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/installation`, {
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'SyncMyDep-Action'
      }
    });

    if (!instRes.ok) {
      throw new Error(`App is not installed on ${owner}/${repo} or invalid App ID (HTTP ${instRes.status})`);
    }

    const installation = (await instRes.json()) as { id: number };

    // 2. Generate installation token
    const tokenRes = await fetch(`https://api.github.com/app/installations/${installation.id}/access_tokens`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'SyncMyDep-Action'
      }
    });

    if (!tokenRes.ok) {
      throw new Error(`Failed to generate installation token (HTTP ${tokenRes.status})`);
    }

    const tokenData = (await tokenRes.json()) as { token: string };
    core.info(`[SyncMyDep] Successfully minted GitHub App installation token.`);
    return tokenData.token;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to authenticate GitHub App: ${msg}`);
  }
}
