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
  createOrUpdatePullRequest
} from './git-pr';

import { buildMarkdownSummary } from './summary';
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

    const labels = labelsInput ? labelsInput.split(',').map((s) => s.trim()).filter(Boolean) : [];
    const assignees = assigneesInput ? assigneesInput.split(',').map((s) => s.trim()).filter(Boolean) : [];
    const reviewers = reviewersInput ? reviewersInput.split(',').map((s) => s.trim()).filter(Boolean) : [];

    const workspaceDir = path.resolve(process.cwd(), workingDirInput);
    core.info(`[SyncMyDep] Working directory: ${workspaceDir}`);

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
