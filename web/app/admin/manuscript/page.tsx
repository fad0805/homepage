"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { apiDownload, apiFetch } from "@/lib/api";

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

interface Book {
  id: number;
  title: string;
}

type Notice = { type: "success" | "error"; text: string };

export default function AdminManuscriptPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [query, setQuery] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [bookModalProject, setBookModalProject] = useState<Project | null>(null);
  const [books, setBooks] = useState<Book[]>([]);
  const [bookQuery, setBookQuery] = useState("");
  const [bookLoading, setBookLoading] = useState(false);
  const [fileBusyId, setFileBusyId] = useState<number | null>(null);
  const [importing, setImporting] = useState(false);

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

  const filteredBooks = useMemo(() => {
    const needle = bookQuery.trim().toLocaleLowerCase();
    if (!needle) return books;
    return books.filter((book) =>
      book.title.toLocaleLowerCase().includes(needle),
    );
  }, [books, bookQuery]);

  const openBookModal = async (project: Project) => {
    setBookModalProject(project);
    setBookQuery("");
    setBookLoading(true);
    try {
      setBooks(await apiFetch<Book[]>("/api/books?mine=true"));
    } catch (error) {
      setNotice({ type: "error", text: (error as Error).message });
    } finally {
      setBookLoading(false);
    }
  };

  const assignBook = async (bookId: number | null) => {
    const project = bookModalProject;
    if (!project) return;
    try {
      await apiFetch(`/api/manuscript/projects/${project.id}`, {
        method: "PATCH",
        body: JSON.stringify({ linked_book_id: bookId }),
      });
      setNotice({
        type: "success",
        text: bookId === null ? "책 연결을 해제했습니다." : "책을 연결했습니다.",
      });
      setBookModalProject(null);
      await load();
    } catch (error) {
      setNotice({ type: "error", text: (error as Error).message });
    }
  };

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

  const importScrivener = async (file: File) => {
    setImporting(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const result = await apiFetch<{
        project_title: string;
        imported_count: number;
      }>("/api/manuscript/scrivener/import", {
        method: "POST",
        body: form,
      });
      setNotice({
        type: "success",
        text: `“${result.project_title || file.name}” 프로젝트를 만들었습니다. (${result.imported_count}개 노드)`,
      });
      await load();
    } catch (error) {
      setNotice({ type: "error", text: (error as Error).message });
    } finally {
      setImporting(false);
    }
  };

  const exportScrivener = async (project: Project) => {
    setFileBusyId(project.id);
    try {
      const { blob, filename } = await apiDownload(
        `/api/manuscript/projects/${project.id}/scrivener/export`,
      );
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename ?? `${project.title}.scriv.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setNotice({
        type: "success",
        text: "스크리브너 프로젝트 파일을 내려받았습니다.",
      });
    } catch (error) {
      setNotice({ type: "error", text: (error as Error).message });
    } finally {
      setFileBusyId(null);
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
            프로젝트 이름을 클릭하면 새 탭에서 원고 편집기가 열립니다.
          </p>
        </div>
        <div className="admin-manuscript-actions">
          <label className="admin-manuscript-field">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="제목 검색"
              aria-label="제목 검색"
            />
          </label>
          <div className="admin-manuscript-actions-right">
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
        </div>
      </header>

      {notice ? (
        <div className={`admin-manuscript-notice is-${notice.type}`}>
          {notice.text}
        </div>
      ) : null}

      <div className="admin-manuscript-import">
        <label className="admin-manuscript-button is-primary">
          <input
            type="file"
            className="admin-manuscript-file-input"
            accept=".zip,.scriv,application/zip"
            disabled={importing}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void importScrivener(file);
            }}
          />
          {importing ? "불러오는 중..." : "스크리브너 불러오기"}
        </label>
        <span className="admin-manuscript-hint">
          .scriv 프로젝트의 zip 파일을 불러오면 새 원고 프로젝트가 만들어집니다.
        </span>
      </div>

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
            <span>파일</span>
          </div>
          {filtered.map((project) => {
            const busy = fileBusyId === project.id;
            return (
              <div key={project.id} className="admin-manuscript-row">
                <span
                  className="admin-manuscript-title"
                  role="button"
                  tabIndex={0}
                  onClick={() => openProject(project)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openProject(project);
                    }
                  }}
                  title="클릭하여 편집기에서 열기"
                >
                  {project.title}
                </span>
                <button
                  type="button"
                  className="admin-manuscript-book"
                  onClick={() => void openBookModal(project)}
                  title="연결할 책 선택"
                >
                  {project.linked_book_title ?? "연결된 책 없음"}
                </button>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={() => openProject(project)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openProject(project);
                    }
                  }}
                >
                  {project.node_count}
                </span>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={() => openProject(project)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openProject(project);
                    }
                  }}
                >
                  {project.updated_at ?? "—"}
                </span>
                <div className="admin-manuscript-row-actions">
                  <button
                    type="button"
                    className="admin-manuscript-button is-compact"
                    onClick={() => void exportScrivener(project)}
                    disabled={busy}
                    title="스크리브너 프로젝트 ZIP 내려받기"
                  >
                    내려받기
                  </button>
                  <button
                    type="button"
                    className="admin-manuscript-button is-compact is-danger"
                    onClick={() => void deleteProject(project)}
                    disabled={busy}
                  >
                    삭제
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {bookModalProject ? (
        <div
          className="ams-book-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setBookModalProject(null);
          }}
        >
          <div
            className="ams-book-modal"
            role="dialog"
            aria-modal="true"
            aria-label="연결할 책 선택"
          >
            <div className="ams-book-modal__header">
              <h2>책 연결 — {bookModalProject.title}</h2>
              <button
                type="button"
                className="ams-book-modal__close"
                onClick={() => setBookModalProject(null)}
                aria-label="닫기"
              >
                ×
              </button>
            </div>
            <div className="ams-book-modal__body">
              <label className="ams-book-modal__search">
                <span>책 제목 검색</span>
                <input
                  autoFocus
                  value={bookQuery}
                  onChange={(event) => setBookQuery(event.target.value)}
                  placeholder="책 제목"
                />
              </label>
              {bookLoading ? (
                <p className="ams-book-modal__empty">불러오는 중...</p>
              ) : filteredBooks.length === 0 ? (
                <p className="ams-book-modal__empty">
                  {books.length === 0
                    ? "책이 없습니다. 먼저 책장에서 책을 만들어주세요."
                    : "검색 조건에 맞는 책이 없습니다."}
                </p>
              ) : (
                <ul className="ams-book-modal__list">
                  {filteredBooks.map((book) => (
                    <li key={book.id}>
                      <button
                        type="button"
                        className={book.id === bookModalProject.linked_book_id ? "is-current" : ""}
                        onClick={() => void assignBook(book.id)}
                      >
                        {book.title}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="ams-book-modal__footer">
              <button
                type="button"
                className="admin-manuscript-button"
                onClick={() => void assignBook(null)}
              >
                연결 해제
              </button>
              <button
                type="button"
                className="admin-manuscript-button"
                onClick={() => setBookModalProject(null)}
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
