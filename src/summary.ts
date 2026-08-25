import {
  SummaryOptions,
  CommentSummaryOptions,
  DependencyDiff,
  VulnerabilityAdvisory
} from './types';

/**
 * Maps severity level to badge/icon formatted text.
 */
function formatSeverity(sev: string): string {
  switch (sev.toLowerCase()) {
    case 'critical':
      return '🔴 **Critical**';
    case 'high':
      return '🟠 **High**';
    case 'moderate':
    case 'medium':
      return '🟡 **Moderate**';
    case 'low':
      return '🔵 **Low**';
    default:
      return '⚪ **Info**';
  }
}

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
  auditAfter,
  lockfileVerified,
  buildResult
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
  if (lockfileVerified !== undefined) {
    md += `- **Lockfile Integrity Verification**: ${lockfileVerified ? '✅ Passed (dry-run installation verified)' : '⚠️ Warning (dry-run inspection failed)'}\n`;
  }
  if (buildResult) {
    md += `- **Build Smoke Test**: ${buildResult.success ? `✅ Passed (\`${buildResult.command}\`)` : `⚠️ Failed (\`${buildResult.command}\`)`}\n`;
  }
  md += `- **Modified Files**: ${changedFiles.length} file(s)\n\n`;

  if (dependencyDiffs && dependencyDiffs.length > 0) {
    md += buildDependencyDiffTable(dependencyDiffs);
  }

  if (auditBefore && auditBefore.advisories && auditBefore.advisories.length > 0) {
    md += buildAdvisoryTable(auditBefore.advisories, fixedAudit);
  } else if (auditBefore && auditBefore.total > 0) {
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

  if (buildResult && !buildResult.success && buildResult.output) {
    md += `### ⚠️ Build Smoke Test Logs\n\n`;
    md += `<details>\n<summary>Click to view build error logs</summary>\n\n`;
    md += `\`\`\`text\n${buildResult.output.slice(0, 3000)}\n\`\`\`\n`;
    md += `</details>\n\n`;
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

  md += `### 🔍 Maintainer Checklist\n\n`;
  md += `- [ ] Verify automated CI test results pass.\n`;
  md += `- [ ] Review package version changes in \`package.json\` / lockfiles.\n`;
  md += `- [ ] Merge this PR to keep repository dependencies synchronized and secure.\n\n`;

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
  lockfileVerified,
  buildResult,
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
  if (lockfileVerified !== undefined) {
    md += `- **Lockfile Integrity**: ${lockfileVerified ? '✅ Passed' : '⚠️ Warning'}\n`;
  }
  if (buildResult) {
    md += `- **Build Smoke Test**: ${buildResult.success ? `✅ Passed` : `⚠️ Failed`}\n`;
  }
  md += `- **Files Updated**: ${changedFiles.length} file(s)\n\n`;

  if (dependencyDiffs && dependencyDiffs.length > 0) {
    md += buildDependencyDiffTable(dependencyDiffs);
  }

  if (auditBefore && auditBefore.advisories && auditBefore.advisories.length > 0) {
    md += buildAdvisoryTable(auditBefore.advisories, fixedAudit);
  } else if (auditBefore && auditBefore.total > 0) {
    md += `#### 🛡️ Vulnerability Audit\n`;
    md += `- **Initial Vulnerabilities**: ${auditBefore.total}\n`;
    if (auditAfter) {
      md += `- **Remaining Vulnerabilities**: ${auditAfter.total}\n`;
    }
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

  md += `---\n*Pushed directly to \`${branch}\` by [SyncMyDep](https://github.com/nivinvysakh/syncmydep).*`;

  return md;
}

/**
 * Generates a markdown diff table for changed package versions.
 */
function buildDependencyDiffTable(diffs: DependencyDiff[]): string {
  const directDiffs = diffs.filter((d) => d.type === 'prod' || d.type === 'dev');
  const transitiveDiffs = diffs.filter((d) => d.type === 'transitive');

  let md = `### 🔄 Package Version Changes\n\n`;

  const renderRow = (diff: DependencyDiff) => {
    const oldV = diff.oldVersion ? `\`${diff.oldVersion}\`` : '—';
    const newV = diff.newVersion ? `\`${diff.newVersion}\`` : '—';
    let statusText: string = diff.reason || 'Direct Update';
    if (diff.changeType === 'added') statusText = '✨ Added';
    if (diff.changeType === 'removed') statusText = '🗑️ Removed';
    return `| \`${diff.name}\` | ${oldV} | ${newV} | ${statusText} |\n`;
  };

  if (directDiffs.length > 0) {
    md += `| Package | Old Version | New Version | Reason / Type |\n`;
    md += `| :--- | :--- | :--- | :--- |\n`;
    for (const diff of directDiffs) {
      md += renderRow(diff);
    }
    md += `\n`;
  }

  if (transitiveDiffs.length > 0) {
    if (directDiffs.length === 0 && transitiveDiffs.length <= 5) {
      md += `| Package | Old Version | New Version | Reason / Type |\n`;
      md += `| :--- | :--- | :--- | :--- |\n`;
      for (const diff of transitiveDiffs) {
        md += renderRow(diff);
      }
      md += `\n`;
    } else {
      md += `<details>\n<summary>📦 <b>${transitiveDiffs.length} Sub-dependency Updates (Lockfile Drift)</b> (Click to expand)</summary>\n\n`;
      md += `| Package | Old Version | New Version | Reason / Type |\n`;
      md += `| :--- | :--- | :--- | :--- |\n`;
      for (const diff of transitiveDiffs) {
        md += renderRow(diff);
      }
      md += `\n</details>\n\n`;
    }
  }

  return md;
}

/**
 * Generates a markdown disclosure table for detected security advisories.
 */
function buildAdvisoryTable(advisories: VulnerabilityAdvisory[], fixed: boolean): string {
  let md = `### 🛡️ Vulnerability & Security Advisory Disclosure\n\n`;
  md += `The following security advisories were identified${fixed ? ' and patched' : ''} (Total: **${advisories.length}**):\n\n`;

  let table = `| Severity | Advisory / CVE | Package | Patched In | Title |\n`;
  table += `| :--- | :--- | :--- | :--- | :--- |\n`;

  for (const adv of advisories) {
    const idLink = adv.url ? `[${adv.id}](${adv.url})` : adv.id;
    const patched = adv.patchedVersions ? `\`${adv.patchedVersions}\`` : '—';
    table += `| ${formatSeverity(adv.severity)} | ${idLink} | \`${adv.package}\` | ${patched} | ${adv.title} |\n`;
  }

  if (advisories.length <= 5) {
    md += `${table}\n`;
  } else {
    md += `<details>\n<summary>🛡️ <b>View all ${advisories.length} Security Advisories</b> (Click to expand)</summary>\n\n`;
    md += `${table}\n`;
    md += `</details>\n\n`;
  }

  return md;
}
