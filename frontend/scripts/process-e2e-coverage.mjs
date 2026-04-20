#!/usr/bin/env node
/**
 * Convert V8 coverage data from Playwright E2E tests into an Istanbul
 * coverage-summary.json. Reads raw V8 entries from .v8-coverage/*.json,
 * converts each via v8-to-istanbul, and writes a merged summary.
 *
 * Usage: node scripts/process-e2e-coverage.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import v8toIstanbul from "v8-to-istanbul";
import { createCoverageMap, createCoverageSummary } from "istanbul-lib-coverage";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const V8_DIR = path.join(__dirname, "..", ".v8-coverage");
const OUT_DIR = path.join(__dirname, "..", "coverage-e2e");

function emptySummary() {
  return {
    total: {
      statements: { total: 0, covered: 0, pct: 0 },
      branches: { total: 0, covered: 0, pct: 0 },
      functions: { total: 0, covered: 0, pct: 0 },
      lines: { total: 0, covered: 0, pct: 0 },
    },
  };
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  if (!fs.existsSync(V8_DIR)) {
    console.log("No V8 coverage data found — writing empty summary.");
    fs.writeFileSync(path.join(OUT_DIR, "coverage-summary.json"), JSON.stringify(emptySummary()));
    return;
  }

  const files = fs.readdirSync(V8_DIR).filter((f) => f.endsWith(".json"));
  if (files.length === 0) {
    console.log("No coverage files found — writing empty summary.");
    fs.writeFileSync(path.join(OUT_DIR, "coverage-summary.json"), JSON.stringify(emptySummary()));
    return;
  }

  console.log(`Processing ${files.length} V8 coverage files...`);
  const coverageMap = createCoverageMap({});
  let processedEntries = 0;

  for (const file of files) {
    const entries = JSON.parse(fs.readFileSync(path.join(V8_DIR, file), "utf8"));
    for (const entry of entries) {
      try {
        const converter = v8toIstanbul("", 0, { source: entry.source ?? "" });
        await converter.load();
        converter.applyCoverage(entry.functions ?? []);
        const data = converter.toIstanbul();
        coverageMap.merge(data);
        processedEntries++;
      } catch {
        // Some entries can't be converted (e.g. eval scripts) — skip
      }
    }
  }

  console.log(`Converted ${processedEntries} entries.`);

  const summary = emptySummary();
  try {
    const totals = coverageMap.getCoverageSummary();
    summary.total.statements = totals.statements;
    summary.total.branches = totals.branches;
    summary.total.functions = totals.functions;
    summary.total.lines = totals.lines;
  } catch {
    console.log("Could not compute summary — writing zeros.");
  }

  fs.writeFileSync(
    path.join(OUT_DIR, "coverage-summary.json"),
    JSON.stringify(summary, null, 2)
  );
  console.log(`Coverage summary written to ${OUT_DIR}/coverage-summary.json`);
  console.log(
    `  Statements: ${summary.total.statements.pct}%  Branches: ${summary.total.branches.pct}%  ` +
    `Functions: ${summary.total.functions.pct}%  Lines: ${summary.total.lines.pct}%`
  );
}

main().catch((e) => {
  console.error("Coverage processing failed:", e.message);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, "coverage-summary.json"), JSON.stringify(emptySummary()));
});
