import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../components/InsightChat.tsx"),
  "utf8"
);

describe("InsightChat context expand/collapse aria-labels (closes #1007)", () => {
  it("ContextChip toggle button has aria-label attribute", () => {
    // ContextChip is the first component — find its toggle button
    const contextChipIdx = src.indexOf("function ContextChip");
    expect(contextChipIdx).toBeGreaterThan(-1);
    const nextComponentIdx = src.indexOf("\nfunction ", contextChipIdx + 1);
    const contextChipSrc = src.slice(contextChipIdx, nextComponentIdx);
    const btnIdx = contextChipSrc.indexOf('onClick={() => setExpanded');
    expect(btnIdx).toBeGreaterThan(-1);
    const btnWindow = contextChipSrc.slice(Math.max(0, btnIdx - 20), btnIdx + 300);
    expect(btnWindow).toContain("aria-label");
  });

  it("MsgContextBlock toggle button has aria-label attribute", () => {
    const msgCtxIdx = src.indexOf("function MsgContextBlock");
    expect(msgCtxIdx).toBeGreaterThan(-1);
    const nextIdx = src.indexOf("\nfunction ", msgCtxIdx + 1);
    const msgCtxSrc = src.slice(msgCtxIdx, nextIdx > -1 ? nextIdx : undefined);
    // Search for the onClick={onToggle} button, then check nearby for aria-label
    const onClickIdx = msgCtxSrc.indexOf("onClick={onToggle}");
    expect(onClickIdx).toBeGreaterThan(-1);
    const btnWindow = msgCtxSrc.slice(Math.max(0, onClickIdx - 20), onClickIdx + 200);
    expect(btnWindow).toContain("aria-label");
  });

  it("ContextChip toggle button aria-label describes context expansion", () => {
    const contextChipIdx = src.indexOf("function ContextChip");
    const nextComponentIdx = src.indexOf("\nfunction ", contextChipIdx + 1);
    const contextChipSrc = src.slice(contextChipIdx, nextComponentIdx);
    expect(contextChipSrc).toMatch(/aria-label=.*[Cc]ontext|aria-label=.*[Ee]xpand|aria-label=.*[Cc]ollapse/);
  });

  it("MsgContextBlock toggle button aria-label describes context expansion", () => {
    const msgCtxIdx = src.indexOf("function MsgContextBlock");
    const nextIdx = src.indexOf("\nfunction ", msgCtxIdx + 1);
    const msgCtxSrc = src.slice(msgCtxIdx, nextIdx > -1 ? nextIdx : undefined);
    expect(msgCtxSrc).toMatch(/aria-label=.*[Cc]ontext|aria-label=.*[Ee]xpand|aria-label=.*[Cc]ollapse/);
  });
});
