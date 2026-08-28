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
  | 'nx'
  | 'deno';

export interface WorkspaceInfo {
  isMonorepo: boolean;
  type: WorkspaceType;
  patterns: string[];
  packages: string[];
}

export interface DependencyDiff {
  name: string;
  type: 'prod' | 'dev' | 'peer' | 'optional' | 'transitive';
  oldVersion?: string;
  newVersion?: string;
  changeType: 'added' | 'upgraded' | 'downgraded' | 'removed';
  reason?: 'Direct Update' | 'Audit Fix' | 'Lockfile Drift' | 'Transitive Upgrade' | 'Lockfile Reconciled';
}

export interface VulnerabilityAdvisory {
  id: string; // e.g. GHSA-xxxx-xxxx-xxxx or CVE-xxxx-xxxxx
  package: string;
  severity: 'critical' | 'high' | 'moderate' | 'low' | 'info';
  title: string;
  patchedVersions?: string;
  url?: string;
}

export interface BuildVerificationResult {
  command: string;
  success: boolean;
  output: string;
}

export interface SyncMyDepConfig {
  packageManager?: string;
  workingDirectory?: string;
  syncLockfile?: boolean;
  fixAudit?: boolean;
  auditLevel?: string;
  checkOnly?: boolean;
  directPush?: boolean;
  dedupe?: boolean;
  ignorePackages?: string[];
  baseBranch?: string;
  prDraft?: boolean;
  stepSummary?: boolean;
  prHeader?: string;
  prFooter?: string;
  monorepo?: {
    rootOnly?: boolean;
    ignore?: string[];
  };
  prBranch?: string;
  prTitle?: string;
  commitMessage?: string;
  prLabels?: string[];
  prAssignees?: string[];
  prReviewers?: string[];
  commentTrigger?: string;
  requireOwner?: boolean;
  verifyLockfile?: boolean;
  runBuild?: string;
  failOnBuildError?: boolean;
  autoMerge?: boolean;
  autoMergeMethod?: 'squash' | 'merge' | 'rebase';
  cache?: boolean;
  detectUnusedDeps?: boolean;
  pruneUnusedDeps?: boolean;
  ignoreUnusedPackages?: string[];
  showChangelogs?: boolean;
  riskScoring?: boolean;
  updateReadmeBadge?: boolean;
  autoRebase?: boolean;
  groupRules?: GroupRule[];
  generateReport?: boolean;
  reportPath?: string;
}

export interface GroupRule {
  name: string;
  patterns?: string[];
  types?: ('prod' | 'dev' | 'peer' | 'optional' | 'transitive')[];
  changeTypes?: ('added' | 'upgraded' | 'downgraded' | 'removed')[];
  branchSuffix?: string;
  titlePrefix?: string;
}

export interface DependencyGroup {
  name: string;
  diffs: DependencyDiff[];
  branchSuffix?: string;
  titlePrefix?: string;
}

export interface ReportData {
  projectName: string;
  timestamp: string;
  pm: PackageManager;
  yarnVariant?: YarnVariant;
  workspaceInfo?: WorkspaceInfo;
  diffs: DependencyDiff[];
  groups?: DependencyGroup[];
  auditBefore: AuditInspectionResult | null;
  auditAfter: AuditInspectionResult | null;
  riskScore?: RiskScoreResult;
  unusedDeps?: UnusedDependencyResult;
  lockfileVerified?: boolean;
  buildResult?: BuildVerificationResult | null;
}

export interface ReportOptions {
  output?: string;
  title?: string;
}

export type RiskLevel = 'low' | 'moderate' | 'high';

export interface RiskFactor {
  package: string;
  level: RiskLevel;
  reason: string;
  fromVersion?: string;
  toVersion?: string;
}

export interface RiskScoreResult {
  overallLevel: RiskLevel;
  score: number; // 1 to 10 scale
  badge: string;
  summary: string;
  factors: RiskFactor[];
  safeToAutoMerge: boolean;
}

export interface PackageReleaseInfo {
  name: string;
  fromVersion?: string;
  toVersion?: string;
  repositoryUrl?: string;
  changelogUrl?: string;
  releaseUrl?: string;
  diffUrl?: string;
}

export interface ChangelogSummary {
  package: string;
  fromVersion?: string;
  toVersion?: string;
  diffUrl?: string;
  releaseUrl?: string;
  notesSummary?: string;
}

export interface UnusedDependencyResult {
  unusedProd: string[];
  unusedDev: string[];
  totalUnused: number;
  scannedFilesCount: number;
}

export interface BadgeOptions {
  status?: 'synced' | 'drift' | 'fixed';
  pm?: PackageManager;
  vulnCount?: number;
  riskLevel?: RiskLevel;
  repoUrl?: string;
}

export interface BadgeResult {
  syncBadge: string;
  vulnBadge: string;
  pmBadge: string;
  riskBadge: string;
  combinedMarkdown: string;
}

export interface AuditInspectionResult {
  total: number;
  summary: Record<string, number>;
  advisories?: VulnerabilityAdvisory[];
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
  dedupeRun?: boolean;
  dedupeSuccess?: boolean;
  auditBefore: AuditInspectionResult | null;
  auditAfter: AuditInspectionResult | null;
  lockfileVerified?: boolean;
  buildResult?: BuildVerificationResult | null;
  prHeader?: string;
  prFooter?: string;
  riskScore?: RiskScoreResult;
  changelogs?: ChangelogSummary[];
  unusedDeps?: UnusedDependencyResult;
  badgesMarkdown?: string;
  groups?: DependencyGroup[];
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
  headRepo?: string;
  token?: string;
  isFork?: boolean;
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
  draft?: boolean;
  labels?: string[];
  assignees?: string[];
  reviewers?: string[];
  autoMerge?: boolean;
  autoMergeMethod?: 'squash' | 'merge' | 'rebase';
}

export interface PullRequestResult {
  number: number;
  url: string;
  nodeId?: string;
  isNew: boolean;
}

export interface PullRequestDetails {
  number: number;
  title: string;
  headBranch: string;
  baseBranch: string;
  headRepo: string;
  isFork?: boolean;
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
