import { SummaryOptions } from './types';
/**
 * Builds a rich Markdown description for the Pull Request and GitHub Step Summary.
 */
export declare function buildMarkdownSummary({ pm, changedFiles, diffStat, syncedLockfile, fixedAudit, auditBefore, auditAfter }: SummaryOptions): string;
