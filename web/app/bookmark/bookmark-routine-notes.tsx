interface NoteItem {
  index: number;
  text: string;
  checkbox: boolean;
  checked: boolean;
}

type NoteBlock =
  | { type: "list"; items: NoteItem[] }
  | { type: "paragraph"; index: number; text: string };

function parseBlocks(notes: string): NoteBlock[] {
  const blocks: NoteBlock[] = [];
  let list: NoteItem[] = [];
  const flushList = () => {
    if (list.length === 0) return;
    blocks.push({ type: "list", items: list });
    list = [];
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
        checked: check ? check[1].toLowerCase() === "x" : false,
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

export function BookmarkRoutineNotes({
  notes,
  disabled = false,
  onToggle,
}: {
  notes: string;
  disabled?: boolean;
  onToggle?: (index: number) => void;
}) {
  const blocks = parseBlocks(notes);
  return (
    <div className="bookmark-item-notes">
      {blocks.map((block) =>
        block.type === "list" ? (
          <ul
            className="bookmark-note-list"
            key={`list-${block.items[0].index}`}
          >
            {block.items.map((item) => (
              <li
                key={item.index}
                className={item.checkbox ? "is-check" : undefined}
              >
                {item.checkbox ? (
                  <label
                    className={`bookmark-note-check${
                      onToggle && !disabled ? " is-interactive" : ""
                    }`}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={item.checked}
                      disabled={disabled || !onToggle}
                      onChange={() => onToggle?.(item.index)}
                    />
                    <span
                      className={
                        item.checked ? "is-done" : undefined
                      }
                    >
                      {item.text || "\u00A0"}
                    </span>
                  </label>
                ) : (
                  <span>{item.text || "\u00A0"}</span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p
            className="bookmark-note-line"
            key={`p-${block.index}`}
          >
            {block.text}
          </p>
        ),
      )}
    </div>
  );
}
