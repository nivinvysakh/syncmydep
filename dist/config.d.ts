import { SyncMyDepConfig } from './types';
/**
 * Loads and parses the .syncmydep.yml / .syncmydeprc.yml configuration file if present.
 */
export declare function loadConfigFile(workspaceDir: string, customConfigPath?: string): SyncMyDepConfig;
