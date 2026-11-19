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

interface FolderOption {
  id: number | null;
  label: string;
}

interface DropTarget {
  parentId: number | null;
  position: number;
  sourceId?: number;
}

type DropMode = "before" | "after" | "inside";

const ROOT_OPTION: FolderOption = { id: null, label: "목차 최상위" };

function flattenNodes(nodes: ManageTocNode[]): ManageTocNode[] {
  return nodes.flatMap((node) => [node, ...flattenNodes(node.children)]);
}

function folderTree(nodes: ManageTocNode[]): ManageTocNode[] {
  return nodes
    .filter((node) => node.node_type === "folder")
    .map((node) => ({ ...node, children: folderTree(node.children) }));
}

function collectFolderOptions(
  nodes: ManageTocNode[],
  blocked: Set<number> = new Set(),
  depth = 0,
): FolderOption[] {
  const options: FolderOption[] = [];
  for (const node of nodes) {
    if (node.node_type !== "folder" || blocked.has(node.id)) continue;
    options.push({
      id: node.id,
      label: `${"　".repeat(depth)}${node.label ?? "폴더"}`,
    });
    options.push(...collectFolderOptions(node.children, blocked, depth + 1));
  }
  return options;
}

function descendantIds(node: ManageTocNode): number[] {
  return node.children.flatMap((child) => [child.id, ...descendantIds(child)]);
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
  const dragRef = useRef<{ kind: "node" | "chapter"; id: number } | null>(
    null,
  );
  const onSelectParentRef = useRef(onSelectParent);
  onSelectParentRef.current = onSelectParent;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await apiFetch<ManageTocNode[]>(
        `/api/books/${bookId}/toc/manage`,
      );
      setTree(next);
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
  const folderOptions = useMemo(() => collectFolderOptions(tree), [tree]);

  const run = async (
    action: () => Promise<ManageTocNode[]>,
    success: string,
  ) => {
    setWorking(true);
    try {
      setTree(await action());
      notify("success", success);
    } catch (caught) {
      notify("error", (caught as Error).message);
    } finally {
      setWorking(false);
    }
  };

  const selectParent = (parentId: number | null) => {
    onSelectParentRef.current?.(parentId);
  };

  const createFolder = async (parentId: number | null, label: string) => {
    const title = label.trim();
    if (!title) return;
    await run(
      () =>
        apiFetch<ManageTocNode[]>(`/api/books/${bookId}/toc/folders`, {
          method: "POST",
          body: JSON.stringify({ label: title, parent_id: parentId }),
        }),
      "폴더를 만들었습니다.",
    );
    setFolderParentId(undefined);
    setFolderLabel("");
    selectParent(parentId);
  };

  const createPost = async (
    chapterId: number,
    parentId: number | null,
    position?: number,
  ) => {
    await run(
      () =>
        apiFetch<ManageTocNode[]>(`/api/books/${bookId}/toc/posts`, {
          method: "POST",
          body: JSON.stringify({
            chapter_id: chapterId,
            parent_id: parentId,
            ...(position === undefined ? {} : { position }),
          }),
        }),
      "게시글을 목차에 등록했습니다.",
    );
    if (chapterId === selectedChapterId) selectParent(parentId);
  };

  const renameFolder = async (node: ManageTocNode) => {
    const title = renameLabel.trim();
    if (!title) return;
    await run(
      () =>
        apiFetch<ManageTocNode[]>(
          `/api/books/${bookId}/toc/nodes/${node.id}`,
          {
            method: "PATCH",
            body: JSON.stringify({ label: title }),
          },
        ),
      "이름을 변경했습니다.",
    );
    setRenamingId(null);
  };

  const moveNode = async (
    nodeId: number,
    parentId: number | null,
    position: number,
  ) => {
    const movedNode = allNodes.find((node) => node.id === nodeId);
    await run(
      () =>
        apiFetch<ManageTocNode[]>(
          `/api/books/${bookId}/toc/nodes/${nodeId}/move`,
          {
            method: "POST",
            body: JSON.stringify({ parent_id: parentId, position }),
          },
        ),
      "목차 위치를 변경했습니다.",
    );
    if (
      selectedChapterId !== null &&
      movedNode?.chapter_id === selectedChapterId
    ) {
      selectParent(parentId);
    }
  };

  const moveViaSelect = async (node: ManageTocNode, parentId: number | null) => {
    await moveNode(node.id, parentId, 10_000);
  };

  const removeNode = async (node: ManageTocNode) => {
    await run(
      () =>
        apiFetch<ManageTocNode[]>(
          `/api/books/${bookId}/toc/nodes/${node.id}`,
          { method: "DELETE" },
        ),
      "목차에서 삭제했습니다.",
    );
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
    const blocked = new Set(
      node.node_type === "folder" ? [node.id, ...descendantIds(node)] : [],
    );
    const options = [ROOT_OPTION, ...collectFolderOptions(tree, blocked)];
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
          <span className="admin-books-toc__icon" aria-hidden="true">
            {node.node_type === "folder" ? "▣" : "·"}
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
                    void renameFolder(node);
                  } else if (event.key === "Escape") {
                    setRenamingId(null);
                  }
                }}
              />
              <button
                type="button"
                className="admin-button"
                onClick={() => void renameFolder(node)}
              >
                저장
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
              >
                {node.label}
              </span>
              {node.pinned ? (
                <span className="admin-books-pin-badge">고정</span>
              ) : null}
              {node.locked ? (
                <span className="admin-books-pin-badge">보호</span>
              ) : null}
              {node.node_type === "folder" ? (
                <button
                  type="button"
                  className="admin-button"
                  onClick={() => {
                    setFolderParentId(node.id);
                    setFolderLabel("");
                  }}
                >
                  하위 폴더
                </button>
              ) : null}
              <select
                value={node.parent_id ?? ""}
                aria-label={`${node.label} 위치`}
                onChange={(event) =>
                  void moveViaSelect(
                    node,
                    event.target.value ? Number(event.target.value) : null,
                  )
                }
                disabled={working}
              >
                {options.map((option) => (
                  <option value={option.id ?? ""} key={option.id ?? "root"}>
                    {option.label}
                  </option>
                ))}
              </select>
              {node.node_type === "folder" ? (
                <button
                  type="button"
                  className="admin-button"
                  onClick={() => {
                    setRenamingId(node.id);
                    setRenameLabel(node.label ?? "");
                  }}
                >
                  이름 변경
                </button>
              ) : null}
              <button
                type="button"
                className="admin-button danger"
                onClick={() => void removeNode(node)}
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
                  void createFolder(node.id, folderLabel);
                } else if (event.key === "Escape") {
                  setFolderParentId(undefined);
                }
              }}
            />
            <button
              type="button"
              className="admin-button primary"
              onClick={() => void createFolder(node.id, folderLabel)}
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
              onClick={() => void load()}
              disabled={loading}
            >
              새로고침
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
                    void createPost(selectedChapterId, selectedParentId)
                  }
                >
                  이 챕터를 목차에 등록
                </button>
              ) : null}
            </div>
          ) : null}

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
                    void createFolder(null, folderLabel);
                  } else if (event.key === "Escape") {
                    setFolderParentId(undefined);
                  }
                }}
              />
              <button
                type="button"
                className="admin-button primary"
                onClick={() => void createFolder(null, folderLabel)}
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
            <p className="admin-books-empty">등록된 목차가 없습니다.</p>
          ) : (
            <div className="admin-books-toc__tree">
              {visibleTree.map((node) => renderNode(node, 0))}
              <div
                className={[
                  "admin-books-toc__root-drop",
                  dropKey === "root" ? "is-active" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDropKey("root");
                }}
                onDragLeave={() => setDropKey(null)}
                onDrop={(event) => void applyDrop(event, rootTarget)}
              >
                여기에 놓으면 목차 최상위로 이동합니다.
              </div>
            </div>
          )}
        </>
      ) : null}
    </section>
  );
}
