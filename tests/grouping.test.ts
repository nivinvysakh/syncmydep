import { matchPackagePattern, matchesGroupRule, groupDependencyDiffs } from "../src/grouping";
import { DependencyDiff, GroupRule } from "../src/types";

describe("grouping module", () => {
  test("matchPackagePattern matches wildcard and scoped packages correctly", () => {
    expect(matchPackagePattern("@types/node", "@types/*")).toBe(true);
    expect(matchPackagePattern("@types/react", "@types/*")).toBe(true);
    expect(matchPackagePattern("eslint-plugin-react", "eslint*")).toBe(true);
    expect(matchPackagePattern("prettier", "prettier*")).toBe(true);
    expect(matchPackagePattern("express", "@types/*")).toBe(false);
    expect(matchPackagePattern("lodash", "*")).toBe(true);
  });

  test("matchesGroupRule filters by type, changeType, and pattern", () => {
    const diff: DependencyDiff = {
      name: "@types/jest",
      type: "dev",
      changeType: "upgraded",
      oldVersion: "29.0.0",
      newVersion: "29.5.0"
    };

    const ruleDevTypes: GroupRule = {
      name: "Types",
      patterns: ["@types/*"],
      types: ["dev"]
    };
    expect(matchesGroupRule(diff, ruleDevTypes)).toBe(true);

    const ruleProdOnly: GroupRule = {
      name: "Prod Types",
      patterns: ["@types/*"],
      types: ["prod"]
    };
    expect(matchesGroupRule(diff, ruleProdOnly)).toBe(false);
  });

  test("groupDependencyDiffs categorizes diffs into default ecosystem groups", () => {
    const diffs: DependencyDiff[] = [
      { name: "@types/node", type: "dev", changeType: "upgraded", oldVersion: "18.0.0", newVersion: "20.0.0" },
      { name: "eslint", type: "dev", changeType: "upgraded", oldVersion: "8.0.0", newVersion: "9.0.0" },
      { name: "react", type: "prod", changeType: "upgraded", oldVersion: "18.2.0", newVersion: "18.3.0" },
      { name: "axios", type: "prod", changeType: "upgraded", oldVersion: "1.6.0", newVersion: "1.7.0" }
    ];

    const groups = groupDependencyDiffs(diffs);
    expect(groups.length).toBeGreaterThan(0);

    const typeGroup = groups.find((g) => g.name === "TypeScript & Type Definitions");
    expect(typeGroup).toBeDefined();
    expect(typeGroup?.diffs.some((d) => d.name === "@types/node")).toBe(true);

    const lintGroup = groups.find((g) => g.name === "Linters & Code Formatters");
    expect(lintGroup).toBeDefined();
    expect(lintGroup?.diffs.some((d) => d.name === "eslint")).toBe(true);

    const frameworkGroup = groups.find((g) => g.name === "Frontend Frameworks & UI");
    expect(frameworkGroup).toBeDefined();
    expect(frameworkGroup?.diffs.some((d) => d.name === "react")).toBe(true);

    const generalGroup = groups.find((g) => g.name === "General Dependencies");
    expect(generalGroup).toBeDefined();
    expect(generalGroup?.diffs.some((d) => d.name === "axios")).toBe(true);
  });
});
