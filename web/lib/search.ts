/**
 * Split a search query on whitespace. Every resulting token must match for a
 * document to be included (AND search).
 */
export function searchTokens(query: string): string[] {
  const normalized = query.trim().toLowerCase();
  return normalized ? normalized.split(/\s+/).filter(Boolean) : [];
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
