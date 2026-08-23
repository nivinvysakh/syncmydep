import { PackageManager } from './types';
/**
 * Checks if the detected package manager CLI is installed in PATH.
 * If missing, automatically installs it for the GitHub runner.
 */
export declare function ensurePackageManagerInstalled(pm: PackageManager): Promise<void>;
