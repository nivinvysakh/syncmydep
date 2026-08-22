import type { getOctokit } from '@actions/github';

export type PackageManager = 'npm' | 'yarn' | 'pnpm';

export interface AuditInspectionResult {
  total: number;
  summary: Record<string, number>;
  raw: unknown;
}

export interface SyncResult {
  success: boolean;
  output: string;
}

export interface GitStatusResult {
  hasChanges: boolean;
  changedFiles: string[];
}

export interface SummaryOptions {
  pm: PackageManager;
  changedFiles: string[];
  diffStat: string;
  syncedLockfile: boolean;
  fixedAudit: boolean;
  auditBefore: AuditInspectionResult | null;
  auditAfter: AuditInspectionResult | null;
}

export interface CommitAndPushParams {
  workspaceDir: string;
  branch: string;
  commitMessage: string;
  files: string[];
}

export type OctokitClient = ReturnType<typeof getOctokit>;

export interface CreateOrUpdatePullRequestParams {
  octokit: OctokitClient;
  owner: string;
  repo: string;
  baseBranch: string;
  headBranch: string;
  title: string;
  body: string;
  labels?: string[];
  assignees?: string[];
  reviewers?: string[];
}

export interface PullRequestResult {
  number: number;
  url: string;
  isNew: boolean;
}
