import { DependencyDiff, DependencyGroup, GroupRule } from "./types";

export const DEFAULT_GROUP_RULES: GroupRule[] = [
  {
    name: "TypeScript & Type Definitions",
    patterns: ["@types/*", "typescript", "ts-node", "tsx", "tslib", "@types/**"],
    branchSuffix: "types",
    titlePrefix: "types"
  },
  {
    name: "Linters & Code Formatters",
    patterns: ["eslint*", "prettier*", "@eslint/*", "@typescript-eslint/*", "stylelint*", "biome*", "@biomejs/*"],
    branchSuffix: "lint",
    titlePrefix: "lint"
  },
  {
    name: "Testing & QA Tooling",
    patterns: ["jest*", "vitest*", "@testing-library/*", "playwright*", "cypress*", "mocha*", "chai*", "supertest*"],
    branchSuffix: "test",
    titlePrefix: "test"
  },
  {
    name: "Frontend Frameworks & UI",
    patterns: ["react*", "@types/react*", "vue*", "@vue/*", "@angular/*", "@sveltejs/*", "svelte*", "astro*", "next*", "nuxt*"],
    branchSuffix: "frameworks",
    titlePrefix: "ui"
  },
  {
    name: "Build & Bundlers",
    patterns: ["vite*", "webpack*", "rollup*", "esbuild*", "turbopack*", "babel*", "@babel/*", "postcss*", "tailwindcss*"],
    branchSuffix: "build",
    titlePrefix: "build"
  }
];

/**
 * Matches a package name against a glob or wildcard pattern (e.g. "@types/*", "eslint*").
 */
export function matchPackagePattern(pkgName: string, pattern: string): boolean {
  if (!pattern || !pkgName) return false;
  const normalizedPattern = pattern.trim();
  if (normalizedPattern === "*" || normalizedPattern === "**") return true;

  // Convert glob pattern to regular expression
  const escaped = normalizedPattern
    .replace(/\./g, "\\.")
    .replace(/\*\*/g, ".*")
    .replace(/\*/g, "[^/]*");

  const regex = new RegExp(`^${escaped}$`, "i");
  return regex.test(pkgName);
}

/**
 * Matches a dependency diff against a group rule.
 */
export function matchesGroupRule(diff: DependencyDiff, rule: GroupRule): boolean {
  // Check types filter if present
  if (rule.types && rule.types.length > 0 && !rule.types.includes(diff.type)) {
    return false;
  }

  // Check changeTypes filter if present
  if (rule.changeTypes && rule.changeTypes.length > 0 && !rule.changeTypes.includes(diff.changeType)) {
    return false;
  }

  // Check patterns
  if (rule.patterns && rule.patterns.length > 0) {
    return rule.patterns.some((pattern) => matchPackagePattern(diff.name, pattern));
  }

  return true;
}

/**
 * Groups a list of dependency diffs according to defined rules or default ecosystem presets.
 */
export function groupDependencyDiffs(
  diffs: DependencyDiff[],
  customRules?: GroupRule[]
): DependencyGroup[] {
  if (!diffs || diffs.length === 0) return [];

  const rules = customRules && customRules.length > 0 ? customRules : DEFAULT_GROUP_RULES;
  const groups: DependencyGroup[] = [];
  const handled = new Set<string>();

  for (const rule of rules) {
    const matchedDiffs = diffs.filter((d) => !handled.has(d.name) && matchesGroupRule(d, rule));
    if (matchedDiffs.length > 0) {
      for (const d of matchedDiffs) {
        handled.add(d.name);
      }
      groups.push({
        name: rule.name,
        diffs: matchedDiffs,
        branchSuffix: rule.branchSuffix,
        titlePrefix: rule.titlePrefix
      });
    }
  }

  // Remaining packages go to "General Dependencies"
  const remaining = diffs.filter((d) => !handled.has(d.name));
  if (remaining.length > 0) {
    groups.push({
      name: "General Dependencies",
      diffs: remaining,
      branchSuffix: "deps",
      titlePrefix: "deps"
    });
  }

  return groups;
}
