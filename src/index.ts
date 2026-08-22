import * as path from 'path';
import * as core from '@actions/core';
import * as github from '@actions/github';

import {
  detectPackageManager,
  checkPackageJsonExists,
  inspectAudit
} from './detector';

import {
  syncLockfile,
  runAuditFix,
  getGitStatus,
  getGitDiffStat
} from './fixer';

import {
  configureGitUser,
  commitAndPushChanges,
  checkoutBranch,
  getPullRequestDetails,
  addCommentReaction,
  postIssueComment,
  createOrUpdatePullRequest
} from './git-pr';

import { buildMarkdownSummary, buildCommentSummary } from './summary';
import { AuditInspectionResult } from './types';

async function run(): Promise<void> {
  try {
    const token = core.getInput('github-token') || process.env.GITHUB_TOKEN;
    const pmInput = core.getInput('package-manager') || 'auto';
    const workingDirInput = core.getInput('working-directory') || '.';
    const syncLockfileOption = core.getBooleanInput('sync-lockfile');
    const fixAuditOption = core.getBooleanInput('fix-audit');
    const auditLevel = core.getInput('audit-level') || 'moderate';
    const branchName = core.getInput('pr-branch') || 'syncmydep/dependency-fix';
    const prTitle = core.getInput('pr-title') || 'chore(deps): synchronize package.json and lockfile issues';
    const commitMessage = core.getInput('commit-message') || 'chore(deps): synchronize package.json and lockfile issues';
    const labelsInput = core.getInput('pr-labels') || '';
    const assigneesInput = core.getInput('pr-assignees') || '';
    const reviewersInput = core.getInput('pr-reviewers') || '';
    const commentTrigger = (core.getInput('comment-trigger') || 'syncdep').toLowerCase().trim();

    const labels = labelsInput ? labelsInput.split(',').map((s) => s.trim()).filter(Boolean) : [];
    const assignees = assigneesInput ? assigneesInput.split(',').map((s) => s.trim()).filter(Boolean) : [];
    const reviewers = reviewersInput ? reviewersInput.split(',').map((s) => s.trim()).filter(Boolean) : [];

    const workspaceDir = path.resolve(process.cwd(), workingDirInput);
    core.info(`[SyncMyDep] Working directory: ${workspaceDir}`);

    const eventName = github.context.eventName;
    const isIssueComment = eventName === 'issue_comment';

    if (isIssueComment) {
      const issue = github.context.payload.issue;
      const comment = github.context.payload.comment;

      // Ensure this comment is on a Pull Request
      if (!issue || !issue.pull_request) {
        core.info('[SyncMyDep] Comment is on a regular issue, not a Pull Request. Skipping.');
        return;
      }

      const commentBody = (comment?.body || '').toLowerCase().trim();
      const triggerPatterns = [commentTrigger, `/${commentTrigger}`, `@${commentTrigger}`];
      const isTriggered = triggerPatterns.some((pattern) => commentBody.includes(pattern));

      if (!isTriggered) {
        core.info(`[SyncMyDep] Comment did not contain trigger word (${commentTrigger}). Skipping.`);
        return;
      }

      if (!token) {
        throw new Error('github-token is required to handle PR comment triggers.');
      }

      const octokit = github.getOctokit(token);
      const { owner, repo } = github.context.repo;
      const prNumber = issue.number;
      const commenter = comment?.user?.login || 'unknown';
      const authorAssociation = (comment?.author_association || '').toUpperCase();

      const requireOwner = core.getInput('require-owner') !== 'false';
      const isOwner = commenter.toLowerCase() === owner.toLowerCase() || authorAssociation === 'OWNER';

      if (requireOwner && !isOwner) {
        core.warning(`[SyncMyDep] User @${commenter} is not authorized. Only repository owners can trigger syncdep.`);
        if (comment?.id) {
          await addCommentReaction(octokit, owner, repo, comment.id, '-1');
        }
        await postIssueComment(
          octokit,
          owner,
          repo,
          prNumber,
          `⛔ **SyncMyDep**: Permission denied. Only the repository owner (@${owner}) is permitted to trigger dependency synchronization on this repository.`
        );
        return;
      }

      core.info(`[SyncMyDep] Authorized trigger by @${commenter} on PR #${prNumber}`);

      // Add acknowledgement reaction (eyes)
      if (comment?.id) {
        await addCommentReaction(octokit, owner, repo, comment.id, 'eyes');
      }

      // Fetch PR details to know head branch
      const prDetails = await getPullRequestDetails(octokit, owner, repo, prNumber);
      core.info(`[SyncMyDep] PR #${prNumber} head branch: ${prDetails.headBranch}`);

      // Checkout PR branch
      await configureGitUser(workspaceDir);
      await checkoutBranch(workspaceDir, prDetails.headBranch, prNumber);

      if (!checkPackageJsonExists(workspaceDir)) {
        throw new Error(`package.json was not found in ${workspaceDir} on branch ${prDetails.headBranch}`);
      }

      const pm = detectPackageManager(workspaceDir, pmInput);
      core.info(`[SyncMyDep] Active package manager: ${pm}`);

      let auditBefore: AuditInspectionResult | null = null;
      let auditAfter: AuditInspectionResult | null = null;

      if (fixAuditOption) {
        auditBefore = await inspectAudit(workspaceDir, pm);
      }

      let syncedLockfile = false;
      if (syncLockfileOption) {
        const syncResult = await syncLockfile(workspaceDir, pm);
        syncedLockfile = syncResult.success;
      }

      let fixedAudit = false;
      if (fixAuditOption) {
        const auditResult = await runAuditFix(workspaceDir, pm, auditLevel);
        fixedAudit = auditResult.success;
        auditAfter = await inspectAudit(workspaceDir, pm);
      }

      const { hasChanges, changedFiles } = await getGitStatus(workspaceDir);

      if (!hasChanges) {
        core.info('✅ [SyncMyDep] No dependency issues or lockfile changes needed for this PR.');
        core.setOutput('changes-detected', 'false');
        core.setOutput('modified-files', '');

        if (comment?.id) {
          await addCommentReaction(octokit, owner, repo, comment.id, 'hooray');
        }

        await postIssueComment(
          octokit,
          owner,
          repo,
          prNumber,
          `✅ **SyncMyDep**: All dependencies and lockfiles on branch \`${prDetails.headBranch}\` are already synchronized and healthy! No changes needed.`
        );

        return;
      }

      core.info(`[SyncMyDep] Changes detected in files: ${changedFiles.join(', ')}`);
      core.setOutput('changes-detected', 'true');
      core.setOutput('modified-files', changedFiles.join(','));

      const diffStat = await getGitDiffStat(workspaceDir, changedFiles);
      const commentMarkdown = buildCommentSummary({
        pm,
        changedFiles,
        diffStat,
        syncedLockfile,
        fixedAudit,
        auditBefore,
        auditAfter,
        branch: prDetails.headBranch,
        commenter
      });

      const committed = await commitAndPushChanges({
        workspaceDir,
        branch: prDetails.headBranch,
        commitMessage: commitMessage || `chore(deps): synchronize package.json and lockfile`,
        files: changedFiles
      });

      if (committed) {
        if (comment?.id) {
          await addCommentReaction(octokit, owner, repo, comment.id, 'rocket');
        }

        await postIssueComment(
          octokit,
          owner,
          repo,
          prNumber,
          commentMarkdown
        );

        core.info(`[SyncMyDep] Successfully pushed dependency fixes to branch ${prDetails.headBranch}`);
      }

      return;
    }

    // Standard run (push / schedule / workflow_dispatch)
    if (!checkPackageJsonExists(workspaceDir)) {
      throw new Error(`package.json was not found in ${workspaceDir}`);
    }

    const pm = detectPackageManager(workspaceDir, pmInput);
    core.info(`[SyncMyDep] Active package manager: ${pm}`);

    let auditBefore: AuditInspectionResult | null = null;
    let auditAfter: AuditInspectionResult | null = null;

    if (fixAuditOption) {
      auditBefore = await inspectAudit(workspaceDir, pm);
      core.info(`[SyncMyDep] Initial audit scan found ${auditBefore.total} vulnerabilities.`);
    }

    let syncedLockfile = false;
    if (syncLockfileOption) {
      const syncResult = await syncLockfile(workspaceDir, pm);
      syncedLockfile = syncResult.success;
    }

    let fixedAudit = false;
    if (fixAuditOption) {
      const auditResult = await runAuditFix(workspaceDir, pm, auditLevel);
      fixedAudit = auditResult.success;
      auditAfter = await inspectAudit(workspaceDir, pm);
    }

    const { hasChanges, changedFiles } = await getGitStatus(workspaceDir);

    if (!hasChanges) {
      core.info('✅ [SyncMyDep] No dependency issues or lockfile desync detected. Everything is up-to-date!');
      core.setOutput('changes-detected', 'false');
      core.setOutput('modified-files', '');

      await core.summary
        .addHeading('SyncMyDep: Dependency Check Result')
        .addRaw('✅ **All dependencies and lockfiles are synchronized and healthy.** No Pull Request is needed.')
        .write();

      return;
    }

    core.info(`[SyncMyDep] Changes detected in files: ${changedFiles.join(', ')}`);
    core.setOutput('changes-detected', 'true');
    core.setOutput('modified-files', changedFiles.join(','));

    const diffStat = await getGitDiffStat(workspaceDir, changedFiles);
    const prBody = buildMarkdownSummary({
      pm,
      changedFiles,
      diffStat,
      syncedLockfile,
      fixedAudit,
      auditBefore,
      auditAfter
    });

    if (!token) {
      core.warning('[SyncMyDep] No github-token provided. Cannot push branch or create PR automatically.');
      return;
    }

    await configureGitUser(workspaceDir);

    const committed = await commitAndPushChanges({
      workspaceDir,
      branch: branchName,
      commitMessage,
      files: changedFiles
    });

    if (!committed) {
      core.info('[SyncMyDep] No changes committed.');
      return;
    }

    const octokit = github.getOctokit(token);
    const { owner, repo } = github.context.repo;

    // Detect base branch
    let baseBranch = 'main';
    if (github.context.ref && github.context.ref.startsWith('refs/heads/')) {
      baseBranch = github.context.ref.replace('refs/heads/', '');
    } else {
      try {
        const repoInfo = await octokit.rest.repos.get({ owner, repo });
        baseBranch = repoInfo.data.default_branch || 'main';
      } catch {
        baseBranch = 'main';
      }
    }

    const prResult = await createOrUpdatePullRequest({
      octokit,
      owner,
      repo,
      baseBranch,
      headBranch: branchName,
      title: prTitle,
      body: prBody,
      labels,
      assignees,
      reviewers
    });

    core.setOutput('pull-request-number', String(prResult.number));
    core.setOutput('pull-request-url', prResult.url);

    await core.summary
      .addHeading('SyncMyDep: PR Created / Updated')
      .addRaw(`🚀 **Pull Request #${prResult.number}**: [${prTitle}](${prResult.url})\n\n`)
      .addRaw(prBody)
      .write();
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    core.setFailed(`[SyncMyDep Action Failed]: ${errMsg}`);
  }
}

run();
