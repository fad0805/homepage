// Checklist-aware rendering for planner notes.

export const NOTE_CHECK_LINE_RE =
  /^(\s*(?:[-*]\s+)?\[)([ xX]?)(\]\s*)(.*)$/;

export interface PlannerNoteItem {
  index: number;
  text: string;
  checkbox: boolean;
  checked: boolean;
}

export type PlannerNoteBlock =
  | { type: "list"; items: PlannerNoteItem[] }
  | { type: "paragraph"; index: number; text: string };

export function parseNoteBlocks(notes: string): PlannerNoteBlock[] {
  const blocks: PlannerNoteBlock[] = [];
  let list: PlannerNoteItem[] = [];
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

export function PlannerNoteContent({
  notes,
  disabled,
  onToggle,
}: {
  notes: string;
  disabled: boolean;
  onToggle: (index: number) => void;
}) {
  const blocks = parseNoteBlocks(notes);
  return (
    <div className="planner-note-content">
      {blocks.map((block) =>
        block.type === "list" ? (
          <ul
            className="planner-note-list"
            key={`list-${block.items[0].index}`}
          >
            {block.items.map((item) => (
              <li
                key={item.index}
                className={item.checkbox ? "is-check" : undefined}
              >
                {item.checkbox ? (
                  <span
                    className={`planner-note-check${
                      item.checked ? " is-done" : ""
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={item.checked}
                      disabled={disabled}
                      aria-label={item.text || "체크 항목"}
                      onClick={(event) => event.stopPropagation()}
                      onChange={() => onToggle(item.index)}
                    />
                    <span>{item.text || "\u00A0"}</span>
                  </span>
                ) : (
                  <span>{item.text || "\u00A0"}</span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="planner-note-line" key={`p-${block.index}`}>
            {block.text}
          </p>
        ),
      )}
    </div>
  );
}
