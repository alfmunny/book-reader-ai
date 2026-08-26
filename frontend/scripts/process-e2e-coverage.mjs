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
// istanbul-lib-coverage is CommonJS: named imports throw at module load, which
// happens before main()'s catch can write a fallback summary. Default-import
// and destructure instead.
import istanbulLibCoverage from "istanbul-lib-coverage";

const { createCoverageMap } = istanbulLibCoverage;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Overridable so the directories can be pointed at fixtures under test.
const V8_DIR = process.env.E2E_COVERAGE_IN || path.join(__dirname, "..", ".v8-coverage");
const OUT_DIR = process.env.E2E_COVERAGE_OUT || path.join(__dirname, "..", "coverage-e2e");

/**
 * v8-to-istanbul needs a non-empty path: it stamps it onto the coverage object,
 * and coverageMap.merge() rejects one whose `path` is blank ("Invalid file
 * coverage object"). Deriving it from the entry URL also keys the map per
 * bundle, so the same file seen by several specs merges instead of colliding.
 */
function scriptPath(url, fallbackId) {
  try {
    const { pathname } = new URL(url);
    if (pathname && pathname !== "/") return pathname;
  } catch {
    // Not an absolute URL — fall through to the synthetic name.
  }
  return `/unparsed/${fallbackId}.js`;
}

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

  let skipped = 0;
  for (const file of files) {
    const entries = JSON.parse(fs.readFileSync(path.join(V8_DIR, file), "utf8"));
    for (const [i, entry] of entries.entries()) {
      // Without inline source, v8-to-istanbul falls back to reading the derived
      // path off disk and fails with ENOENT. Nothing to measure either way.
      if (!entry.source) {
        skipped++;
        continue;
      }
      try {
        const converter = v8toIstanbul(scriptPath(entry.url, `${file}:${i}`), 0, {
          source: entry.source,
        });
        await converter.load();
        converter.applyCoverage(entry.functions ?? []);
        const data = converter.toIstanbul();
        coverageMap.merge(data);
        processedEntries++;
      } catch (e) {
        // Some entries can't be converted (e.g. eval scripts). Count them, so a
        // wholesale conversion failure can't masquerade as "no coverage".
        skipped++;
        if (skipped <= 3) console.log(`  skipped an entry: ${e.message}`);
      }
    }
  }
  if (skipped > 0) console.log(`Skipped ${skipped} entries that could not be converted.`);

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
