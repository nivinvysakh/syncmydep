import { CommitAndPushParams, CreateOrUpdatePullRequestParams, PullRequestResult } from './types';
/**
 * Sets up git bot credentials.
 */
export declare function configureGitUser(workspaceDir: string): Promise<void>;
/**
 * Creates/checks out a branch, commits modified files, and pushes to origin.
 */
export declare function commitAndPushChanges({ workspaceDir, branch, commitMessage, files }: CommitAndPushParams): Promise<boolean>;
/**
 * Creates or updates a GitHub Pull Request using Octokit.
 */
export declare function createOrUpdatePullRequest({ octokit, owner, repo, baseBranch, headBranch, title, body, labels, assignees, reviewers }: CreateOrUpdatePullRequestParams): Promise<PullRequestResult>;
