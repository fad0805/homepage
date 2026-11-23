// Checklist-aware rendering for planner notes.

import { parseNoteBlocks } from "@/lib/note-markdown";

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
