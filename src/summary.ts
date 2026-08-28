import {
  SummaryOptions,
  CommentSummaryOptions,
  DependencyDiff,
  DependencyGroup,
  VulnerabilityAdvisory,
  AuditInspectionResult,
  RiskScoreResult,
  ChangelogSummary,
  UnusedDependencyResult
} from "./types";

function formatSeverity(sev: string): string {
  switch (sev.toLowerCase()) {
    case "critical":
      return "🔴 **Critical**";
    case "high":
      return "🟠 **High**";
    case "moderate":
    case "medium":
      return "🟡 **Moderate**";
    case "low":
      return "🔵 **Low**";
    default:
      return "⚪ **Info**";
  }
}

export function buildMarkdownSummary({
  pm,
  yarnVariant,
  workspaceInfo,
  changedFiles,
  diffStat,
  dependencyDiffs = [],
  syncedLockfile,
  fixedAudit,
  dedupeRun,
  dedupeSuccess,
  auditBefore,
  auditAfter,
  lockfileVerified,
  buildResult,
  prHeader,
  prFooter,
  riskScore,
  changelogs = [],
  unusedDeps,
  badgesMarkdown,
  groups
}: SummaryOptions): string {
  const pmDisplay = pm === "yarn" && yarnVariant === "berry" ? "yarn (berry)" : pm;
  let md = "";

  if (badgesMarkdown) {
    md += badgesMarkdown + "\n\n";
  }

  if (prHeader) {
    md += prHeader.trim() + "\n\n";
  }

  md += "## 🤖 SyncMyDep: Automated Dependency Synchronization\n\n";
  md += "SyncMyDep detected desynchronization or security vulnerabilities in your project's dependencies and generated this Pull Request.\n\n";

  md += "### 📦 Overview\n\n";
  md += "- **Package Manager**: `" + pmDisplay + "`\n";
  if (workspaceInfo && workspaceInfo.isMonorepo) {
    md += "- **Monorepo / Workspace**: `" + workspaceInfo.type + "` (" + workspaceInfo.packages.length + " workspace packages)\n";
  }
  if (riskScore) {
    md += "- **Breaking Change Risk**: " + riskScore.badge + "\n";
  }
  md += "- **Lockfile Synchronization**: " + (syncedLockfile ? "✅ Applied" : "⏭️ Skipped") + "\n";
  md += "- **Security Audit Fix**: " + formatAuditStatus(fixedAudit, auditBefore, auditAfter) + "\n";
  if (dedupeRun !== undefined) {
    md += "- **Lockfile Deduplication**: " + (dedupeSuccess ? "✅ Applied (sub-dependency trees optimized)" : "⚠️ Skipped / Failed") + "\n";
  }
  if (lockfileVerified !== undefined) {
    md += "- **Lockfile Integrity Verification**: " + (lockfileVerified ? "✅ Passed (dry-run installation verified)" : "⚠️ Warning (dry-run inspection failed)") + "\n";
  }
  if (buildResult) {
    md += "- **Build Smoke Test**: " + (buildResult.success ? "✅ Passed (`" + buildResult.command + "`)" : "⚠️ Failed (`" + buildResult.command + "`)") + "\n";
  }
  md += "- **Modified Files**: " + changedFiles.length + " file(s)\n\n";

  if (riskScore && riskScore.factors.length > 0) {
    md += buildRiskAssessmentSection(riskScore);
  }

  if (groups && groups.length > 0) {
    md += buildGroupedDependencyTable(groups);
  } else if (dependencyDiffs && dependencyDiffs.length > 0) {
    md += buildDependencyDiffTable(dependencyDiffs);
  }

  if (changelogs && changelogs.length > 0) {
    md += buildChangelogSection(changelogs);
  }

  if (unusedDeps && unusedDeps.totalUnused > 0) {
    md += buildUnusedDepsSection(unusedDeps);
  }

  if (auditBefore && auditBefore.advisories && auditBefore.advisories.length > 0) {
    md += buildAdvisoryTable(auditBefore.advisories, fixedAudit);
  } else if (auditBefore && auditBefore.total > 0) {
    md += "### 🛡️ Vulnerability Audit\n\n";
    md += "- **Initial Vulnerabilities Detected**: " + auditBefore.total + "\n";
    if (auditAfter) {
      md += "- **Remaining Vulnerabilities After Fix**: " + auditAfter.total + "\n";
    }
    if (auditBefore.summary) {
      md += "\n<details>\n<summary>View vulnerability breakdown</summary>\n\n";
      md += "```json\n" + JSON.stringify(auditBefore.summary, null, 2) + "\n```\n";
      md += "</details>\n\n";
    }
  }

  if (buildResult && !buildResult.success && buildResult.output) {
    md += "### ⚠️ Build Smoke Test Logs\n\n";
    md += "<details>\n<summary>Click to view build error logs</summary>\n\n";
    md += "```text\n" + buildResult.output.slice(0, 3000) + "\n```\n";
    md += "</details>\n\n";
  }

  md += "### 📁 Modified Dependency Files\n\n";
  md += "| File | Status |\n";
  md += "| :--- | :--- |\n";
  for (const file of changedFiles) {
    md += "| `" + file + "` | 🔄 Updated |\n";
  }
  md += "\n";

  if (diffStat) {
    md += "### 📊 Diff Summary\n\n";
    md += "```text\n" + diffStat + "\n```\n\n";
  }

  md += "### 🔍 Maintainer Checklist\n\n";
  md += "- [ ] Verify automated CI test results pass.\n";
  md += "- [ ] Review package version changes in `package.json` / lockfiles.\n";
  if (riskScore && !riskScore.safeToAutoMerge) {
    md += "- [ ] ⚠️ Check breaking changes & release notes for major version updates.\n";
  }
  md += "- [ ] Merge this PR to keep repository dependencies synchronized and secure.\n\n";

  if (prFooter) {
    md += "\n" + prFooter.trim() + "\n\n";
  }

  md += "---\n*Generated automatically by [SyncMyDep GitHub Action](https://github.com/nivinvysakh/syncmydep).*";

  return md;
}

export function buildCommentSummary({
  pm,
  yarnVariant,
  changedFiles,
  diffStat,
  syncedLockfile,
  fixedAudit,
  dedupeRun,
  dedupeSuccess,
  auditBefore,
  auditAfter,
  branch,
  commenter,
  lockfileVerified,
  buildResult,
  prHeader,
  prFooter
}: CommentSummaryOptions): string {
  const pmDisplay = pm === "yarn" && yarnVariant === "berry" ? "yarn (berry)" : pm;
  let md = "";

  if (prHeader) {
    md += prHeader.trim() + "\n\n";
  }

  md += "### 🤖 SyncMyDep Dependency Fix Applied\n\n";

  if (commenter) {
    md += "Triggered by **@" + commenter + "** on branch `" + branch + "`.\n\n";
  } else {
    md += "Triggered automatically on pull request branch `" + branch + "`.\n\n";
  }

  md += "#### 📦 Execution Summary\n";
  md += "- **Package Manager**: `" + pmDisplay + "`\n";
  md += "- **Lockfile Synchronization**: " + (syncedLockfile ? "✅ Applied" : "⏭️ Skipped") + "\n";
  md += "- **Security Audit Fix**: " + formatAuditStatus(fixedAudit, auditBefore, auditAfter) + "\n";
  if (dedupeRun !== undefined) {
    md += "- **Lockfile Deduplication**: " + (dedupeSuccess ? "✅ Applied" : "⚠️ Skipped") + "\n";
  }
  if (lockfileVerified !== undefined) {
    md += "- **Lockfile Integrity Verification**: " + (lockfileVerified ? "✅ Verified" : "⚠️ Warning") + "\n";
  }
  if (buildResult) {
    md += "- **Build Smoke Test**: " + (buildResult.success ? "✅ Passed (`" + buildResult.command + "`)" : "⚠️ Failed (`" + buildResult.command + "`)") + "\n";
  }
  md += "- **Modified Files**: " + changedFiles.length + " file(s)\n\n";

  md += "#### 📁 Updated Files\n";
  md += "| File | Status |\n";
  md += "| :--- | :--- |\n";
  for (const file of changedFiles) {
    md += "| `" + file + "` | 🔄 Synchronized & Pushed |\n";
  }
  md += "\n";

  if (diffStat) {
    md += "#### 📊 Diff Summary\n";
    md += "```text\n" + diffStat + "\n```\n\n";
  }

  if (prFooter) {
    md += "\n" + prFooter.trim() + "\n\n";
  }

  md += "---\n*Pushed directly to `" + branch + "` by [SyncMyDep](https://github.com/nivinvysakh/syncmydep).*";

  return md;
}

function formatAuditStatus(
  fixedAudit: boolean,
  auditBefore: AuditInspectionResult | null,
  auditAfter: AuditInspectionResult | null
): string {
  if (auditBefore === null) {
    return fixedAudit ? "✅ Applied" : "⏭️ Skipped";
  }

  if (auditBefore.total === 0) {
    return "✅ Clean (0 vulnerabilities detected)";
  }

  if (auditAfter) {
    if (auditAfter.total === 0) {
      return "✅ Applied (All " + auditBefore.total + " vulnerabilities patched)";
    }
    if (auditAfter.total < auditBefore.total) {
      const fixedCount = auditBefore.total - auditAfter.total;
      return "🔄 Partially Applied (" + fixedCount + " patched, " + auditAfter.total + " require breaking changes)";
    }
    if (auditAfter.total >= auditBefore.total) {
      return "⚠️ Attempted (" + auditBefore.total + " require breaking major version upgrade / manual review)";
    }
  }

  return fixedAudit ? "✅ Applied" : "⏭️ Skipped";
}

function buildRiskAssessmentSection(risk: RiskScoreResult): string {
  let md = "### 🛡️ Breaking Change Risk & Compatibility Analysis\n\n";
  md += "**Overall Risk Level**: " + risk.badge + "\n\n";
  md += "> " + risk.summary + "\n\n";

  if (risk.factors.length > 0) {
    md += "<details>\n<summary>⚠️ <b>View Risk Factors & Compatibility Breakdown (" + risk.factors.length + " package" + (risk.factors.length === 1 ? "" : "s") + ")</b> (Click to expand)</summary>\n\n";
    md += "| Package | Risk Level | Version Change | Reason |\n";
    md += "| :--- | :--- | :--- | :--- |\n";
    for (const factor of risk.factors) {
      const levelBadge =
        factor.level === "high"
          ? "🔴 **High**"
          : factor.level === "moderate"
          ? "🟡 **Moderate**"
          : "🟢 **Low**";
      const changeStr =
        factor.fromVersion && factor.toVersion
          ? "`" + factor.fromVersion + "` ➔ `" + factor.toVersion + "`"
          : "—";
      md += "| `" + factor.package + "` | " + levelBadge + " | " + changeStr + " | " + factor.reason + " |\n";
    }
    md += "\n</details>\n\n";
  }

  return md;
}

function buildChangelogSection(changelogs: ChangelogSummary[]): string {
  let md = "### 📖 Dependency Changelogs & Release Notes\n\n";
  md += "<details>\n<summary>🔍 <b>View Full Changelogs & Release Notes (" + changelogs.length + " package" + (changelogs.length === 1 ? "" : "s") + ")</b> (Click to expand)</summary>\n\n";
  md += "| Package | Version Transition | Release Notes / Compare Diff |\n";
  md += "| :--- | :--- | :--- |\n";

  for (const item of changelogs) {
    const vStr =
      item.fromVersion && item.toVersion
        ? "`" + item.fromVersion + "` ➔ `" + item.toVersion + "`"
        : item.toVersion
        ? "`v" + item.toVersion + "`"
        : "—";
    md += "| `" + item.package + "` | " + vStr + " | " + (item.notesSummary || "—") + " |\n";
  }
  md += "\n</details>\n\n";

  return md;
}

function buildUnusedDepsSection(unused: UnusedDependencyResult): string {
  let md = "### 🧹 Unused Dependencies Detected\n\n";
  md += "SyncMyDep scanned **" + unused.scannedFilesCount + "** source files and identified **" + unused.totalUnused + "** potentially unused package(s):\n\n";

  if (unused.unusedProd.length > 0) {
    md += "- **Production Dependencies**: " + unused.unusedProd.map((p) => "`" + p + "`").join(", ") + "\n";
  }
  if (unused.unusedDev.length > 0) {
    md += "- **Dev Dependencies**: " + unused.unusedDev.map((p) => "`" + p + "`").join(", ") + "\n";
  }
  md += "\n*To prune these dependencies automatically, run `npx syncmydep prune` or enable `prune-unused-deps: true`.*\n\n";

  return md;
}

function buildDependencyDiffTable(diffs: DependencyDiff[]): string {
  const directDiffs = diffs.filter((d) => d.type === "prod" || d.type === "dev");
  const transitiveDiffs = diffs.filter((d) => d.type === "transitive");

  let md = "### 🔄 Package Version Changes\n\n";

  const renderRow = (diff: DependencyDiff) => {
    const oldV = diff.oldVersion ? "`" + diff.oldVersion + "`" : "—";
    const newV = diff.newVersion ? "`" + diff.newVersion + "`" : "—";
    let statusText: string = diff.reason || "Direct Update";
    if (diff.changeType === "added") statusText = "✨ Added";
    if (diff.changeType === "removed") statusText = "🗑️ Removed";
    if (diff.changeType === "downgraded") statusText = "🔒 Lockfile Reconciled";
    else if (diff.reason === "Lockfile Drift") statusText = "🔒 Lockfile Drift";
    if (diff.reason === "Direct Update" && diff.changeType === "upgraded") statusText = "🔄 Direct Update";
    return "| `" + diff.name + "` | " + oldV + " | " + newV + " | " + statusText + " |\n";
  };

  if (directDiffs.length > 0) {
    md += "| Package | Old Version | New Version | Reason / Type |\n";
    md += "| :--- | :--- | :--- | :--- |\n";
    for (const diff of directDiffs) {
      md += renderRow(diff);
    }
    md += "\n";
  }

  if (transitiveDiffs.length > 0) {
    if (directDiffs.length === 0 && transitiveDiffs.length <= 5) {
      md += "| Package | Old Version | New Version | Reason / Type |\n";
      md += "| :--- | :--- | :--- | :--- |\n";
      for (const diff of transitiveDiffs) {
        md += renderRow(diff);
      }
      md += "\n";
    } else {
      md += "<details>\n<summary>🔒 <b>" + transitiveDiffs.length + " Sub-dependency Updates (Lockfile Drift)</b> (Click to expand)</summary>\n\n";
      md += "| Package | Old Version | New Version | Reason / Type |\n";
      md += "| :--- | :--- | :--- | :--- |\n";
      for (const diff of transitiveDiffs) {
        md += renderRow(diff);
      }
      md += "\n</details>\n\n";
    }
  }

  return md;
}

function buildGroupedDependencyTable(groups: DependencyGroup[]): string {
  let md = "### 📦 Grouped Package Updates\n\n";

  for (const group of groups) {
    const shouldCollapse = group.diffs.length > 5 || group.name.toLowerCase().includes("general");
    const countLabel = "(" + group.diffs.length + " package" + (group.diffs.length === 1 ? "" : "s") + ")";

    if (shouldCollapse) {
      md += "<details>\n<summary>📂 <b>" + group.name + " " + countLabel + "</b> (Click to expand)</summary>\n\n";
    } else {
      md += "#### " + group.name + " " + countLabel + "\n\n";
    }

    md += "| Package | Old Version | New Version | Reason / Type |\n";
    md += "| :--- | :--- | :--- | :--- |\n";
    for (const diff of group.diffs) {
      const oldV = diff.oldVersion ? "`" + diff.oldVersion + "`" : "—";
      const newV = diff.newVersion ? "`" + diff.newVersion + "`" : "—";
      let statusText: string = diff.reason || "Direct Update";
      if (diff.changeType === "added") statusText = "✨ Added";
      if (diff.changeType === "removed") statusText = "🗑️ Removed";
      if (diff.changeType === "downgraded") statusText = "🔒 Lockfile Reconciled";
      else if (diff.reason === "Lockfile Drift") statusText = "🔒 Lockfile Drift";
      if (diff.reason === "Direct Update" && diff.changeType === "upgraded") statusText = "🔄 Direct Update";
      md += "| `" + diff.name + "` | " + oldV + " | " + newV + " | " + statusText + " |\n";
    }

    if (shouldCollapse) {
      md += "\n</details>\n\n";
    } else {
      md += "\n";
    }
  }

  return md;
}

function buildAdvisoryTable(advisories: VulnerabilityAdvisory[], fixed: boolean): string {
  let md = "### 🛡️ Vulnerability & Security Advisory Disclosure\n\n";
  md += "The following security advisories were identified" + (fixed ? " and patched" : "") + " (Total: **" + advisories.length + "**):\n\n";

  let table = "| Severity | Advisory / CVE | Package | Patched In | Title |\n";
  table += "| :--- | :--- | :--- | :--- | :--- |\n";

  for (const adv of advisories) {
    const idLink = adv.url ? "[" + adv.id + "](" + adv.url + ")" : adv.id;
    const patched = adv.patchedVersions ? "`" + adv.patchedVersions + "`" : "—";
    table += "| " + formatSeverity(adv.severity) + " | " + idLink + " | `" + adv.package + "` | " + patched + " | " + adv.title + " |\n";
  }

  if (advisories.length <= 5) {
    md += table + "\n";
  } else {
    md += "<details>\n<summary>🛡️ <b>View all " + advisories.length + " Security Advisories</b> (Click to expand)</summary>\n\n";
    md += table + "\n";
    md += "</details>\n\n";
  }

  return md;
}
