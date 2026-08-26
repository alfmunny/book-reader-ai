/**
 * scripts/process-e2e-coverage.mjs — converts Playwright's raw V8 coverage
 * into an Istanbul summary.
 *
 * It had been dead in CI: `istanbul-lib-coverage` is CommonJS, so the named
 * import threw at module load — before the script's own catch could write a
 * summary. The CI step swallows failures with `|| echo`, so it stayed silent.
 */
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

const FRONTEND = path.join(__dirname, "..", "..");
const SCRIPT = path.join(FRONTEND, "scripts", "process-e2e-coverage.mjs");

function run(env: Record<string, string>): { stdout: string; status: number } {
  try {
    const stdout = execFileSync("node", [SCRIPT], {
      cwd: FRONTEND,
      env: { ...process.env, ...env },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { stdout, status: 0 };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { stdout: `${err.stdout ?? ""}${err.stderr ?? ""}`, status: err.status ?? 1 };
  }
}

function tmpdir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "e2e-cov-"));
}

function readSummary(outDir: string) {
  return JSON.parse(fs.readFileSync(path.join(outDir, "coverage-summary.json"), "utf8"));
}

/** One entry shaped like Playwright's page.coverage.stopJSCoverage() output. */
function v8Entry(source: string, covered: boolean, url = "http://localhost:3100/_next/static/chunks/app.js") {
  return [
    {
      url,
      scriptId: "1",
      source,
      functions: [
        {
          functionName: "add",
          isBlockCoverage: true,
          ranges: [{ startOffset: 0, endOffset: source.length, count: covered ? 1 : 0 }],
        },
      ],
    },
  ];
}

test("runs to completion and reports a summary for real V8 entries", () => {
  const inDir = tmpdir();
  const outDir = tmpdir();
  const source = "function add(a, b) {\n  return a + b;\n}\nadd(1, 2);\n";
  fs.writeFileSync(path.join(inDir, "test1.json"), JSON.stringify(v8Entry(source, true)));

  const { status, stdout } = run({ E2E_COVERAGE_IN: inDir, E2E_COVERAGE_OUT: outDir });

  expect(status).toBe(0);
  expect(stdout).toContain("Converted 1 entries.");

  const summary = readSummary(outDir);
  expect(summary.total.statements.total).toBeGreaterThan(0);
  expect(summary.total.statements.pct).toBeGreaterThan(0);
  expect(summary.total.lines.total).toBeGreaterThan(0);
});

test("reports 0% rather than crashing when nothing was executed", () => {
  const inDir = tmpdir();
  const outDir = tmpdir();
  const source = "function add(a, b) {\n  return a + b;\n}\n";
  fs.writeFileSync(path.join(inDir, "test1.json"), JSON.stringify(v8Entry(source, false)));

  const { status } = run({ E2E_COVERAGE_IN: inDir, E2E_COVERAGE_OUT: outDir });

  expect(status).toBe(0);
  expect(readSummary(outDir).total.statements.pct).toBe(0);
});

test("writes an empty summary when no coverage was collected", () => {
  const outDir = tmpdir();

  const { status } = run({
    E2E_COVERAGE_IN: path.join(tmpdir(), "does-not-exist"),
    E2E_COVERAGE_OUT: outDir,
  });

  expect(status).toBe(0);
  expect(readSummary(outDir).total.statements.pct).toBe(0);
});

test("merges entries across several test files", () => {
  const inDir = tmpdir();
  const outDir = tmpdir();
  fs.writeFileSync(
    path.join(inDir, "a.json"),
    JSON.stringify(v8Entry("function add(a, b) {\n  return a + b;\n}\n", true)),
  );
  fs.writeFileSync(
    path.join(inDir, "b.json"),
    JSON.stringify(
      v8Entry("function mul(a, b) {\n  return a * b;\n}\n", true, "http://localhost:3100/_next/static/chunks/page.js"),
    ),
  );

  const { status, stdout } = run({ E2E_COVERAGE_IN: inDir, E2E_COVERAGE_OUT: outDir });

  expect(status).toBe(0);
  expect(stdout).toContain("Converted 2 entries.");
});
