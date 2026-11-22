"use client";

import { useMemo, useState } from "react";
import { apiDownload } from "@/lib/api";

import type { ManuscriptNode } from "./manuscript-types";

interface ManuscriptExportModalProps {
  projectId: number;
  projectTitle: string;
  tree: ManuscriptNode[];
  onClose: () => void;
  onBeforeExport: () => Promise<boolean>;
  notify: (text: string, type?: "success" | "error") => void;
}

export function ManuscriptExportModal({
  projectId,
  projectTitle,
  tree,
  onClose,
  onBeforeExport,
  notify,
}: ManuscriptExportModalProps) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [expanded, setExpanded] = useState<Set<number>>(
    () =>
      new Set(
        tree
          .filter((node) => node.node_type === "folder")
          .map((node) => node.id),
      ),
  );
  const [busy, setBusy] = useState<"all" | "partial" | null>(null);

  const childrenByParent = useMemo(() => {
    const map = new Map<number | null, ManuscriptNode[]>();
    for (const node of tree) {
      const siblings = map.get(node.parent_id) ?? [];
      siblings.push(node);
      map.set(node.parent_id, siblings);
    }
    return map;
  }, [tree]);

  const parentById = useMemo(
    () => new Map(tree.map((node) => [node.id, node.parent_id])),
    [tree],
  );

  const toggleExpanded = (id: number) => {
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelected = (node: ManuscriptNode, checked: boolean) => {
    setSelected((previous) => {
      const next = new Set(previous);
      const apply = (current: ManuscriptNode, value: boolean) => {
        if (value) next.add(current.id);
        else next.delete(current.id);
        for (const child of childrenByParent.get(current.id) ?? []) {
          apply(child, value);
        }
      };
      apply(node, checked);
      if (!checked) {
        // A folder is only selected when all of its descendants are. Dropping
        // one child must drop its ancestors too, or the export would silently
        // re-include the unchecked document.
        let parent = parentById.get(node.id);
        while (parent !== null && parent !== undefined) {
          next.delete(parent);
          parent = parentById.get(parent);
        }
      }
      return next;
    });
  };

  const download = async (nodeIds: number[] | null, mode: "all" | "partial") => {
    if (busy !== null) return;
    if (!(await onBeforeExport())) return;
    setBusy(mode);
    try {
      const { blob, filename } = await apiDownload(
        `/api/manuscript/projects/${projectId}/scrivener/export`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ node_ids: nodeIds }),
        },
      );
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename ?? `${projectTitle}.scriv.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      notify(
        mode === "all"
          ? "전체 원고를 내보냈습니다."
          : "선택한 원고를 내보냈습니다.",
      );
      onClose();
    } catch (error) {
      notify((error as Error).message, "error");
    } finally {
      setBusy(null);
    }
  };

  const renderRow = (node: ManuscriptNode, depth: number) => {
    const children = childrenByParent.get(node.id) ?? [];
    const hasChildren = children.length > 0;
    const isExpanded = expanded.has(node.id);
    return (
      <div key={node.id}>
        <div
          className="ms-export-row"
          style={{ paddingLeft: `${depth * 0.9}rem` }}
        >
          {hasChildren ? (
            <button
              type="button"
              className="ms-export-row__toggle"
              onClick={() => toggleExpanded(node.id)}
              aria-label={isExpanded ? "접기" : "펼치기"}
            >
              {isExpanded ? "▾" : "▸"}
            </button>
          ) : (
            <span className="ms-export-row__toggle" aria-hidden="true" />
          )}
          <input
            type="checkbox"
            checked={selected.has(node.id)}
            onChange={(event) => toggleSelected(node, event.target.checked)}
            aria-label={`${node.title} 선택`}
          />
          <span className="ms-export-row__title">{node.title}</span>
          <span className="ms-export-row__type">
            {node.node_type === "folder" ? "폴더" : "문서"}
          </span>
        </div>
        {hasChildren && isExpanded
          ? children.map((child) => renderRow(child, depth + 1))
          : null}
      </div>
    );
  };

  const roots = childrenByParent.get(null) ?? [];

  return (
    <div className="ms-modal-backdrop" onClick={onClose}>
      <div
        className="ms-modal ms-modal--export"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="ms-modal__header">
          <h2>원고 내보내기</h2>
          <button type="button" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </div>
        <p className="ms-modal__hint">
          내보내기 전에 현재 변경 사항을 저장합니다. 스크리브너 프로젝트
          파일로 내려받습니다.
        </p>

        <div className="ms-export-section">
          <div className="ms-export-section__head">
            <strong>전체 내보내기</strong>
            <span>프로젝트의 모든 원고</span>
          </div>
          <button
            type="button"
            className="ms-button ms-button--primary"
            onClick={() => void download(null, "all")}
            disabled={busy !== null}
          >
            {busy === "all" ? "내보내는 중…" : "전체 내보내기"}
          </button>
        </div>

        <div className="ms-export-section">
          <div className="ms-export-section__head">
            <strong>부분 내보내기</strong>
            <span>선택 {selected.size}개</span>
          </div>
          <div className="ms-export-controls">
            <button
              type="button"
              onClick={() => setSelected(new Set(tree.map((node) => node.id)))}
              disabled={busy !== null}
            >
              전체 선택
            </button>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              disabled={busy !== null || selected.size === 0}
            >
              선택 해제
            </button>
          </div>
          <div className="ms-export-tree">
            {roots.length > 0 ? (
              roots.map((node) => renderRow(node, 0))
            ) : (
              <p className="ms-export-empty">내보낼 원고가 없습니다.</p>
            )}
          </div>
          <div className="ms-modal__footer">
            <button type="button" onClick={onClose} disabled={busy !== null}>
              취소
            </button>
            <button
              type="button"
              className="ms-button ms-button--primary"
              onClick={() => void download([...selected], "partial")}
              disabled={busy !== null || selected.size === 0}
            >
              {busy === "partial" ? "내보내는 중…" : "선택 내보내기"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
