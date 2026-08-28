import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  extractPackageName,
  extractImportsFromCode,
  detectUnusedDependencies,
  pruneUnusedDependencies
} from '../src/unused-deps';

describe('unused-deps module', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'syncmydep-unused-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('extractPackageName extracts root and scoped packages', () => {
    expect(extractPackageName('lodash/map')).toBe('lodash');
    expect(extractPackageName('@actions/core/lib/command')).toBe('@actions/core');
    expect(extractPackageName('react')).toBe('react');
    expect(extractPackageName('./utils/helper')).toBeNull();
    expect(extractPackageName('node:fs')).toBeNull();
  });

  test('extractImportsFromCode parses imports, requires, and dynamic imports', () => {
    const code = `
      import React, { useState } from 'react';
      import * as core from '@actions/core';
      const lodash = require('lodash');
      const mod = await import('chalk');
      export * from 'my-shared-pkg';
      import './local-styles.css';
    `;

    const imports = extractImportsFromCode(code);
    expect(imports.has('react')).toBe(true);
    expect(imports.has('@actions/core')).toBe(true);
    expect(imports.has('lodash')).toBe(true);
    expect(imports.has('chalk')).toBe(true);
    expect(imports.has('my-shared-pkg')).toBe(true);
    expect(imports.has('./local-styles.css')).toBe(false);
  });

  test('detectUnusedDependencies identifies unused dependencies in workspace', () => {
    const pkgJson = {
      name: 'demo-app',
      dependencies: {
        'used-pkg': '^1.0.0',
        'unused-pkg': '^2.0.0'
      },
      devDependencies: {
        'used-dev': '^1.0.0',
        'unused-dev': '^1.0.0',
        'typescript': '^5.0.0'
      }
    };
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify(pkgJson));

    const srcDir = path.join(tmpDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(
      path.join(srcDir, 'index.ts'),
      `import { foo } from 'used-pkg'; import bar from 'used-dev';`
    );

    const result = detectUnusedDependencies(tmpDir, { checkDevDeps: true });
    expect(result.unusedProd).toEqual(['unused-pkg']);
    expect(result.unusedDev).toEqual(['unused-dev']);
    expect(result.totalUnused).toBe(2);
    // typescript is whitelisted and should not be flagged
    expect(result.unusedDev).not.toContain('typescript');
  });

  test('pruneUnusedDependencies removes unused packages from package.json', () => {
    const pkgJson = {
      name: 'demo-app',
      dependencies: {
        'used-pkg': '^1.0.0',
        'to-remove': '^2.0.0'
      },
      devDependencies: {
        'dev-to-remove': '^1.0.0'
      }
    };
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify(pkgJson, null, 2));

    const result = pruneUnusedDependencies(tmpDir, ['to-remove', 'dev-to-remove']);
    expect(result.modified).toBe(true);
    expect(result.pruned).toEqual(['to-remove', 'dev-to-remove']);

    const updated = JSON.parse(fs.readFileSync(path.join(tmpDir, 'package.json'), 'utf8'));
    expect(updated.dependencies['to-remove']).toBeUndefined();
    expect(updated.dependencies['used-pkg']).toBe('^1.0.0');
    expect(updated.devDependencies['dev-to-remove']).toBeUndefined();
  });
});
