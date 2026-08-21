/**
 * Builds a rich Markdown description for the Pull Request and GitHub Step Summary.
 * @param {object} params
 * @param {string} params.pm
 * @param {string[]} params.changedFiles
 * @param {string} params.diffStat
 * @param {boolean} params.syncedLockfile
 * @param {boolean} params.fixedAudit
 * @param {object} params.auditBefore
 * @param {object} params.auditAfter
 * @returns {string} Markdown content
 */
function buildMarkdownSummary({
  pm,
  changedFiles,
  diffStat,
  syncedLockfile,
  fixedAudit,
  auditBefore,
  auditAfter
}) {
  let md = `## 🤖 SyncMyDep: Automated Dependency Synchronization\n\n`;
  md += `SyncMyDep detected desynchronization or security vulnerabilities in your project's dependencies and generated this Pull Request.\n\n`;

  md += `### 📦 Overview\n\n`;
  md += `- **Package Manager**: \`${pm}\`\n`;
  md += `- **Lockfile Synchronization**: ${syncedLockfile ? '✅ Applied' : '⏭️ Skipped'}\n`;
  md += `- **Security Audit Fix**: ${fixedAudit ? '✅ Applied' : '⏭️ Skipped'}\n`;
  md += `- **Modified Files**: ${changedFiles.length} file(s)\n\n`;

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

  md += `---\n*Generated automatically by [SyncMyDep GitHub Action](https://github.com).*`;

  return md;
}

module.exports = {
  buildMarkdownSummary
};
