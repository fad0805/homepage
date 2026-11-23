// Shared markdown-note helpers for planner notes and memos.

export const NOTE_CHECK_LINE_RE =
  /^(\s*(?:[-*]\s+)?\[)([ xX]?)(\]\s*)(.*)$/;

export interface NoteItem {
  index: number;
  text: string;
  checkbox: boolean;
  checked: boolean;
}

export type NoteBlock =
  | { type: "list"; items: NoteItem[] }
  | { type: "paragraph"; index: number; text: string };

export function parseNoteBlocks(notes: string): NoteBlock[] {
  const blocks: NoteBlock[] = [];
  let list: NoteItem[] = [];
  const flushList = () => {
    if (list.length > 0) {
      blocks.push({ type: "list", items: list });
      list = [];
    }
  };

  notes.split(/\r?\n/).forEach((line, index) => {
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    const content = bullet ? bullet[1] : line;
    const check = content.match(/^\[([ xX]?)\]\s*(.*)$/);
    if (bullet || check) {
      list.push({
        index,
        text: check ? check[2] : (bullet?.[1] ?? ""),
        checkbox: Boolean(check),
        checked: check
          ? check[1].toLowerCase() === "x"
          : false,
      });
      return;
    }

    flushList();
    if (line.trim()) {
      blocks.push({ type: "paragraph", index, text: line });
    }
  });
  flushList();
  return blocks;
}

/** Toggle `[ ]` <-> `[x]` on one line, returning null if it is not a checkbox. */
export function toggleNoteCheckLine(
  notes: string,
  lineIndex: number,
): string | null {
  const lines = notes.split(/\r?\n/);
  const line = lines[lineIndex];
  if (line === undefined) return null;
  const match = line.match(NOTE_CHECK_LINE_RE);
  if (!match) return null;

  const checked = (match[2] || "").toLowerCase() === "x";
  lines[lineIndex] = `${match[1]}${checked ? " " : "x"}${match[3]}${match[4]}`;
  return lines.join("\n");
}
