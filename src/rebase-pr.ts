import * as exec from "@actions/exec";
import * as core from "@actions/core";
import {
  OctokitClient,
  PackageManager,
  YarnVariant,
  WorkspaceInfo,
  AuditInspectionResult,
  BuildVerificationResult,
} from "./types";
import {
  commitAndPushChanges,
  postIssueComment,
  updateIssueComment,
  addCommentReaction,
  createOrUpdatePullRequest,
} from "./git-pr";
import {
  syncLockfile,
  runAuditFix,
  getGitStatus,
  getGitDiffStat,
  parseDependencyDiffs,
  verifyLockfileIntegrity,
  runBuildSmokeTest,
} from "./fixer";
import { inspectAudit } from "./detector";
import { buildCommentSummary, buildMarkdownSummary } from "./summary";

export interface RebaseAndRedoOptions {
  workspaceDir: string;
  octokit: OctokitClient;
  owner: string;
  repo: string;
  baseBranch: string;
  targetBranch: string;
  headRepo?: string;
  isFork?: boolean;
  token?: string;
  prNumber?: number;
  triggerCommentId?: number;
  commentId?: number;
  commenter?: string;
  pm: PackageManager;
  yarnVariant?: YarnVariant;
  workspaceInfo: WorkspaceInfo;
  syncLockfileOption: boolean;
  fixAuditOption: boolean;
  auditLevel: string;
  commitMessage: string;
  prTitle: string;
  labels?: string[];
  assignees?: string[];
  reviewers?: string[];
  verifyLockfile?: boolean;
  runBuild?: string;
  failOnBuildError?: boolean;
  autoMerge?: boolean;
  autoMergeMethod?: 'squash' | 'merge' | 'rebase';
}

/**
 * Deletes a local branch if it exists.
 */
export async function deleteLocalBranch(
  workspaceDir: string,
  branch: string,
): Promise<boolean> {
  const options = { cwd: workspaceDir, silent: true, ignoreReturnCode: true };
  core.info(`[SyncMyDep] Deleting local branch ${branch}...`);
  const exitCode = await exec.exec("git", ["branch", "-D", branch], options);
  return exitCode === 0;
}

/**
 * Deletes a remote branch on origin if it exists.
 */
export async function deleteRemoteBranch(
  workspaceDir: string,
  branch: string,
  octokit?: OctokitClient,
  owner?: string,
  repo?: string,
): Promise<boolean> {
  core.info(`[SyncMyDep] Deleting remote branch origin/${branch}...`);

  if (octokit && owner && repo) {
    try {
      await octokit.rest.git.deleteRef({
        owner,
        repo,
        ref: `heads/${branch}`,
      });
      core.info(
        `[SyncMyDep] Successfully deleted remote ref heads/${branch} via GitHub API.`,
      );
      return true;
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      core.info(
        `[SyncMyDep] GitHub API deleteRef failed or ref did not exist: ${errMsg}`,
      );
    }
  }

  // Fallback via git command line
  const options = { cwd: workspaceDir, silent: true, ignoreReturnCode: true };
  const exitCode = await exec.exec(
    "git",
    ["push", "origin", "--delete", branch],
    options,
  );
  return exitCode === 0;
}

/**
 * Fetches the latest base branch and creates/resets a fresh target branch from it.
 */
export async function recreateFreshBranch(
  workspaceDir: string,
  baseBranch: string,
  targetBranch: string,
): Promise<void> {
  const options = { cwd: workspaceDir, ignoreReturnCode: true };

  core.info(`[SyncMyDep] Cleaning working directory...`);
  await exec.exec("git", ["reset", "--hard"], options);
  await exec.exec("git", ["clean", "-fd"], options);

  core.info(`[SyncMyDep] Fetching latest ${baseBranch} from origin...`);
  await exec.exec(
    "git",
    ["fetch", "origin", `${baseBranch}:${baseBranch}`],
    options,
  );
  await exec.exec(
    "git",
    [
      "fetch",
      "origin",
      `+refs/heads/${baseBranch}:refs/remotes/origin/${baseBranch}`,
    ],
    options,
  );

  core.info(
    `[SyncMyDep] Creating clean branch ${targetBranch} tracking origin/${baseBranch}...`,
  );
  const branchCheckoutCode = await exec.exec(
    "git",
    ["checkout", "-B", targetBranch, `origin/${baseBranch}`],
    options,
  );

  if (branchCheckoutCode !== 0) {
    // Fallback: switch to base branch directly and create new branch
    await exec.exec("git", ["checkout", baseBranch], options);
    await exec.exec("git", ["pull", "origin", baseBranch], options);
    await exec.exec("git", ["checkout", "-B", targetBranch], options);
  }
}

/**
 * Orchestrates a complete rebase: resets the target branch from the latest base branch,
 * re-executes the dependency synchronization & vulnerability fixes, commits and force pushes,
 * and updates or notifies the PR.
 */
export async function rebaseAndRedoProcess(
  options: RebaseAndRedoOptions,
): Promise<{
  hasChanges: boolean;
  pushed: boolean;
  prNumber?: number;
}> {
  const {
    workspaceDir,
    octokit,
    owner,
    repo,
    baseBranch,
    targetBranch,
    headRepo,
    isFork,
    token,
    prNumber,
    triggerCommentId,
    commentId,
    commenter,
    pm,
    yarnVariant,
    workspaceInfo,
    syncLockfileOption,
    fixAuditOption,
    auditLevel,
    commitMessage,
    prTitle,
    labels = [],
    assignees = [],
    reviewers = [],
    verifyLockfile = true,
    runBuild,
    failOnBuildError = false,
    autoMerge = false,
    autoMergeMethod = 'squash',
  } = options;

  const userTriggerCommentId = triggerCommentId || commentId;
  let botCommentId: number | undefined;

  if (prNumber) {
    try {
      const { data: createdComment } = await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: prNumber,
        body: `🔄 **SyncMyDep**: Rebasing branch \`${targetBranch}\` onto \`${baseBranch}\` and generating fresh dependency synchronization...`,
      });
      botCommentId = createdComment.id;
    } catch {
      // ignore
    }
  }

  // 1. Recreate fresh branch from upstream base
  await recreateFreshBranch(workspaceDir, baseBranch, targetBranch);

  // 2. Perform vulnerability check before fix
  let auditBefore: AuditInspectionResult | null = null;
  let auditAfter: AuditInspectionResult | null = null;

  if (fixAuditOption) {
    auditBefore = await inspectAudit(workspaceDir, pm);
  }

  // 3. Sync lockfile
  let syncedLockfile = false;
  if (syncLockfileOption) {
    const syncResult = await syncLockfile(workspaceDir, pm, yarnVariant);
    syncedLockfile = syncResult.success;
  }

  // 4. Run audit fix
  let fixedAudit = false;
  if (fixAuditOption) {
    const auditResult = await runAuditFix(workspaceDir, pm, auditLevel);
    fixedAudit = auditResult.success;
    auditAfter = await inspectAudit(workspaceDir, pm);
  }

  // 5. Lockfile integrity verification
  let lockfileVerified: boolean | undefined = undefined;
  if (verifyLockfile) {
    const integrityResult = await verifyLockfileIntegrity(workspaceDir, pm, yarnVariant);
    lockfileVerified = integrityResult.success;
  }

  // 6. Build smoke test
  let buildResult: BuildVerificationResult | null = null;
  if (runBuild) {
    buildResult = await runBuildSmokeTest(workspaceDir, runBuild);
    if (!buildResult.success && failOnBuildError) {
      core.error(`[SyncMyDep] Build smoke test failed: ${buildResult.output}`);
      if (botCommentId) {
        await updateIssueComment(
          octokit,
          owner,
          repo,
          botCommentId,
          `❌ **SyncMyDep Rebase Aborted**: Build smoke test (\`${runBuild}\`) failed with errors.`
        );
      }
      return { hasChanges: true, pushed: false, prNumber };
    }
  }

  // 7. Check git changes
  const { hasChanges, changedFiles } = await getGitStatus(workspaceDir);

  if (!hasChanges) {
    core.info(
      `[SyncMyDep] No changes detected after rebase on branch ${targetBranch}.`,
    );

    if (prNumber) {
      if (userTriggerCommentId) {
        await addCommentReaction(octokit, owner, repo, userTriggerCommentId, "hooray");
      }
      if (botCommentId) {
        await updateIssueComment(
          octokit,
          owner,
          repo,
          botCommentId,
          `✅ **SyncMyDep**: Branch \`${targetBranch}\` was successfully rebased onto \`${baseBranch}\`. All dependencies are already up-to-date and synchronized!`,
        );
      } else {
        await postIssueComment(
          octokit,
          owner,
          repo,
          prNumber,
          `✅ **SyncMyDep**: Branch \`${targetBranch}\` was successfully rebased onto \`${baseBranch}\`. All dependencies are already up-to-date and synchronized!`,
        );
      }
    }

    return { hasChanges: false, pushed: false, prNumber };
  }

  // 8. Stage, commit and force push
  const diffStat = await getGitDiffStat(workspaceDir, changedFiles);
  const dependencyDiffs = await parseDependencyDiffs(
    workspaceDir,
    changedFiles,
  );

  const committedAndPushed = await commitAndPushChanges({
    workspaceDir,
    branch: targetBranch,
    commitMessage:
      commitMessage ||
      `chore(deps): synchronize package.json and lockfile (rebased)`,
    files: changedFiles,
    headRepo,
    isFork,
    token,
  });

  if (!committedAndPushed) {
    core.warning(
      `[SyncMyDep] Failed to commit or push rebased branch ${targetBranch}.`,
    );
    return { hasChanges: true, pushed: false, prNumber };
  }

  // 9. PR Comment or PR Create/Update
  if (prNumber) {
    const commentMarkdown = buildCommentSummary({
      pm,
      yarnVariant,
      workspaceInfo,
      changedFiles,
      diffStat,
      dependencyDiffs,
      syncedLockfile,
      fixedAudit,
      auditBefore,
      auditAfter,
      lockfileVerified,
      buildResult,
      branch: targetBranch,
      commenter,
    });

    if (userTriggerCommentId) {
      await addCommentReaction(octokit, owner, repo, userTriggerCommentId, "rocket");
    }
    if (botCommentId) {
      await updateIssueComment(
        octokit,
        owner,
        repo,
        botCommentId,
        `🔄 **SyncMyDep**: Successfully rebased \`${targetBranch}\` onto \`${baseBranch}\` with fresh lockfile synchronization.\n\n${commentMarkdown}`,
      );
    } else {
      await postIssueComment(
        octokit,
        owner,
        repo,
        prNumber,
        `🔄 **SyncMyDep Rebase Completed**: Branch \`${targetBranch}\` has been refreshed and rebased onto \`${baseBranch}\` with fresh lockfile synchronization.\n\n${commentMarkdown}`,
      );
    }

    return { hasChanges: true, pushed: true, prNumber };
  }

  const prBody = buildMarkdownSummary({
    pm,
    yarnVariant,
    workspaceInfo,
    changedFiles,
    diffStat,
    dependencyDiffs,
    syncedLockfile,
    fixedAudit,
    auditBefore,
    auditAfter,
    lockfileVerified,
    buildResult,
  });

  const prResult = await createOrUpdatePullRequest({
    octokit,
    owner,
    repo,
    baseBranch,
    headBranch: targetBranch,
    title: prTitle,
    body: prBody,
    labels,
    assignees,
    reviewers,
    autoMerge,
    autoMergeMethod,
  });

  return { hasChanges: true, pushed: true, prNumber: prResult.number };
}
