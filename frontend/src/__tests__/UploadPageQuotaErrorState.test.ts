/**
 * Source-level regression tests for upload page quota fetch error state (issue #2423).
 */
import fs from "fs";
import path from "path";

const SOURCE_PATH = path.resolve(__dirname, "../app/(shell)/upload/page.tsx");
const SOURCE = fs.readFileSync(SOURCE_PATH, "utf8");

describe("Upload page — quota fetch error state (issue #2423)", () => {
  it("declares quotaFetchError state", () => {
    expect(SOURCE).toMatch(/quotaFetchError/);
  });

  it("declares quotaRetryTick state", () => {
    expect(SOURCE).toMatch(/quotaRetryTick/);
  });

  it("sets quotaFetchError on getUploadQuota rejection (no silent .catch(() => {}))", () => {
    const effectStart = SOURCE.indexOf("getUploadQuota");
    expect(effectStart).toBeGreaterThan(0);
    const effectEnd = SOURCE.indexOf("}, [status", effectStart);
    const effectBlock = SOURCE.slice(effectStart, effectEnd + 50);

    expect(effectBlock).toMatch(/setQuotaFetchError\s*\(\s*true\s*\)/);
  });

  it("renders error UI with retry when quotaFetchError is true", () => {
    expect(SOURCE).toMatch(/Couldn(?:&apos;|')t load quota|[Ff]ailed to load quota|[Cc]ouldn(?:&apos;|')t load/);
    expect(SOURCE).toMatch(/setQuotaRetryTick/);
  });

  it("error branch appears before the quota bar render", () => {
    const errorIdx = SOURCE.indexOf("quotaFetchError");
    const quotaBarIdx = SOURCE.indexOf("quota !== null");
    expect(errorIdx).toBeGreaterThan(0);
    expect(quotaBarIdx).toBeGreaterThan(0);
    expect(errorIdx).toBeLessThan(quotaBarIdx);
  });
});
