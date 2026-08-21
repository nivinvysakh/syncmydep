const { buildMarkdownSummary } = require('../src/summary');

describe('summary builder', () => {
  test('builds accurate markdown table and stats', () => {
    const summary = buildMarkdownSummary({
      pm: 'npm',
      changedFiles: ['package.json', 'package-lock.json'],
      diffStat: 'package-lock.json | 10 +++++-----',
      syncedLockfile: true,
      fixedAudit: true,
      auditBefore: { total: 2, summary: { high: 2 } },
      auditAfter: { total: 0, summary: {} }
    });

    expect(summary).toContain('SyncMyDep: Automated Dependency Synchronization');
    expect(summary).toContain('`npm`');
    expect(summary).toContain('`package.json`');
    expect(summary).toContain('`package-lock.json`');
    expect(summary).toContain('package-lock.json | 10 +++++-----');
    expect(summary).toContain('Initial Vulnerabilities Detected**: 2');
    expect(summary).toContain('Remaining Vulnerabilities After Fix**: 0');
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
