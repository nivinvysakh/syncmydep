import * as fs from 'fs';
import * as path from 'path';
import * as core from '@actions/core';
import * as yaml from 'js-yaml';
import { SyncMyDepConfig } from './types';

const CONFIG_CANDIDATES = [
  '.syncmydep.yml',
  '.syncmydep.yaml',
  '.syncmydeprc.yml',
  '.syncmydeprc.yaml',
  '.syncmydeprc.json',
  '.syncmydep.json'
];

/**
 * Loads and parses the .syncmydep.yml / .syncmydeprc.yml configuration file if present.
 */
export function loadConfigFile(workspaceDir: string, customConfigPath?: string): SyncMyDepConfig {
  let targetPath: string | null = null;

  if (customConfigPath) {
    const resolved = path.isAbsolute(customConfigPath)
      ? customConfigPath
      : path.join(workspaceDir, customConfigPath);
    if (fs.existsSync(resolved)) {
      targetPath = resolved;
    } else {
      core.warning(`[SyncMyDep] Specified config-file not found: ${resolved}`);
    }
  }

  if (!targetPath) {
    for (const candidate of CONFIG_CANDIDATES) {
      const candidatePath = path.join(workspaceDir, candidate);
      if (fs.existsSync(candidatePath)) {
        targetPath = candidatePath;
        break;
      }
    }
  }

  if (!targetPath) {
    return {};
  }

  try {
    core.info(`[SyncMyDep] Found configuration file: ${targetPath}`);
    const content = fs.readFileSync(targetPath, 'utf8').trim();
    if (!content) return {};

    const rawData = (targetPath.endsWith('.json')
      ? JSON.parse(content)
      : yaml.load(content)) as Record<string, unknown>;

    if (!rawData || typeof rawData !== 'object') {
      return {};
    }

    return normalizeConfig(rawData);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    core.warning(`[SyncMyDep] Failed to parse config file (${targetPath}): ${msg}. Using defaults.`);
    return {};
  }
}

/**
 * Normalizes YAML/JSON keys supporting camelCase, kebab-case, and snake_case.
 */
function normalizeConfig(raw: Record<string, unknown>): SyncMyDepConfig {
  const getVal = <T>(...keys: string[]): T | undefined => {
    for (const key of keys) {
      if (raw[key] !== undefined && raw[key] !== null) {
        return raw[key] as T;
      }
    }
    return undefined;
  };

  const labels = getVal<string[] | string>('prLabels', 'pr-labels', 'pr_labels');
  const assignees = getVal<string[] | string>('prAssignees', 'pr-assignees', 'pr_assignees');
  const reviewers = getVal<string[] | string>('prReviewers', 'pr-reviewers', 'pr_reviewers');
  const ignorePackages = getVal<string[] | string>('ignorePackages', 'ignore-packages', 'ignore_packages', 'ignore');

  const normalizeList = (val: string[] | string | undefined): string[] | undefined => {
    if (!val) return undefined;
    if (Array.isArray(val)) return val.map((s) => String(s).trim()).filter(Boolean);
    if (typeof val === 'string') return val.split(',').map((s) => s.trim()).filter(Boolean);
    return undefined;
  };

  const rawMonorepo = getVal<Record<string, unknown>>('monorepo', 'workspace');
  let monorepoConfig: SyncMyDepConfig['monorepo'] = undefined;
  if (rawMonorepo && typeof rawMonorepo === 'object') {
    monorepoConfig = {
      rootOnly: Boolean(rawMonorepo.rootOnly ?? rawMonorepo['root-only'] ?? rawMonorepo.root_only),
      ignore: normalizeList(rawMonorepo.ignore as string[] | string | undefined)
    };
  }

  return {
    packageManager: getVal<string>('packageManager', 'package-manager', 'package_manager'),
    workingDirectory: getVal<string>('workingDirectory', 'working-directory', 'working_directory'),
    syncLockfile: getVal<boolean>('syncLockfile', 'sync-lockfile', 'sync_lockfile'),
    fixAudit: getVal<boolean>('fixAudit', 'fix-audit', 'fix_audit'),
    auditLevel: getVal<string>('auditLevel', 'audit-level', 'audit_level'),
    checkOnly: getVal<boolean>('checkOnly', 'check-only', 'check_only'),
    directPush: getVal<boolean>('directPush', 'direct-push', 'direct_push'),
    dedupe: getVal<boolean>('dedupe', 'de-dupe'),
    ignorePackages: normalizeList(ignorePackages),
    baseBranch: getVal<string>('baseBranch', 'base-branch', 'base_branch'),
    prDraft: getVal<boolean>('prDraft', 'pr-draft', 'pr_draft', 'draft'),
    stepSummary: getVal<boolean>('stepSummary', 'step-summary', 'step_summary', 'jobSummary', 'job-summary'),
    prHeader: getVal<string>('prHeader', 'pr-header', 'pr_header', 'customHeader', 'custom-header'),
    prFooter: getVal<string>('prFooter', 'pr-footer', 'pr_footer', 'customFooter', 'custom-footer'),
    monorepo: monorepoConfig,
    prBranch: getVal<string>('prBranch', 'pr-branch', 'pr_branch'),
    prTitle: getVal<string>('prTitle', 'pr-title', 'pr_title'),
    commitMessage: getVal<string>('commitMessage', 'commit-message', 'commit_message'),
    prLabels: normalizeList(labels),
    prAssignees: normalizeList(assignees),
    prReviewers: normalizeList(reviewers),
    commentTrigger: getVal<string>('commentTrigger', 'comment-trigger', 'comment_trigger'),
    requireOwner: getVal<boolean>('requireOwner', 'require-owner', 'require_owner'),
    verifyLockfile: getVal<boolean>('verifyLockfile', 'verify-lockfile', 'verify_lockfile'),
    runBuild: getVal<string>('runBuild', 'run-build', 'run_build', 'buildScript', 'build-script', 'build_script'),
    failOnBuildError: getVal<boolean>('failOnBuildError', 'fail-on-build-error', 'fail_on_build_error'),
    autoMerge: getVal<boolean>('autoMerge', 'auto-merge', 'auto_merge'),
    autoMergeMethod: getVal<'squash' | 'merge' | 'rebase'>('autoMergeMethod', 'auto-merge-method', 'auto_merge_method'),
    cache: getVal<boolean>('cache', 'cache'),
    detectUnusedDeps: getVal<boolean>('detectUnusedDeps', 'detect-unused-deps', 'detect_unused_deps', 'unusedDeps', 'unused-deps'),
    pruneUnusedDeps: getVal<boolean>('pruneUnusedDeps', 'prune-unused-deps', 'prune_unused_deps', 'prune'),
    ignoreUnusedPackages: normalizeList(getVal<string[] | string>('ignoreUnusedPackages', 'ignore-unused-packages', 'ignore_unused_packages')),
    showChangelogs: getVal<boolean>('showChangelogs', 'show-changelogs', 'show_changelogs', 'changelogs'),
    riskScoring: getVal<boolean>('riskScoring', 'risk-scoring', 'risk_scoring', 'risk'),
    updateReadmeBadge: getVal<boolean>('updateReadmeBadge', 'update-readme-badge', 'update_readme_badge', 'readmeBadge', 'readme-badge')
  };
}
