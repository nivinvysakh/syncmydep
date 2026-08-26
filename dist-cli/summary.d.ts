import { SummaryOptions, CommentSummaryOptions } from './types';
/**
 * Builds a rich Markdown description for the Pull Request and GitHub Step Summary.
 */
export declare function buildMarkdownSummary({ pm, yarnVariant, workspaceInfo, changedFiles, diffStat, dependencyDiffs, syncedLockfile, fixedAudit, dedupeRun, dedupeSuccess, auditBefore, auditAfter, lockfileVerified, buildResult, prHeader, prFooter }: SummaryOptions): string;
/**
 * Builds a clean, focused Markdown comment when SyncMyDep updates an existing PR via comment trigger.
 */
export declare function buildCommentSummary({ pm, yarnVariant, workspaceInfo, changedFiles, diffStat, dependencyDiffs, syncedLockfile, fixedAudit, dedupeRun, dedupeSuccess, auditBefore, auditAfter, lockfileVerified, buildResult, prHeader, prFooter, branch, commenter }: CommentSummaryOptions): string;
