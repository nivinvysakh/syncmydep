import * as fs from 'fs';
import * as path from 'path';
import { BadgeOptions, BadgeResult, PackageManager, RiskLevel } from './types';

const PM_COLORS: Record<PackageManager, { color: string; logo: string }> = {
  npm: { color: 'CB3837', logo: 'npm' },
  pnpm: { color: 'F69220', logo: 'pnpm' },
  yarn: { color: '2C8EBB', logo: 'yarn' },
  bun: { color: 'black', logo: 'bun' },
  deno: { color: '000000', logo: 'deno' }
};

/**
 * Generates Shields.io markdown badges based on SyncMyDep execution status.
 */
export function generateBadges(options: BadgeOptions = {}): BadgeResult {
  const repoLink = options.repoUrl || 'https://github.com/nivinvysakh/syncmydep';

  // 1. Sync Status Badge
  let syncLabel = 'In%20Sync';
  let syncColor = '2ea44f';
  if (options.status === 'fixed') {
    syncLabel = 'Auto--Patched';
    syncColor = 'blue';
  } else if (options.status === 'drift') {
    syncLabel = 'Drift%20Detected';
    syncColor = 'critical';
  }
  const syncBadge = `[![SyncMyDep](https://img.shields.io/badge/SyncMyDep-${syncLabel}-${syncColor}?logo=github-actions&logoColor=white)](${repoLink})`;

  // 2. Vulnerability Badge
  const vulnCount = options.vulnCount ?? 0;
  const vulnLabel = vulnCount === 0 ? '0%20detected' : `${vulnCount}%20detected`;
  const vulnColor = vulnCount === 0 ? 'brightgreen' : vulnCount > 5 ? 'critical' : 'yellow';
  const vulnBadge = `[![Vulnerabilities](https://img.shields.io/badge/Vulnerabilities-${vulnLabel}-${vulnColor}?logo=security&logoColor=white)](${repoLink})`;

  // 3. Package Manager Badge
  const pm: PackageManager = options.pm || 'npm';
  const pmInfo = PM_COLORS[pm] || { color: 'blue', logo: 'npm' };
  const pmBadge = `[![Package Manager](https://img.shields.io/badge/Package%20Manager-${pm}-${pmInfo.color}?logo=${pmInfo.logo}&logoColor=white)](${repoLink})`;

  // 4. Risk Badge
  const risk: RiskLevel = options.riskLevel || 'low';
  let riskLabel = 'Low%20Risk';
  let riskColor = 'brightgreen';
  if (risk === 'moderate') {
    riskLabel = 'Moderate%20Risk';
    riskColor = 'yellow';
  } else if (risk === 'high') {
    riskLabel = 'High%20Risk';
    riskColor = 'red';
  }
  const riskBadge = `[![Risk Score](https://img.shields.io/badge/Risk%20Score-${riskLabel}-${riskColor})](${repoLink})`;

  const combinedMarkdown = `${syncBadge} ${vulnBadge} ${pmBadge}`;

  return {
    syncBadge,
    vulnBadge,
    pmBadge,
    riskBadge,
    combinedMarkdown
  };
}

/**
 * Updates or inserts SyncMyDep status badges into README.md using comment markers.
 */
export function updateReadmeBadges(
  workspaceDir: string,
  badgeMarkdown: string
): { updated: boolean; filePath: string } {
  const readmeNames = ['README.md', 'readme.md', 'Readme.md'];
  let targetPath = '';

  for (const name of readmeNames) {
    const fullPath = path.join(workspaceDir, name);
    if (fs.existsSync(fullPath)) {
      targetPath = fullPath;
      break;
    }
  }

  if (!targetPath) {
    targetPath = path.join(workspaceDir, 'README.md');
    fs.writeFileSync(
      targetPath,
      `# Project

<!-- syncmydep:start -->
${badgeMarkdown}
<!-- syncmydep:end -->
`
    );
    return { updated: true, filePath: targetPath };
  }

  const content = fs.readFileSync(targetPath, 'utf8');
  const startMarker = '<!-- syncmydep:start -->';
  const endMarker = '<!-- syncmydep:end -->';

  const block = `${startMarker}\n${badgeMarkdown}\n${endMarker}`;

  if (content.includes(startMarker) && content.includes(endMarker)) {
    const pattern = new RegExp(`${startMarker}[\\s\\S]*?${endMarker}`, 'g');
    const updated = content.replace(pattern, block);
    fs.writeFileSync(targetPath, updated);
    return { updated: true, filePath: targetPath };
  }

  // Prepend after the first markdown heading if present
  const lines = content.split('\n');
  if (lines.length > 0 && lines[0].startsWith('# ')) {
    lines.splice(1, 0, '\n' + block + '\n');
    fs.writeFileSync(targetPath, lines.join('\n'));
    return { updated: true, filePath: targetPath };
  }

  // Prepend at the top
  fs.writeFileSync(targetPath, block + '\n\n' + content);
  return { updated: true, filePath: targetPath };
}
