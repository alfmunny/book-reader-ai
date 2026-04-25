import * as fs from "fs";
import * as path from "path";

const queueTabSrc = fs.readFileSync(
  path.join(__dirname, "../components/QueueTab.tsx"),
  "utf-8",
);

const pageSrc = fs.readFileSync(
  path.join(__dirname, "../app/page.tsx"),
  "utf-8",
);

describe("QueueTab Spinner and button spinner aria attributes", () => {
  it("Spinner component uses aria-hidden instead of aria-label", () => {
    expect(queueTabSrc).toContain('aria-hidden="true"');
    expect(queueTabSrc).not.toContain('aria-label="loading"');
  });

  it("stop-worker button spinner is aria-hidden", () => {
    expect(queueTabSrc).not.toContain('aria-label="stopping"');
  });

  it("start-worker button spinner is aria-hidden", () => {
    expect(queueTabSrc).not.toContain('aria-label="starting"');
  });

  it("save-chain button spinner is aria-hidden", () => {
    expect(queueTabSrc).not.toContain('aria-label="saving"');
  });

  it("status dot is aria-hidden", () => {
    expect(queueTabSrc).toMatch(/aria-hidden="true"[\s\S]{0,200}bg-emerald-500 animate-pulse/);
  });

  it("startup banner loading container has role=status", () => {
    expect(queueTabSrc).toMatch(/role="status"[\s\S]{0,300}text-sky-700/);
  });

  it("cost estimate loading container has role=status", () => {
    expect(queueTabSrc).toMatch(/role="status"[\s\S]{0,300}Computing cost estimate/);
  });

  it("items loading container has role=status", () => {
    expect(queueTabSrc).toMatch(/role="status"[\s\S]{0,400}Loading items/);
  });
});

describe("page.tsx search button spinner aria attribute", () => {
  it("search button spinner is aria-hidden", () => {
    expect(pageSrc).toMatch(
      /animate-spin"[^/]*aria-hidden="true"/,
    );
  });
});
