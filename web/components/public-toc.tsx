"use client";

import { useEffect, useState, type ReactNode } from "react";

import type { TocNode } from "@/app/books/types";

interface PublicTocProps {
  nodes: TocNode[];
  selectedFolderId?: number | null;
  onSelectFolder?: (folderId: number) => void;
}

function collectFolders(nodes: TocNode[], folders: Set<number>) {
  for (const node of nodes) {
    if (node.node_type !== "folder") continue;
    if (node.id !== null) folders.add(node.id);
    collectFolders(node.children, folders);
  }
}

export function PublicToc({
  nodes,
  selectedFolderId = null,
  onSelectFolder,
}: PublicTocProps) {
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());

  useEffect(() => {
    const folders = new Set<number>();
    collectFolders(nodes, folders);
    setExpanded(folders);
  }, [nodes]);

  const toggleFolder = (id: number) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderNodes = (items: TocNode[], depth: number): ReactNode[] =>
    items
      .filter((node) => node.node_type === "folder")
      .map((node, index) => {
        const indentation = { paddingLeft: `${depth * 1.1}rem` };
        const hasChildFolders = node.children.some(
          (child) => child.node_type === "folder",
        );
        const open = node.id === null || expanded.has(node.id);

        return (
          <div className="books-toc__group" key={node.id ?? `folder-${index}`}>
            {hasChildFolders ? (
              <button
                type="button"
                className="books-toc__folder"
                style={indentation}
                onClick={() => node.id !== null && toggleFolder(node.id)}
                aria-expanded={open}
              >
                <span className="books-toc__chevron" aria-hidden="true">
                  {open ? "▾" : "▸"}
                </span>
                <span>{node.label ?? "폴더"}</span>
              </button>
            ) : (
              <button
                type="button"
                className={`books-toc__folder is-leaf${
                  node.unassigned ? " is-unassigned" : ""
                }${
                  node.id !== null && node.id === selectedFolderId
                    ? " is-selected"
                    : ""
                }`}
                style={indentation}
                onClick={() =>
                  node.id !== null && onSelectFolder?.(node.id)
                }
                aria-pressed={node.id === selectedFolderId}
              >
                {node.label ?? "폴더"}
              </button>
            )}
            {hasChildFolders && open
              ? renderNodes(node.children, depth + 1)
              : null}
          </div>
        );
      });

  return <div className="books-toc">{renderNodes(nodes, 0)}</div>;
}
