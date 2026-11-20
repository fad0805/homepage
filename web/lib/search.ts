/** Build a global-search URL that filters by an exact tag. */
export function tagSearchHref(tag: string): string {
  return `/search?q=${encodeURIComponent(`type:tag ${tag}`)}`;
}

/**
 * Split a search query on whitespace. Every resulting token must match for a
 * document to be included (AND search).
 */
export function searchTokens(query: string): string[] {
  const normalized = query.trim().toLowerCase();
  return normalized ? normalized.split(/\s+/).filter(Boolean) : [];
}

/**
 * Parse the `type:tag` global-search modifier. Both `type:tag 태그명` and
 * `type:tag:태그명` are accepted; all remaining words form the tag name.
 */
export function parseSearchQuery(query: string): {
  tag: string | null;
  query: string;
} {
  const parts = query.trim().split(/\s+/).filter(Boolean);
  const rest: string[] = [];
  let tagMode = false;
  let inlineTag: string | null = null;

  for (const part of parts) {
    const lower = part.toLowerCase();
    if (lower === "type:tag") {
      tagMode = true;
      continue;
    }
    if (lower.startsWith("type:tag:")) {
      tagMode = true;
      inlineTag = part.slice("type:tag:".length);
      continue;
    }
    rest.push(part);
  }

  if (!tagMode) return { tag: null, query: parts.join(" ") };
  if (inlineTag !== null) {
    return { tag: inlineTag.trim(), query: rest.join(" ") };
  }
  return { tag: rest.join(" ").trim(), query: "" };
}

/**
 * Return true when every token appears in at least one of the given values.
 * Values are compared case-insensitively using substring matching.
 */
export function matchesAllTokens(
  values: Array<string | null | undefined>,
  tokens: string[],
): boolean {
  if (tokens.length === 0) return true;

  const haystack = values.map((value) =>
    (value ?? "").toLowerCase(),
  );
  return tokens.every((token) =>
    haystack.some((value) => value.includes(token)),
  );
}
