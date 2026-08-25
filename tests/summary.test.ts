import { buildMarkdownSummary, buildCommentSummary } from '../src/summary';

describe('summary builder', () => {
  test('builds accurate markdown table and stats for new PR with monorepo & diffs', () => {
    const summary = buildMarkdownSummary({
      pm: 'pnpm',
      workspaceInfo: {
        isMonorepo: true,
        type: 'pnpm',
        patterns: ['packages/*'],
        packages: ['packages/core', 'packages/web']
      },
      changedFiles: ['package.json', 'pnpm-lock.yaml'],
      diffStat: 'pnpm-lock.yaml | 10 +++++-----',
      dependencyDiffs: [
        { name: 'typescript', type: 'prod', oldVersion: '5.0.0', newVersion: '5.5.0', changeType: 'upgraded' },
        { name: 'zod', type: 'prod', newVersion: '3.22.0', changeType: 'added' }
      ],
      syncedLockfile: true,
      fixedAudit: true,
      auditBefore: { total: 2, summary: { high: 2 }, raw: null },
      auditAfter: { total: 0, summary: {}, raw: null }
    });

    expect(summary).toContain('SyncMyDep: Automated Dependency Synchronization');
    expect(summary).toContain('`pnpm`');
    expect(summary).toContain('Monorepo / Workspace**: `pnpm` (2 workspace packages)');
    expect(summary).toContain('`typescript`');
    expect(summary).toContain('`5.0.0`');
    expect(summary).toContain('`5.5.0`');
    expect(summary).toContain('`zod`');
    expect(summary).toContain('✨ Added');
    expect(summary).toContain('pnpm-lock.yaml | 10 +++++-----');
  });

  test('builds accurate markdown comment for PR comment trigger with Yarn Berry', () => {
    const comment = buildCommentSummary({
      pm: 'yarn',
      yarnVariant: 'berry',
      changedFiles: ['yarn.lock'],
      diffStat: 'yarn.lock | 20 ++++++++',
      syncedLockfile: true,
      fixedAudit: true,
      auditBefore: { total: 1, summary: { high: 1 }, raw: null },
      auditAfter: { total: 0, summary: {}, raw: null },
      branch: 'feature/auth-fix',
      commenter: 'nivinvysakh'
    });

    expect(comment).toContain('SyncMyDep: Dependencies Synchronized on `feature/auth-fix`');
    expect(comment).toContain('`yarn (berry)`');
    expect(comment).toContain('@nivinvysakh');
    expect(comment).toContain('`yarn.lock`');
    expect(comment).toContain('🔄 Synchronized & Pushed');
  });

  test('handles clean audit and skipped actions gracefully', () => {
    const summary = buildMarkdownSummary({
      pm: 'bun',
      changedFiles: ['bun.lock'],
      diffStat: '',
      syncedLockfile: true,
      fixedAudit: false,
      auditBefore: null,
      auditAfter: null
    });

    expect(summary).toContain('`bun`');
    expect(summary).toContain('⏭️ Skipped');
    expect(summary).toContain('`bun.lock`');
  });

  test('renders CVE vulnerability advisory disclosure table and verification badges', () => {
    const summary = buildMarkdownSummary({
      pm: 'npm',
      changedFiles: ['package-lock.json'],
      diffStat: 'package-lock.json | 50 +++',
      dependencyDiffs: [
        {
          name: 'axios',
          type: 'prod',
          oldVersion: '0.21.1',
          newVersion: '1.7.4',
          changeType: 'upgraded',
          reason: 'Audit Fix'
        }
      ],
      syncedLockfile: true,
      fixedAudit: true,
      lockfileVerified: true,
      buildResult: {
        command: 'npm run build',
        success: true,
        output: 'Build successful'
      },
      auditBefore: {
        total: 1,
        summary: { high: 1 },
        advisories: [
          {
            id: 'GHSA-cph5-m8f7-6c5x',
            package: 'axios',
            severity: 'high',
            title: 'Server-Side Request Forgery in axios',
            patchedVersions: '>=1.7.4',
            url: 'https://github.com/advisories/GHSA-cph5-m8f7-6c5x'
          }
        ],
        raw: null
      },
      auditAfter: { total: 0, summary: {}, advisories: [], raw: null }
    });

    expect(summary).toContain('Vulnerability & Security Advisory Disclosure');
    expect(summary).toContain('GHSA-cph5-m8f7-6c5x');
    expect(summary).toContain('`axios`');
    expect(summary).toContain('🟠 **High**');
    expect(summary).toContain('Lockfile Integrity Verification**: ✅ Passed');
    expect(summary).toContain('Build Smoke Test**: ✅ Passed (`npm run build`)');
  });
});
