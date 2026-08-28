import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { generateBadges, updateReadmeBadges } from '../src/badges';

describe('badges module', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'syncmydep-badges-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('generateBadges creates correct markdown badges', () => {
    const badges = generateBadges({
      pm: 'pnpm',
      status: 'synced',
      vulnCount: 0,
      riskLevel: 'low'
    });

    expect(badges.syncBadge).toContain('SyncMyDep-In%20Sync-2ea44f');
    expect(badges.vulnBadge).toContain('Vulnerabilities-0%20detected-brightgreen');
    expect(badges.pmBadge).toContain('Package%20Manager-pnpm-F69220');
    expect(badges.riskBadge).toContain('Risk%20Score-Low%20Risk-brightgreen');
  });

  test('generateBadges handles drift and vulnerabilities', () => {
    const badges = generateBadges({
      pm: 'bun',
      status: 'drift',
      vulnCount: 3,
      riskLevel: 'high'
    });

    expect(badges.syncBadge).toContain('SyncMyDep-Drift%20Detected-critical');
    expect(badges.vulnBadge).toContain('Vulnerabilities-3%20detected-yellow');
    expect(badges.riskBadge).toContain('Risk%20Score-High%20Risk-red');
  });

  test('updateReadmeBadges replaces existing comment block', () => {
    const initialReadme = `
# My Awesome Project

<!-- syncmydep:start -->
OLD BADGES
<!-- syncmydep:end -->

## Description
Some project description.
`;
    fs.writeFileSync(path.join(tmpDir, 'README.md'), initialReadme.trim());

    const result = updateReadmeBadges(tmpDir, 'NEW_SYNC_BADGES');
    expect(result.updated).toBe(true);

    const updatedContent = fs.readFileSync(path.join(tmpDir, 'README.md'), 'utf8');
    expect(updatedContent).toContain('NEW_SYNC_BADGES');
    expect(updatedContent).not.toContain('OLD BADGES');
    expect(updatedContent).toContain('## Description');
  });

  test('updateReadmeBadges preserves external badges outside markers', () => {
    const initialReadme = `
# My Awesome Project

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://example.com)
[![Build Status](https://img.shields.io/badge/build-passing-brightgreen)](https://example.com)

<!-- syncmydep:start -->
OLD_SYNC_BADGE
<!-- syncmydep:end -->

## Description
Some project description.
`;
    fs.writeFileSync(path.join(tmpDir, 'README.md'), initialReadme.trim());

    const result = updateReadmeBadges(tmpDir, 'NEW_SYNC_BADGE');
    expect(result.updated).toBe(true);

    const updatedContent = fs.readFileSync(path.join(tmpDir, 'README.md'), 'utf8');
    // External badges outside the comment block must remain intact
    expect(updatedContent).toContain('License: MIT');
    expect(updatedContent).toContain('build-passing');
    // Sync badge updated
    expect(updatedContent).toContain('NEW_SYNC_BADGE');
    expect(updatedContent).not.toContain('OLD_SYNC_BADGE');
  });

  test('updateReadmeBadges creates README.md if none exists', () => {
    const result = updateReadmeBadges(tmpDir, 'NEW_SYNC_BADGES');
    expect(result.updated).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'README.md'))).toBe(true);
    const content = fs.readFileSync(path.join(tmpDir, 'README.md'), 'utf8');
    expect(content).toContain('NEW_SYNC_BADGES');
  });
});
