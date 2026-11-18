"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { apiFetch } from "@/lib/api";

import "@/public/styles/admin/project-picker.scss";

interface Project {
  id: number;
  title: string;
  linked_book_id: number | null;
  linked_book_title: string | null;
  node_count: number;
  created_at: string | null;
  updated_at: string | null;
}

interface ManuscriptProjectPickerProps {
  open: boolean;
  onClose: () => void;
}

export function ManuscriptProjectPicker({
  open,
  onClose,
}: ManuscriptProjectPickerProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [query, setQuery] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setProjects(await apiFetch<Project[]>("/api/manuscript/projects"));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return projects;
    return projects.filter((project) =>
      project.title.toLocaleLowerCase().includes(needle),
    );
  }, [projects, query]);

  const createProject = async () => {
    const title = newTitle.trim();
    if (!title || saving) return;
    setSaving(true);
    setError("");
    try {
      await apiFetch("/api/manuscript/projects", {
        method: "POST",
        body: JSON.stringify({ title }),
      });
      setNewTitle("");
      setNotice("프로젝트를 만들었습니다.");
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const deleteProject = async (project: Project) => {
    if (
      !window.confirm(
        `“${project.title}” 프로젝트와 안의 모든 원고를 삭제할까요?`,
      )
    ) {
      return;
    }
    setError("");
    try {
      await apiFetch(`/api/manuscript/projects/${project.id}`, {
        method: "DELETE",
      });
      setNotice("프로젝트를 삭제했습니다.");
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const openProject = (project: Project) => {
    window.open(
      `/manuscript?project=${project.id}`,
      "_blank",
      "noopener,noreferrer",
    );
    onClose();
  };

  if (!open) return null;

  return (
    <div
      className="ms-picker-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="ms-picker"
        role="dialog"
        aria-modal="true"
        aria-label="원고 프로젝트"
      >
        <div className="ms-picker__header">
          <h2>원고 프로젝트</h2>
          <button
            type="button"
            className="ms-picker__close"
            onClick={onClose}
            aria-label="닫기"
          >
            ×
          </button>
        </div>
        <div className="ms-picker__body">
          <div className="ms-picker__toolbar">
            <label className="ms-picker__field">
              <span>제목 검색</span>
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="프로젝트 제목"
              />
            </label>
            <div className="ms-picker__create">
              <input
                value={newTitle}
                onChange={(event) => setNewTitle(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void createProject();
                  }
                }}
                placeholder="새 프로젝트 이름"
                aria-label="새 프로젝트 이름"
              />
              <button
                type="button"
                className="ms-picker__button ms-picker__button--primary"
                onClick={() => void createProject()}
                disabled={saving || !newTitle.trim()}
              >
                {saving ? "만드는 중..." : "만들기"}
              </button>
            </div>
          </div>

          {error ? <p className="ms-picker__notice is-error">{error}</p> : null}
          {notice ? (
            <p className="ms-picker__notice is-success">{notice}</p>
          ) : null}

          {loading ? (
            <p className="ms-picker__empty">불러오는 중...</p>
          ) : filtered.length === 0 ? (
            <p className="ms-picker__empty">
              {projects.length === 0
                ? "원고 프로젝트가 없습니다. 새 프로젝트를 만들어주세요."
                : "검색 조건에 맞는 프로젝트가 없습니다."}
            </p>
          ) : (
            <ul className="ms-picker__list">
              {filtered.map((project) => (
                <li
                  key={project.id}
                  className="ms-picker__item"
                  onDoubleClick={() => openProject(project)}
                  title="더블클릭하여 편집기에서 열기"
                >
                  <span className="ms-picker__icon">▤</span>
                  <span className="ms-picker__info">
                    <strong>{project.title}</strong>
                    <small>
                      {project.linked_book_title ?? "연결된 책 없음"} · 노드{" "}
                      {project.node_count}개
                    </small>
                  </span>
                  <button
                    type="button"
                    className="ms-picker__button ms-picker__button--danger"
                    onClick={(event) => {
                      event.stopPropagation();
                      void deleteProject(project);
                    }}
                  >
                    삭제
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="ms-picker__footer">
          프로젝트를 더블클릭하면 새 탭에서 편집기가 열립니다.
        </div>
      </div>
    </div>
  );
}
