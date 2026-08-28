import * as fs from "fs";
import { ReportData, ReportOptions } from "./types";

function escapeHtml(str?: string): string {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function generateHtmlReport(
  data: ReportData,
  options?: ReportOptions
): { html: string; outputPath: string } {
  const outputPath = options?.output || "syncmydep-report.html";
  const title = options?.title || ("SyncMyDep Report: " + data.projectName);

  const totalVulnerabilities = data.auditAfter?.total ?? data.auditBefore?.total ?? 0;
  const criticalVulns = (data.auditAfter?.summary?.critical ?? data.auditBefore?.summary?.critical) || 0;
  const highVulns = (data.auditAfter?.summary?.high ?? data.auditBefore?.summary?.high) || 0;
  const moderateVulns = (data.auditAfter?.summary?.moderate ?? data.auditBefore?.summary?.moderate) || 0;
  const lowVulns = (data.auditAfter?.summary?.low ?? data.auditBefore?.summary?.low) || 0;

  const riskLevel = data.riskScore?.overallLevel || "low";
  const riskScoreNum = data.riskScore?.score ?? 10;
  const riskBadgeColor =
    riskLevel === "high" ? "#ef4444" : riskLevel === "moderate" ? "#f59e0b" : "#10b981";

  const diffRows = (data.diffs || []).map((diff) => {
    const changeClass =
      diff.changeType === "added"
        ? "badge-added"
        : diff.changeType === "removed"
        ? "badge-removed"
        : diff.changeType === "downgraded"
        ? "badge-reconciled"
        : "badge-upgraded";

    const statusLabel =
      diff.changeType === "added"
        ? "✨ Added"
        : diff.changeType === "removed"
        ? "🗑️ Removed"
        : diff.changeType === "downgraded"
        ? "🔒 Reconciled"
        : "🔄 Upgraded";

    const vFrom = diff.oldVersion ? escapeHtml(diff.oldVersion) : "—";
    const vTo = diff.newVersion ? escapeHtml(diff.newVersion) : "—";

    return (
      "<tr class=\"dep-row\" data-type=\"" + escapeHtml(diff.type) + "\" data-change=\"" + escapeHtml(diff.changeType) + "\" data-name=\"" + escapeHtml(diff.name.toLowerCase()) + "\">" +
      "<td class=\"font-mono font-medium\">" + escapeHtml(diff.name) + "</td>" +
      "<td><span class=\"type-tag\">" + escapeHtml(diff.type) + "</span></td>" +
      "<td class=\"font-mono\">" + vFrom + "</td>" +
      "<td class=\"font-mono font-semibold\">" + vTo + "</td>" +
      "<td><span class=\"status-pill " + changeClass + "\">" + statusLabel + "</span></td>" +
      "<td class=\"text-muted\">" + escapeHtml(diff.reason || "Direct Update") + "</td>" +
      "</tr>"
    );
  }).join("\n");

  const unusedProdItems = (data.unusedDeps?.unusedProd || [])
    .map((p) => "<li class=\"unused-item prod\"><span class=\"badge-dot\"></span><code>" + escapeHtml(p) + "</code> <span class=\"tag\">prod</span></li>")
    .join("\n");
  const unusedDevItems = (data.unusedDeps?.unusedDev || [])
    .map((p) => "<li class=\"unused-item dev\"><span class=\"badge-dot\"></span><code>" + escapeHtml(p) + "</code> <span class=\"tag\">dev</span></li>")
    .join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      --bg: #0f172a;
      --card: #1e293b;
      --card-border: #334155;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --accent: #8b5cf6;
      --green: #10b981;
      --yellow: #f59e0b;
      --red: #ef4444;
      --blue: #38bdf8;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { background: var(--bg); color: var(--text); padding: 2rem 1rem; line-height: 1.5; }
    .container { max-width: 1200px; margin: 0 auto; }
    header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem; flex-wrap: wrap; gap: 1rem; }
    .title-group h1 { font-size: 1.8rem; font-weight: 700; color: #fff; display: flex; align-items: center; gap: 0.5rem; }
    .title-group p { color: var(--text-muted); font-size: 0.9rem; margin-top: 0.25rem; }
    .header-badges { display: flex; gap: 0.5rem; flex-wrap: wrap; }
    .badge { background: #334155; color: #e2e8f0; font-size: 0.8rem; padding: 0.3rem 0.75rem; border-radius: 9999px; font-weight: 600; }
    .grid-kpi { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
    .card { background: var(--card); border: 1px solid var(--card-border); border-radius: 12px; padding: 1.25rem; }
    .card-title { font-size: 0.85rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem; }
    .card-val { font-size: 1.8rem; font-weight: 700; display: flex; align-items: baseline; gap: 0.5rem; }
    .card-sub { font-size: 0.8rem; color: var(--text-muted); margin-top: 0.25rem; }
    .controls { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; gap: 1rem; flex-wrap: wrap; }
    .search-box { background: var(--card); border: 1px solid var(--card-border); border-radius: 8px; color: #fff; padding: 0.6rem 1rem; width: 300px; outline: none; }
    .search-box:focus { border-color: var(--accent); }
    .filters { display: flex; gap: 0.5rem; flex-wrap: wrap; }
    .filter-btn { background: var(--card); border: 1px solid var(--card-border); color: var(--text-muted); padding: 0.4rem 0.9rem; border-radius: 8px; cursor: pointer; font-size: 0.85rem; transition: 0.2s; }
    .filter-btn.active, .filter-btn:hover { background: var(--accent); color: #fff; border-color: var(--accent); }
    table { width: 100%; border-collapse: collapse; text-align: left; font-size: 0.9rem; }
    th { background: #1e293b; color: var(--text-muted); padding: 0.75rem 1rem; border-bottom: 1px solid var(--card-border); font-size: 0.8rem; text-transform: uppercase; }
    td { padding: 0.85rem 1rem; border-bottom: 1px solid #283548; }
    tr:hover td { background: #243248; }
    .font-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
    .status-pill { padding: 0.2rem 0.6rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; }
    .badge-upgraded { background: rgba(56, 189, 248, 0.15); color: #38bdf8; }
    .badge-reconciled { background: rgba(16, 185, 129, 0.15); color: #10b981; }
    .badge-added { background: rgba(139, 92, 246, 0.15); color: #a78bfa; }
    .badge-removed { background: rgba(239, 68, 68, 0.15); color: #f87171; }
    .type-tag { font-size: 0.75rem; background: #0f172a; padding: 0.2rem 0.5rem; border-radius: 4px; color: #94a3b8; }
    .unused-list { list-style: none; display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem; }
    .unused-item { background: #0f172a; border: 1px solid var(--card-border); border-radius: 6px; padding: 0.3rem 0.6rem; font-size: 0.85rem; display: flex; align-items: center; gap: 0.4rem; }
    .badge-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--yellow); }
    .tag { font-size: 0.7rem; color: var(--text-muted); background: #334155; padding: 0.1rem 0.3rem; border-radius: 4px; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="title-group">
        <h1>🔄 SyncMyDep Report</h1>
        <p>Project: <strong>${escapeHtml(data.projectName)}</strong> | Generated at ${escapeHtml(data.timestamp)}</p>
      </div>
      <div class="header-badges">
        <span class="badge">📦 ${escapeHtml(data.pm)}</span>
        <span class="badge" style="border: 1px solid ${riskBadgeColor}; color: ${riskBadgeColor};">🛡️ ${escapeHtml(riskLevel.toUpperCase())} RISK</span>
      </div>
    </header>

    <div class="grid-kpi">
      <div class="card">
        <div class="card-title">Modified Dependencies</div>
        <div class="card-val" style="color: var(--blue);">${(data.diffs || []).length}</div>
        <div class="card-sub">Manifest & lockfile packages adjusted</div>
      </div>
      <div class="card">
        <div class="card-title">Security Vulnerabilities</div>
        <div class="card-val" style="color: ${totalVulnerabilities === 0 ? "var(--green)" : "var(--red)"};">${totalVulnerabilities}</div>
        <div class="card-sub">${criticalVulns} critical, ${highVulns} high, ${moderateVulns} moderate, ${lowVulns} low</div>
      </div>
      <div class="card">
        <div class="card-title">Breaking Risk Score</div>
        <div class="card-val" style="color: ${riskBadgeColor};">${riskScoreNum}/10</div>
        <div class="card-sub">${escapeHtml(data.riskScore?.summary || "All updates backwards-compatible")}</div>
      </div>
      <div class="card">
        <div class="card-title">Unused Packages</div>
        <div class="card-val" style="color: var(--yellow);">${data.unusedDeps?.totalUnused ?? 0}</div>
        <div class="card-sub">Scanned in ${data.unusedDeps?.scannedFilesCount ?? 0} source files</div>
      </div>
    </div>

    ${(data.unusedDeps?.totalUnused ?? 0) > 0 ? `
    <div class="card" style="margin-bottom: 2rem;">
      <div class="card-title">🧹 Detected Unused Dependencies</div>
      <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 0.5rem;">These packages are present in <code>package.json</code> but have no imports in your source code:</p>
      <ul class="unused-list">
        ${unusedProdItems}
        ${unusedDevItems}
      </ul>
    </div>
    ` : ""}

    <div class="card">
      <div class="controls">
        <div class="filters">
          <button class="filter-btn active" data-filter="all">All (${(data.diffs || []).length})</button>
          <button class="filter-btn" data-filter="upgraded">Upgraded</button>
          <button class="filter-btn" data-filter="downgraded">Reconciled</button>
          <button class="filter-btn" data-filter="added">Added</button>
          <button class="filter-btn" data-filter="removed">Removed</button>
        </div>
        <input type="text" id="searchInput" class="search-box" placeholder="🔍 Search package name..." />
      </div>

      <div style="overflow-x: auto;">
        <table>
          <thead>
            <tr>
              <th>Package Name</th>
              <th>Type</th>
              <th>Old Version</th>
              <th>New Version</th>
              <th>Status</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody id="depTableBody">
            ${diffRows || "<tr><td colspan=\"6\" style=\"text-align:center;color:#94a3b8;padding:2rem;\">No dependency changes recorded.</td></tr>"}
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <script>
    const searchInput = document.getElementById("searchInput");
    const filterBtns = document.querySelectorAll(".filter-btn");
    const rows = document.querySelectorAll(".dep-row");

    let currentFilter = "all";
    let searchQuery = "";

    function filterRows() {
      rows.forEach(row => {
        const name = row.getAttribute("data-name") || "";
        const change = row.getAttribute("data-change") || "";
        const matchesFilter = currentFilter === "all" || change === currentFilter;
        const matchesSearch = !searchQuery || name.includes(searchQuery);

        row.style.display = matchesFilter && matchesSearch ? "" : "none";
      });
    }

    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        searchQuery = e.target.value.toLowerCase().trim();
        filterRows();
      });
    }

    filterBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        filterBtns.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        currentFilter = btn.getAttribute("data-filter") || "all";
        filterRows();
      });
    });
  </script>
</body>
</html>`;

  fs.writeFileSync(outputPath, html);
  return { html, outputPath };
}