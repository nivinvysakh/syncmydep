import { SummaryOptions, CommentSummaryOptions, DependencyDiff } from './types';

/**
 * Builds a rich Markdown description for the Pull Request and GitHub Step Summary.
 */
export function buildMarkdownSummary({
  pm,
  yarnVariant,
  workspaceInfo,
  changedFiles,
  diffStat,
  dependencyDiffs = [],
  syncedLockfile,
  fixedAudit,
  auditBefore,
  auditAfter
}: SummaryOptions): string {
  const pmDisplay = pm === 'yarn' && yarnVariant === 'berry' ? 'yarn (berry)' : pm;
  let md = `## 🤖 SyncMyDep: Automated Dependency Synchronization\n\n`;
  md += `SyncMyDep detected desynchronization or security vulnerabilities in your project's dependencies and generated this Pull Request.\n\n`;

  md += `### 📦 Overview\n\n`;
  md += `- **Package Manager**: \`${pmDisplay}\`\n`;
  if (workspaceInfo && workspaceInfo.isMonorepo) {
    md += `- **Monorepo / Workspace**: \`${workspaceInfo.type}\` (${workspaceInfo.packages.length} workspace packages)\n`;
  }
  md += `- **Lockfile Synchronization**: ${syncedLockfile ? '✅ Applied' : '⏭️ Skipped'}\n`;
  md += `- **Security Audit Fix**: ${fixedAudit ? '✅ Applied' : '⏭️ Skipped'}\n`;
  md += `- **Modified Files**: ${changedFiles.length} file(s)\n\n`;

  if (dependencyDiffs && dependencyDiffs.length > 0) {
    md += buildDependencyDiffTable(dependencyDiffs);
  }

  md += `### 📁 Modified Dependency Files\n\n`;
  md += `| File | Status |\n`;
  md += `| :--- | :--- |\n`;
  for (const file of changedFiles) {
    md += `| \`${file}\` | 🔄 Updated |\n`;
  }
  md += `\n`;

  if (diffStat) {
    md += `### 📊 Diff Summary\n\n`;
    md += `\`\`\`text\n${diffStat}\n\`\`\`\n\n`;
  }

  if (auditBefore && auditBefore.total > 0) {
    md += `### 🛡️ Vulnerability Audit\n\n`;
    md += `- **Initial Vulnerabilities Detected**: ${auditBefore.total}\n`;
    if (auditAfter) {
      md += `- **Remaining Vulnerabilities After Fix**: ${auditAfter.total}\n`;
    }
    if (auditBefore.summary) {
      md += `\n<details>\n<summary>View vulnerability breakdown</summary>\n\n`;
      md += `\`\`\`json\n${JSON.stringify(auditBefore.summary, null, 2)}\n\`\`\`\n`;
      md += `</details>\n\n`;
    }
  }

  md += `### 🔍 Maintainer Checklist\n\n`;
  md += `- [ ] Verify automated CI test results pass.\n`;
  md += `- [ ] Review any package version changes in \`package.json\` / lockfiles.\n`;
  md += `- [ ] Merge this PR to ensure your repository dependencies stay synchronized and secure.\n\n`;

  md += `---\n*Generated automatically by [SyncMyDep GitHub Action](https://github.com/nivinvysakh/syncmydep).*`;

  return md;
}

/**
 * Builds a clean, focused Markdown comment when SyncMyDep updates an existing PR via comment trigger.
 */
export function buildCommentSummary({
  pm,
  yarnVariant,
  workspaceInfo,
  changedFiles,
  diffStat,
  dependencyDiffs = [],
  syncedLockfile,
  fixedAudit,
  auditBefore,
  auditAfter,
  branch,
  commenter
}: CommentSummaryOptions): string {
  const pmDisplay = pm === 'yarn' && yarnVariant === 'berry' ? 'yarn (berry)' : pm;
  let md = `### 🚀 SyncMyDep: Dependencies Synchronized on \`${branch}\`\n\n`;
  if (commenter) {
    md += `Triggered by @${commenter}'s \`syncdep\` command.\n\n`;
  }

  md += `#### 📦 Summary\n`;
  md += `- **Package Manager**: \`${pmDisplay}\`\n`;
  if (workspaceInfo && workspaceInfo.isMonorepo) {
    md += `- **Monorepo / Workspace**: \`${workspaceInfo.type}\` (${workspaceInfo.packages.length} packages)\n`;
  }
  md += `- **Lockfile Synchronization**: ${syncedLockfile ? '✅ Applied' : '⏭️ Skipped'}\n`;
  md += `- **Security Audit Fix**: ${fixedAudit ? '✅ Applied' : '⏭️ Skipped'}\n`;
  md += `- **Files Updated**: ${changedFiles.length} file(s)\n\n`;

  if (dependencyDiffs && dependencyDiffs.length > 0) {
    md += buildDependencyDiffTable(dependencyDiffs);
  }

  md += `#### 📁 Modified Dependency Files\n`;
  md += `| File | Status |\n`;
  md += `| :--- | :--- |\n`;
  for (const file of changedFiles) {
    md += `| \`${file}\` | 🔄 Synchronized & Pushed |\n`;
  }
  md += `\n`;

  if (diffStat) {
    md += `#### 📊 Diff Summary\n`;
    md += `\`\`\`text\n${diffStat}\n\`\`\`\n\n`;
  }

  if (auditBefore && auditBefore.total > 0) {
    md += `#### 🛡️ Vulnerability Audit\n`;
    md += `- **Initial Vulnerabilities**: ${auditBefore.total}\n`;
    if (auditAfter) {
      md += `- **Remaining Vulnerabilities**: ${auditAfter.total}\n`;
    }
    if (auditBefore.summary) {
      md += `\n<details>\n<summary>View vulnerability breakdown</summary>\n\n`;
      md += `\`\`\`json\n${JSON.stringify(auditBefore.summary, null, 2)}\n\`\`\`\n`;
      md += `</details>\n\n`;
    }
  }

  md += `---\n*Pushed directly to \`${branch}\` by [SyncMyDep](https://github.com/nivinvysakh/syncmydep).*`;

  return md;
}

/**
 * Generates a markdown diff table for changed package versions.
 */
function buildDependencyDiffTable(diffs: DependencyDiff[]): string {
  let md = `### 🔄 Package Version Changes\n\n`;
  md += `| Package | Old Version | New Version | Change |\n`;
  md += `| :--- | :--- | :--- | :--- |\n`;

  for (const diff of diffs) {
    const oldV = diff.oldVersion ? `\`${diff.oldVersion}\`` : '—';
    const newV = diff.newVersion ? `\`${diff.newVersion}\`` : '—';
    let statusIcon = '🔄 Updated';
    if (diff.changeType === 'added') statusIcon = '✨ Added';
    if (diff.changeType === 'removed') statusIcon = '🗑️ Removed';

    md += `| \`${diff.name}\` | ${oldV} | ${newV} | ${statusIcon} |\n`;
  }
  md += `\n`;
  return md;
}
