"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { apiFetch } from "@/lib/api";

import "@/public/styles/admin/manuscript.scss";

interface Project {
  id: number;
  title: string;
  linked_book_id: number | null;
  linked_book_title: string | null;
  node_count: number;
  created_at: string | null;
  updated_at: string | null;
}

type Notice = { type: "success" | "error"; text: string };

export default function AdminManuscriptPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [query, setQuery] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setProjects(await apiFetch<Project[]>("/api/manuscript/projects"));
    } catch (error) {
      setNotice({ type: "error", text: (error as Error).message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);

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
    try {
      await apiFetch("/api/manuscript/projects", {
        method: "POST",
        body: JSON.stringify({ title }),
      });
      setNewTitle("");
      setNotice({ type: "success", text: "프로젝트를 만들었습니다." });
      await load();
    } catch (error) {
      setNotice({ type: "error", text: (error as Error).message });
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
    try {
      await apiFetch(`/api/manuscript/projects/${project.id}`, {
        method: "DELETE",
      });
      setNotice({ type: "success", text: "프로젝트를 삭제했습니다." });
      await load();
    } catch (error) {
      setNotice({ type: "error", text: (error as Error).message });
    }
  };

  const openProject = (project: Project) => {
    window.open(
      `/manuscript?project=${project.id}`,
      "_blank",
      "noopener,noreferrer",
    );
  };

  return (
    <div id="admin-manuscript">
      <header className="admin-manuscript-toolbar">
        <div>
          <h1>원고 관리</h1>
          <p className="admin-manuscript-hint">
            프로젝트를 더블클릭하면 새 탭에서 원고 편집기가 열립니다.
          </p>
        </div>
        <div className="admin-manuscript-actions">
          <label className="admin-manuscript-field">
            <span>제목 검색</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="프로젝트 제목"
            />
          </label>
          <div className="admin-manuscript-create">
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
              className="admin-manuscript-button is-primary"
              onClick={() => void createProject()}
              disabled={saving || !newTitle.trim()}
            >
              {saving ? "만드는 중..." : "만들기"}
            </button>
          </div>
          <button
            type="button"
            className="admin-manuscript-button"
            onClick={() => void load()}
            disabled={loading}
          >
            새로고침
          </button>
        </div>
      </header>

      {notice ? (
        <div className={`admin-manuscript-notice is-${notice.type}`}>
          {notice.text}
        </div>
      ) : null}

      {loading ? (
        <p className="admin-manuscript-empty">불러오는 중...</p>
      ) : filtered.length === 0 ? (
        <p className="admin-manuscript-empty">
          {projects.length === 0
            ? "원고 프로젝트가 없습니다. 새 프로젝트를 만들어주세요."
            : "검색 조건에 맞는 프로젝트가 없습니다."}
        </p>
      ) : (
        <div className="admin-manuscript-table">
          <div className="admin-manuscript-row is-head">
            <span>프로젝트</span>
            <span>연결된 책</span>
            <span>노드</span>
            <span>수정일</span>
            <span />
          </div>
          {filtered.map((project) => (
            <div
              key={project.id}
              className="admin-manuscript-row"
              onDoubleClick={() => openProject(project)}
              title="더블클릭하여 편집기에서 열기"
            >
              <span className="admin-manuscript-title">
                <span className="admin-manuscript-icon">▤</span>
                {project.title}
              </span>
              <span>{project.linked_book_title ?? "—"}</span>
              <span>{project.node_count}</span>
              <span>{project.updated_at ?? "—"}</span>
              <button
                type="button"
                className="admin-manuscript-button is-danger"
                onClick={(event) => {
                  event.stopPropagation();
                  void deleteProject(project);
                }}
              >
                삭제
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
