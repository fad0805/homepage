"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from "react";

import type { ManageTocNode } from "@/app/books/types";
import { apiFetch } from "@/lib/api";
import { BOOK_CHAPTER_MIME, TOC_NODE_MIME } from "@/lib/drag-types";

import "@/public/styles/toc-manager.scss";

interface TocManagerChapter {
  id: number;
  title: string;
  subtitle?: string | null;
}

interface TocManagerProps {
  bookId: number;
  chapters: TocManagerChapter[];
  notify: (type: "success" | "error", text: string) => void;
  title?: string;
  collapsible?: boolean;
  defaultOpen?: boolean;
  selectedChapterId?: number | null;
  selectedParentId?: number | null;
  onSelectParent?: (parentId: number | null) => void;
}

interface DropTarget {
  parentId: number | null;
  position: number;
  sourceId?: number;
}

type DropMode = "before" | "after" | "inside";

function flattenNodes(nodes: ManageTocNode[]): ManageTocNode[] {
  return nodes.flatMap((node) => [node, ...flattenNodes(node.children)]);
}

function folderTree(nodes: ManageTocNode[]): ManageTocNode[] {
  return nodes
    .filter((node) => node.node_type === "folder")
    .map((node) => ({ ...node, children: folderTree(node.children) }));
}

function collectChapterCounts(
  nodes: ManageTocNode[],
  counts = new Map<number, number>(),
): Map<number, number> {
  for (const node of nodes) {
    if (node.node_type === "folder") {
      counts.set(
        node.id,
        node.children.filter((child) => child.node_type === "post").length,
      );
    }
    collectChapterCounts(node.children, counts);
  }
  return counts;
}

function dropMode(event: DragEvent<HTMLElement>, node: ManageTocNode): DropMode {
  const rect = event.currentTarget.getBoundingClientRect();
  const offset = event.clientY - rect.top;
  if (offset < rect.height * 0.28) return "before";
  if (offset > rect.height * 0.72) return "after";
  return node.node_type === "folder" ? "inside" : "after";
}

function targetForNode(node: ManageTocNode, mode: DropMode): DropTarget {
  if (mode === "inside") {
    return {
      parentId: node.id,
      position: node.children.length,
      sourceId: node.id,
    };
  }
  return {
    parentId: node.parent_id,
    position: node.position + (mode === "after" ? 1 : 0),
    sourceId: node.id,
  };
}

type PendingOp =
  | { kind: "create-folder"; tempId: number; label: string; parentId: number | null }
  | {
      kind: "create-post";
      tempId: number;
      chapterId: number;
      parentId: number | null;
      position: number;
    }
  | { kind: "rename"; id: number; label: string }
  | { kind: "move"; id: number; parentId: number | null }
  | { kind: "delete"; id: number };

function findNode(
  nodes: ManageTocNode[],
  id: number,
): ManageTocNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findNode(node.children, id);
    if (found) return found;
  }
  return null;
}

function containsNode(node: ManageTocNode, id: number): boolean {
  return node.id === id || node.children.some((child) => containsNode(child, id));
}

function normalizePositions(nodes: ManageTocNode[]): ManageTocNode[] {
  return nodes.map((node, index) => ({
    ...node,
    position: index,
    children: normalizePositions(node.children),
  }));
}

function removeNodeLocal(nodes: ManageTocNode[], id: number): ManageTocNode[] {
  return nodes
    .filter((node) => node.id !== id)
    .map((node) => ({ ...node, children: removeNodeLocal(node.children, id) }));
}

function insertNodeLocal(
  nodes: ManageTocNode[],
  parentId: number | null,
  node: ManageTocNode,
  position: number,
): ManageTocNode[] {
  if (parentId === null) {
    const next = [...nodes];
    next.splice(Math.max(0, Math.min(position, next.length)), 0, node);
    return normalizePositions(next);
  }
  return nodes.map((current) => {
    if (current.id === parentId) {
      const children = [...current.children];
      children.splice(Math.max(0, Math.min(position, children.length)), 0, node);
      return { ...current, children: normalizePositions(children) };
    }
    return {
      ...current,
      children: insertNodeLocal(current.children, parentId, node, position),
    };
  });
}

function updateNodeLocal(
  nodes: ManageTocNode[],
  id: number,
  patch: Partial<ManageTocNode>,
): ManageTocNode[] {
  return nodes.map((node) =>
    node.id === id
      ? { ...node, ...patch }
      : { ...node, children: updateNodeLocal(node.children, id, patch) },
  );
}

function childCount(nodes: ManageTocNode[], parentId: number | null): number {
  if (parentId === null) return nodes.length;
  return findNode(nodes, parentId)?.children.length ?? 0;
}

function positionOf(
  nodes: ManageTocNode[],
  id: number,
  parentId: number | null = null,
): { parentId: number | null; position: number } | null {
  const index = nodes.findIndex((node) => node.id === id);
  if (index >= 0) return { parentId, position: index };
  for (const node of nodes) {
    const found = positionOf(node.children, id, node.id);
    if (found) return found;
  }
  return null;
}

export function TocManager({
  bookId,
  chapters,
  notify,
  title = "공개 목차",
  collapsible = true,
  defaultOpen = false,
  selectedChapterId = null,
  selectedParentId = null,
  onSelectParent,
}: TocManagerProps) {
  const [tree, setTree] = useState<ManageTocNode[]>([]);
  const [chapterCounts, setChapterCounts] = useState<Map<number, number>>(
    () => new Map(),
  );
  const [open, setOpen] = useState(defaultOpen || !collapsible);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [dropKey, setDropKey] = useState<string | null>(null);
  const [folderParentId, setFolderParentId] = useState<
    number | null | undefined
  >(undefined);
  const [folderLabel, setFolderLabel] = useState("");
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameLabel, setRenameLabel] = useState("");
  const [pending, setPending] = useState<PendingOp[]>([]);
  const dragRef = useRef<{ kind: "node" | "chapter"; id: number } | null>(
    null,
  );
  const tempIdRef = useRef(-1);
  const savedIdsRef = useRef<Set<number>>(new Set());
  const onSelectParentRef = useRef(onSelectParent);
  onSelectParentRef.current = onSelectParent;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await apiFetch<ManageTocNode[]>(
        `/api/books/${bookId}/toc/manage`,
      );
      savedIdsRef.current = new Set(
        flattenNodes(next).map((node) => node.id).filter((id) => id > 0),
      );
      setPending([]);
      setChapterCounts(collectChapterCounts(next));
      setTree(folderTree(next));
      if (selectedChapterId !== null) {
        const post = flattenNodes(next).find(
          (node) =>
            node.node_type === "post" && node.chapter_id === selectedChapterId,
        );
        if (post) onSelectParentRef.current?.(post.parent_id);
      }
    } catch (caught) {
      notify("error", (caught as Error).message);
    } finally {
      setLoading(false);
    }
  }, [bookId, notify, selectedChapterId]);

  useEffect(() => {
    void load();
  }, [load]);

  const allNodes = useMemo(() => flattenNodes(tree), [tree]);
  const visibleTree = useMemo(() => folderTree(tree), [tree]);
  const visibleCount = flattenNodes(visibleTree).length;
  const placedChapterIds = useMemo(
    () =>
      new Set(
        allNodes
          .filter((node) => node.node_type === "post")
          .map((node) => node.chapter_id)
          .filter((id): id is number => id !== null),
      ),
    [allNodes],
  );
  const selectParent = (parentId: number | null) => {
    onSelectParentRef.current?.(parentId);
  };

  const createFolder = (parentId: number | null, label: string) => {
    const title = label.trim();
    if (!title) return;
    const tempId = tempIdRef.current--;
    const node: ManageTocNode = {
      id: tempId,
      parent_id: parentId,
      node_type: "folder",
      label: title,
      position: 0,
      chapter_id: null,
      pinned: false,
      locked: false,
      children: [],
    };
    const next = normalizePositions(
      insertNodeLocal(tree, parentId, node, childCount(tree, parentId)),
    );
    setTree(next);
    setChapterCounts(collectChapterCounts(next));
    setPending((current) => [
      ...current,
      { kind: "create-folder", tempId, label: title, parentId },
    ]);
    setFolderParentId(undefined);
    setFolderLabel("");
    selectParent(parentId);
  };

  const createPost = (
    chapterId: number,
    parentId: number | null,
    position?: number,
  ) => {
    setPending((current) => [
      ...current,
      {
        kind: "create-post",
        tempId: tempIdRef.current--,
        chapterId,
        parentId,
        position: position ?? childCount(tree, parentId),
      },
    ]);
    if (chapterId === selectedChapterId) selectParent(parentId);
  };

  const renameFolder = (node: ManageTocNode) => {
    const title = renameLabel.trim();
    if (!title) return;
    if (node.id < 0) {
      setPending((current) =>
        current.map((op) =>
          op.kind === "create-folder" && op.tempId === node.id
            ? { ...op, label: title }
            : op,
        ),
      );
    } else {
      setPending((current) => [
        ...current.filter(
          (op) => !(op.kind === "rename" && op.id === node.id),
        ),
        { kind: "rename", id: node.id, label: title },
      ]);
    }
    setTree((current) => updateNodeLocal(current, node.id, { label: title }));
    setRenamingId(null);
  };

  const moveNode = (
    nodeId: number,
    parentId: number | null,
    position: number,
  ) => {
    const node = findNode(tree, nodeId);
    if (!node) return;
    if (parentId !== null && containsNode(node, parentId)) return;
    const without = removeNodeLocal(tree, nodeId);
    const moved = { ...node, parent_id: parentId };
    const next = normalizePositions(
      insertNodeLocal(without, parentId, moved, position),
    );
    setTree(next);
    setChapterCounts(collectChapterCounts(next));
    if (node.id < 0) {
      setPending((current) =>
        current.map((op) =>
          op.kind === "create-folder" && op.tempId === node.id
            ? { ...op, parentId }
            : op,
        ),
      );
    } else {
      setPending((current) => [
        ...current.filter((op) => !(op.kind === "move" && op.id === nodeId)),
        { kind: "move", id: nodeId, parentId },
      ]);
    }
    if (
      selectedChapterId !== null &&
      node.chapter_id === selectedChapterId
    ) {
      selectParent(parentId);
    }
  };

  const removeNode = (node: ManageTocNode) => {
    const removedTemps = new Set(
      flattenNodes([node]).map((item) => item.id).filter((id) => id < 0),
    );
    const next = removeNodeLocal(tree, node.id);
    setTree(next);
    setChapterCounts(collectChapterCounts(next));
    setPending((current) =>
      current.filter((op) => {
        if ("tempId" in op && removedTemps.has(op.tempId)) return false;
        if (
          "parentId" in op &&
          op.parentId !== null &&
          removedTemps.has(op.parentId)
        ) {
          return false;
        }
        if (node.id >= 0 && "id" in op && op.id === node.id) return false;
        return true;
      }),
    );
    if (node.id >= 0) {
      setPending((current) => [...current, { kind: "delete", id: node.id }]);
    }
  };

  const save = async () => {
    setWorking(true);
    const ids = new Map<number, number>();
    let knownIds = new Set(savedIdsRef.current);
    const resolve = (id: number | null) =>
      id === null ? null : id < 0 ? (ids.get(id) ?? id) : id;
    try {
      for (const op of pending) {
        if (op.kind !== "delete") continue;
        await apiFetch(`/api/books/${bookId}/toc/nodes/${op.id}`, {
          method: "DELETE",
        });
      }
      for (const op of pending) {
        if (op.kind !== "create-folder" && op.kind !== "create-post") {
          continue;
        }
        const location = positionOf(tree, op.tempId) ?? {
          parentId: op.parentId,
          position: "position" in op ? op.position : 0,
        };
        const parentId = resolve(location.parentId);
        const next = await apiFetch<ManageTocNode[]>(
          op.kind === "create-folder"
            ? `/api/books/${bookId}/toc/folders`
            : `/api/books/${bookId}/toc/posts`,
          {
            method: "POST",
            body: JSON.stringify(
              op.kind === "create-folder"
                ? { label: op.label, parent_id: parentId }
                : {
                    chapter_id: op.chapterId,
                    parent_id: parentId,
                    position: location.position,
                  },
            ),
          },
        );
        const flat = flattenNodes(next);
        const fresh = flat.filter(
          (node) => node.id > 0 && !knownIds.has(node.id),
        );
        const created =
          fresh.find((node) =>
            op.kind === "create-folder"
              ? node.label === op.label && node.parent_id === parentId
              : node.chapter_id === op.chapterId &&
                node.parent_id === parentId,
          ) ?? fresh[0];
        if (created) ids.set(op.tempId, created.id);
        knownIds = new Set(flat.map((node) => node.id));
      }
      for (const op of pending) {
        if (op.kind !== "rename") continue;
        const id = resolve(op.id);
        if (id === null || id < 0) continue;
        await apiFetch(`/api/books/${bookId}/toc/nodes/${id}`, {
          method: "PATCH",
          body: JSON.stringify({ label: op.label }),
        });
      }
      for (const op of pending) {
        if (op.kind !== "move") continue;
        const id = resolve(op.id);
        const location = positionOf(tree, op.id);
        if (id === null || id < 0 || !location) continue;
        await apiFetch(`/api/books/${bookId}/toc/nodes/${id}/move`, {
          method: "POST",
          body: JSON.stringify({
            parent_id: resolve(location.parentId),
            position: location.position,
          }),
        });
      }
      await load();
      notify("success", "목차를 저장했습니다.");
    } catch (caught) {
      notify("error", (caught as Error).message);
    } finally {
      setWorking(false);
    }
  };

  const applyDrop = async (event: DragEvent<HTMLElement>, target: DropTarget) => {
    event.preventDefault();
    event.stopPropagation();
    setDropKey(null);
    const drag = dragRef.current;
    const nodeValue = event.dataTransfer.getData(TOC_NODE_MIME);
    const chapterValue = event.dataTransfer.getData(BOOK_CHAPTER_MIME);
    dragRef.current = null;
    const nodeId =
      drag?.kind === "node" ? drag.id : nodeValue ? Number(nodeValue) : null;
    const chapterId =
      drag?.kind === "chapter"
        ? drag.id
        : chapterValue
          ? Number(chapterValue)
          : null;

    if (nodeId !== null && nodeId === target.sourceId) return;
    if (nodeId !== null) {
      await moveNode(nodeId, target.parentId, target.position);
    } else if (chapterId !== null) {
      await createPost(chapterId, target.parentId, target.position);
    }
  };

  const rootTarget: DropTarget = {
    parentId: null,
    position: tree.length,
  };

  const renderNode = (node: ManageTocNode, depth: number) => {
    const indent = { marginLeft: `${depth * 1.1}rem` };
    const selectedParent =
      onSelectParent !== undefined &&
      node.node_type === "folder" &&
      selectedParentId === node.id;

    return (
      <div className="admin-books-toc__branch" key={node.id}>
        <div
          className={[
            "admin-books-toc__row",
            dropKey?.startsWith(`${node.id}:`)
              ? dropKey.replace(`${node.id}:`, "is-drop-")
              : "",
            selectedParent ? "is-selected-parent" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          style={indent}
          draggable={!working && renamingId !== node.id}
          onDragStart={(event) => {
            dragRef.current = { kind: "node", id: node.id };
            event.dataTransfer.setData(TOC_NODE_MIME, String(node.id));
            event.dataTransfer.effectAllowed = "move";
          }}
          onDragEnd={() => {
            dragRef.current = null;
            setDropKey(null);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            const mode = dropMode(event, node);
            setDropKey(`${node.id}:${mode}`);
          }}
          onDragLeave={() => setDropKey(null)}
          onDrop={(event) => {
            const mode = dropMode(event, node);
            void applyDrop(event, targetForNode(node, mode));
          }}
        >
          <span className="admin-books-toc__grip" aria-hidden="true">
            ⠿
          </span>
          {onSelectParent && node.node_type === "folder" ? (
            <input
              type="checkbox"
              checked={selectedParent}
              onChange={() => selectParent(node.id)}
              aria-label={`${node.label ?? "폴더"}에 배치`}
            />
          ) : null}
          {renamingId === node.id ? (
            <>
              <input
                value={renameLabel}
                autoFocus
                aria-label="폴더 이름"
                onChange={(event) => setRenameLabel(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    renameFolder(node);
                  } else if (event.key === "Escape") {
                    setRenamingId(null);
                  }
                }}
              />
              <button
                type="button"
                className="admin-button"
                onClick={() => renameFolder(node)}
              >
                적용
              </button>
              <button
                type="button"
                className="admin-button"
                onClick={() => setRenamingId(null)}
              >
                취소
              </button>
            </>
          ) : (
            <>
              <span
                className={[
                  "admin-books-toc__label",
                  node.pinned ? "is-pinned" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                title="더블클릭하여 이름 변경"
                onDoubleClick={() => {
                  setRenamingId(node.id);
                  setRenameLabel(node.label ?? "");
                }}
              >
                {node.label}
              </span>
              {node.pinned ? (
                <span className="admin-books-pin-badge">고정</span>
              ) : null}
              {node.children.length === 0 ? (
                <span className="admin-books-toc__chapter-count">
                  챕터 {chapterCounts.get(node.id) ?? 0}개
                </span>
              ) : null}
              {node.node_type === "folder" ? (
                <button
                  type="button"
                  className="admin-button"
                  aria-label="하위 폴더 추가"
                  title="하위 폴더 추가"
                  onClick={() => {
                    setFolderParentId(node.id);
                    setFolderLabel("");
                  }}
                >
                  +
                </button>
              ) : null}
              <button
                type="button"
                className="admin-button danger"
                onClick={() => removeNode(node)}
                disabled={working || node.children.length > 0}
                title={
                  node.children.length > 0
                    ? "하위 항목을 먼저 옮기거나 삭제해주세요."
                    : undefined
                }
              >
                삭제
              </button>
            </>
          )}
        </div>
        {folderParentId === node.id ? (
          <div className="admin-books-toc__inline-form" style={indent}>
            <input
              value={folderLabel}
              autoFocus
              placeholder="새 폴더 이름"
              aria-label="새 폴더 이름"
              onChange={(event) => setFolderLabel(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  createFolder(node.id, folderLabel);
                } else if (event.key === "Escape") {
                  setFolderParentId(undefined);
                }
              }}
            />
            <button
              type="button"
              className="admin-button primary"
              onClick={() => createFolder(node.id, folderLabel)}
            >
              만들기
            </button>
            <button
              type="button"
              className="admin-button"
              onClick={() => setFolderParentId(undefined)}
            >
              취소
            </button>
          </div>
        ) : null}
        {node.children.map((child) => renderNode(child, depth + 1))}
      </div>
    );
  };

  return (
    <section
      className={[
        "admin-books-panel",
        "admin-books-toc-panel",
        collapsible && !open ? "is-collapsed" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onDragOver={(event) => {
        if (
          !dragRef.current &&
          !event.dataTransfer.types.includes(BOOK_CHAPTER_MIME)
        ) {
          return;
        }
        event.preventDefault();
      }}
      onDrop={(event) => void applyDrop(event, rootTarget)}
    >
      <header className="admin-books-toc__head">
        {collapsible ? (
          <button
            type="button"
            className="admin-books-toc__toggle"
            onClick={() => setOpen((current) => !current)}
            aria-expanded={open}
          >
            <span className="admin-books-toc__chevron" aria-hidden="true">
              {open ? "▾" : "▸"}
            </span>
            <span>
              <strong>{title}</strong>
              <span className="admin-books-toc__count">
                {visibleCount}개 항목
              </span>
            </span>
          </button>
        ) : (
          <div className="admin-books-toc__static-title">
            <strong>{title}</strong>
            <span className="admin-books-toc__count">
              {visibleCount}개 항목
            </span>
          </div>
        )}
      </header>

      {open ? (
        <>
          <div className="admin-books-toc__toolbar">
            <div className="admin-books-toc__actions">
              <button
                type="button"
                className="admin-button"
                onClick={() => {
                  setFolderParentId(null);
                  setFolderLabel("");
                }}
              >
                + 폴더
              </button>
              <button
                type="button"
                className="admin-button"
                onClick={() => {
                  if (
                    pending.length === 0 ||
                    window.confirm("저장하지 않은 변경을 버리고 다시 불러올까요?")
                  ) {
                    void load();
                  }
                }}
                disabled={loading || working}
              >
                새로고침
              </button>
              {pending.length > 0 ? (
                <span className="admin-books-toc__dirty">
                  저장 안 됨 · {pending.length}개 변경
                </span>
              ) : null}
              <button
                type="button"
                className="admin-button primary"
                onClick={() => void save()}
                disabled={working || pending.length === 0}
              >
                저장
              </button>
              <button
                type="button"
                className="admin-button"
                onClick={() => {
                  if (
                    pending.length === 0 ||
                    window.confirm("저장하지 않은 변경을 버릴까요?")
                  ) {
                    void load();
                  }
                }}
                disabled={working || pending.length === 0}
              >
                변경 취소
              </button>
            </div>

            {onSelectParent ? (
              <div className="admin-books-toc__select-actions">
                <button
                  type="button"
                  className={[
                    "admin-button",
                    selectedParentId === null ? "primary" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => selectParent(null)}
                >
                  목차 최상위에 배치
                </button>
                {selectedChapterId !== null &&
                chapters.some((chapter) => chapter.id === selectedChapterId) &&
                !placedChapterIds.has(selectedChapterId) ? (
                  <button
                    type="button"
                    className="admin-button"
                    onClick={() =>
                      createPost(selectedChapterId, selectedParentId)
                    }
                  >
                    이 챕터를 목차에 등록
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>

          {folderParentId === null ? (
            <div className="admin-books-toc__inline-form">
              <input
                value={folderLabel}
                autoFocus
                placeholder="새 폴더 이름"
                aria-label="새 폴더 이름"
                onChange={(event) => setFolderLabel(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    createFolder(null, folderLabel);
                  } else if (event.key === "Escape") {
                    setFolderParentId(undefined);
                  }
                }}
              />
              <button
                type="button"
                className="admin-button primary"
                onClick={() => createFolder(null, folderLabel)}
              >
                만들기
              </button>
              <button
                type="button"
                className="admin-button"
                onClick={() => setFolderParentId(undefined)}
              >
                취소
              </button>
            </div>
          ) : null}

          {loading ? (
            <p className="admin-books-empty">목차를 불러오는 중…</p>
          ) : visibleTree.length === 0 ? (
            <p className="admin-books-empty admin-books-toc__empty">
              등록된 목차가 없습니다.
            </p>
          ) : (
            <div className="admin-books-toc__tree">
              {visibleTree.map((node) => renderNode(node, 0))}
            </div>
          )}
        </>
      ) : null}
    </section>
  );
}
