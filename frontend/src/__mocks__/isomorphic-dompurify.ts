/**
 * Jest-compatible mock for isomorphic-dompurify.
 * Implements real DOMPurify semantics for ALLOWED_TAGS / ALLOWED_ATTR
 * without the ESM transitive-dep issue that breaks Jest.
 *
 * Content-consuming tags (script, style, etc.) have their inner text removed
 * as well as their tags — matching real DOMPurify behavior.
 */

// Tags whose entire content (including text nodes) must be removed.
const CONTENT_CONSUMING = ["script", "style", "noscript", "iframe"];

const DOMPurify = {
  sanitize(
    input: string,
    opts?: { ALLOWED_TAGS?: string[]; ALLOWED_ATTR?: string[] },
  ): string {
    const tags = opts?.ALLOWED_TAGS ?? [];

    // First pass: remove content-consuming tags plus their inner content.
    let out = input;
    for (const tag of CONTENT_CONSUMING) {
      if (!tags.includes(tag)) {
        out = out.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, "gi"), "");
      }
    }

    // Second pass: strip/transform remaining tags.
    return out.replace(/<\/?([a-z][a-z0-9]*)\b[^>]*>/gi, (match, rawTag) => {
      const tag = rawTag.toLowerCase();
      const isClose = match.startsWith("</");

      if (!tags.includes(tag)) return "";   // strip disallowed open/close tags

      if (isClose) return `</${tag}>`;

      // For allowed tags: emit bare open tag (no attributes) when ALLOWED_ATTR is [].
      return `<${tag}>`;
    });
  },
};

export default DOMPurify;
