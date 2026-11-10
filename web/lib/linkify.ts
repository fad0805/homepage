import { find } from "linkifyjs";

export interface LinkToken {
  start: number;
  end: number;
  href: string;
  text: string;
}

export interface LinkPart {
  text: string;
  href?: string;
}

export function findLinkTokens(text: string): LinkToken[] {
  return find(text, { defaultProtocol: "https" })
    .filter((token) => token.isLink)
    .map((token) => ({
      start: token.start,
      end: token.end,
      href: token.href,
      text: token.value,
    }));
}

export function linkifyParts(text: string): LinkPart[] {
  const tokens = findLinkTokens(text);
  if (tokens.length === 0) return [{ text }];

  const parts: LinkPart[] = [];
  let cursor = 0;

  for (const token of tokens) {
    if (token.start > cursor) {
      parts.push({ text: text.slice(cursor, token.start) });
    }
    parts.push({
      text: text.slice(token.start, token.end),
      href: token.href,
    });
    cursor = token.end;
  }

  if (cursor < text.length) {
    parts.push({ text: text.slice(cursor) });
  }

  return parts;
}
