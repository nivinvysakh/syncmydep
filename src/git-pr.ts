import * as exec from "@actions/exec";
import * as core from "@actions/core";
import {
  CommitAndPushParams,
  CreateOrUpdatePullRequestParams,
  PullRequestResult,
  PullRequestDetails,
  CommentReaction,
  OctokitClient,
} from "./types";

/**
 * Sets up git bot credentials. Automatically uses authenticated PAT user if available.
 */
export async function configureGitUser(
  workspaceDir: string,
  octokit?: OctokitClient,
  customName?: string,
  customEmail?: string
): Promise<void> {
  let userName = customName || 'syncmydep[bot]';
  let userEmail = customEmail || 'syncmydep[bot]@users.noreply.github.com';

  if (octokit && (!customName || !customEmail)) {
    try {
      const { data: user } = await octokit.rest.users.getAuthenticated();
      if (user && user.login && user.login !== 'github-actions[bot]') {
        userName = customName || user.name || user.login;
        userEmail = customEmail || user.email || `${user.id}+${user.login}@users.noreply.github.com`;
        core.info(`[SyncMyDep] Authenticated as @${user.login}. Git author set to ${userName} <${userEmail}>`);
      }
    } catch {
      // Fallback to default
    }
  }

  const options = { cwd: workspaceDir, silent: true, ignoreReturnCode: true };
  await exec.exec('git', ['config', 'user.name', userName], options);
  await exec.exec('git', ['config', 'user.email', userEmail], options);
}

/**
 * Checks out a specific branch locally and pulls latest if available.
 */
export async function checkoutBranch(
  workspaceDir: string,
  branch: string,
  prNumber?: number,
): Promise<void> {
  const options = { cwd: workspaceDir, ignoreReturnCode: true };
  core.info(`[SyncMyDep] Fetching and checking out branch ${branch}...`);
  if (prNumber) {
    await exec.exec(
      "git",
      ["fetch", "origin", `pull/${prNumber}/head:${branch}`],
      options,
    );
  }
  await exec.exec(
    "git",
    ["fetch", "origin", `+refs/heads/${branch}:refs/remotes/origin/${branch}`],
    options,
  );
  const checkoutCode = await exec.exec("git", ["checkout", branch], options);
  if (checkoutCode !== 0) {
    await exec.exec(
      "git",
      ["checkout", "-B", branch, `origin/${branch}`],
      options,
    );
  }
}

/**
 * Creates/checks out a branch, commits modified files, and pushes to origin.
 */
export async function commitAndPushChanges({
  workspaceDir,
  branch,
  commitMessage,
  files,
}: CommitAndPushParams): Promise<boolean> {
  const options = { cwd: workspaceDir, ignoreReturnCode: true };

  core.info(`[SyncMyDep] Checking out branch: ${branch}...`);
  await exec.exec("git", ["checkout", "-B", branch], options);

  core.info(`[SyncMyDep] Staging changed files: ${files.join(", ")}...`);
  await exec.exec("git", ["add", ...files], options);

  core.info(`[SyncMyDep] Committing changes...`);
  const commitCode = await exec.exec(
    "git",
    ["commit", "-m", commitMessage],
    options,
  );
  if (commitCode !== 0) {
    core.info("[SyncMyDep] No staged changes to commit or commit failed.");
    return false;
  }

  core.info(`[SyncMyDep] Pushing branch ${branch} to remote...`);
  const pushCode = await exec.exec("git", ["push", "origin", branch], options);
  if (pushCode !== 0) {
    core.info(`[SyncMyDep] Standard push failed, retrying with force...`);
    const forcePushCode = await exec.exec(
      "git",
      ["push", "origin", branch, "--force"],
      options,
    );
    if (forcePushCode !== 0) {
      throw new Error(`Failed to push branch ${branch} to origin.`);
    }
  }

  return true;
}

/**
 * Fetches pull request details from GitHub API.
 */
export async function getPullRequestDetails(
  octokit: OctokitClient,
  owner: string,
  repo: string,
  pullNumber: number,
): Promise<PullRequestDetails> {
  const { data: pr } = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: pullNumber,
  });

  return {
    number: pr.number,
    title: pr.title,
    headBranch: pr.head.ref,
    baseBranch: pr.base.ref,
    headRepo: pr.head.repo ? pr.head.repo.full_name : `${owner}/${repo}`,
    htmlUrl: pr.html_url,
  };
}

/**
 * Adds an emoji reaction to a comment.
 */
export async function addCommentReaction(
  octokit: OctokitClient,
  owner: string,
  repo: string,
  commentId: number,
  content: CommentReaction,
): Promise<void> {
  try {
    await octokit.rest.reactions.createForIssueComment({
      owner,
      repo,
      comment_id: commentId,
      content,
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    core.warning(`Could not add reaction to comment #${commentId}: ${errMsg}`);
  }
}

/**
 * Posts a comment to a GitHub issue or PR.
 */
export async function postIssueComment(
  octokit: OctokitClient,
  owner: string,
  repo: string,
  issueNumber: number,
  body: string,
): Promise<void> {
  try {
    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: issueNumber,
      body,
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    core.warning(`Could not post comment to #${issueNumber}: ${errMsg}`);
  }
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
  reviewers = [],
}: CreateOrUpdatePullRequestParams): Promise<PullRequestResult> {
  core.info(
    `[SyncMyDep] Checking for existing Pull Request for branch ${headBranch}...`,
  );

  // Query existing PRs
  const { data: pullRequests } = await octokit.rest.pulls.list({
    owner,
    repo,
    state: "open",
    head: `${owner}:${headBranch}`,
    base: baseBranch,
  });

  let prNumber: number;
  let prUrl: string;
  let isNew = false;

  if (pullRequests && pullRequests.length > 0) {
    const existingPr = pullRequests[0];
    prNumber = existingPr.number;
    prUrl = existingPr.html_url;
    core.info(
      `[SyncMyDep] Found existing Pull Request #${prNumber}. Updating...`,
    );

    await octokit.rest.pulls.update({
      owner,
      repo,
      pull_number: prNumber,
      title,
      body,
    });

    await postIssueComment(
      octokit,
      owner,
      repo,
      prNumber,
      `🔄 **SyncMyDep Update**: Refreshed dependency synchronization and pushed latest fixes.`,
    );
  } else {
    core.info(`[SyncMyDep] Creating new Pull Request...`);
    const { data: newPr } = await octokit.rest.pulls.create({
      owner,
      repo,
      title,
      body,
      head: headBranch,
      base: baseBranch,
    });

    prNumber = newPr.number;
    prUrl = newPr.html_url;
    isNew = true;
    core.info(
      `[SyncMyDep] Successfully created Pull Request #${prNumber}: ${prUrl}`,
    );
  }

  // Apply labels
  if (labels && labels.length > 0) {
    try {
      await octokit.rest.issues.addLabels({
        owner,
        repo,
        issue_number: prNumber,
        labels,
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
        assignees,
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
        reviewers,
      });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      core.warning(
        `Could not request reviewers for PR #${prNumber}: ${errMsg}`,
      );
    }
  }

  return {
    number: prNumber,
    url: prUrl,
    isNew,
  };
}
