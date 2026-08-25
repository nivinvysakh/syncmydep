import { PackageManager, YarnVariant } from './types';
/**
 * Computes a hash of all manifest and lockfiles in the workspace to serve as cache key.
 */
export declare function computeLockfileHash(workspaceDir: string): string;
/**
 * Resolves cache directories for the active package manager.
 */
export declare function getCacheDirectories(workspaceDir: string, pm: PackageManager, yarnVariant?: YarnVariant): string[];
/**
 * Restores cached packages for faster subsequent workflow runs.
 */
export declare function restorePackageCache(workspaceDir: string, pm: PackageManager, yarnVariant?: YarnVariant): Promise<{
    restored: boolean;
    cacheKey: string;
}>;
/**
 * Saves package manager cache directories for future workflow runs.
 */
export declare function savePackageCache(workspaceDir: string, pm: PackageManager, cacheKey: string, yarnVariant?: YarnVariant): Promise<boolean>;
