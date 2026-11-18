"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from "react";
import { RichTextEditor, type EditorNotice } from "@/components/rich-text-editor";
import { apiFetch } from "@/lib/api";

import "@/public/styles/manuscript.scss";

interface Project {
  id: number;
  title: string;
  linked_book_id: number | null;
  linked_book_title: string | null;
  node_count: number;
}

interface ManuscriptNode {
  id: number;
  project_id: number;
  parent_id: number | null;
  node_type: "folder" | "chapter";
  title: string;
  subtitle: string | null;
  synopsis: string | null;
  status: string | null;
  notes: string | null;
  target_chars: number | null;
  position: number;
  char_count_with_spaces: number;
  char_count_plain: number;
  published_chapter_id: number | null;
  published_state:
    | "unpublished"
    | "published"
    | "needs_republish"
    | "chapter_edited"
    | "diverged"
    | "published_missing";
  body?: string | null;
  deleted_at?: string | null;
}

interface Book {
  id: number;
  title: string;
}

interface SearchResult {
  id: number;
  project_id: number;
  node_type: "folder" | "chapter";
  title: string;
  path: { id: number; title: string }[];
  snippet: string;
  char_count_with_spaces: number;
}

interface TrashItem {
  id: number;
  project_id: number;
  title: string;
  node_type: "folder" | "chapter";
  deleted_at: string | null;
  expires_at: string | null;
}

interface ScrivDoc {
  id: number;
  title: string;
  node_type: "folder" | "chapter";
  body: string | null;
  char_count_with_spaces: number;
  char_count_plain: number;
}

type Notice = { type: "success" | "error"; text: string };

const BLOCK_TAGS = new Set([
  "p",
  "div",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "blockquote",
  "li",
  "tr",
  "section",
  "article",
  "pre",
]);
const SOFT_BREAK = "\u0000";

function countText(html: string): { withSpaces: number; plain: number } {
  let text = "";
  const parser = new DOMParser().parseFromString(html || "", "text/html");
  const walk = (node: globalThis.Node) => {
    if (node.nodeType === globalThis.Node.TEXT_NODE) {
      text += node.textContent ?? "";
      return;
    }
    if (node.nodeType !== globalThis.Node.ELEMENT_NODE) return;
    const element = node as HTMLElement;
    const tag = element.tagName.toLowerCase();
    if (tag === "script" || tag === "style") return;
    if (tag === "br" || tag === "hr") {
      text += "\n";
      return;
    }
    const isBlock = BLOCK_TAGS.has(tag);
    if (isBlock && text && !text.endsWith("\n")) text += SOFT_BREAK;
    element.childNodes.forEach(walk);
    if (isBlock && text && !text.endsWith(SOFT_BREAK) && !text.endsWith("\n")) {
      text += SOFT_BREAK;
    }
  };
  parser.body.childNodes.forEach(walk);
  const normalized = text.replace(new RegExp(`${SOFT_BREAK}+$`), "").replaceAll(SOFT_BREAK, "\n");
  return {
    withSpaces: Array.from(normalized).length,
    plain: Array.from(normalized.replace(/\s+/gu, "")).length,
  };
}

const STATE_LABEL: Record<ManuscriptNode["published_state"], string> = {
  unpublished: "미발행",
  published: "발행됨",
  needs_republish: "재발행 필요",
  chapter_edited: "발행본 수정됨",
  diverged: "양쪽 수정됨",
  published_missing: "발행본 없음",
};

const EMPTY_FORM = {
  subtitle: "",
  synopsis: "",
  notes: "",
  body: "",
};

/** Split the combined folder document back into per-chapter bodies. */
function splitCombinedHtml(html: string): string[] {
  const parsed = new DOMParser().parseFromString(html || "", "text/html");
  const segments: string[] = [];
  let buffer: globalThis.Node[] = [];
  const flush = () => {
    const wrapper = document.createElement("div");
    buffer.forEach((node) => wrapper.appendChild(node.cloneNode(true)));
    segments.push(wrapper.innerHTML || "<p></p>");
    buffer = [];
  };
  parsed.body.childNodes.forEach((node) => {
    if (
      node.nodeType === globalThis.Node.ELEMENT_NODE &&
      (node as HTMLElement).tagName === "HR"
    ) {
      flush();
      return;
    }
    buffer.push(node);
  });
  flush();
  return segments;
}

export default function ManuscriptWorkspace() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<number | null>(null);
  const [newProjectTitle, setNewProjectTitle] = useState("");
  const [tree, setTree] = useState<ManuscriptNode[]>([]);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selected, setSelected] = useState<ManuscriptNode | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [dirty, setDirty] = useState(false);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [books, setBooks] = useState<Book[]>([]);
  const [publishBookId, setPublishBookId] = useState<number | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [trashOpen, setTrashOpen] = useState(false);
  const [trash, setTrash] = useState<TrashItem[]>([]);
  const [scrivenings, setScrivenings] = useState<ScrivDoc[] | null>(null);
  const [scrivCombinedHtml, setScrivCombinedHtml] = useState("");
  const [scrivDirty, setScrivDirty] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const dragId = useRef<number | null>(null);
  const cancelRename = useRef(false);

  const notify = useCallback((text: string, type: Notice["type"] = "success") => {
    setNotice({ type, text });
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 3600);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const loadProjects = useCallback(async () => {
    const [projectList, bookList] = await Promise.all([
      apiFetch<Project[]>("/api/manuscript/projects"),
      apiFetch<Book[]>("/api/books?mine=true"),
    ]);
    setProjects(projectList);
    setBooks(bookList);
    setProjectId((current) => current ?? projectList[0]?.id ?? null);
    if (bookList.length && !publishBookId) setPublishBookId(bookList[0].id);
  }, [publishBookId]);

  const loadTree = useCallback(async (id: number) => {
    const nodes = await apiFetch<ManuscriptNode[]>(
      `/api/manuscript/projects/${id}/tree`,
    );
    setTree(nodes);
    setExpanded((current) => {
      const next = new Set(current);
      nodes.forEach((node) => {
        if (node.node_type === "folder" && !next.has(node.id)) next.add(node.id);
      });
      return next;
    });
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        await loadProjects();
      } catch (error) {
        if (active) notify((error as Error).message, "error");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [loadProjects, notify]);

  useEffect(() => {
    if (!projectId) return;
    loadTree(projectId).catch((error: Error) => notify(error.message, "error"));
  }, [projectId, loadTree, notify]);

  useEffect(() => {
    if (!selectedId) {
      setSelected(null);
      setForm({ ...EMPTY_FORM });
      setDirty(false);
      setScrivenings(null);
      return;
    }
    let active = true;
    apiFetch<ManuscriptNode>(`/api/manuscript/nodes/${selectedId}`)
      .then((node) => {
        if (!active) return;
        setSelected(node);
        setForm({
          subtitle: node.subtitle ?? "",
          synopsis: node.synopsis ?? "",
          notes: node.notes ?? "",
          body: node.body ?? "",
        });
        setDirty(false);
      })
      .catch((error: Error) => notify(error.message, "error"));
    return () => {
      active = false;
    };
  }, [selectedId, notify]);

  useEffect(() => {
    if (!searchOpen || !query.trim()) {
      setResults([]);
      return;
    }
    const timer = window.setTimeout(() => {
      apiFetch<SearchResult[]>(
        `/api/manuscript/search?q=${encodeURIComponent(query.trim())}`,
      )
        .then(setResults)
        .catch((error: Error) => notify(error.message, "error"));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query, searchOpen, notify]);

  useEffect(() => {
    if (!trashOpen) return;
    apiFetch<TrashItem[]>("/api/manuscript/trash")
      .then(setTrash)
      .catch((error: Error) => notify(error.message, "error"));
  }, [trashOpen, notify]);

  const childrenMap = useMemo(() => {
    const map = new Map<number | null, ManuscriptNode[]>();
    tree.forEach((node) => {
      const siblings = map.get(node.parent_id) ?? [];
      siblings.push(node);
      map.set(node.parent_id, siblings);
    });
    map.forEach((siblings) =>
      siblings.sort((a, b) => a.position - b.position || a.id - b.id),
    );
    return map;
  }, [tree]);

  const counts = useMemo(() => countText(form.body), [form.body]);
  const scrivCounts = useMemo(
    () => countText(scrivCombinedHtml),
    [scrivCombinedHtml],
  );

  const refresh = useCallback(async () => {
    if (projectId) await loadTree(projectId);
    if (selectedId) {
      const node = await apiFetch<ManuscriptNode>(
        `/api/manuscript/nodes/${selectedId}`,
      );
      setSelected(node);
    }
  }, [projectId, selectedId, loadTree]);

  const createProject = async () => {
    const title = newProjectTitle.trim();
    if (!title) return;
    try {
      const project = await apiFetch<Project>("/api/manuscript/projects", {
        method: "POST",
        body: JSON.stringify({ title }),
      });
      setProjects((current) => [...current, project]);
      setProjectId(project.id);
      setNewProjectTitle("");
      notify("원고 프로젝트를 만들었습니다.");
    } catch (error) {
      notify((error as Error).message, "error");
    }
  };

  const createNode = async (nodeType: "folder" | "chapter") => {
    if (!projectId) return;
    const parentId =
      selected?.node_type === "folder" ? selected.id : (selected?.parent_id ?? null);
    try {
      const node = await apiFetch<ManuscriptNode>("/api/manuscript/nodes", {
        method: "POST",
        body: JSON.stringify({
          project_id: projectId,
          parent_id: parentId,
          node_type: nodeType,
          title: nodeType === "folder" ? "새 폴더" : "새 챕터",
          body: nodeType === "chapter" ? "<p></p>" : null,
        }),
      });
      if (parentId) setExpanded((current) => new Set(current).add(parentId));
      await loadTree(projectId);
      setSelectedId(node.id);
    } catch (error) {
      notify((error as Error).message, "error");
    }
  };

  const saveNode = async () => {
    if (!selectedId) return;
    setSaving(true);
    try {
      await apiFetch(`/api/manuscript/nodes/${selectedId}`, {
        method: "PATCH",
        body: JSON.stringify({
          subtitle: form.subtitle || null,
          synopsis: form.synopsis || null,
          notes: form.notes || null,
          body: form.body,
        }),
      });
      setDirty(false);
      await refresh();
      notify("원고를 저장했습니다.");
    } catch (error) {
      notify((error as Error).message, "error");
    } finally {
      setSaving(false);
    }
  };

  const deleteSelected = async () => {
    if (!selectedId || !window.confirm("선택한 노드와 하위 노드를 휴지통으로 이동할까요?")) {
      return;
    }
    try {
      await apiFetch(`/api/manuscript/nodes/${selectedId}`, { method: "DELETE" });
      setSelectedId(null);
      if (projectId) await loadTree(projectId);
      notify("휴지통으로 이동했습니다.");
    } catch (error) {
      notify((error as Error).message, "error");
    }
  };

  const moveNode = async (id: number, parentId: number | null) => {
    if (!projectId) return;
    const siblings = childrenMap.get(parentId) ?? [];
    try {
      await apiFetch(`/api/manuscript/nodes/${id}/move`, {
        method: "POST",
        body: JSON.stringify({ parent_id: parentId, position: siblings.length }),
      });
      if (parentId) setExpanded((current) => new Set(current).add(parentId));
      await loadTree(projectId);
    } catch (error) {
      notify((error as Error).message, "error");
    }
  };

  const publish = async () => {
    if (!selectedId || selected?.node_type !== "chapter") return;
    if (!selected.published_chapter_id && !publishBookId) {
      notify("발행할 게시판을 선택해 주세요.", "error");
      return;
    }
    try {
      await apiFetch(`/api/manuscript/nodes/${selectedId}/publish`, {
        method: "POST",
        body: JSON.stringify({
          target_book_id: selected.published_chapter_id ? null : publishBookId,
        }),
      });
      await refresh();
      notify(selected.published_chapter_id ? "재발행했습니다." : "발행했습니다.");
    } catch (error) {
      notify((error as Error).message, "error");
    }
  };

  const unlink = async () => {
    if (!selectedId || !selected?.published_chapter_id) return;
    const deleteBook = window.confirm(
      "연결된 발행용 게시판(책)도 삭제할까요?\n확인: 게시판 삭제 / 취소: 링크만 해제",
    );
    try {
      await apiFetch(`/api/manuscript/nodes/${selectedId}/unlink`, {
        method: "POST",
        body: JSON.stringify({ delete_book: deleteBook }),
      });
      await refresh();
      notify(deleteBook ? "링크와 게시판을 삭제했습니다." : "링크만 해제했습니다.");
    } catch (error) {
      notify((error as Error).message, "error");
    }
  };

  const openScrivenings = async (rootId: number) => {
    try {
      const docs = await apiFetch<ScrivDoc[]>(
        `/api/manuscript/scrivenings?root_id=${rootId}`,
      );
      setScrivenings(docs);
      setScrivCombinedHtml(
        docs.map((doc) => doc.body || "<p></p>").join("<hr>"),
      );
      setScrivDirty(false);
    } catch (error) {
      notify((error as Error).message, "error");
    }
  };

  const saveCombined = async () => {
    if (!scrivenings || !selected || !projectId) return;
    const bodies = splitCombinedHtml(scrivCombinedHtml);
    if (bodies.length !== scrivenings.length) {
      notify(
        `구분선이 ${scrivenings.length - 1}개여야 합니다. 지금은 ${bodies.length - 1}개입니다.`,
        "error",
      );
      return;
    }
    setSaving(true);
    try {
      await Promise.all(
        bodies.map((body, index) =>
          apiFetch(`/api/manuscript/nodes/${scrivenings[index].id}`, {
            method: "PATCH",
            body: JSON.stringify({ body }),
          }),
        ),
      );
      await loadTree(projectId);
      await openScrivenings(selected.id);
      notify("폴더 본문을 저장했습니다.");
    } catch (error) {
      notify((error as Error).message, "error");
    } finally {
      setSaving(false);
    }
  };

  const restoreFromTrash = async (id: number) => {
    try {
      await apiFetch(`/api/manuscript/nodes/${id}/restore`, { method: "POST" });
      setTrash((current) => current.filter((item) => item.id !== id));
      if (projectId) await loadTree(projectId);
      notify("복원했습니다.");
    } catch (error) {
      notify((error as Error).message, "error");
    }
  };

  const purgeTrash = async () => {
    try {
      const result = await apiFetch<{ purged: number }>("/api/manuscript/trash/purge", {
        method: "POST",
      });
      setTrash([]);
      notify(`${result.purged}개를 영구 삭제했습니다.`);
    } catch (error) {
      notify((error as Error).message, "error");
    }
  };

  const toggle = (id: number) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const commitRename = async (id: number) => {
    setRenamingId(null);
    if (cancelRename.current) {
      cancelRename.current = false;
      return;
    }
    const title = renameValue.trim();
    if (!title || !projectId) return;
    try {
      await apiFetch(`/api/manuscript/nodes/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ title }),
      });
      await loadTree(projectId);
      if (selectedId === id) {
        setSelected((current) =>
          current ? { ...current, title } : current,
        );
      }
      notify("이름을 변경했습니다.");
    } catch (error) {
      notify((error as Error).message, "error");
    }
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
              moveNode(movingId, targetParent);
            }}
            onClick={() => {
              setSelectedId(node.id);
              if (node.node_type === "folder") {
                setScrivenings(null);
                void openScrivenings(node.id);
              } else {
                setScrivenings(null);
              }
            }}
          >
            <button
              type="button"
              className="ms-node__toggle"
              disabled={!hasChildren}
              onClick={(event) => {
                event.stopPropagation();
                toggle(node.id);
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
            <span className="ms-node__count">{node.char_count_with_spaces}</span>
            {node.published_chapter_id ? (
              <span
                className={`ms-node__badge ms-node__badge--${node.published_state}`}
                title={STATE_LABEL[node.published_state]}
              >
                {STATE_LABEL[node.published_state]}
              </span>
            ) : null}
          </div>
          {isOpen ? renderRows(node.id, depth + 1) : null}
        </Fragment>
      );
    });
  };

  if (loading) {
    return <div className="ms-loading">원고 워크스페이스를 불러오는 중…</div>;
  }

  const isPlaceholder = !selected;

  return (
    <div className="ms-app">
      <header className="ms-topbar">
        <div className="ms-brand">
          <span className="ms-brand__mark">✎</span>
          <span className="ms-brand__name">원고 워크스페이스</span>
        </div>
        <select
          className="ms-select"
          value={projectId ?? ""}
          onChange={(event) => {
            setProjectId(Number(event.target.value) || null);
            setSelectedId(null);
          }}
          aria-label="원고 프로젝트"
        >
          <option value="">프로젝트 선택</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.title}
            </option>
          ))}
        </select>
        <div className="ms-new-project">
          <input
            value={newProjectTitle}
            onChange={(event) => setNewProjectTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") createProject();
            }}
            placeholder="새 원고 이름"
            aria-label="새 원고 이름"
          />
          <button type="button" onClick={createProject}>
            만들기
          </button>
        </div>
        <div className="ms-topbar__actions">
          <button type="button" onClick={() => setSearchOpen(true)}>
            전체 검색
          </button>
          <button type="button" onClick={() => setTrashOpen(true)}>
            휴지통
          </button>
          <a href="/admin/books">책장 관리</a>
        </div>
      </header>

      {notice ? (
        <div className={`ms-notice ms-notice--${notice.type}`}>{notice.text}</div>
      ) : null}

      {!projectId ? (
        <div className="ms-empty">
          <h1>원고를 시작해 주세요</h1>
          <p>새 원고 프로젝트를 만들면 폴더와 챕터를 자유롭게 구성할 수 있습니다.</p>
        </div>
      ) : (
        <div className="ms-layout">
          <aside className="ms-binder">
            <div className="ms-panel-title">
              <span>바인더</span>
              <div className="ms-panel-title__actions">
                <button type="button" onClick={() => createNode("folder")} title="폴더 추가">
                  + 폴더
                </button>
                <button type="button" onClick={() => createNode("chapter")} title="챕터 추가">
                  + 챕터
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
                if (movingId) moveNode(movingId, null);
              }}
            >
              {renderRows(null, 0)}
            </div>
            <div className="ms-binder__hint">
              항목을 끌어 이동 · 제목 더블클릭으로 변경 · 폴더 클릭 시 폴더 전체 보기
            </div>
          </aside>

          {scrivenings ? (
            <RichTextEditor
              variant="workspace"
              placeholder="폴더 본문을 입력해주세요."
              value={scrivCombinedHtml}
              onChange={(html) => {
                setScrivCombinedHtml(html);
                setScrivDirty(true);
              }}
              uploadUrl="/api/chapters/upload"
              onNotice={(editorNotice: EditorNotice) =>
                notify(editorNotice.text, editorNotice.type)
              }
            />
          ) : !selected || selected.node_type === "chapter" ? (
            <RichTextEditor
              variant="workspace"
              readOnly={isPlaceholder}
              placeholder="본문을 입력해주세요."
              value={form.body}
              onChange={(html) => {
                if (isPlaceholder) return;
                setForm({ ...form, body: html });
                setDirty(true);
              }}
              uploadUrl="/api/chapters/upload"
              onNotice={(editorNotice: EditorNotice) =>
                notify(editorNotice.text, editorNotice.type)
              }
            />
          ) : (
            <section className="ms-editor ms-editor--reader">
              <div className="ms-empty">
                <p>폴더 내용을 불러오는 중…</p>
              </div>
            </section>
          )}

          <aside className="ms-inspector">
            <div className="ms-panel-title">
              <span>정보</span>
            </div>
            {selected ? (
              <>
                <div className="ms-inspector__actions">
                  {scrivenings ? (
                    <button
                      type="button"
                      className="ms-button ms-button--primary"
                      disabled={!scrivDirty || saving}
                      onClick={saveCombined}
                    >
                      {saving ? "저장 중…" : scrivDirty ? "폴더 본문 저장" : "저장됨"}
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="ms-button ms-button--primary"
                        disabled={!dirty || saving}
                        onClick={saveNode}
                      >
                        {saving ? "저장 중…" : dirty ? "저장" : "저장됨"}
                      </button>
                      <button type="button" onClick={() => void openScrivenings(selected.id)}>
                        묶어보기
                      </button>
                      <button type="button" className="ms-button--danger" onClick={deleteSelected}>
                        삭제
                      </button>
                    </>
                  )}
                </div>
                {selected.node_type === "chapter" ? (
                  <label className="ms-inspector__field">
                    부제
                    <input
                      value={form.subtitle}
                      placeholder="부제를 입력하세요"
                      onChange={(event) => {
                        setForm({ ...form, subtitle: event.target.value });
                        setDirty(true);
                      }}
                    />
                  </label>
                ) : null}
                {selected.node_type === "folder" ? (
                  <label className="ms-inspector__field">
                    시놉시스
                    <textarea
                      value={form.synopsis}
                      rows={4}
                      placeholder="폴더 시놉시스를 입력하세요"
                      onChange={(event) => {
                        setForm({ ...form, synopsis: event.target.value });
                        setDirty(true);
                      }}
                    />
                  </label>
                ) : null}
                <label className="ms-inspector__field">
                  작가 메모
                  <textarea
                    value={form.notes}
                    rows={6}
                    onChange={(event) => {
                      setForm({ ...form, notes: event.target.value });
                      setDirty(true);
                    }}
                  />
                </label>

                {selected.node_type === "chapter" ? (
                  <div className="ms-publish">
                    <div className="ms-panel-title"><span>발행</span></div>
                    <p className="ms-publish__state">
                      {STATE_LABEL[selected.published_state]}
                      {selected.published_chapter_id
                        ? ` · 챕터 #${selected.published_chapter_id}`
                        : ""}
                    </p>
                    {!selected.published_chapter_id ? (
                      <select
                        className="ms-select"
                        value={publishBookId ?? ""}
                        onChange={(event) => setPublishBookId(Number(event.target.value) || null)}
                      >
                        <option value="">게시판 선택</option>
                        {books.map((book) => (
                          <option key={book.id} value={book.id}>
                            {book.title}
                          </option>
                        ))}
                      </select>
                    ) : null}
                    <button type="button" className="ms-button ms-button--primary" onClick={publish}>
                      {selected.published_chapter_id ? "재발행" : "발행"}
                    </button>
                    {selected.published_chapter_id ? (
                      <button type="button" className="ms-button--danger" onClick={unlink}>
                        링크 해제
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </>
            ) : (
              <p className="ms-inspector__empty">선택된 노드가 없습니다.</p>
            )}
            <footer className="ms-statusbar">
              <span>
                공백 포함 {(scrivenings ? scrivCounts : counts).withSpaces.toLocaleString()}자
              </span>
              <span>순수 {(scrivenings ? scrivCounts : counts).plain.toLocaleString()}자</span>
            </footer>
          </aside>
        </div>
      )}

      {searchOpen ? (
        <div className="ms-modal-backdrop" onClick={() => setSearchOpen(false)}>
          <div className="ms-modal ms-modal--search" onClick={(event) => event.stopPropagation()}>
            <div className="ms-modal__header">
              <h2>전체 검색</h2>
              <button type="button" onClick={() => setSearchOpen(false)} aria-label="닫기">
                ×
              </button>
            </div>
            <input
              autoFocus
              className="ms-search-input"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="제목, 시놉시스, 메모, 본문 검색"
            />
            <div className="ms-search-results">
              {results.map((result) => (
                <button
                  type="button"
                  key={result.id}
                  onClick={() => {
                    setSelectedId(result.id);
                    setSearchOpen(false);
                    setScrivenings(null);
                    if (result.node_type === "folder") {
                      void openScrivenings(result.id);
                    }
                  }}
                >
                  <span className="ms-search-results__title">{result.title}</span>
                  <span className="ms-search-results__path">
                    {result.path.map((part) => part.title).join(" / ") || "최상위"}
                  </span>
                  <span className="ms-search-results__snippet">{result.snippet}</span>
                </button>
              ))}
              {query.trim() && results.length === 0 ? (
                <p className="ms-search-results__empty">검색 결과가 없습니다.</p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {trashOpen ? (
        <div className="ms-modal-backdrop" onClick={() => setTrashOpen(false)}>
          <div className="ms-modal" onClick={(event) => event.stopPropagation()}>
            <div className="ms-modal__header">
              <h2>휴지통</h2>
              <button type="button" onClick={() => setTrashOpen(false)} aria-label="닫기">
                ×
              </button>
            </div>
            <p className="ms-modal__hint">
              이동 후 30일이 지나면 자동으로 영구 삭제됩니다.
            </p>
            <div className="ms-trash-list">
              {trash.map((item) => (
                <div key={item.id} className="ms-trash-item">
                  <span>{item.title}</span>
                  <button type="button" onClick={() => restoreFromTrash(item.id)}>
                    복원
                  </button>
                </div>
              ))}
              {trash.length === 0 ? <p>휴지통이 비어 있습니다.</p> : null}
            </div>
            {trash.length ? (
              <button type="button" className="ms-button--danger" onClick={purgeTrash}>
                만료 항목 영구 삭제
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
