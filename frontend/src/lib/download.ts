/** Turn a book title into a safe filename stem; `fallback` when nothing survives. */
export function slugifyFilename(title: string, fallback = "export"): string {
  const slug = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")  // strip diacritics left by NFKD
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 60)
    .replace(/^-+|-+$/g, "");
  return slug || fallback;
}

/** Save `contents` to the user's device as a file, without a round trip to the server. */
export function downloadTextFile(filename: string, contents: string, mime = "text/markdown;charset=utf-8"): void {
  const url = URL.createObjectURL(new Blob([contents], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  // Firefox only fires the download for anchors attached to the document.
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
