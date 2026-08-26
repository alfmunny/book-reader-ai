/**
 * lib/download.ts — client-side file download helper (#2703).
 */
import { downloadTextFile, slugifyFilename } from "@/lib/download";

describe("slugifyFilename", () => {
  it("lowercases and hyphenates words", () => {
    expect(slugifyFilename("Moby Dick")).toBe("moby-dick");
  });

  it("collapses punctuation runs into a single hyphen", () => {
    expect(slugifyFilename("Alice's Adventures — in Wonderland!")).toBe("alice-s-adventures-in-wonderland");
  });

  it("strips diacritics", () => {
    expect(slugifyFilename("Les Misérables")).toBe("les-miserables");
  });

  it("falls back when the title has no sluggable characters", () => {
    expect(slugifyFilename("红楼梦", "notes")).toBe("notes");
  });

  it("falls back on an empty title", () => {
    expect(slugifyFilename("", "vocabulary")).toBe("vocabulary");
  });

  it("truncates very long titles", () => {
    const slug = slugifyFilename("a".repeat(200));
    expect(slug.length).toBeLessThanOrEqual(60);
  });
});

describe("downloadTextFile", () => {
  let createdBlob: Blob | null = null;
  let clickedHref: string | null = null;
  let clickedDownload: string | null = null;
  let anchorInDomAtClick = false;

  beforeEach(() => {
    createdBlob = null;
    clickedHref = null;
    clickedDownload = null;
    anchorInDomAtClick = false;
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = jest.fn((b: Blob) => {
      createdBlob = b;
      return "blob:mock-url";
    });
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = jest.fn();
    jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clickedHref = this.getAttribute("href");
      clickedDownload = this.getAttribute("download");
      anchorInDomAtClick = document.body.contains(this);
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("clicks an anchor carrying the object URL and the requested filename", () => {
    downloadTextFile("moby-dick-notes.md", "# Moby Dick\n");

    expect(clickedHref).toBe("blob:mock-url");
    expect(clickedDownload).toBe("moby-dick-notes.md");
  });

  it("attaches the anchor to the document before clicking (Firefox needs it in the DOM)", () => {
    downloadTextFile("notes.md", "# Notes\n");
    expect(anchorInDomAtClick).toBe(true);
  });

  it("builds a markdown blob from the contents", async () => {
    downloadTextFile("notes.md", "# Notes\n");

    expect(createdBlob).toBeInstanceOf(Blob);
    expect(createdBlob!.type).toBe("text/markdown;charset=utf-8");

    // jsdom's Blob has no .text(); FileReader is the portable way to read it back.
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(createdBlob!);
    });
    expect(text).toBe("# Notes\n");
  });

  it("revokes the object URL and removes the anchor afterwards", () => {
    downloadTextFile("notes.md", "# Notes\n");

    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
    expect(document.querySelectorAll("a[download]")).toHaveLength(0);
  });
});
