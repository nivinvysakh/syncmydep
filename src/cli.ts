import * as fs from 'fs';
import * as path from 'path';
import {
  detectPackageManager,
  detectYarnVariant,
  checkPackageJsonExists,
  checkGitRepository,
  inspectAudit
} from './detector';
import {
  syncLockfile,
  runAuditFix,
  runDedupe,
  getGitStatus,
  verifyLockfileIntegrity,
  parseDependencyDiffs
} from './fixer';
import { loadConfigFile } from './config';
import { detectWorkspace, sanitizeWorkspaceLockfiles } from './workspace';
import { calculateRiskScore } from './risk';
import { detectUnusedDependencies, pruneUnusedDependencies } from './unused-deps';
import { generateBadges, updateReadmeBadges } from './badges';
import { AuditInspectionResult, RiskScoreResult, UnusedDependencyResult } from './types';

export function parseBool(val: string | undefined, defaultVal: boolean): boolean {
  if (val === undefined || val === '') return defaultVal;
  return val.toLowerCase() === 'true' || val === '1';
}

function cleanLogOutput(raw: string): string {
  if (!raw || !raw.trim()) return '_No output reported._';
  const clean = raw
    .replace(/\\x1b\[[0-9;]*[a-zA-Z]/g, '')
    .replace(/\[0m|\[3[0-9]m/g, '')
    .trim();
  return '```text\n' + (clean || '_No output reported._') + '\n```';
}

export function generateDockerDumpMarkdown(data: {
  workspaceDir: string;
  pm: string;
  yarnVariant?: string;
  isMonorepo: boolean;
  monorepoType?: string;
  packageCount?: number;
  syncSuccess: boolean;
  syncLog: string;
  auditBefore: AuditInspectionResult | null;
  auditAfter: AuditInspectionResult | null;
  auditFixLog: string;
  dedupeLog: string;
  integritySuccess: boolean;
  integrityLog: string;
  changedFiles: string[];
  sanitizedLockfiles?: string[];
  checkOnly: boolean;
  riskScore?: RiskScoreResult;
  unusedDeps?: UnusedDependencyResult;
}): string {
  const timestamp = new Date().toISOString();
  const vulnsBefore = data.auditBefore?.total ?? 0;
  const vulnsAfter = data.auditAfter?.total ?? 0;
  const vulnsFixed = Math.max(0, vulnsBefore - vulnsAfter);

  return `# 🔄 SyncMyDep Execution Log Dump

> Generated on \`${timestamp}\` during local runner execution.

---

## 📋 Environment Overview
- **Workspace Directory**: \`${data.workspaceDir}\`
- **Package Manager**: \`${data.pm}${data.yarnVariant ? ` (${data.yarnVariant})` : ''}\`
- **Workspace Type**: ${data.isMonorepo ? `\`Monorepo (${data.monorepoType}, ${data.packageCount} packages)\`` : '`Single Package`'}
- **Mode**: ${data.checkOnly ? '`Check-Only (CI Linter)`' : '`Full Auto-Fix & Sync`'}
${data.riskScore ? `- **Breaking Change Risk**: ${data.riskScore.badge}\n` : ''}
---

## 📊 Summary of Results
| Metric | Status / Result |
| :--- | :--- |
| **Lockfile Sync** | ${data.syncSuccess ? '✅ Successful' : '❌ Issues Encountered'} |
| **Integrity Check** | ${data.integritySuccess ? '✅ Verified' : '⚠️ Warning / Issues'} |
| **Ghost Lockfiles Purged** | ${data.sanitizedLockfiles && data.sanitizedLockfiles.length > 0 ? `🧹 Removed ${data.sanitizedLockfiles.length} (${data.sanitizedLockfiles.map((f) => `\`${f}\``).join(', ')})` : '_None (Clean workspace)_'} |
| **Vulnerabilities Found** | \`${vulnsBefore}\` |
| **Vulnerabilities After Fix** | \`${vulnsAfter}\` ${vulnsFixed > 0 ? `(🎉 Patched ${vulnsFixed})` : ''} |
${data.unusedDeps ? `| **Unused Dependencies** | \`${data.unusedDeps.totalUnused}\` candidate(s) |\n` : ''}| **Files Modified** | ${data.changedFiles.length > 0 ? data.changedFiles.map((f) => `\`${f}\``).join(', ') : '_None (Already in sync)_'} |

---

## 🔄 Lockfile Synchronization Logs
${cleanLogOutput(data.syncLog)}

---

## 🛡️ Security Audit & Fix Logs
### Initial Audit Scan
- Total Vulnerabilities: \`${vulnsBefore}\`
${data.auditBefore ? `\`\`\`json\n${JSON.stringify(data.auditBefore.summary, null, 2)}\n\`\`\`` : '_Scan skipped_'}

### Audit Fix Output
${cleanLogOutput(data.auditFixLog)}

---

## 🧹 Lockfile Deduplication Logs
${cleanLogOutput(data.dedupeLog)}

---

## 🔍 Lockfile Integrity Verification Logs
${cleanLogOutput(data.integrityLog)}
`;
}

export async function runCli(): Promise<void> {
  // Ensure sub-commands don't dump hundreds of lines of noise into stdout and run in non-interactive CI mode
  process.env.SYNCMYDEP_SILENT = 'true';
  process.env.CI = 'true';

  const args = process.argv.slice(2);
  const command = args[0]?.toLowerCase();

  const workingDir = process.env.INPUT_WORKING_DIRECTORY || process.cwd();
  const workspaceDir = path.resolve(process.cwd(), workingDir);

  const fileConfig = loadConfigFile(workspaceDir);

  // Subcommand: prune
  if (command === 'prune') {
    console.log('\n=============================================================');
    console.log('            🧹 SyncMyDep: Unused Dependency Pruner           ');
    console.log('=============================================================');
    console.log(`📁 Directory: ${workspaceDir}`);
    const unused = detectUnusedDependencies(workspaceDir, {
      ignorePackages: fileConfig.ignoreUnusedPackages,
      checkDevDeps: true
    });

    if (unused.totalUnused === 0) {
      console.log('✅ No unused dependencies detected. Your project is clean!');
      console.log('=============================================================\n');
      return;
    }

    console.log(`🧹 Found ${unused.totalUnused} unused package(s):`);
    if (unused.unusedProd.length > 0) console.log(`   - Production: ${unused.unusedProd.join(', ')}`);
    if (unused.unusedDev.length > 0) console.log(`   - Development: ${unused.unusedDev.join(', ')}`);

    const allUnused = [...unused.unusedProd, ...unused.unusedDev];
    const { pruned } = pruneUnusedDependencies(workspaceDir, allUnused);
    console.log(`✨ Pruned ${pruned.length} package(s) from package.json!`);
    const pm = detectPackageManager(workspaceDir, fileConfig.packageManager);
    console.log(`🔄 Synchronizing lockfile using ${pm}...`);
    await syncLockfile(workspaceDir, pm);
    console.log('✅ Pruning and lockfile synchronization complete!');
    console.log('=============================================================\n');
    return;
  }

  // Subcommand: badge
  if (command === 'badge') {
    const shouldUpdate = args.includes('--update') || Boolean(fileConfig.updateReadmeBadge);
    const pm = detectPackageManager(workspaceDir, fileConfig.packageManager);
    const badges = generateBadges({ pm, status: 'synced', vulnCount: 0, riskLevel: 'low' });

    console.log('\n=============================================================');
    console.log('            📊 SyncMyDep: README Status Badges               ');
    console.log('=============================================================');
    console.log(badges.combinedMarkdown);

    if (shouldUpdate) {
      const res = updateReadmeBadges(workspaceDir, badges.combinedMarkdown);
      console.log(`\n✅ Successfully updated README badges at: ${res.filePath}`);
    } else {
      console.log('\n💡 Tip: Run `syncmydep badge --update` to insert these badges into README.md automatically.');
    }
    console.log('=============================================================\n');
    return;
  }

  const pmInput = process.env.INPUT_PACKAGE_MANAGER || fileConfig.packageManager || 'auto';
  const syncLockfileOption = parseBool(process.env.INPUT_SYNC_LOCKFILE, fileConfig.syncLockfile ?? true);
  const fixAuditOption = parseBool(process.env.INPUT_FIX_AUDIT, fileConfig.fixAudit ?? true);
  const auditLevel = process.env.INPUT_AUDIT_LEVEL || fileConfig.auditLevel || 'moderate';
  const checkOnly = parseBool(process.env.INPUT_CHECK_ONLY, fileConfig.checkOnly ?? false);
  const dedupeOption = parseBool(process.env.INPUT_DEDUPE, fileConfig.dedupe ?? false);
  const detectUnusedOption = parseBool(process.env.INPUT_DETECT_UNUSED_DEPS, fileConfig.detectUnusedDeps ?? true);

  console.log('\n=============================================================');
  console.log('                 🔄 SyncMyDep Local Runner                  ');
  console.log('=============================================================');
  console.log(`📁 Directory:       ${workspaceDir}`);

  const workspaceInfo = detectWorkspace(workspaceDir);
  if (workspaceInfo.isMonorepo) {
    console.log(`🏢 Workspace:       Monorepo (${workspaceInfo.type}, ${workspaceInfo.packages.length} packages)`);
  } else {
    console.log(`📦 Workspace:       Single Package`);
  }

  // Ghost Lockfile Cleanup (Workspace Sanitation)
  const sanitizedLockfiles = sanitizeWorkspaceLockfiles(workspaceDir, workspaceInfo);
  if (sanitizedLockfiles.length > 0) {
    console.log(`🧹 Sanitation:      Removed ${sanitizedLockfiles.length} ghost lockfile(s) (${sanitizedLockfiles.join(', ')})`);
  }

  const pm = detectPackageManager(workspaceDir, pmInput);
  const yarnVariant = pm === 'yarn' ? detectYarnVariant(workspaceDir) : undefined;
  console.log(`⚡ Package Manager: ${pm}${yarnVariant ? ` (${yarnVariant})` : ''}`);

  if (!checkPackageJsonExists(workspaceDir, pm)) {
    console.error(`\n❌ Error: Package manifest not found in ${workspaceDir}`);
    console.log('=============================================================\n');
    process.exit(1);
  }

  const isGitRepo = await checkGitRepository(workspaceDir);
  if (!isGitRepo) {
    console.error(`\n❌ Error: '${workspaceDir}' is not an initialized Git repository!`);
    console.error('   SyncMyDep requires Git to track lockfile drift and detect modified files.\n');
    console.warn('💡 Tip: Initialize git in this directory by running:');
    console.warn('   git init');
    console.warn('   git add .');
    console.warn('   git commit -m "chore: initial commit"');
    console.log('=============================================================\n');
    process.exit(1);
  }

  let auditBefore: AuditInspectionResult | null = null;
  let auditAfter: AuditInspectionResult | null = null;
  let syncSuccess = true;
  let syncLog = '';
  let auditFixLog = '';
  let dedupeLog = '';

  if (fixAuditOption) {
    auditBefore = await inspectAudit(workspaceDir, pm);
    if (auditBefore.total > 0) {
      console.log(`🛡️  Audit Scan:      Found ${auditBefore.total} vulnerabilities`);
    }
  }

  if (syncLockfileOption) {
    console.log(`🔄 Syncing lockfile using ${pm}...`);
    const syncRes = await syncLockfile(workspaceDir, pm, yarnVariant);
    syncSuccess = syncRes.success;
    syncLog = syncRes.output;
  }

  if (fixAuditOption && !checkOnly) {
    console.log(`🛡️  Running audit fix (${auditLevel})...`);
    const auditRes = await runAuditFix(workspaceDir, pm, auditLevel, yarnVariant);
    auditFixLog = auditRes?.output ?? '';
    auditAfter = await inspectAudit(workspaceDir, pm);
  }

  if (dedupeOption && !checkOnly) {
    console.log(`🧹 Deduplicating dependencies...`);
    const dedupeRes = await runDedupe(workspaceDir, pm, yarnVariant);
    dedupeLog = dedupeRes?.output ?? '';
  }

  let unusedDeps: UnusedDependencyResult | undefined;
  if (detectUnusedOption) {
    unusedDeps = detectUnusedDependencies(workspaceDir, {
      ignorePackages: fileConfig.ignoreUnusedPackages,
      checkDevDeps: true
    });
    if (unusedDeps.totalUnused > 0) {
      console.log(`🧹 Unused Deps:     Found ${unusedDeps.totalUnused} candidate(s)`);
    }
  }

  const integrity = await verifyLockfileIntegrity(workspaceDir, pm, yarnVariant);
  if (integrity.success) {
    console.log(`✅ Lockfile:        Integrity verified`);
  } else {
    console.warn(`⚠️  Lockfile warning: ${integrity.output}`);
  }

  const { hasChanges, changedFiles } = await getGitStatus(workspaceDir);
  const diffs = await parseDependencyDiffs(workspaceDir, changedFiles);
  const riskScore = calculateRiskScore(diffs);

  // Write markdown dump file
  const dumpMarkdown = generateDockerDumpMarkdown({
    workspaceDir,
    pm,
    yarnVariant,
    isMonorepo: workspaceInfo.isMonorepo,
    monorepoType: workspaceInfo.type,
    packageCount: workspaceInfo.packages.length,
    syncSuccess,
    syncLog,
    auditBefore,
    auditAfter,
    auditFixLog,
    dedupeLog,
    integritySuccess: integrity.success,
    integrityLog: integrity.output,
    changedFiles,
    sanitizedLockfiles,
    checkOnly,
    riskScore,
    unusedDeps
  });

  let dumpSaved = false;
  const dumpFilePath = path.join(workspaceDir, 'log_docker_dump.md');
  try {
    if (fs.existsSync(dumpFilePath)) {
      try {
        fs.unlinkSync(dumpFilePath);
      } catch {
        // ignore unlink attempt
      }
    }
    fs.writeFileSync(dumpFilePath, dumpMarkdown, { encoding: 'utf-8', flag: 'w', mode: 0o666 });
    dumpSaved = true;
  } catch {
    dumpSaved = false;
  }

  console.log('=============================================================');

  if (checkOnly) {
    if (!hasChanges && (!auditBefore || auditBefore.total === 0)) {
      console.log('✅ Check Passed: All dependencies and lockfiles are clean!');
      if (dumpSaved) {
        console.log(`📄 Detailed log saved to: log_docker_dump.md`);
      }
      console.log('=============================================================\n');
      process.exit(0);
    }

    console.error('❌ Check Failed: Desynchronization or vulnerabilities detected!');
    if (changedFiles.length > 0) {
      console.error(`📄 Modified files: ${changedFiles.join(', ')}`);
    }
    if (auditBefore && auditBefore.total > 0) {
      console.error(`🛡️  Vulnerabilities: ${auditBefore.total} detected`);
    }

    console.warn('\n⚠️  ACTION REQUIRED:');
    console.warn('   Your repository has uncommitted lockfile drift or security issues.');
    console.warn('   Please synchronize and commit your changes, then rerun:');
    console.warn('   1. Auto-fix: `docker run --rm -v "$(pwd)":/workspace syncmydep:latest`');
    console.warn('   2. Commit:   `git add . && git commit -m "chore(deps): sync lockfile"`');
    console.warn('   3. Re-run:   `docker run --rm -v "$(pwd)":/workspace -e INPUT_CHECK_ONLY="true" syncmydep:latest`');

    if (dumpSaved) {
      console.log(`\n📄 Detailed log saved to: log_docker_dump.md`);
    }
    console.log('=============================================================\n');
    process.exit(1);
  }

  if (!hasChanges) {
    console.log('✅ All dependencies and lockfiles are already in sync!');
  } else {
    console.log(`✨ Successfully synchronized and updated local files:`);
    changedFiles.forEach((file) => console.log(`   - ${file}`));
    console.log(`🛡️  Risk Level:      ${riskScore.badge}`);
    if (auditBefore && auditAfter && auditBefore.total > auditAfter.total) {
      console.log(`🛡️  Fixed ${auditBefore.total - auditAfter.total} vulnerabilities!`);
    }
    console.log('\n💡 Don\'t forget to commit your updated files:');
    console.log(`   git add ${changedFiles.join(' ')}`);
    console.log(`   git commit -m "chore(deps): synchronize lockfiles and dependencies"`);
  }

  if (dumpSaved) {
    console.log(`📄 Detailed execution log saved to: log_docker_dump.md`);
  }
  console.log('=============================================================\n');
  process.exit(0);
}

if (process.env.JEST_WORKER_ID === undefined) {
  runCli().catch((err) => {
    console.error('\n❌ Fatal CLI Error:', err);
    process.exit(1);
  });
}

