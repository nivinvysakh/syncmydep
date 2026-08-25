import type { getOctokit } from '@actions/github';
export type PackageManager = 'npm' | 'yarn' | 'pnpm' | 'bun' | 'deno';
export type YarnVariant = 'classic' | 'berry';
export type WorkspaceType = 'none' | 'npm' | 'pnpm' | 'yarn' | 'bun' | 'turbo' | 'lerna' | 'nx';
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
    reason?: 'Direct Update' | 'Audit Fix' | 'Lockfile Drift' | 'Transitive Upgrade';
}
export interface VulnerabilityAdvisory {
    id: string;
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
    auditBefore: AuditInspectionResult | null;
    auditAfter: AuditInspectionResult | null;
    lockfileVerified?: boolean;
    buildResult?: BuildVerificationResult | null;
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
    htmlUrl: string;
}
export type CommentReaction = '+1' | '-1' | 'laugh' | 'confused' | 'heart' | 'hooray' | 'rocket' | 'eyes';
