import { SummaryOptions, CommentSummaryOptions } from './types';
/**
 * Builds a rich Markdown description for the Pull Request and GitHub Step Summary.
 */
export declare function buildMarkdownSummary({ pm, changedFiles, diffStat, syncedLockfile, fixedAudit, auditBefore, auditAfter }: SummaryOptions): string;
/**
 * Builds a clean, focused Markdown comment when SyncMyDep updates an existing PR via comment trigger.
 */
export declare function buildCommentSummary({ pm, changedFiles, diffStat, syncedLockfile, fixedAudit, auditBefore, auditAfter, branch, commenter }: CommentSummaryOptions): string;
