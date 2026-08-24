import { CommitAndPushParams, CreateOrUpdatePullRequestParams, PullRequestResult, PullRequestDetails, CommentReaction, OctokitClient } from './types';
/**
 * Sets up git bot credentials. Defaults to syncmydep[bot].
 */
export declare function configureGitUser(workspaceDir: string, userName?: string, userEmail?: string): Promise<void>;
/**
 * Checks out a specific branch locally and pulls latest if available.
 */
export declare function checkoutBranch(workspaceDir: string, branch: string, prNumber?: number): Promise<void>;
/**
 * Creates/checks out a branch, commits modified files, and pushes to origin.
 */
export declare function commitAndPushChanges({ workspaceDir, branch, commitMessage, files }: CommitAndPushParams): Promise<boolean>;
/**
 * Fetches pull request details from GitHub API.
 */
export declare function getPullRequestDetails(octokit: OctokitClient, owner: string, repo: string, pullNumber: number): Promise<PullRequestDetails>;
/**
 * Adds an emoji reaction to a comment.
 */
export declare function addCommentReaction(octokit: OctokitClient, owner: string, repo: string, commentId: number, content: CommentReaction): Promise<void>;
/**
 * Posts a comment to a GitHub issue or PR.
 */
export declare function postIssueComment(octokit: OctokitClient, owner: string, repo: string, issueNumber: number, body: string): Promise<void>;
/**
 * Creates or updates a GitHub Pull Request using Octokit.
 */
export declare function createOrUpdatePullRequest({ octokit, owner, repo, baseBranch, headBranch, title, body, labels, assignees, reviewers }: CreateOrUpdatePullRequestParams): Promise<PullRequestResult>;
