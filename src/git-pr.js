const exec = require('@actions/exec');
const core = require('@actions/core');

/**
 * Sets up git bot credentials.
 * @param {string} workspaceDir
 */
async function configureGitUser(workspaceDir) {
  const options = { cwd: workspaceDir, silent: true, ignoreReturnCode: true };
  await exec.exec('git', ['config', 'user.name', 'github-actions[bot]'], options);
  await exec.exec('git', ['config', 'user.email', 'github-actions[bot]@users.noreply.github.com'], options);
}

/**
 * Creates/checks out a branch, commits modified files, and pushes to origin.
 * @param {object} params
 * @param {string} params.workspaceDir
 * @param {string} params.branch
 * @param {string} params.commitMessage
 * @param {string[]} params.files
 */
async function commitAndPushChanges({ workspaceDir, branch, commitMessage, files }) {
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
 * @param {object} params
 * @param {object} params.octokit
 * @param {string} params.owner
 * @param {string} params.repo
 * @param {string} params.baseBranch
 * @param {string} params.headBranch
 * @param {string} params.title
 * @param {string} params.body
 * @param {string[]} [params.labels]
 * @param {string[]} [params.assignees]
 * @param {string[]} [params.reviewers]
 * @returns {Promise<{number: number, url: string, isNew: boolean}>}
 */
async function createOrUpdatePullRequest({
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
}) {
  core.info(`[SyncMyDep] Checking for existing Pull Request for branch ${headBranch}...`);

  // Query existing PRs
  const { data: pullRequests } = await octokit.rest.pulls.list({
    owner,
    repo,
    state: 'open',
    head: `${owner}:${headBranch}`,
    base: baseBranch
  });

  let pr;
  let isNew = false;

  if (pullRequests && pullRequests.length > 0) {
    pr = pullRequests[0];
    core.info(`[SyncMyDep] Found existing Pull Request #${pr.number}. Updating...`);

    await octokit.rest.pulls.update({
      owner,
      repo,
      pull_number: pr.number,
      title,
      body
    });

    try {
      await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: pr.number,
        body: `🔄 **SyncMyDep Update**: Refreshed dependency synchronization and pushed latest fixes.`
      });
    } catch (err) {
      core.warning(`Could not post comment to PR #${pr.number}: ${err.message}`);
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

    pr = newPr;
    isNew = true;
    core.info(`[SyncMyDep] Successfully created Pull Request #${pr.number}: ${pr.html_url}`);
  }

  // Apply labels
  if (labels && labels.length > 0) {
    try {
      await octokit.rest.issues.addLabels({
        owner,
        repo,
        issue_number: pr.number,
        labels
      });
    } catch (err) {
      core.warning(`Could not apply labels to PR #${pr.number}: ${err.message}`);
    }
  }

  // Apply assignees
  if (assignees && assignees.length > 0) {
    try {
      await octokit.rest.issues.addAssignees({
        owner,
        repo,
        issue_number: pr.number,
        assignees
      });
    } catch (err) {
      core.warning(`Could not assign users to PR #${pr.number}: ${err.message}`);
    }
  }

  // Request reviewers
  if (reviewers && reviewers.length > 0) {
    try {
      await octokit.rest.pulls.requestReviewers({
        owner,
        repo,
        pull_number: pr.number,
        reviewers
      });
    } catch (err) {
      core.warning(`Could not request reviewers for PR #${pr.number}: ${err.message}`);
    }
  }

  return {
    number: pr.number,
    url: pr.html_url,
    isNew
  };
}

module.exports = {
  configureGitUser,
  commitAndPushChanges,
  createOrUpdatePullRequest
};
