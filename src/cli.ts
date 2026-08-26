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

export async function runCli(): Promise<void> {
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

  if (fixAuditOption) {
    auditBefore = await inspectAudit(workspaceDir, pm);
    if (auditBefore.total > 0) {
      console.log(`🛡️  Audit Scan:      Found ${auditBefore.total} vulnerabilities`);
    }
  }

  if (syncLockfileOption) {
    console.log(`🔄 Syncing lockfile using ${pm}...`);
    const syncRes = await syncLockfile(workspaceDir, pm, yarnVariant);
    if (!syncRes.success) {
      console.warn(`⚠️  Warning: Lockfile sync command reported issues:\n${syncRes.output}`);
    }
  }

  if (fixAuditOption && !checkOnly) {
    console.log(`🛡️  Running audit fix (${auditLevel})...`);
    await runAuditFix(workspaceDir, pm, auditLevel);
    auditAfter = await inspectAudit(workspaceDir, pm);
  }

  if (dedupeOption && !checkOnly) {
    console.log(`🧹 Deduplicating dependencies...`);
    await runDedupe(workspaceDir, pm, yarnVariant);
  }

  const integrity = await verifyLockfileIntegrity(workspaceDir, pm);
  if (integrity.success) {
    console.log(`✅ Lockfile:        Integrity verified`);
  } else {
    console.warn(`⚠️  Lockfile warning: ${integrity.output}`);
  }

  const { hasChanges, changedFiles } = await getGitStatus(workspaceDir);

  console.log('=============================================================');

  if (checkOnly) {
    if (!hasChanges && (!auditBefore || auditBefore.total === 0)) {
      console.log('✅ Check Passed: All dependencies and lockfiles are clean!');
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
  console.log('=============================================================\n');
  process.exit(0);
}

if (require.main === module) {
  runCli().catch((err) => {
    console.error('\n❌ Fatal CLI Error:', err);
    process.exit(1);
  });
}
