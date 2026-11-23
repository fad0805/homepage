import { Fragment, type ReactNode } from "react";

import {
  parseInlineMarkdown,
  type InlineMarkdownNode,
} from "@/lib/inline-markdown";
import { parseNoteBlocks } from "@/lib/note-markdown";

function renderInlineNodes(nodes: InlineMarkdownNode[]): ReactNode[] {
  return nodes.map((node, index) => {
    switch (node.kind) {
      case "link":
        return (
          <a
            key={`${node.href}-${index}`}
            href={node.href}
            target="_blank"
            rel="noopener noreferrer"
          >
            {node.text}
          </a>
        );
      case "strong":
        return <strong key={index}>{renderInlineNodes(node.children)}</strong>;
      case "em":
        return <em key={index}>{renderInlineNodes(node.children)}</em>;
      case "del":
        return <del key={index}>{renderInlineNodes(node.children)}</del>;
      default:
        return <Fragment key={index}>{node.text}</Fragment>;
    }
  });
}

function renderText(text: string): ReactNode {
  return text ? renderInlineNodes(parseInlineMarkdown(text)) : "\u00A0";
}

export function MemoContent({
  content,
  disabled,
  onToggleCheck,
}: {
  content: string;
  disabled: boolean;
  onToggleCheck: (lineIndex: number) => void;
}) {
  const blocks = parseNoteBlocks(content);
  return (
    <div className="memo-content" title={content}>
      {blocks.map((block) =>
        block.type === "list" ? (
          <ul className="memo-content-list" key={`list-${block.items[0].index}`}>
            {block.items.map((item) => (
              <li
                key={item.index}
                className={item.checkbox ? "is-check" : undefined}
              >
                {item.checkbox ? (
                  <span
                    className={`memo-content-check${
                      item.checked ? " is-done" : ""
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={item.checked}
                      disabled={disabled}
                      aria-label={item.text || "체크 항목"}
                      onChange={() => onToggleCheck(item.index)}
                    />
                    <span>{renderText(item.text)}</span>
                  </span>
                ) : (
                  <span>{renderText(item.text)}</span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="memo-content-line" key={`p-${block.index}`}>
            {renderText(block.text)}
          </p>
        ),
      )}
    </div>
  );
}
