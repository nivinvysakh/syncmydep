import { CommitAndPushParams, CreateOrUpdatePullRequestParams, PullRequestResult, PullRequestDetails, CommentReaction, OctokitClient } from "./types";
/**
 * Sets up git bot credentials. Automatically uses authenticated PAT user if available.
 */
export declare function configureGitUser(workspaceDir: string, octokit?: OctokitClient, customName?: string, customEmail?: string): Promise<void>;
/**
 * Checks out a specific branch locally and pulls latest if available.
 */
export declare function checkoutBranch(workspaceDir: string, branch: string, prNumber?: number): Promise<void>;
/**
 * Creates/checks out a branch, commits modified files, and pushes to origin or fork remote.
 */
export declare function commitAndPushChanges({ workspaceDir, branch, commitMessage, files, isFork, headRepo, token, }: CommitAndPushParams): Promise<boolean>;
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
 * Closes an open Pull Request using Octokit.
 */
export declare function closePullRequest(octokit: OctokitClient, owner: string, repo: string, pullNumber: number): Promise<void>;
/**
 * Updates an existing comment on an issue or PR.
 */
export declare function updateIssueComment(octokit: OctokitClient, owner: string, repo: string, commentId: number, body: string): Promise<void>;
/**
 * Enables GitHub native auto-merge on a Pull Request via GraphQL API.
 */
export declare function enablePullRequestAutoMerge(octokit: OctokitClient, pullRequestNodeId: string, mergeMethod?: 'squash' | 'merge' | 'rebase'): Promise<boolean>;
/**
 * Creates or updates a GitHub Pull Request using Octokit.
 */
export declare function createOrUpdatePullRequest({ octokit, owner, repo, baseBranch, headBranch, title, body, labels, assignees, reviewers, autoMerge, autoMergeMethod, }: CreateOrUpdatePullRequestParams): Promise<PullRequestResult>;
