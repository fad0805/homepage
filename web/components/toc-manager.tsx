"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { ManageTocNode } from "@/app/books/types";
import { apiFetch } from "@/lib/api";

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
}

interface FolderOption {
  id: number | null;
  label: string;
}

const ROOT_OPTION: FolderOption = { id: null, label: "목차 최상위" };

function flattenNodes(nodes: ManageTocNode[]): ManageTocNode[] {
  return nodes.flatMap((node) => [node, ...flattenNodes(node.children)]);
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

export function TocManager({ bookId, chapters, notify }: TocManagerProps) {
  const [tree, setTree] = useState<ManageTocNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [folderParentId, setFolderParentId] = useState<
    number | null | undefined
  >(undefined);
  const [folderLabel, setFolderLabel] = useState("");
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameLabel, setRenameLabel] = useState("");
  const [postOpen, setPostOpen] = useState(false);
  const [postChapterId, setPostChapterId] = useState<number | null>(null);
  const [postParentId, setPostParentId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await apiFetch<ManageTocNode[]>(
        `/api/books/${bookId}/toc/manage`,
      );
      setTree(next);
    } catch (caught) {
      notify("error", (caught as Error).message);
    } finally {
      setLoading(false);
    }
  }, [bookId, notify]);

  useEffect(() => {
    void load();
  }, [load]);

  const allNodes = useMemo(() => flattenNodes(tree), [tree]);
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
  const availableChapters = useMemo(
    () => chapters.filter((chapter) => !placedChapterIds.has(chapter.id)),
    [chapters, placedChapterIds],
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
  };

  const createPost = async () => {
    if (postChapterId === null) return;
    await run(
      () =>
        apiFetch<ManageTocNode[]>(`/api/books/${bookId}/toc/posts`, {
          method: "POST",
          body: JSON.stringify({
            chapter_id: postChapterId,
            parent_id: postParentId,
          }),
        }),
      "게시글을 목차에 등록했습니다.",
    );
    setPostOpen(false);
    setPostChapterId(null);
    setPostParentId(null);
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

  const moveNode = async (node: ManageTocNode, parentId: number | null) => {
    await run(
      () =>
        apiFetch<ManageTocNode[]>(
          `/api/books/${bookId}/toc/nodes/${node.id}`,
          {
            method: "PATCH",
            body: JSON.stringify({ parent_id: parentId }),
          },
        ),
      "위치를 변경했습니다.",
    );
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

  const renderNode = (node: ManageTocNode, depth: number) => {
    const blocked = new Set(
      node.node_type === "folder"
        ? [node.id, ...descendantIds(node)]
        : [],
    );
    const options = [ROOT_OPTION, ...collectFolderOptions(tree, blocked)];
    const indent = { marginLeft: `${depth * 1.1}rem` };

    return (
      <div className="admin-books-toc__branch" key={node.id}>
        <div className="admin-books-toc__row" style={indent}>
          <span className="admin-books-toc__icon" aria-hidden="true">
            {node.node_type === "folder" ? "▣" : "·"}
          </span>
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
              <span className="admin-books-toc__label">{node.label}</span>
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
                  void moveNode(
                    node,
                    event.target.value ? Number(event.target.value) : null,
                  )
                }
                disabled={working}
              >
                {options.map((option) => (
                  <option
                    value={option.id ?? ""}
                    key={option.id ?? "root"}
                  >
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
    <section className="admin-books-panel admin-books-toc-panel">
      <div className="admin-books-toc__head">
        <div>
          <h2>공개 목차</h2>
          <p className="admin-books-hint">
            독자에게 보이는 목차 트리를 관리합니다. 챕터를 삭제해도 게시글은
            남습니다.
          </p>
        </div>
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
              setPostOpen((current) => !current);
              setPostParentId(null);
              setPostChapterId(availableChapters[0]?.id ?? null);
            }}
            disabled={availableChapters.length === 0}
          >
            + 챕터 등록
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

      {postOpen && availableChapters.length > 0 ? (
        <div className="admin-books-toc__inline-form">
          <select
            value={postChapterId ?? ""}
            aria-label="등록할 챕터"
            onChange={(event) => setPostChapterId(Number(event.target.value))}
          >
            {availableChapters.map((chapter) => (
              <option value={chapter.id} key={chapter.id}>
                {chapter.title}
              </option>
            ))}
          </select>
          <select
            value={postParentId ?? ""}
            aria-label="등록할 목차 위치"
            onChange={(event) =>
              setPostParentId(
                event.target.value ? Number(event.target.value) : null,
              )
            }
          >
            {folderOptions.map((option) => (
              <option value={option.id ?? ""} key={option.id ?? "root"}>
                {option.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="admin-button primary"
            onClick={() => void createPost()}
          >
            등록
          </button>
          <button
            type="button"
            className="admin-button"
            onClick={() => setPostOpen(false)}
          >
            취소
          </button>
        </div>
      ) : null}

      {loading ? (
        <p className="admin-books-empty">목차를 불러오는 중…</p>
      ) : tree.length === 0 ? (
        <p className="admin-books-empty">등록된 목차가 없습니다.</p>
      ) : (
        <div className="admin-books-toc__tree">
          {tree.map((node) => renderNode(node, 0))}
        </div>
      )}
    </section>
  );
}
