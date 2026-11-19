"use client";

import { Fragment, useRef, useState, type ReactElement } from "react";
import type { ManuscriptNode, TrashItem } from "./manuscript-types";

interface ManuscriptBinderProps {
  childrenMap: Map<number | null, ManuscriptNode[]>;
  trashChildrenMap: Map<number | null, TrashItem[]>;
  expanded: Set<number>;
  selectedId: number | null;
  trashPreviewId: number | null;
  trashExpanded: boolean;
  trashCount: number;
  isOpen: boolean;
  onSelectNode: (node: ManuscriptNode) => void;
  onCreateNode: (type: "folder" | "chapter") => void;
  onMoveNode: (id: number, parentId: number | null) => void;
  onToggleFolder: (id: number) => void;
  onRename: (id: number, title: string) => void;
  onToggleTrash: () => void;
  onOpenTrashItem: (item: TrashItem) => void;
  onPurgeTrash: () => void;
}

export function ManuscriptBinder({
  childrenMap,
  trashChildrenMap,
  expanded,
  selectedId,
  trashPreviewId,
  trashExpanded,
  trashCount,
  isOpen,
  onSelectNode,
  onCreateNode,
  onMoveNode,
  onToggleFolder,
  onRename,
  onToggleTrash,
  onOpenTrashItem,
  onPurgeTrash,
}: ManuscriptBinderProps) {
  const dragId = useRef<number | null>(null);
  const cancelRename = useRef(false);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [trashFoldersOpen, setTrashFoldersOpen] = useState<Set<number>>(
    new Set(),
  );

  const toggleTrashFolder = (id: number) => {
    setTrashFoldersOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const commitRename = (id: number) => {
    setRenamingId(null);
    if (cancelRename.current) {
      cancelRename.current = false;
      return;
    }
    onRename(id, renameValue);
  };

  const renderRows = (parentId: number | null, depth: number): ReactElement[] => {
    const items = childrenMap.get(parentId) ?? [];
    return items.map((node) => {
      const hasChildren = (childrenMap.get(node.id) ?? []).length > 0;
      const isOpen = expanded.has(node.id);
      return (
        <Fragment key={node.id}>
          <div
            className={`ms-node${selectedId === node.id ? " is-selected" : ""}`}
            style={{ paddingLeft: `${0.65 + depth * 1.05}rem` }}
            draggable={renamingId !== node.id}
            onDragStart={() => {
              dragId.current = node.id;
            }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const movingId = dragId.current;
              dragId.current = null;
              if (!movingId || movingId === node.id) return;
              const targetParent =
                node.node_type === "folder" ? node.id : node.parent_id;
              onMoveNode(movingId, targetParent);
            }}
            onClick={() => onSelectNode(node)}
          >
            <button
              type="button"
              className="ms-node__toggle"
              disabled={!hasChildren}
              onClick={(event) => {
                event.stopPropagation();
                onToggleFolder(node.id);
              }}
              aria-label={isOpen ? "접기" : "펼치기"}
            >
              {hasChildren ? (isOpen ? "▾" : "▸") : "·"}
            </button>
            <span className={`ms-node__icon ms-node__icon--${node.node_type}`}>
              {node.node_type === "folder" ? "▣" : "▤"}
            </span>
            {renamingId === node.id ? (
              <input
                autoFocus
                className="ms-node__rename"
                value={renameValue}
                onClick={(event) => event.stopPropagation()}
                onChange={(event) => setRenameValue(event.target.value)}
                onBlur={() => commitRename(node.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    event.currentTarget.blur();
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    cancelRename.current = true;
                    setRenamingId(null);
                  }
                }}
              />
            ) : (
              <span
                className="ms-node__title"
                title="더블클릭하여 이름 변경"
                onDoubleClick={(event) => {
                  event.stopPropagation();
                  cancelRename.current = false;
                  setRenameValue(node.title);
                  setRenamingId(node.id);
                }}
              >
                {node.title}
              </span>
            )}
            {node.node_type === "chapter" ? (
              <span className="ms-node__count">{node.char_count_with_spaces}</span>
            ) : null}
          </div>
          {isOpen ? renderRows(node.id, depth + 1) : null}
        </Fragment>
      );
    });
  };

  const renderTrashRows = (
    parentId: number | null,
    depth: number,
  ): ReactElement[] =>
    (trashChildrenMap.get(parentId) ?? []).map((item) => {
      const isFolder = item.node_type === "folder";
      const isOpen = trashFoldersOpen.has(item.id);
      return (
        <Fragment key={item.id}>
          <div
            className={`ms-node${trashPreviewId === item.id ? " is-selected" : ""}`}
            style={{ paddingLeft: `${0.65 + depth * 1.05}rem` }}
            title={`삭제: ${item.deleted_at}\n영구 삭제: ${item.expires_at}`}
            onClick={() => onOpenTrashItem(item)}
          >
            <button
              type="button"
              className="ms-node__toggle"
              disabled={!isFolder || !(trashChildrenMap.get(item.id) ?? []).length}
              onClick={(event) => {
                event.stopPropagation();
                toggleTrashFolder(item.id);
              }}
              aria-label={isOpen ? "접기" : "펼치기"}
            >
              {isFolder ? (isOpen ? "▾" : "▸") : "·"}
            </button>
            <span className={`ms-node__icon ms-node__icon--${item.node_type}`}>
              {isFolder ? "▣" : "▤"}
            </span>
            <span className="ms-node__title">{item.title}</span>
          </div>
          {isFolder && isOpen ? renderTrashRows(item.id, depth + 1) : null}
        </Fragment>
      );
    });

  const classes = ["ms-binder"];
  if (isOpen) classes.push("is-open");

  return (
    <aside className={classes.join(" ")}>
      <div className="ms-panel-title">
        <span>바인더</span>
        <div className="ms-panel-title__actions">
          <button type="button" onClick={() => onCreateNode("folder")} title="폴더 추가">
            + 폴더
          </button>
          <button type="button" onClick={() => onCreateNode("chapter")} title="문서 추가">
            + 문서
          </button>
        </div>
      </div>
      <div
        className="ms-node-list"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          const movingId = dragId.current;
          dragId.current = null;
          if (movingId) onMoveNode(movingId, null);
        }}
      >
        {renderRows(null, 0)}
        <div
          className="ms-node ms-node--trash"
          onClick={onToggleTrash}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onToggleTrash();
            }
          }}
          role="button"
          tabIndex={0}
          aria-expanded={trashExpanded}
        >
          <button
            type="button"
            className="ms-node__toggle"
            onClick={(event) => {
              event.stopPropagation();
              onToggleTrash();
            }}
            aria-label={trashExpanded ? "휴지통 접기" : "휴지통 펼치기"}
          >
            {trashExpanded ? "▾" : "▸"}
          </button>
          <span className="ms-node__icon">⌫</span>
          <span className="ms-node__title">휴지통</span>
          <span className="ms-node__count">{trashCount}</span>
        </div>
        {trashExpanded ? (
          <div className="ms-trash-binder">
            {renderTrashRows(null, 0)}
            {trashCount === 0 ? (
              <p className="ms-trash-empty">휴지통이 비어 있습니다.</p>
            ) : null}
            {trashCount ? (
              <button
                type="button"
                className="ms-trash-purge"
                onClick={(event) => {
                  event.stopPropagation();
                  onPurgeTrash();
                }}
              >
                만료 항목 영구 삭제
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </aside>
  );
}
