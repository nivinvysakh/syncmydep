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
  let userName = customName || 'github-actions[bot]';
  let userEmail = customEmail || 'github-actions[bot]@users.noreply.github.com';

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
  core.info(`[SyncMyDep] Fetching and checking out branch '${branch}'${prNumber ? ` (PR #${prNumber})` : ''}...`);

  if (prNumber) {
    const prWorkBranch = `syncmydep-pr-${prNumber}`;
    const fetchPrCode = await exec.exec(
      "git",
      ["fetch", "origin", `pull/${prNumber}/head:${prWorkBranch}`, "--force"],
      options,
    );
    if (fetchPrCode === 0) {
      const checkoutCode = await exec.exec(
        "git",
        ["checkout", "-B", prWorkBranch, `refs/heads/${prWorkBranch}`],
        options,
      );
      if (checkoutCode === 0) {
        return;
      }
    }
  }

  await exec.exec(
    "git",
    ["fetch", "origin", `+refs/heads/${branch}:refs/remotes/origin/${branch}`, "--force"],
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
 * Creates/checks out a branch, commits modified files, and pushes to origin or fork remote.
 */
export async function commitAndPushChanges({
  workspaceDir,
  branch,
  commitMessage,
  files,
  isFork,
  headRepo,
  token,
}: CommitAndPushParams): Promise<boolean> {
  const options = { cwd: workspaceDir, ignoreReturnCode: true };

  // Always fetch latest commits from remote before creating branch or committing
  core.info(`[SyncMyDep] Fetching latest commits from remote...`);
  await exec.exec("git", ["fetch", "origin", "--force"], { cwd: workspaceDir, silent: true, ignoreReturnCode: true });

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

  // If this is a fork PR, configure the authenticated fork remote
  if (isFork && headRepo && token) {
    core.info(`[SyncMyDep] Fork PR detected from ${headRepo}. Configuring fork remote...`);
    const remoteUrl = `https://x-access-token:${token}@github.com/${headRepo}.git`;
    await exec.exec("git", ["remote", "remove", "pr-fork"], { cwd: workspaceDir, silent: true, ignoreReturnCode: true });
    await exec.exec("git", ["remote", "add", "pr-fork", remoteUrl], { cwd: workspaceDir, silent: true, ignoreReturnCode: true });

    core.info(`[SyncMyDep] Pushing fixes to fork branch: ${headRepo}:${branch}...`);
    const pushCode = await exec.exec("git", ["push", "pr-fork", `HEAD:${branch}`], options);
    if (pushCode !== 0) {
      core.info(`[SyncMyDep] Standard push to fork failed, retrying with force...`);
      const forcePushCode = await exec.exec(
        "git",
        ["push", "pr-fork", `HEAD:${branch}`, "--force"],
        options,
      );
      if (forcePushCode !== 0) {
        throw new Error(
          `Failed to push dependency fixes to fork ${headRepo}:${branch}. Please verify that the PR author has "Maintainers are allowed to edit this pull request" enabled or check token permissions.`
        );
      }
    }
    return true;
  }

  core.info(`[SyncMyDep] Pushing branch ${branch} to origin...`);
  const pushCode = await exec.exec("git", ["push", "origin", `HEAD:${branch}`], options);
  if (pushCode !== 0) {
    core.info(`[SyncMyDep] Standard push failed, retrying with force...`);
    const forcePushCode = await exec.exec(
      "git",
      ["push", "origin", `HEAD:${branch}`, "--force"],
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

  const headRepo = pr.head.repo ? pr.head.repo.full_name : `${owner}/${repo}`;
  const isFork = Boolean(pr.head.repo && pr.head.repo.full_name.toLowerCase() !== `${owner}/${repo}`.toLowerCase());

  return {
    number: pr.number,
    title: pr.title,
    headBranch: pr.head.ref,
    baseBranch: pr.base.ref,
    headRepo,
    isFork,
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
 * Closes an open Pull Request using Octokit.
 */
export async function closePullRequest(
  octokit: OctokitClient,
  owner: string,
  repo: string,
  pullNumber: number,
): Promise<void> {
  try {
    await octokit.rest.pulls.update({
      owner,
      repo,
      pull_number: pullNumber,
      state: "closed",
    });
    core.info(`[SyncMyDep] Successfully closed Pull Request #${pullNumber}.`);
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    core.warning(`Could not close PR #${pullNumber}: ${errMsg}`);
  }
}

/**
 * Updates an existing comment on an issue or PR.
 */
export async function updateIssueComment(
  octokit: OctokitClient,
  owner: string,
  repo: string,
  commentId: number,
  body: string,
): Promise<void> {
  try {
    await octokit.rest.issues.updateComment({
      owner,
      repo,
      comment_id: commentId,
      body,
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    core.warning(`Could not update comment #${commentId}: ${errMsg}`);
  }
}

/**
 * Enables GitHub native auto-merge on a Pull Request via GraphQL API.
 */
export async function enablePullRequestAutoMerge(
  octokit: OctokitClient,
  pullRequestNodeId: string,
  mergeMethod: 'squash' | 'merge' | 'rebase' = 'squash',
): Promise<boolean> {
  try {
    const methodEnum = mergeMethod.toUpperCase() as 'SQUASH' | 'MERGE' | 'REBASE';
    const mutation = `
      mutation EnableAutoMerge($pullRequestId: ID!, $mergeMethod: PullRequestMergeMethod!) {
        enablePullRequestAutoMerge(input: {
          pullRequestId: $pullRequestId,
          mergeMethod: $mergeMethod
        }) {
          pullRequest {
            id
            autoMergeRequest {
              enabledAt
              enabledBy {
                login
              }
            }
          }
        }
      }
    `;

    await octokit.graphql(mutation, {
      pullRequestId: pullRequestNodeId,
      mergeMethod: methodEnum,
    });
    core.info(`[SyncMyDep] Successfully enabled auto-merge (${mergeMethod}) on Pull Request.`);
    return true;
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    core.info(`[SyncMyDep] Auto-merge not enabled (requires 'Allow auto-merge' in repo settings): ${errMsg}`);
    return false;
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
  draft = false,
  labels = [],
  assignees = [],
  reviewers = [],
  autoMerge = false,
  autoMergeMethod = 'squash',
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
  let nodeId: string | undefined;
  let isNew = false;

  if (pullRequests && pullRequests.length > 0) {
    const existingPr = pullRequests[0];
    prNumber = existingPr.number;
    prUrl = existingPr.html_url;
    nodeId = existingPr.node_id;
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
  } else {
    core.info(`[SyncMyDep] Creating new Pull Request${draft ? ' (Draft)' : ''}...`);
    const { data: newPr } = await octokit.rest.pulls.create({
      owner,
      repo,
      title,
      body,
      head: headBranch,
      base: baseBranch,
      draft: Boolean(draft),
    });

    prNumber = newPr.number;
    prUrl = newPr.html_url;
    nodeId = newPr.node_id;
    isNew = true;
    core.info(
      `[SyncMyDep] Successfully created Pull Request #${prNumber}: ${prUrl}`,
    );
  }

  // Apply labels (with automatic label creation fallback)
  if (labels && labels.length > 0) {
    try {
      await octokit.rest.issues.addLabels({
        owner,
        repo,
        issue_number: prNumber,
        labels,
      });
      core.info(`[SyncMyDep] ✅ Successfully attached labels: ${labels.join(', ')}`);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      core.info(`[SyncMyDep] Retrying label attachment with auto-creation for: ${labels.join(', ')} (${errMsg})...`);
      for (const label of labels) {
        try {
          try {
            await octokit.rest.issues.createLabel({
              owner,
              repo,
              name: label,
              color: label.toLowerCase().includes('syncmydep') ? '6f42c1' : '0366d6',
              description: 'Applied by SyncMyDep',
            });
          } catch {
            // ignore if label already exists or permission restricted
          }
          await octokit.rest.issues.addLabels({
            owner,
            repo,
            issue_number: prNumber,
            labels: [label],
          });
          core.info(`[SyncMyDep] ✅ Applied label: ${label}`);
        } catch (labelErr: unknown) {
          const lMsg = labelErr instanceof Error ? labelErr.message : String(labelErr);
          core.warning(`[SyncMyDep] Could not apply label '${label}' to PR #${prNumber}: ${lMsg}`);
        }
      }
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

  // Auto-merge
  if (autoMerge && nodeId) {
    await enablePullRequestAutoMerge(octokit, nodeId, autoMergeMethod);
  }

  return {
    number: prNumber,
    url: prUrl,
    nodeId,
    isNew,
  };
}
