import { parseBool, runCli, generateDockerDumpMarkdown } from '../src/cli';
import * as detector from '../src/detector';
import * as fixer from '../src/fixer';
import * as workspace from '../src/workspace';
import * as config from '../src/config';

jest.mock('../src/detector');
jest.mock('../src/fixer');
jest.mock('../src/workspace');
jest.mock('../src/config');

describe('CLI helpers & execution', () => {
  const originalExit = process.exit;
  const originalEnv = process.env;
  let mockExit: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    mockExit = jest.fn() as unknown as jest.Mock;
    process.exit = mockExit as unknown as typeof process.exit;

    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});

    (config.loadConfigFile as jest.Mock).mockReturnValue({});
    (workspace.detectWorkspace as jest.Mock).mockReturnValue({
      isMonorepo: false,
      type: 'none',
      patterns: [],
      packages: []
    });
    (detector.detectPackageManager as jest.Mock).mockReturnValue('npm');
    (detector.checkPackageJsonExists as jest.Mock).mockReturnValue(true);
    (detector.inspectAudit as jest.Mock).mockResolvedValue({ total: 0, summary: {}, raw: {} });
    (fixer.syncLockfile as jest.Mock).mockResolvedValue({ success: true, output: '' });
    (fixer.runAuditFix as jest.Mock).mockResolvedValue({ success: true, output: '' });
    (fixer.runDedupe as jest.Mock).mockResolvedValue({ success: true, output: '' });
    (fixer.verifyLockfileIntegrity as jest.Mock).mockResolvedValue({ success: true, output: '' });
    (fixer.getGitStatus as jest.Mock).mockResolvedValue({ hasChanges: false, changedFiles: [] });
  });

  afterAll(() => {
    process.exit = originalExit;
    process.env = originalEnv;
  });

  describe('parseBool helper', () => {
    test('parses true values correctly', () => {
      expect(parseBool('true', false)).toBe(true);
      expect(parseBool('TRUE', false)).toBe(true);
      expect(parseBool('1', false)).toBe(true);
    });

    test('parses false values correctly', () => {
      expect(parseBool('false', true)).toBe(false);
      expect(parseBool('FALSE', true)).toBe(false);
      expect(parseBool('0', true)).toBe(false);
    });

    test('returns default value when undefined or empty', () => {
      expect(parseBool(undefined, true)).toBe(true);
      expect(parseBool('', false)).toBe(false);
      expect(parseBool('', true)).toBe(true);
    });
  });

  describe('runCli workflow', () => {
    test('exits 0 when everything is clean and in sync', async () => {
      await runCli();

      expect(detector.detectPackageManager).toHaveBeenCalled();
      expect(fixer.syncLockfile).toHaveBeenCalledWith(expect.any(String), 'npm', undefined);
      expect(mockExit).toHaveBeenCalledWith(0);
    });

    test('exits 1 when package manifest is missing', async () => {
      (detector.checkPackageJsonExists as jest.Mock).mockReturnValue(false);

      await runCli();

      expect(mockExit).toHaveBeenCalledWith(1);
    });

    test('check-only mode exits 0 when clean', async () => {
      process.env.INPUT_CHECK_ONLY = 'true';

      await runCli();

      expect(mockExit).toHaveBeenCalledWith(0);
    });

    test('check-only mode exits 1 when desynchronization detected', async () => {
      process.env.INPUT_CHECK_ONLY = 'true';
      (fixer.getGitStatus as jest.Mock).mockResolvedValue({
        hasChanges: true,
        changedFiles: ['package-lock.json']
      });

      await runCli();

      expect(mockExit).toHaveBeenCalledWith(1);
    });

    test('applies audit fix and dedupe when enabled', async () => {
      process.env.INPUT_FIX_AUDIT = 'true';
      process.env.INPUT_DEDUPE = 'true';
      (fixer.runAuditFix as jest.Mock).mockResolvedValue({ success: true, output: '' });
      (fixer.runDedupe as jest.Mock).mockResolvedValue({ success: true, output: '' });

      await runCli();

      expect(fixer.runAuditFix).toHaveBeenCalled();
      expect(fixer.runDedupe).toHaveBeenCalled();
      expect(mockExit).toHaveBeenCalledWith(0);
    });
  });

  describe('generateDockerDumpMarkdown helper', () => {
    test('generates complete markdown report', () => {
      const md = generateDockerDumpMarkdown({
        workspaceDir: '/dummy/workspace',
        pm: 'npm',
        isMonorepo: false,
        syncSuccess: true,
        syncLog: 'up to date in 200ms',
        auditBefore: { total: 5, summary: {}, raw: {} },
        auditAfter: { total: 0, summary: {}, raw: {} },
        auditFixLog: 'fixed 5 vulnerabilities',
        dedupeLog: 'removed 2 packages',
        integritySuccess: true,
        integrityLog: 'verified',
        changedFiles: ['package-lock.json'],
        checkOnly: false
      });

      expect(md).toContain('# 🔄 SyncMyDep Execution Log Dump');
      expect(md).toContain('`npm`');
      expect(md).toContain('Patched 5');
      expect(md).toContain('fixed 5 vulnerabilities');
      expect(md).toContain('package-lock.json');
    });
  });
});
