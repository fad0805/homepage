"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { apiFetch } from "@/lib/api";
import type { ManageTocNode } from "@/app/books/types";

import "@/public/styles/toc-picker.scss";

interface TocPickerProps {
  bookId: number;
  chapterId?: number | null;
  onChange: (parentId: number | null) => void;
}

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

function flattenNodes(nodes: ManageTocNode[]): ManageTocNode[] {
  return nodes.flatMap((node) => [node, ...flattenNodes(node.children)]);
}

function findPostParent(
  nodes: ManageTocNode[],
  chapterId: number,
): { found: boolean; parentId: number | null } {
  for (const node of nodes) {
    if (node.node_type === "post" && node.chapter_id === chapterId) {
      return { found: true, parentId: node.parent_id };
    }
    const nested = findPostParent(node.children, chapterId);
    if (nested.found) return nested;
  }
  return { found: false, parentId: null };
}

export function TocPicker({ bookId, chapterId, onChange }: TocPickerProps) {
  const [tree, setTree] = useState<ManageTocNode[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState("");
  const [creatingUnder, setCreatingUnder] = useState<number | null | undefined>(
    undefined,
  );
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameLabel, setRenameLabel] = useState("");
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await apiFetch<ManageTocNode[]>(
        `/api/books/${bookId}/toc/manage`,
      );
      setTree(next);
      if (chapterId != null) {
        const existing = findPostParent(next, chapterId);
        const parentId = existing.found ? existing.parentId : null;
        setSelectedId(parentId);
        onChangeRef.current(parentId);
      } else {
        setSelectedId((current) =>
          current === null || findNode(next, current) ? current : null,
        );
      }
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setLoading(false);
    }
  }, [bookId, chapterId]);

  useEffect(() => {
    void load();
  }, [load]);

  const select = (parentId: number | null) => {
    setSelectedId(parentId);
    onChangeRef.current(parentId);
  };

  const refreshAfterChange = async (nextTree: ManageTocNode[]) => {
    setTree(nextTree);
    if (selectedId !== null && !findNode(nextTree, selectedId)) {
      select(null);
    }
  };

  const createFolder = async (parentId: number | null, label: string) => {
    const title = label.trim();
    if (!title) return;
    try {
      const nextTree = await apiFetch<ManageTocNode[]>(
        `/api/books/${bookId}/toc/folders`,
        {
          method: "POST",
          body: JSON.stringify({ label: title, parent_id: parentId }),
        },
      );
      setNewLabel("");
      setCreatingUnder(undefined);
      const created = flattenNodes(nextTree);
      const match = created.find(
        (node) =>
          node.node_type === "folder" &&
          node.label === title &&
          node.parent_id === parentId,
      );
      if (match) select(match.id);
      await refreshAfterChange(nextTree);
    } catch (caught) {
      setError((caught as Error).message);
    }
  };

  const renameFolder = async (node: ManageTocNode) => {
    const title = renameLabel.trim();
    if (!title) return;
    try {
      const nextTree = await apiFetch<ManageTocNode[]>(
        `/api/books/${bookId}/toc/nodes/${node.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ label: title }),
        },
      );
      setRenamingId(null);
      await refreshAfterChange(nextTree);
    } catch (caught) {
      setError((caught as Error).message);
    }
  };

  const removeNode = async (node: ManageTocNode) => {
    try {
      const nextTree = await apiFetch<ManageTocNode[]>(
        `/api/books/${bookId}/toc/nodes/${node.id}`,
        { method: "DELETE" },
      );
      await refreshAfterChange(nextTree);
    } catch (caught) {
      setError((caught as Error).message);
    }
  };

  const renderNode = (node: ManageTocNode, depth: number) => {
    const indent = { paddingLeft: `${0.4 + depth * 1.1}rem` };
    if (node.node_type === "post") {
      return (
        <div className="toc-picker__row is-post" style={indent} key={node.id}>
          <span className="toc-picker__post">
            {node.locked ? "🔒 " : ""}
            {node.label ?? "게시글"}
          </span>
        </div>
      );
    }
    return (
      <div key={node.id}>
        <div
          className={`toc-picker__row${
            selectedId === node.id ? " is-selected" : ""
          }`}
          style={indent}
        >
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
              <button type="button" onClick={() => void renameFolder(node)}>
                저장
              </button>
              <button type="button" onClick={() => setRenamingId(null)}>
                취소
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="toc-picker__select"
                onClick={() => select(node.id)}
              >
                {node.label ?? "폴더"}
              </button>
              <button
                type="button"
                className="toc-picker__mini"
                title="이 폴더 안에 새 폴더"
                onClick={() => {
                  setCreatingUnder(node.id);
                  setNewLabel("");
                }}
              >
                +
              </button>
              <button
                type="button"
                className="toc-picker__mini"
                title="이름 변경"
                onClick={() => {
                  setRenamingId(node.id);
                  setRenameLabel(node.label ?? "");
                }}
              >
                ✎
              </button>
              <button
                type="button"
                className="toc-picker__mini is-danger"
                title="삭제"
                onClick={() => void removeNode(node)}
              >
                ×
              </button>
            </>
          )}
        </div>
        {node.children.map((child) => renderNode(child, depth + 1))}
      </div>
    );
  };

  return (
    <div className="toc-picker">
      <div className="toc-picker__head">
        <strong>공개 목차 위치</strong>
        {loading ? <span>불러오는 중…</span> : null}
      </div>
      <button
        type="button"
        className={`toc-picker__root${
          selectedId === null ? " is-selected" : ""
        }`}
        onClick={() => select(null)}
      >
        목차 최상위
      </button>
      <div className="toc-picker__tree">
        {tree.length === 0 && !loading ? (
          <p className="toc-picker__empty">폴더가 없습니다.</p>
        ) : (
          tree.map((node) => renderNode(node, 0))
        )}
      </div>
      {creatingUnder !== undefined ? (
        <div className="toc-picker__create">
          <input
            value={newLabel}
            autoFocus
            placeholder="새 폴더 이름"
            aria-label="새 폴더 이름"
            onChange={(event) => setNewLabel(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void createFolder(creatingUnder, newLabel);
              } else if (event.key === "Escape") {
                setCreatingUnder(undefined);
              }
            }}
          />
          <button
            type="button"
            onClick={() => void createFolder(creatingUnder, newLabel)}
          >
            추가
          </button>
          <button type="button" onClick={() => setCreatingUnder(undefined)}>
            취소
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="toc-picker__add"
          onClick={() => {
            setCreatingUnder(selectedId);
            setNewLabel("");
          }}
        >
          + 선택한 위치에 폴더 만들기
        </button>
      )}
      {error ? <p className="toc-picker__error">{error}</p> : null}
    </div>
  );
}
