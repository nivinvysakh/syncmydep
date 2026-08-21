const fs = require('fs');
const path = require('path');
const { detectPackageManager, checkPackageJsonExists, getLockfileName } = require('../src/detector');

describe('detector', () => {
  const tempDir = path.join(__dirname, 'fixtures');

  beforeAll(() => {
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
  });

  afterAll(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('getLockfileName returns corresponding lockfile', () => {
    expect(getLockfileName('npm')).toBe('package-lock.json');
    expect(getLockfileName('yarn')).toBe('yarn.lock');
    expect(getLockfileName('pnpm')).toBe('pnpm-lock.yaml');
  });

  test('detectPackageManager respects explicit package manager input', () => {
    expect(detectPackageManager(tempDir, 'yarn')).toBe('yarn');
    expect(detectPackageManager(tempDir, 'pnpm')).toBe('pnpm');
    expect(detectPackageManager(tempDir, 'npm')).toBe('npm');
  });

  test('checkPackageJsonExists returns true if file exists', () => {
    const pkgPath = path.join(tempDir, 'package.json');
    fs.writeFileSync(pkgPath, JSON.stringify({ name: 'test' }));
    expect(checkPackageJsonExists(tempDir)).toBe(true);
    fs.unlinkSync(pkgPath);
    expect(checkPackageJsonExists(tempDir)).toBe(false);
  });

  test('detectPackageManager detects pnpm from pnpm-lock.yaml', () => {
    const pnpmPath = path.join(tempDir, 'pnpm-lock.yaml');
    fs.writeFileSync(pnpmPath, '');
    expect(detectPackageManager(tempDir, 'auto')).toBe('pnpm');
    fs.unlinkSync(pnpmPath);
  });

  test('detectPackageManager detects yarn from yarn.lock', () => {
    const yarnPath = path.join(tempDir, 'yarn.lock');
    fs.writeFileSync(yarnPath, '');
    expect(detectPackageManager(tempDir, 'auto')).toBe('yarn');
    fs.unlinkSync(yarnPath);
  });

  test('detectPackageManager defaults to npm if package-lock.json exists or no lockfile', () => {
    expect(detectPackageManager(tempDir, 'auto')).toBe('npm');
  });
});
