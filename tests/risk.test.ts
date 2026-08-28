import { parseSemVer, evaluateVersionRisk, calculateRiskScore } from '../src/risk';
import { DependencyDiff } from '../src/types';

describe('risk evaluation module', () => {
  test('parseSemVer correctly handles various version formats', () => {
    expect(parseSemVer('^1.2.3')).toEqual({ major: 1, minor: 2, patch: 3, valid: true });
    expect(parseSemVer('~0.4.1-beta.1')).toEqual({ major: 0, minor: 4, patch: 1, valid: true });
    expect(parseSemVer('v18.0.0')).toEqual({ major: 18, minor: 0, patch: 0, valid: true });
    expect(parseSemVer('invalid')).toEqual({ major: 0, minor: 0, patch: 0, valid: false });
    expect(parseSemVer('')).toEqual({ major: 0, minor: 0, patch: 0, valid: false });
  });

  test('evaluateVersionRisk flags major version jumps as high risk', () => {
    const risk = evaluateVersionRisk('lodash', '^4.17.21', '^5.0.0', 'upgraded');
    expect(risk.level).toBe('high');
    expect(risk.reason).toContain('Major SemVer jump');
  });

  test('evaluateVersionRisk flags 0.x minor jumps as high risk', () => {
    const risk = evaluateVersionRisk('fast-tool', '0.1.5', '0.2.0', 'upgraded');
    expect(risk.level).toBe('high');
    expect(risk.reason).toContain('Initial development major shift');
  });

  test('evaluateVersionRisk flags minor updates as moderate risk', () => {
    const risk = evaluateVersionRisk('express', '4.18.0', '4.19.0', 'upgraded');
    expect(risk.level).toBe('moderate');
    expect(risk.reason).toContain('Minor feature update');
  });

  test('evaluateVersionRisk flags patch updates as low risk', () => {
    const risk = evaluateVersionRisk('react', '18.2.0', '18.2.1', 'upgraded');
    expect(risk.level).toBe('low');
    expect(risk.reason).toContain('Patch / bug-fix update');
  });

  test('evaluateVersionRisk flags package removal as moderate risk', () => {
    const risk = evaluateVersionRisk('axios', '1.0.0', undefined, 'removed');
    expect(risk.level).toBe('moderate');
    expect(risk.reason).toContain('Package was removed');
  });

  test('calculateRiskScore returns low risk for empty diffs', () => {
    const result = calculateRiskScore([]);
    expect(result.overallLevel).toBe('low');
    expect(result.safeToAutoMerge).toBe(true);
  });

  test('calculateRiskScore aggregates high risk when any dependency has major bump', () => {
    const diffs: DependencyDiff[] = [
      { name: 'patch-pkg', oldVersion: '1.0.0', newVersion: '1.0.1', changeType: 'upgraded', type: 'prod' },
      { name: 'major-pkg', oldVersion: '2.4.0', newVersion: '3.0.0', changeType: 'upgraded', type: 'prod' }
    ];

    const result = calculateRiskScore(diffs);
    expect(result.overallLevel).toBe('high');
    expect(result.score).toBe(8);
    expect(result.safeToAutoMerge).toBe(false);
    expect(result.badge).toContain('High Risk');
  });
});
