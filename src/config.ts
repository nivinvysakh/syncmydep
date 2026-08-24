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

  const normalizeList = (val: string[] | string | undefined): string[] | undefined => {
    if (!val) return undefined;
    if (Array.isArray(val)) return val.map((s) => String(s).trim()).filter(Boolean);
    if (typeof val === 'string') return val.split(',').map((s) => s.trim()).filter(Boolean);
    return undefined;
  };

  return {
    packageManager: getVal<string>('packageManager', 'package-manager', 'package_manager'),
    workingDirectory: getVal<string>('workingDirectory', 'working-directory', 'working_directory'),
    syncLockfile: getVal<boolean>('syncLockfile', 'sync-lockfile', 'sync_lockfile'),
    fixAudit: getVal<boolean>('fixAudit', 'fix-audit', 'fix_audit'),
    auditLevel: getVal<string>('auditLevel', 'audit-level', 'audit_level'),
    checkOnly: getVal<boolean>('checkOnly', 'check-only', 'check_only'),
    directPush: getVal<boolean>('directPush', 'direct-push', 'direct_push'),
    prBranch: getVal<string>('prBranch', 'pr-branch', 'pr_branch'),
    prTitle: getVal<string>('prTitle', 'pr-title', 'pr_title'),
    commitMessage: getVal<string>('commitMessage', 'commit-message', 'commit_message'),
    prLabels: normalizeList(labels),
    prAssignees: normalizeList(assignees),
    prReviewers: normalizeList(reviewers),
    commentTrigger: getVal<string>('commentTrigger', 'comment-trigger', 'comment_trigger'),
    requireOwner: getVal<boolean>('requireOwner', 'require-owner', 'require_owner'),
    appId: getVal<string>('appId', 'app-id', 'app_id'),
    privateKey: getVal<string>('privateKey', 'private-key', 'private_key')
  };
}
