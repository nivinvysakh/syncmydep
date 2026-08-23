import { SyncMyDepConfig } from './types';
/**
 * Loads and parses the .syncmydeprc.json configuration file if present.
 */
export declare function loadConfigFile(workspaceDir: string, customConfigPath?: string): SyncMyDepConfig;
