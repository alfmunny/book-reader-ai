import fs from "fs";
import path from "path";

const src = (rel: string) =>
  fs.readFileSync(path.join(process.cwd(), "src", rel), "utf-8");

const uploadsPage = src("app/admin/uploads/page.tsx");
const queueTab = src("components/QueueTab.tsx");

describe("Data table accessible names (WCAG 1.3.1) (closes #1376)", () => {
  it("admin/uploads/page.tsx table has aria-label", () => {
    expect(uploadsPage).toMatch(/<table[^>]+aria-label=/);
  });

  it("QueueTab.tsx planning table has aria-label", () => {
    expect(queueTab).toMatch(/<table[^>]+aria-label=/);
  });
});
