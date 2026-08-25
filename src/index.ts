import * as path from 'path';
import * as core from '@actions/core';
import * as github from '@actions/github';

import {
  detectPackageManager,
  detectYarnVariant,
  checkPackageJsonExists,
  inspectAudit
} from './detector';

import {
  syncLockfile,
  runAuditFix,
  getGitStatus,
  getGitDiffStat,
  parseDependencyDiffs,
  verifyLockfileIntegrity,
  runBuildSmokeTest
} from './fixer';

import {
  configureGitUser,
  commitAndPushChanges,
  checkoutBranch,
  getPullRequestDetails,
  addCommentReaction,
  postIssueComment,
  closePullRequest,
  createOrUpdatePullRequest
} from './git-pr';

import { loadConfigFile } from './config';
import { detectWorkspace } from './workspace';
import { ensurePackageManagerInstalled } from './installer';
import { restorePackageCache, savePackageCache } from './cache';
import { rebaseAndRedoProcess, deleteRemoteBranch } from './rebase-pr';
import { buildMarkdownSummary, buildCommentSummary } from './summary';
import { AuditInspectionResult, BuildVerificationResult } from './types';

async function run(): Promise<void> {
  try {
    const customConfigPath = core.getInput('config-file') || '';
    const workingDirInput = core.getInput('working-directory') || '.';
    const workspaceDir = path.resolve(process.cwd(), workingDirInput);

    // 1. Load .syncmydeprc.json if present
    const fileConfig = loadConfigFile(workspaceDir, customConfigPath);

    // 2. Resolve Action inputs (Action input > file config > default)
    const token = core.getInput('github-token') || process.env.GITHUB_TOKEN;
    const pmInput = core.getInput('package-manager') || fileConfig.packageManager || 'auto';
    const syncLockfileOption = core.getInput('sync-lockfile') !== ''
      ? core.getBooleanInput('sync-lockfile')
      : fileConfig.syncLockfile ?? true;
    const fixAuditOption = core.getInput('fix-audit') !== ''
      ? core.getBooleanInput('fix-audit')
      : fileConfig.fixAudit ?? true;
    const auditLevel = core.getInput('audit-level') || fileConfig.auditLevel || 'moderate';
    const checkOnly = core.getInput('check-only') !== ''
      ? core.getBooleanInput('check-only')
      : fileConfig.checkOnly ?? false;
    const directPush = core.getInput('direct-push') !== ''
      ? core.getBooleanInput('direct-push')
      : fileConfig.directPush ?? false;
    const branchName = core.getInput('pr-branch') || fileConfig.prBranch || 'syncmydep/dependency-fix';
    const prTitle = core.getInput('pr-title') || fileConfig.prTitle || 'chore(deps): synchronize package.json and lockfile issues';
    const commitMessage = core.getInput('commit-message') || fileConfig.commitMessage || 'chore(deps): synchronize package.json and lockfile issues';
    const labelsInput = core.getInput('pr-labels') || (fileConfig.prLabels ? fileConfig.prLabels.join(',') : '');
    const assigneesInput = core.getInput('pr-assignees') || (fileConfig.prAssignees ? fileConfig.prAssignees.join(',') : '');
    const reviewersInput = core.getInput('pr-reviewers') || (fileConfig.prReviewers ? fileConfig.prReviewers.join(',') : '');
    const commentTrigger = (core.getInput('comment-trigger') || fileConfig.commentTrigger || 'syncdep').toLowerCase().trim();
    const requireOwner = core.getInput('require-owner') !== ''
      ? core.getBooleanInput('require-owner')
      : fileConfig.requireOwner ?? true;
    const verifyLockfileOption = core.getInput('verify-lockfile') !== ''
      ? core.getBooleanInput('verify-lockfile')
      : fileConfig.verifyLockfile ?? true;
    const runBuild = core.getInput('run-build') || fileConfig.runBuild || '';
    const failOnBuildError = core.getInput('fail-on-build-error') !== ''
      ? core.getBooleanInput('fail-on-build-error')
      : fileConfig.failOnBuildError ?? false;
    const autoMergeOption = core.getInput('auto-merge') !== ''
      ? core.getBooleanInput('auto-merge')
      : fileConfig.autoMerge ?? false;
    const autoMergeMethod = (core.getInput('auto-merge-method') || fileConfig.autoMergeMethod || 'squash').toLowerCase() as 'squash' | 'merge' | 'rebase';
    const cacheOption = core.getInput('cache') !== ''
      ? core.getBooleanInput('cache')
      : fileConfig.cache ?? true;

    const labels = labelsInput ? labelsInput.split(',').map((s) => s.trim()).filter(Boolean) : [];
    const assignees = assigneesInput ? assigneesInput.split(',').map((s) => s.trim()).filter(Boolean) : [];
    const reviewers = reviewersInput ? reviewersInput.split(',').map((s) => s.trim()).filter(Boolean) : [];

    core.info(`[SyncMyDep] Working directory: ${workspaceDir}`);

    // 3. Workspace / Monorepo Detection
    const workspaceInfo = detectWorkspace(workspaceDir);
    if (workspaceInfo.isMonorepo) {
      core.info(`[SyncMyDep] Monorepo detected: type=${workspaceInfo.type}, packages=${workspaceInfo.packages.length}`);
    }

    const eventName = github.context.eventName;
    const isIssueComment = eventName === 'issue_comment';
    const isPullRequest = eventName === 'pull_request';

    // 4. Handle PR Comment Trigger
    if (isIssueComment) {
      const issue = github.context.payload.issue;
      const comment = github.context.payload.comment;

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

      if (comment?.id) {
        await addCommentReaction(octokit, owner, repo, comment.id, 'eyes');
      }

      const prDetails = await getPullRequestDetails(octokit, owner, repo, prNumber);
      core.info(`[SyncMyDep] PR #${prNumber} head branch: ${prDetails.headBranch}`);

      await configureGitUser(workspaceDir, octokit);

      const pm = detectPackageManager(workspaceDir, pmInput);
      const yarnVariant = pm === 'yarn' ? detectYarnVariant(workspaceDir) : undefined;
      core.info(`[SyncMyDep] Active package manager: ${pm}${yarnVariant ? ` (${yarnVariant})` : ''}`);

      await ensurePackageManagerInstalled(pm);

      const isRebase = commentBody.includes('rebase') || commentBody.includes('reset') || commentBody.includes('fresh');
      if (isRebase) {
        core.info(`[SyncMyDep] Executing rebase and redo for PR #${prNumber}...`);
        await rebaseAndRedoProcess({
          workspaceDir,
          octokit,
          owner,
          repo,
          baseBranch: prDetails.baseBranch,
          targetBranch: prDetails.headBranch,
          prNumber,
          triggerCommentId: comment?.id,
          commenter,
          pm,
          yarnVariant,
          workspaceInfo,
          syncLockfileOption,
          fixAuditOption,
          auditLevel,
          commitMessage,
          prTitle,
          labels,
          assignees,
          reviewers,
          verifyLockfile: verifyLockfileOption,
          runBuild,
          failOnBuildError,
          autoMerge: autoMergeOption,
          autoMergeMethod
        });
        return;
      }

      const isClose = commentBody.includes('close') || commentBody.includes('cancel');
      if (isClose) {
        core.info(`[SyncMyDep] Closing Pull Request #${prNumber} as requested by @${commenter}...`);
        await closePullRequest(octokit, owner, repo, prNumber);
        await deleteRemoteBranch(workspaceDir, prDetails.headBranch, octokit, owner, repo);

        if (comment?.id) {
          await addCommentReaction(octokit, owner, repo, comment.id, '+1');
        }

        await postIssueComment(
          octokit,
          owner,
          repo,
          prNumber,
          `🚪 **SyncMyDep**: Closed Pull Request #${prNumber} and cleaned up branch \`${prDetails.headBranch}\` as requested by @${commenter}.`,
        );
        return;
      }

      await checkoutBranch(workspaceDir, prDetails.headBranch, prNumber);

      if (!checkPackageJsonExists(workspaceDir, pm)) {
        throw new Error(`Package manifest was not found in ${workspaceDir} on branch ${prDetails.headBranch}`);
      }

      let auditBefore: AuditInspectionResult | null = null;
      let auditAfter: AuditInspectionResult | null = null;

      if (fixAuditOption) {
        auditBefore = await inspectAudit(workspaceDir, pm);
      }

      let syncedLockfile = false;
      if (syncLockfileOption) {
        const syncResult = await syncLockfile(workspaceDir, pm, yarnVariant);
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
      const dependencyDiffs = await parseDependencyDiffs(workspaceDir, changedFiles);

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

    // 5. Standard run (check-only / pull_request direct-push / push / schedule)
    const pm = detectPackageManager(workspaceDir, pmInput);
    const yarnVariant = pm === 'yarn' ? detectYarnVariant(workspaceDir) : undefined;
    core.info(`[SyncMyDep] Active package manager: ${pm}${yarnVariant ? ` (${yarnVariant})` : ''}`);

    await ensurePackageManagerInstalled(pm);

    if (!checkPackageJsonExists(workspaceDir, pm)) {
      throw new Error(`Package manifest was not found in ${workspaceDir}`);
    }

    let cacheKey: string | undefined = undefined;
    if (cacheOption) {
      const cacheRestore = await restorePackageCache(workspaceDir, pm, yarnVariant);
      cacheKey = cacheRestore.cacheKey;
    }

    let auditBefore: AuditInspectionResult | null = null;
    let auditAfter: AuditInspectionResult | null = null;

    if (fixAuditOption) {
      auditBefore = await inspectAudit(workspaceDir, pm);
      core.info(`[SyncMyDep] Initial audit scan found ${auditBefore.total} vulnerabilities.`);
    }

    let syncedLockfile = false;
    if (syncLockfileOption) {
      const syncResult = await syncLockfile(workspaceDir, pm, yarnVariant);
      syncedLockfile = syncResult.success;
    }

    let fixedAudit = false;
    if (fixAuditOption && !checkOnly) {
      const auditResult = await runAuditFix(workspaceDir, pm, auditLevel);
      fixedAudit = auditResult.success;
      auditAfter = await inspectAudit(workspaceDir, pm);
    }

    if (cacheOption && cacheKey) {
      await savePackageCache(workspaceDir, pm, cacheKey, yarnVariant);
    }

    // Lockfile integrity verification
    let lockfileVerified: boolean | undefined = undefined;
    if (verifyLockfileOption) {
      const integrityResult = await verifyLockfileIntegrity(workspaceDir, pm, yarnVariant);
      lockfileVerified = integrityResult.success;
    }

    // Build smoke test
    let buildResult: BuildVerificationResult | null = null;
    if (runBuild && !checkOnly) {
      buildResult = await runBuildSmokeTest(workspaceDir, runBuild);
      if (!buildResult.success && failOnBuildError) {
        core.setFailed(`[SyncMyDep] Build smoke test failed: ${buildResult.output}`);
        return;
      }
    }

    const { hasChanges, changedFiles } = await getGitStatus(workspaceDir);

    // 6. Check-Only / CI Gating Mode
    if (checkOnly) {
      if (!hasChanges && (!auditBefore || auditBefore.total === 0)) {
        core.info('✅ [SyncMyDep] Check-Only passed: all dependencies and lockfiles are synchronized and healthy.');
        core.setOutput('changes-detected', 'false');
        core.setOutput('modified-files', '');

        await core.summary
          .addHeading('SyncMyDep: CI Check Passed')
          .addRaw('✅ **All dependencies and lockfiles are synchronized.** No action required.')
          .write();
        return;
      }

      core.setOutput('changes-detected', 'true');
      core.setOutput('modified-files', changedFiles.join(','));

      for (const file of changedFiles) {
        core.error(`[SyncMyDep] Lockfile desynchronization detected in: ${file}`, { file });
      }

      if (auditBefore && auditBefore.total > 0) {
        core.error(`[SyncMyDep] ${auditBefore.total} security vulnerabilities detected in dependencies.`);
      }

      await core.summary
        .addHeading('SyncMyDep: CI Check Failed')
        .addRaw(`❌ **Desynchronization or security vulnerabilities detected in:** \`${changedFiles.join(', ')}\`\n\nRun SyncMyDep to automatically fix and sync your lockfiles.`)
        .write();

      core.setFailed(`SyncMyDep Check-Only failed: lockfiles are desynchronized or vulnerabilities were detected.`);
      return;
    }

    // 7. No changes detected
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

    // 8. Changes detected
    core.info(`[SyncMyDep] Changes detected in files: ${changedFiles.join(', ')}`);
    core.setOutput('changes-detected', 'true');
    core.setOutput('modified-files', changedFiles.join(','));

    const diffStat = await getGitDiffStat(workspaceDir, changedFiles);
    const dependencyDiffs = await parseDependencyDiffs(workspaceDir, changedFiles);

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
      buildResult
    });

    if (!token) {
      core.warning('[SyncMyDep] No github-token provided. Cannot push branch or create PR automatically.');
      return;
    }

    const octokit = github.getOctokit(token);
    const { owner, repo } = github.context.repo;

    await configureGitUser(workspaceDir, octokit);

    // 9. Direct Push Mode on pull_request triggers
    if ((isPullRequest || directPush) && github.context.payload.pull_request) {
      const pr = github.context.payload.pull_request;
      const headBranch = pr.head.ref;
      const headRepo = pr.head.repo?.full_name;
      const currentRepo = `${github.context.repo.owner}/${github.context.repo.repo}`;

      if (headRepo === currentRepo) {
        core.info(`[SyncMyDep] Direct Push enabled on PR #${pr.number} (branch: ${headBranch}). Pushing fixes...`);
        const committed = await commitAndPushChanges({
          workspaceDir,
          branch: headBranch,
          commitMessage,
          files: changedFiles
        });

        if (committed) {
          const octokit = github.getOctokit(token);
          await postIssueComment(
            octokit,
            github.context.repo.owner,
            github.context.repo.repo,
            pr.number,
            `🔄 **SyncMyDep**: Automatically synchronized dependencies and updated \`${headBranch}\` in place.\n\n${prBody}`
          );
          core.info(`[SyncMyDep] Successfully direct-pushed to PR #${pr.number}`);
          return;
        }
      }
    }

    // 10. Create or Update Pull Request
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
      reviewers,
      autoMerge: autoMergeOption,
      autoMergeMethod
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
