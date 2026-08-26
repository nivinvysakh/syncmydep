import * as fs from 'fs';
import * as path from 'path';
import {
  detectPackageManager,
  detectYarnVariant,
  checkPackageJsonExists,
  inspectAudit
} from './detector';
import {
  syncLockfile,
  runAuditFix,
  runDedupe,
  getGitStatus,
  verifyLockfileIntegrity
} from './fixer';
import { loadConfigFile } from './config';
import { detectWorkspace } from './workspace';
import { AuditInspectionResult } from './types';

export function parseBool(val: string | undefined, defaultVal: boolean): boolean {
  if (val === undefined || val === '') return defaultVal;
  return val.toLowerCase() === 'true' || val === '1';
}

function cleanLogOutput(raw: string): string {
  if (!raw || !raw.trim()) return '_No output reported._';
  return '```text\n' + raw.trim() + '\n```';
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
  checkOnly: boolean;
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

---

## 📊 Summary of Results
| Metric | Status / Result |
| :--- | :--- |
| **Lockfile Sync** | ${data.syncSuccess ? '✅ Successful' : '❌ Issues Encountered'} |
| **Integrity Check** | ${data.integritySuccess ? '✅ Verified' : '⚠️ Warning / Issues'} |
| **Vulnerabilities Found** | \`${vulnsBefore}\` |
| **Vulnerabilities After Fix** | \`${vulnsAfter}\` ${vulnsFixed > 0 ? `(🎉 Patched ${vulnsFixed})` : ''} |
| **Files Modified** | ${data.changedFiles.length > 0 ? data.changedFiles.map((f) => `\`${f}\``).join(', ') : '_None (Already in sync)_'} |

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
  // Ensure sub-commands don't dump hundreds of lines of noise into stdout
  process.env.SYNCMYDEP_SILENT = 'true';

  const workingDir = process.env.INPUT_WORKING_DIRECTORY || process.cwd();
  const workspaceDir = path.resolve(process.cwd(), workingDir);

  const fileConfig = loadConfigFile(workspaceDir);

  const pmInput = process.env.INPUT_PACKAGE_MANAGER || fileConfig.packageManager || 'auto';
  const syncLockfileOption = parseBool(process.env.INPUT_SYNC_LOCKFILE, fileConfig.syncLockfile ?? true);
  const fixAuditOption = parseBool(process.env.INPUT_FIX_AUDIT, fileConfig.fixAudit ?? true);
  const auditLevel = process.env.INPUT_AUDIT_LEVEL || fileConfig.auditLevel || 'moderate';
  const checkOnly = parseBool(process.env.INPUT_CHECK_ONLY, fileConfig.checkOnly ?? false);
  const dedupeOption = parseBool(process.env.INPUT_DEDUPE, fileConfig.dedupe ?? false);

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

  const pm = detectPackageManager(workspaceDir, pmInput);
  const yarnVariant = pm === 'yarn' ? detectYarnVariant(workspaceDir) : undefined;
  console.log(`⚡ Package Manager: ${pm}${yarnVariant ? ` (${yarnVariant})` : ''}`);

  if (!checkPackageJsonExists(workspaceDir, pm)) {
    console.error(`\n❌ Error: Package manifest not found in ${workspaceDir}`);
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
    const auditRes = await runAuditFix(workspaceDir, pm, auditLevel);
    auditFixLog = auditRes?.output ?? '';
    auditAfter = await inspectAudit(workspaceDir, pm);
  }

  if (dedupeOption && !checkOnly) {
    console.log(`🧹 Deduplicating dependencies...`);
    const dedupeRes = await runDedupe(workspaceDir, pm, yarnVariant);
    dedupeLog = dedupeRes?.output ?? '';
  }

  const integrity = await verifyLockfileIntegrity(workspaceDir, pm);
  if (integrity.success) {
    console.log(`✅ Lockfile:        Integrity verified`);
  } else {
    console.warn(`⚠️  Lockfile warning: ${integrity.output}`);
  }

  const { hasChanges, changedFiles } = await getGitStatus(workspaceDir);

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
    checkOnly
  });

  let dumpSaved = false;
  const dumpFilePath = path.join(workspaceDir, 'log_docker_dump.md');
  try {
    fs.writeFileSync(dumpFilePath, dumpMarkdown, 'utf-8');
    dumpSaved = true;
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.warn(`⚠️  Could not write log_docker_dump.md: ${errMsg}`);
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
    if (dumpSaved) {
      console.log(`📄 Detailed log saved to: log_docker_dump.md`);
    }
    console.log('=============================================================\n');
    process.exit(1);
  }

  if (!hasChanges) {
    console.log('✅ All dependencies and lockfiles are already in sync!');
  } else {
    console.log(`✨ Successfully synchronized and updated local files:`);
    changedFiles.forEach((file) => console.log(`   - ${file}`));
    if (auditBefore && auditAfter && auditBefore.total > auditAfter.total) {
      console.log(`🛡️  Fixed ${auditBefore.total - auditAfter.total} vulnerabilities!`);
    }
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

