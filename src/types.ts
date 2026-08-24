import type { getOctokit } from '@actions/github';

export type PackageManager = 'npm' | 'yarn' | 'pnpm' | 'bun' | 'deno';

export type YarnVariant = 'classic' | 'berry';

export type WorkspaceType =
  | 'none'
  | 'npm'
  | 'pnpm'
  | 'yarn'
  | 'bun'
  | 'turbo'
  | 'lerna'
  | 'nx';

export interface WorkspaceInfo {
  isMonorepo: boolean;
  type: WorkspaceType;
  patterns: string[];
  packages: string[];
}

export interface DependencyDiff {
  name: string;
  type: 'prod' | 'dev' | 'peer' | 'optional';
  oldVersion?: string;
  newVersion?: string;
  changeType: 'added' | 'upgraded' | 'downgraded' | 'removed';
}

export interface SyncMyDepConfig {
  packageManager?: string;
  workingDirectory?: string;
  syncLockfile?: boolean;
  fixAudit?: boolean;
  auditLevel?: string;
  checkOnly?: boolean;
  directPush?: boolean;
  prBranch?: string;
  prTitle?: string;
  commitMessage?: string;
  prLabels?: string[];
  prAssignees?: string[];
  prReviewers?: string[];
  commentTrigger?: string;
  requireOwner?: boolean;
}

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
  yarnVariant?: YarnVariant;
  workspaceInfo?: WorkspaceInfo;
  changedFiles: string[];
  diffStat: string;
  dependencyDiffs?: DependencyDiff[];
  syncedLockfile: boolean;
  fixedAudit: boolean;
  auditBefore: AuditInspectionResult | null;
  auditAfter: AuditInspectionResult | null;
}

export interface CommentSummaryOptions extends SummaryOptions {
  branch: string;
  commenter?: string;
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

export interface PullRequestDetails {
  number: number;
  title: string;
  headBranch: string;
  baseBranch: string;
  headRepo: string;
  htmlUrl: string;
}

export type CommentReaction =
  | '+1'
  | '-1'
  | 'laugh'
  | 'confused'
  | 'heart'
  | 'hooray'
  | 'rocket'
  | 'eyes';
