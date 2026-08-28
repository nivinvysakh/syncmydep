import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { generateHtmlReport } from "../src/report";
import { ReportData } from "../src/types";

describe("report module", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "syncmydep-report-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test("generateHtmlReport produces a standalone HTML dashboard", () => {
    const reportData: ReportData = {
      projectName: "my-app",
      timestamp: "2026-08-29 00:00 UTC",
      pm: "npm",
      diffs: [
        {
          name: "react",
          type: "prod",
          oldVersion: "18.2.0",
          newVersion: "18.3.1",
          changeType: "upgraded",
          reason: "Direct Update"
        },
        {
          name: "lodash",
          type: "prod",
          oldVersion: "4.17.20",
          newVersion: "4.17.21",
          changeType: "upgraded",
          reason: "Audit Fix"
        }
      ],
      auditBefore: { total: 1, summary: { high: 1 }, raw: {} },
      auditAfter: { total: 0, summary: {}, raw: {} },
      riskScore: {
        overallLevel: "low",
        score: 9,
        badge: "Low Risk",
        summary: "Patch and minor updates only",
        factors: [],
        safeToAutoMerge: true
      },
      unusedDeps: {
        unusedProd: ["moment"],
        unusedDev: ["grunt"],
        totalUnused: 2,
        scannedFilesCount: 15
      }
    };

    const outPath = path.join(tmpDir, "report.html");
    const { html, outputPath } = generateHtmlReport(reportData, { output: outPath });

    expect(outputPath).toBe(outPath);
    expect(fs.existsSync(outPath)).toBe(true);
    expect(html).toContain("SyncMyDep Report");
    expect(html).toContain("my-app");
    expect(html).toContain("react");
    expect(html).toContain("moment");
    expect(html).toContain("LOW RISK");
  });
});
