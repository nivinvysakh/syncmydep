import * as fs from 'fs';
import * as path from 'path';
import * as core from '@actions/core';
import { SyncMyDepConfig } from './types';

const CONFIG_CANDIDATES = [
  '.syncmydeprc.json',
  '.syncmydeprc',
  'syncmydep.config.json',
  '.syncmydep.json'
];

/**
 * Loads and parses the .syncmydeprc.json configuration file if present.
 */
export function loadConfigFile(workspaceDir: string, customConfigPath?: string): SyncMyDepConfig {
  let targetPath: string | null = null;

  if (customConfigPath) {
    const resolved = path.isAbsolute(customConfigPath)
      ? customConfigPath
      : path.join(workspaceDir, customConfigPath);
    if (fs.existsSync(resolved)) {
      targetPath = resolved;
    } else {
      core.warning(`[SyncMyDep] Specified config-file not found: ${resolved}`);
    }
  }

  if (!targetPath) {
    for (const candidate of CONFIG_CANDIDATES) {
      const candidatePath = path.join(workspaceDir, candidate);
      if (fs.existsSync(candidatePath)) {
        targetPath = candidatePath;
        break;
      }
    }
  }

  if (!targetPath) {
    return {};
  }

  try {
    core.info(`[SyncMyDep] Found configuration file: ${targetPath}`);
    const content = fs.readFileSync(targetPath, 'utf8').trim();
    if (!content) return {};
    const parsed = JSON.parse(content) as SyncMyDepConfig;
    return parsed;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    core.warning(`[SyncMyDep] Failed to parse config file (${targetPath}): ${msg}. Using defaults.`);
    return {};
  }
}
