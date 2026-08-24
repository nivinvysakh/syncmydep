/**
 * Generates an installation access token for a GitHub App scoped to the target repository
 * using standard Node.js crypto and GitHub REST API.
 */
export declare function getGitHubAppToken(appId: string, privateKey: string, owner: string, repo: string): Promise<string>;
