import { buildMarkdownSummary, buildCommentSummary } from '../src/summary';

describe('summary builder', () => {
  test('builds accurate markdown table and stats for new PR', () => {
    const summary = buildMarkdownSummary({
      pm: 'npm',
      changedFiles: ['package.json', 'package-lock.json'],
      diffStat: 'package-lock.json | 10 +++++-----',
      syncedLockfile: true,
      fixedAudit: true,
      auditBefore: { total: 2, summary: { high: 2 }, raw: null },
      auditAfter: { total: 0, summary: {}, raw: null }
    });

    expect(summary).toContain('SyncMyDep: Automated Dependency Synchronization');
    expect(summary).toContain('`npm`');
    expect(summary).toContain('`package.json`');
    expect(summary).toContain('`package-lock.json`');
    expect(summary).toContain('package-lock.json | 10 +++++-----');
    expect(summary).toContain('Initial Vulnerabilities Detected**: 2');
    expect(summary).toContain('Remaining Vulnerabilities After Fix**: 0');
  });

  test('builds accurate markdown comment for PR comment trigger', () => {
    const comment = buildCommentSummary({
      pm: 'npm',
      changedFiles: ['package-lock.json'],
      diffStat: 'package-lock.json | 20 ++++++++',
      syncedLockfile: true,
      fixedAudit: true,
      auditBefore: { total: 1, summary: { high: 1 }, raw: null },
      auditAfter: { total: 0, summary: {}, raw: null },
      branch: 'feature/auth-fix',
      commenter: 'nivinvysakh'
    });

    expect(comment).toContain('SyncMyDep: Dependencies Synchronized on `feature/auth-fix`');
    expect(comment).toContain('@nivinvysakh');
    expect(comment).toContain('`package-lock.json`');
    expect(comment).toContain('🔄 Synchronized & Pushed');
    expect(comment).toContain('package-lock.json | 20 ++++++++');
  });

  test('handles clean audit and skipped actions gracefully', () => {
    const summary = buildMarkdownSummary({
      pm: 'yarn',
      changedFiles: ['yarn.lock'],
      diffStat: '',
      syncedLockfile: true,
      fixedAudit: false,
      auditBefore: null,
      auditAfter: null
    });

    expect(summary).toContain('`yarn`');
    expect(summary).toContain('⏭️ Skipped');
    expect(summary).toContain('`yarn.lock`');
  });
});
