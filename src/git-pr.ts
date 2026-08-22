import * as exec from '@actions/exec';
import * as core from '@actions/core';
import {
  CommitAndPushParams,
  CreateOrUpdatePullRequestParams,
  PullRequestResult
} from './types';

/**
 * Sets up git bot credentials.
 */
export async function configureGitUser(workspaceDir: string): Promise<void> {
  const options = { cwd: workspaceDir, silent: true, ignoreReturnCode: true };
  await exec.exec('git', ['config', 'user.name', 'github-actions[bot]'], options);
  await exec.exec('git', ['config', 'user.email', 'github-actions[bot]@users.noreply.github.com'], options);
}

/**
 * Creates/checks out a branch, commits modified files, and pushes to origin.
 */
export async function commitAndPushChanges({
  workspaceDir,
  branch,
  commitMessage,
  files
}: CommitAndPushParams): Promise<boolean> {
  const options = { cwd: workspaceDir, ignoreReturnCode: true };

  core.info(`[SyncMyDep] Checking out branch: ${branch}...`);
  await exec.exec('git', ['checkout', '-B', branch], options);

  core.info(`[SyncMyDep] Staging changed files: ${files.join(', ')}...`);
  await exec.exec('git', ['add', ...files], options);

  core.info(`[SyncMyDep] Committing changes...`);
  const commitCode = await exec.exec('git', ['commit', '-m', commitMessage], options);
  if (commitCode !== 0) {
    core.info('[SyncMyDep] No staged changes to commit or commit failed.');
    return false;
  }

  core.info(`[SyncMyDep] Pushing branch ${branch} to remote...`);
  const pushCode = await exec.exec('git', ['push', 'origin', branch, '--force'], options);
  if (pushCode !== 0) {
    throw new Error(`Failed to push branch ${branch} to origin.`);
  }

  return true;
}

/**
 * Creates or updates a GitHub Pull Request using Octokit.
 */
export async function createOrUpdatePullRequest({
  octokit,
  owner,
  repo,
  baseBranch,
  headBranch,
  title,
  body,
  labels = [],
  assignees = [],
  reviewers = []
}: CreateOrUpdatePullRequestParams): Promise<PullRequestResult> {
  core.info(`[SyncMyDep] Checking for existing Pull Request for branch ${headBranch}...`);

  // Query existing PRs
  const { data: pullRequests } = await octokit.rest.pulls.list({
    owner,
    repo,
    state: 'open',
    head: `${owner}:${headBranch}`,
    base: baseBranch
  });

  let prNumber: number;
  let prUrl: string;
  let isNew = false;

  if (pullRequests && pullRequests.length > 0) {
    const existingPr = pullRequests[0];
    prNumber = existingPr.number;
    prUrl = existingPr.html_url;
    core.info(`[SyncMyDep] Found existing Pull Request #${prNumber}. Updating...`);

    await octokit.rest.pulls.update({
      owner,
      repo,
      pull_number: prNumber,
      title,
      body
    });

    try {
      await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: prNumber,
        body: `🔄 **SyncMyDep Update**: Refreshed dependency synchronization and pushed latest fixes.`
      });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      core.warning(`Could not post comment to PR #${prNumber}: ${errMsg}`);
    }
  } else {
    core.info(`[SyncMyDep] Creating new Pull Request...`);
    const { data: newPr } = await octokit.rest.pulls.create({
      owner,
      repo,
      title,
      body,
      head: headBranch,
      base: baseBranch
    });

    prNumber = newPr.number;
    prUrl = newPr.html_url;
    isNew = true;
    core.info(`[SyncMyDep] Successfully created Pull Request #${prNumber}: ${prUrl}`);
  }

  // Apply labels
  if (labels && labels.length > 0) {
    try {
      await octokit.rest.issues.addLabels({
        owner,
        repo,
        issue_number: prNumber,
        labels
      });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      core.warning(`Could not apply labels to PR #${prNumber}: ${errMsg}`);
    }
  }

  // Apply assignees
  if (assignees && assignees.length > 0) {
    try {
      await octokit.rest.issues.addAssignees({
        owner,
        repo,
        issue_number: prNumber,
        assignees
      });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      core.warning(`Could not assign users to PR #${prNumber}: ${errMsg}`);
    }
  }

  // Request reviewers
  if (reviewers && reviewers.length > 0) {
    try {
      await octokit.rest.pulls.requestReviewers({
        owner,
        repo,
        pull_number: prNumber,
        reviewers
      });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      core.warning(`Could not request reviewers for PR #${prNumber}: ${errMsg}`);
    }
  }

  return {
    number: prNumber,
    url: prUrl,
    isNew
  };
}
