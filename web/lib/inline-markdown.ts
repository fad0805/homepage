import { findLinkTokens, linkifyParts } from "./linkify";

export type InlineMarkdownNode =
  | { kind: "text"; text: string }
  | { kind: "link"; text: string; href: string }
  | { kind: "strong"; children: InlineMarkdownNode[] }
  | { kind: "em"; children: InlineMarkdownNode[] }
  | { kind: "del"; children: InlineMarkdownNode[] };

type EmphasisKind = "strong" | "em" | "del";

interface MarkerConfig {
  token: string;
  /** Nested emphasis, outermost first. ["strong", "em"] is ***text***. */
  kinds: EmphasisKind[];
  /**
   * Intraword delimiters do not open or close emphasis. Enabled for `_` so
   * snake_case identifiers stay plain text, matching CommonMark.
   */
  intraword?: boolean;
}

const MARKERS: MarkerConfig[] = [
  { token: "***", kinds: ["strong", "em"] },
  { token: "___", kinds: ["strong", "em"], intraword: true },
  { token: "**", kinds: ["strong"] },
  { token: "__", kinds: ["strong"], intraword: true },
  { token: "~~", kinds: ["del"] },
  { token: "*", kinds: ["em"] },
  { token: "_", kinds: ["em"], intraword: true },
];

function isWhitespace(value: string | undefined) {
  return value !== undefined && /\s/.test(value);
}

function isAlphanumeric(value: string | undefined) {
  return value !== undefined && /[0-9A-Za-z]/.test(value);
}

function findClosingMarker(
  text: string,
  marker: MarkerConfig,
  from: number,
  isMasked: (index: number) => boolean,
): number {
  let searchFrom = from;

  for (;;) {
    const index = text.indexOf(marker.token, searchFrom);
    if (index === -1) return -1;
    searchFrom = index + 1;

    // URLs are never treated as markdown delimiters.
    if (isMasked(index)) continue;

    const previous = text[index - 1];
    const next = text[index + marker.token.length];

    // Skip runs like *** when looking for a single *.
    if (
      marker.token.length === 1 &&
      (previous === marker.token || next === marker.token)
    ) {
      continue;
    }

    // A closing delimiter cannot be preceded by whitespace.
    if (isWhitespace(previous)) continue;

    // Intraword delimiters (snake_case_word) do not close.
    if (marker.intraword && isAlphanumeric(next)) continue;

    return index;
  }
}

function wrapEmphasis(
  kinds: EmphasisKind[],
  children: InlineMarkdownNode[],
): InlineMarkdownNode[] {
  return kinds.reduceRight<InlineMarkdownNode[]>(
    (inner, kind) => [{ kind, children: inner }],
    children,
  );
}

/**
 * Parse lightweight inline markdown: **bold**, *italic* / _italic_,
 * ~~strikethrough~~, ***bold italic*** and bare URLs. Unmatched
 * delimiters stay plain text.
 */
export function parseInlineMarkdown(text: string): InlineMarkdownNode[] {
  const linkTokens = findLinkTokens(text);
  const isMasked = (index: number) =>
    linkTokens.some((token) => index >= token.start && index < token.end);

  for (let i = 0; i < text.length; i++) {
    if (isMasked(i)) continue;

    for (const marker of MARKERS) {
      if (!text.startsWith(marker.token, i)) continue;

      const contentStart = i + marker.token.length;

      // An opening delimiter cannot be followed by whitespace.
      if (isWhitespace(text[contentStart])) continue;
      // Intraword delimiters (snake_case_word) do not open.
      if (marker.intraword && isAlphanumeric(text[i - 1])) continue;

      const close = findClosingMarker(text, marker, contentStart, isMasked);
      if (close === -1) continue;

      const content = text.slice(contentStart, close);
      if (
        !content.trim() ||
        isWhitespace(content[0]) ||
        isWhitespace(content[content.length - 1])
      ) {
        continue;
      }

      return [
        ...parseInlineMarkdown(text.slice(0, i)),
        ...wrapEmphasis(marker.kinds, parseInlineMarkdown(content)),
        ...parseInlineMarkdown(text.slice(close + marker.token.length)),
      ];
    }
  }

  return linkifyParts(text)
    .filter((part) => part.text !== "")
    .map((part) =>
      part.href
        ? { kind: "link", text: part.text, href: part.href }
        : { kind: "text", text: part.text },
    );
}
