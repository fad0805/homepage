"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Editor } from "@tiptap/core";
import { RichTextEditor, type EditorNotice } from "@/components/rich-text-editor";
import { apiFetch } from "@/lib/api";

import { ManuscriptBinder } from "./manuscript-binder";
import { ManuscriptBinderMenu } from "./manuscript-binder-menu";
import type { MobilePanel, ManuscriptNode, TrashItem } from "./manuscript-types";

import "@/public/styles/manuscript.scss";

/** Same debounce window as the board's draft autosave. */
const AUTOSAVE_DELAY_MS = 2000;
const LAST_NODE_KEY_PREFIX = "ms-last-node:";

function readLastNodeId(projectId: number): number | null {
  try {
    const raw = window.localStorage.getItem(
      `${LAST_NODE_KEY_PREFIX}${projectId}`,
    );
    const id = Number(raw);
    return raw && Number.isInteger(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

function rememberLastNodeId(projectId: number, nodeId: number | null) {
  try {
    if (nodeId === null) {
      window.localStorage.removeItem(`${LAST_NODE_KEY_PREFIX}${projectId}`);
    } else {
      window.localStorage.setItem(
        `${LAST_NODE_KEY_PREFIX}${projectId}`,
        String(nodeId),
      );
    }
  } catch {
    // Local storage can be unavailable; the session still works in memory.
  }
}

interface Project {
  id: number;
  title: string;
  linked_book_id: number | null;
  linked_book_title: string | null;
  node_count: number;
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

interface TrashPreview {
  id: number;
  title: string;
  node_type: "folder" | "chapter";
  body: string | null;
  subtitle: string | null;
  synopsis: string | null;
  notes: string | null;
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

/**
 * Old imports stored Scrivener's 13pt default as an inline style. 13pt is now
 * the document default, which the editor renders at its native 10pt, so strip
 * that mark when loading or saving existing manuscripts.
 */
function normalizeManuscriptHtml(html: string): string {
  return (html ?? "")
    .replace(/font-size\s*:\s*13(?:\.0+)?pt\s*;?/gi, "")
    .replace(/style="\s*"/g, "");
}

function countText(html: string): { withSpaces: number; plain: number } {
  // This component is also rendered on the server. Counts are recalculated
  // after hydration, so avoid touching DOMParser during SSR.
  if (typeof DOMParser === "undefined") {
    return { withSpaces: 0, plain: 0 };
  }
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

const EMPTY_FORM = {
  subtitle: "",
  synopsis: "",
  notes: "",
  body: "",
};

type ChapterForm = typeof EMPTY_FORM;

function chapterSignature(nodeId: number, form: ChapterForm): string {
  return JSON.stringify({ nodeId, ...form });
}

function folderSignature(
  folderId: number,
  html: string,
  form: ChapterForm,
): string {
  return JSON.stringify({
    folderId,
    html,
    subtitle: form.subtitle,
    synopsis: form.synopsis,
    notes: form.notes,
  });
}

/** Collect chapter ids in exactly the order the binder renders them. */
function collectBinderChapterIds(
  rootId: number | null,
  children: Map<number | null, ManuscriptNode[]>,
): number[] {
  const ids: number[] = [];
  const visit = (parentId: number | null) => {
    (children.get(parentId) ?? []).forEach((node) => {
      if (node.node_type === "chapter") ids.push(node.id);
      visit(node.id);
    });
  };
  visit(rootId);
  return ids;
}

/** Collect trashed chapter ids in the same order the trash binder renders them. */
function collectTrashChapterIds(
  rootId: number,
  children: Map<number | null, TrashItem[]>,
): number[] {
  const ids: number[] = [];
  const visit = (parentId: number | null) => {
    (children.get(parentId) ?? []).forEach((item) => {
      if (item.node_type === "chapter") ids.push(item.id);
      visit(item.id);
    });
  };
  visit(rootId);
  return ids;
}

/** Locate the first query token in the live Tiptap document. */
function findSearchRange(
  editor: Editor,
  query: string,
): { from: number; to: number } | null {
  const tokens = query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => token.toLocaleLowerCase());
  if (!tokens.length) return null;

  const positions: number[] = [];
  let text = "";
  editor.state.doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    const lower = node.text.toLocaleLowerCase();
    for (let index = 0; index < lower.length; index += 1) {
      positions.push(pos + index);
    }
    text += lower;
  });

  let found: { index: number; length: number } | null = null;
  for (const token of tokens) {
    const index = text.indexOf(token);
    if (index >= 0 && (found === null || index < found.index)) {
      found = { index, length: token.length };
    }
  }
  if (!found || found.index >= positions.length) return null;
  return {
    from: positions[found.index],
    to: positions[found.index] + found.length,
  };
}

/** Highlight every query token inside a plain-text search snippet. */
function highlightSnippet(text: string, query: string): ReactNode[] {
  const tokens = query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  if (!tokens.length) return [text];
  const pattern = tokens
    .map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  const lowered = new Set(tokens.map((token) => token.toLocaleLowerCase()));
  return text
    .split(new RegExp(`(${pattern})`, "gi"))
    .map((part, index) =>
      lowered.has(part.toLocaleLowerCase()) ? (
        <mark key={index}>{part}</mark>
      ) : (
        part
      ),
    );
}

/** Split the combined folder document back into per-chapter bodies. */
function splitCombinedHtml(html: string): string[] {
  if (typeof DOMParser === "undefined" || typeof document === "undefined") {
    return [html || "<p></p>"];
  }
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
  const [editingProjectTitle, setEditingProjectTitle] = useState(false);
  const [projectTitleDraft, setProjectTitleDraft] = useState("");
  const [savingProjectTitle, setSavingProjectTitle] = useState(false);
  const [tree, setTree] = useState<ManuscriptNode[]>([]);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selected, setSelected] = useState<ManuscriptNode | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [dirty, setDirty] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [trashExpanded, setTrashExpanded] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>(null);
  const [trash, setTrash] = useState<TrashItem[]>([]);
  const [trashPreview, setTrashPreview] = useState<TrashPreview | null>(null);
  const [trashScrivenings, setTrashScrivenings] = useState<ScrivDoc[] | null>(null);
  const [trashCombinedHtml, setTrashCombinedHtml] = useState("");
  const [scrivenings, setScrivenings] = useState<ScrivDoc[] | null>(null);
  const [scrivCombinedHtml, setScrivCombinedHtml] = useState("");
  const [scrivDirty, setScrivDirty] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [autoSaving, setAutoSaving] = useState(false);
  const autosaveRef = useRef<{ key: string | null; signature: string | null }>({
    key: null,
    signature: null,
  });
  const latestSignatureRef = useRef<string | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const pendingSearchRef = useRef<string | null>(null);
  const treeProjectIdRef = useRef<number | null>(null);
  const restoredProjectIdRef = useRef<number | null>(null);
  const saveShortcutRef = useRef<() => void>(() => {});
  const savePromiseRef = useRef<Promise<boolean> | null>(null);
  const saveViewRef = useRef({
    selectedId,
    folderActive: scrivenings !== null,
    dirty,
    scrivDirty,
  });
  saveViewRef.current = {
    selectedId,
    folderActive: scrivenings !== null,
    dirty,
    scrivDirty,
  };

  const notify = useCallback((text: string, type: Notice["type"] = "success") => {
    setNotice({ type, text });
  }, []);

  const waitForPendingSave = async () => {
    const pending = savePromiseRef.current;
    if (pending) await pending;
  };

  const trackSave = (promise: Promise<boolean>) => {
    savePromiseRef.current = promise;
    void promise.finally(() => {
      if (savePromiseRef.current === promise) savePromiseRef.current = null;
    });
    return promise;
  };

  const markSaveFailed = (error: unknown, silent: boolean) => {
    const message = error instanceof Error ? error.message : String(error);
    setSaveError(message);
    if (!silent) notify(message, "error");
  };

  const markSaved = (folder: boolean) => {
    setSaveError(null);
    setDirty(false);
    saveViewRef.current.dirty = false;
    if (folder) {
      setScrivDirty(false);
      saveViewRef.current.scrivDirty = false;
    }
  };

  const selectNode = useCallback(
    (id: number | null) => {
      setSelectedId(id);
      setMobilePanel(null);
      if (projectId !== null) rememberLastNodeId(projectId, id);
    },
    [projectId],
  );

  const handleEditorReady = useCallback((editor: Editor | null) => {
    editorRef.current = editor;
    const pending = pendingSearchRef.current;
    if (!editor || !pending) return;
    const range = findSearchRange(editor, pending);
    if (!range) return;
    pendingSearchRef.current = null;
    window.requestAnimationFrame(() => {
      if (editorRef.current !== editor) return;
      editor.chain().focus().setTextSelection(range).scrollIntoView().run();
    });
  }, []);

  const loadTrash = useCallback(async () => {
    if (!projectId) return;
    const items = await apiFetch<TrashItem[]>(
      `/api/manuscript/trash?project_id=${projectId}`,
    );
    setTrash(items);
  }, [projectId]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 3600);
    return () => window.clearTimeout(timer);
  }, [notice]);

  // Trash expansion is remembered per project; new projects start collapsed.
  useEffect(() => {
    if (!projectId) return;
    const stored = window.localStorage.getItem(`ms-trash-expanded:${projectId}`);
    setTrashExpanded(stored === "1");
  }, [projectId]);

  const toggleTrash = () => {
    setTrashExpanded((current) => {
      const next = !current;
      if (projectId) {
        window.localStorage.setItem(
          `ms-trash-expanded:${projectId}`,
          next ? "1" : "0",
        );
      }
      return next;
    });
  };

  const toggleMobilePanel = (panel: Exclude<MobilePanel, null>) => {
    setMobilePanel((current) => (current === panel ? null : panel));
  };

  const handleSelectNode = async (node: ManuscriptNode) => {
    if (!(await flushAutosave())) return;
    setTrashPreview(null);
    setTrashScrivenings(null);
    setTrashCombinedHtml("");
    setMobilePanel(null);
    selectNode(node.id);
    setScrivenings(null);
    if (node.node_type === "folder") void openScrivenings(node.id);
  };

  const handleOpenTrashItem = (item: TrashItem) => {
    setMobilePanel(null);
    void (item.node_type === "folder"
      ? openTrashFolderPreview(item)
      : openTrashPreview(item));
  };

  const loadProjects = useCallback(async () => {
    const [projectList] = await Promise.all([
      apiFetch<Project[]>("/api/manuscript/projects"),
    ]);
    setProjects(projectList);
    setProjectId((current) => {
      const valid = projectList.some((project) => project.id === current);
      return valid ? current : projectList[0]?.id ?? null;
    });
  }, []);

  const loadTree = useCallback(async (id: number) => {
    const nodes = await apiFetch<ManuscriptNode[]>(
      `/api/manuscript/projects/${id}/tree`,
    );
    treeProjectIdRef.current = id;
    setTree(nodes);
    setExpanded((current) => {
      const next = new Set(current);
      nodes.forEach((node) => {
        if (node.node_type === "folder" && !next.has(node.id)) next.add(node.id);
      });
      return next;
    });
  }, []);

  // The admin project picker opens the workspace with an explicit project.
  useEffect(() => {
    const requested = Number(
      new URLSearchParams(window.location.search).get("project"),
    );
    if (requested) setProjectId(requested);
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
          body: normalizeManuscriptHtml(node.body ?? ""),
        });
        setDirty(false);
      })
      .catch((error: Error) => notify(error.message, "error"));
    return () => {
      active = false;
    };
  }, [selectedId, notify]);

  useEffect(() => {
    const trimmed = query.trim();
    if (!searchOpen || trimmed.length < 2) {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const projectParam = projectId ? `&project_id=${projectId}` : "";
      apiFetch<SearchResult[]>(
        `/api/manuscript/search?q=${encodeURIComponent(trimmed)}${projectParam}`,
        { signal: controller.signal },
      )
        .then(setResults)
        .catch((error: Error) => {
          if (error.name !== "AbortError") notify(error.message, "error");
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, searchOpen, projectId, notify]);

  useEffect(() => {
    if (!trashExpanded || !projectId) return;
    loadTrash().catch((error: Error) => notify(error.message, "error"));
  }, [trashExpanded, projectId, loadTrash, notify]);

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

  const trashChildrenMap = useMemo(() => {
    const ids = new Set(trash.map((item) => item.id));
    const map = new Map<number | null, TrashItem[]>();
    trash.forEach((item) => {
      const parentId = item.parent_id !== null && ids.has(item.parent_id)
        ? item.parent_id
        : null;
      const siblings = map.get(parentId) ?? [];
      siblings.push(item);
      map.set(parentId, siblings);
    });
    map.forEach((siblings) =>
      siblings.sort((a, b) => a.position - b.position || a.id - b.id),
    );
    return map;
  }, [trash]);

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

  const createNode = async (nodeType: "folder" | "chapter") => {
    if (!projectId || !(await flushAutosave())) return;
    const parentId =
      selected?.node_type === "folder" ? selected.id : (selected?.parent_id ?? null);
    try {
      const node = await apiFetch<ManuscriptNode>("/api/manuscript/nodes", {
        method: "POST",
        body: JSON.stringify({
          project_id: projectId,
          parent_id: parentId,
          node_type: nodeType,
          title: nodeType === "folder" ? "새 폴더" : "새 문서",
          body: nodeType === "chapter" ? "<p></p>" : null,
        }),
      });
      if (parentId) setExpanded((current) => new Set(current).add(parentId));
      await loadTree(projectId);
      selectNode(node.id);
    } catch (error) {
      notify((error as Error).message, "error");
    }
  };

  const saveNode = async (silent = false): Promise<boolean> => {
    if (!selectedId) return true;
    await waitForPendingSave();
    const nodeId = selectedId;
    const signature = chapterSignature(nodeId, form);
    if (silent) setAutoSaving(true);
    else setSaving(true);
    return trackSave(
      (async () => {
        try {
          await apiFetch(`/api/manuscript/nodes/${nodeId}`, {
            method: "PATCH",
            body: JSON.stringify({
              subtitle: form.subtitle || null,
              synopsis: form.synopsis || null,
              notes: form.notes || null,
              body: normalizeManuscriptHtml(form.body),
            }),
          });
          autosaveRef.current.signature = signature;
          if (latestSignatureRef.current === signature) markSaved(false);
          if (!silent) {
            await refresh();
            notify("원고를 저장했습니다.");
          }
          return true;
        } catch (error) {
          markSaveFailed(error, silent);
          return false;
        } finally {
          if (silent) setAutoSaving(false);
          else setSaving(false);
        }
      })(),
    );
  };

  const deleteSelected = async () => {
    if (!selectedId || !window.confirm("선택한 노드와 하위 노드를 휴지통으로 이동할까요?")) {
      return;
    }
    if (!(await flushAutosave())) return;
    try {
      await apiFetch(`/api/manuscript/nodes/${selectedId}`, { method: "DELETE" });
      selectNode(null);
      setTrashPreview(null);
      setTrashScrivenings(null);
      setTrashCombinedHtml("");
      setScrivenings(null);
      setScrivCombinedHtml("");
      setScrivDirty(false);
      setDirty(false);
      if (projectId) {
        await loadTree(projectId);
        await loadTrash();
      }
      notify("휴지통으로 이동했습니다.");
    } catch (error) {
      notify((error as Error).message, "error");
    }
  };

  const moveNode = async (id: number, parentId: number | null) => {
    if (!projectId || !(await flushAutosave())) return;
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

  const linkedBookId =
    projects.find((project) => project.id === projectId)?.linked_book_id ?? null;
  const hasLinkedPost = Boolean(
    selected?.published_chapter_exists ??
      (selected?.published_chapter_id && selected.published_state !== "published_missing"),
  );

  const publish = async () => {
    if (!selectedId || selected?.node_type !== "chapter") return;
    if (!linkedBookId) {
      notify("프로젝트에 연결된 책이 없습니다.", "error");
      return;
    }
    if (!(await flushAutosave())) return;
    const wasRepublish = hasLinkedPost;
    try {
      await apiFetch(`/api/manuscript/nodes/${selectedId}/publish`, {
        method: "POST",
        body: JSON.stringify({ target_book_id: linkedBookId }),
      });
      await refresh();
      notify(wasRepublish ? "재발행했습니다." : "발행했습니다.");
    } catch (error) {
      notify((error as Error).message, "error");
    }
  };

  const openScrivenings = useCallback(async (rootId: number): Promise<string | null> => {
    try {
      const docs = await apiFetch<ScrivDoc[]>(
        `/api/manuscript/scrivenings?root_id=${rootId}`,
      );
      // The API already sorts siblings, but keep the binder as the single
      // source of truth so both views can never drift apart.
      const binderIds = collectBinderChapterIds(rootId, childrenMap);
      const byId = new Map(docs.map((doc) => [doc.id, doc]));
      const ordered = binderIds
        .map((id) => byId.get(id))
        .filter((doc): doc is ScrivDoc => Boolean(doc));
      const remaining = docs.filter((doc) => !binderIds.includes(doc.id));
      const orderedDocs = [...ordered, ...remaining];
      const html = orderedDocs
        .map((doc) => normalizeManuscriptHtml(doc.body || "<p></p>"))
        .join("<hr>");
      setScrivenings(orderedDocs);
      setScrivCombinedHtml(html);
      setScrivDirty(false);
      return html;
    } catch (error) {
      notify((error as Error).message, "error");
      return null;
    }
  }, [childrenMap, notify]);

  // Restore the last viewed page once the project's binder has loaded.
  useEffect(() => {
    if (!projectId || treeProjectIdRef.current !== projectId) return;
    if (restoredProjectIdRef.current === projectId) return;
    restoredProjectIdRef.current = projectId;

    const lastId = readLastNodeId(projectId);
    if (lastId === null) return;
    const lastNode = tree.find((node) => node.id === lastId);
    if (!lastNode) {
      rememberLastNodeId(projectId, null);
      return;
    }
    selectNode(lastId);
    if (lastNode.node_type === "folder") void openScrivenings(lastId);
  }, [projectId, tree, selectNode, openScrivenings]);

  const saveCombined = async (silent = false): Promise<boolean> => {
    if (!scrivenings || !selected || !projectId) return true;
    await waitForPendingSave();
    const folderId = selected.id;
    const docs = scrivenings;
    const bodies = splitCombinedHtml(scrivCombinedHtml);
    if (bodies.length !== docs.length) {
      const message = `구분선이 ${docs.length - 1}개여야 합니다. 지금은 ${bodies.length - 1}개입니다.`;
      markSaveFailed(message, silent);
      return false;
    }
    const signature = folderSignature(folderId, scrivCombinedHtml, form);
    const bodiesById = Object.fromEntries(
      bodies.map((body, index) => [
        docs[index].id,
        normalizeManuscriptHtml(body),
      ]),
    );
    if (silent) setAutoSaving(true);
    else setSaving(true);
    return trackSave(
      (async () => {
        try {
          await apiFetch(`/api/manuscript/nodes/${folderId}/save-combined`, {
            method: "POST",
            body: JSON.stringify({
              bodies: bodiesById,
              subtitle: form.subtitle || null,
              synopsis: form.synopsis || null,
              notes: form.notes || null,
            }),
          });
          autosaveRef.current.signature = signature;
          if (latestSignatureRef.current === signature) markSaved(true);
          if (!silent) {
            await loadTree(projectId);
            const reloaded = await openScrivenings(folderId);
            if (reloaded !== null) {
              autosaveRef.current.signature = folderSignature(
                folderId,
                reloaded,
                form,
              );
            }
            notify("폴더를 저장했습니다.");
          }
          return true;
        } catch (error) {
          markSaveFailed(error, silent);
          return false;
        } finally {
          if (silent) setAutoSaving(false);
          else setSaving(false);
        }
      })(),
    );
  };

  const flushAutosave = async (): Promise<boolean> => {
    if (loading) return true;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const pending = savePromiseRef.current;
      if (pending && !(await pending)) return false;

      const view = saveViewRef.current;
      if (view.folderActive) {
        if (!view.scrivDirty && !view.dirty) return true;
        if (!(await saveCombined(true))) return false;
      } else {
        if (!view.dirty || !view.selectedId) return true;
        if (!(await saveNode(true))) return false;
      }
    }
    notify("변경 사항이 계속 발생해 저장을 완료하지 못했습니다.", "error");
    return false;
  };

  // Keep the shortcut pointed at the latest save handler without rebinding
  // the window listener on every keystroke.
  useEffect(() => {
    saveShortcutRef.current = () => {
      if (!selected || trashPreview || saving || autoSaving) return;
      if (scrivenings) {
        if (scrivDirty || dirty) void saveCombined();
      } else if (dirty && selectedId) {
        void saveNode();
      }
    };
  });

  // Ctrl/Cmd+S behaves like the editor's save button while a pane is open.
  useEffect(() => {
    const handleSaveShortcut = (event: KeyboardEvent) => {
      if (
        !(event.ctrlKey || event.metaKey) ||
        event.key.toLowerCase() !== "s"
      ) {
        return;
      }
      if (!selected || trashPreview) return;
      event.preventDefault();
      if (event.repeat) return;
      saveShortcutRef.current();
    };
    window.addEventListener("keydown", handleSaveShortcut);
    return () => window.removeEventListener("keydown", handleSaveShortcut);
  }, [selected, trashPreview]);

  const openTrashPreview = async (item: TrashItem) => {
    if (!(await flushAutosave())) return;
    try {
      const node = await apiFetch<ManuscriptNode>(
        `/api/manuscript/nodes/${item.id}?include_deleted=true`,
      );
      setTrashScrivenings(null);
      setTrashCombinedHtml("");
      setTrashPreview({
        id: node.id,
        title: node.title,
        node_type: node.node_type,
        body: normalizeManuscriptHtml(node.body ?? ""),
        subtitle: node.subtitle,
        synopsis: node.synopsis,
        notes: node.notes,
        deleted_at: item.deleted_at,
        expires_at: item.expires_at,
      });
    } catch (error) {
      notify((error as Error).message, "error");
    }
  };

  const openTrashFolderPreview = async (item: TrashItem) => {
    if (!(await flushAutosave())) return;
    try {
      const [node, docs] = await Promise.all([
        apiFetch<ManuscriptNode>(
          `/api/manuscript/nodes/${item.id}?include_deleted=true`,
        ),
        apiFetch<ScrivDoc[]>(
          `/api/manuscript/scrivenings?root_id=${item.id}&include_deleted=true`,
        ),
      ]);
      // Use the trash binder as the source of truth, just like the normal
      // folder view uses the live binder.
      const binderIds = collectTrashChapterIds(item.id, trashChildrenMap);
      const byId = new Map(docs.map((doc) => [doc.id, doc]));
      const ordered = binderIds
        .map((id) => byId.get(id))
        .filter((doc): doc is ScrivDoc => Boolean(doc));
      const remaining = docs.filter((doc) => !binderIds.includes(doc.id));
      const orderedDocs = [...ordered, ...remaining];
      setTrashScrivenings(orderedDocs);
      setTrashCombinedHtml(
        orderedDocs
          .map((doc) => normalizeManuscriptHtml(doc.body || "<p></p>"))
          .join("<hr>"),
      );
      setTrashPreview({
        id: node.id,
        title: node.title,
        node_type: node.node_type,
        body: normalizeManuscriptHtml(node.body ?? ""),
        subtitle: node.subtitle,
        synopsis: node.synopsis,
        notes: node.notes,
        deleted_at: item.deleted_at,
        expires_at: item.expires_at,
      });
    } catch (error) {
      notify((error as Error).message, "error");
    }
  };

  useEffect(() => {
    if (loading || saving || autoSaving || trashPreview) return;

    const folderActive = scrivenings !== null && selected !== null;
    const signature = folderActive
      ? folderSignature(selected!.id, scrivCombinedHtml, form)
      : selectedId
        ? chapterSignature(selectedId, form)
        : null;
    if (!signature) return;
    latestSignatureRef.current = signature;

    const key = folderActive
      ? `folder:${selected!.id}`
      : `chapter:${selectedId}`;
    if (autosaveRef.current.key !== key) {
      autosaveRef.current.key = key;
      autosaveRef.current.signature = signature;
      return;
    }
    if (autosaveRef.current.signature === signature) return;
    if (folderActive ? !scrivDirty && !dirty : !dirty) return;

    const timer = window.setTimeout(() => {
      if (folderActive) void saveCombined(true);
      else void saveNode(true);
    }, AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [
    autoSaving,
    dirty,
    form,
    loading,
    saving,
    scrivCombinedHtml,
    scrivDirty,
    scrivenings,
    selected,
    selectedId,
    trashPreview,
  ]);

  const restoreFromTrash = async (id: number) => {
    if (!(await flushAutosave())) return;
    try {
      await apiFetch(`/api/manuscript/nodes/${id}/restore`, { method: "POST" });
      setTrashPreview((current) => (current?.id === id ? null : current));
      setTrashScrivenings(null);
      setTrashCombinedHtml("");
      await loadTrash();
      if (projectId) await loadTree(projectId);
      notify("복원했습니다.");
    } catch (error) {
      notify((error as Error).message, "error");
    }
  };

  const purgeTrash = async () => {
    if (!(await flushAutosave())) return;
    try {
      const result = await apiFetch<{ purged: number }>(
        `/api/manuscript/trash/purge?project_id=${projectId}`,
        { method: "POST" },
      );
      setTrashPreview(null);
      setTrashScrivenings(null);
      setTrashCombinedHtml("");
      await loadTrash();
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

  const commitRename = async (id: number, title: string) => {
    const trimmed = title.trim();
    if (!trimmed || !projectId) return;
    try {
      await apiFetch(`/api/manuscript/nodes/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ title: trimmed }),
      });
      await loadTree(projectId);
      if (selectedId === id) {
        setSelected((current) =>
          current ? { ...current, title: trimmed } : current,
        );
      }
      notify("이름을 변경했습니다.");
    } catch (error) {
      notify((error as Error).message, "error");
    }
  };

  const saveProjectTitle = async () => {
    const title = projectTitleDraft.trim();
    const current = projects.find((project) => project.id === projectId)?.title;
    if (!projectId || !title || title === current) {
      setEditingProjectTitle(false);
      return;
    }
    setSavingProjectTitle(true);
    try {
      await apiFetch(`/api/manuscript/projects/${projectId}`, {
        method: "PATCH",
        body: JSON.stringify({ title }),
      });
      setProjects((items) =>
        items.map((project) =>
          project.id === projectId ? { ...project, title } : project,
        ),
      );
      setEditingProjectTitle(false);
      notify("프로젝트 이름을 변경했습니다.");
    } catch (error) {
      notify((error as Error).message, "error");
    } finally {
      setSavingProjectTitle(false);
    }
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
        </div>
        {editingProjectTitle ? (
          <>
            <input
              className="ms-topbar__project-input"
              value={projectTitleDraft}
              autoFocus
              aria-label="프로젝트 이름"
              onChange={(event) => setProjectTitleDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void saveProjectTitle();
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  setEditingProjectTitle(false);
                }
              }}
            />
            <button
              type="button"
              onClick={() => void saveProjectTitle()}
              disabled={savingProjectTitle || !projectTitleDraft.trim()}
            >
              저장
            </button>
          </>
        ) : (
          <span
            className="ms-topbar__project"
            title="더블클릭하여 프로젝트 이름 변경"
            onDoubleClick={() => {
              const current =
                projects.find((project) => project.id === projectId)?.title ?? "";
              setProjectTitleDraft(current);
              setEditingProjectTitle(true);
            }}
          >
            {projects.find((project) => project.id === projectId)?.title ?? ""}
          </span>
        )}
        <div className="ms-topbar__actions">
          <button type="button" onClick={() => setSearchOpen(true)}>
            전체 검색
          </button>
        </div>
      </header>

      {notice ? (
        <div
          className={`ms-notice ms-notice--${notice.type}`}
          role={notice.type === "error" ? "alert" : "status"}
        >
          {notice.text}
        </div>
      ) : null}

      {saveError ? (
        <div className="ms-notice ms-notice--save" role="alert">
          <span>저장 실패: {saveError}</span>
          <button
            type="button"
            className="ms-button ms-button--small"
            onClick={() => {
              if (scrivenings) void saveCombined();
              else void saveNode();
            }}
          >
            다시 저장
          </button>
        </div>
      ) : null}

      {!projectId ? (
        <div className="ms-empty">
          <h1>원고를 시작해 주세요</h1>
          <p>새 원고 프로젝트를 만들면 폴더와 문서를 자유롭게 구성할 수 있습니다.</p>
        </div>
      ) : (
        <div className="ms-layout">
          <ManuscriptBinderMenu
            activePanel={mobilePanel}
            onSelect={toggleMobilePanel}
          />
          {mobilePanel ? (
            <div
              className="ms-binder-backdrop"
              onClick={() => setMobilePanel(null)}
            />
          ) : null}
          <ManuscriptBinder
            childrenMap={childrenMap}
            trashChildrenMap={trashChildrenMap}
            expanded={expanded}
            selectedId={selectedId}
            trashPreviewId={trashPreview?.id ?? null}
            trashExpanded={trashExpanded}
            trashCount={trash.length}
            isOpen={mobilePanel === "nav"}
            onSelectNode={handleSelectNode}
            onCreateNode={(type) => {
              void createNode(type);
            }}
            onMoveNode={(id, parentId) => {
              void moveNode(id, parentId);
            }}
            onToggleFolder={toggle}
            onRename={(id, title) => {
              void commitRename(id, title);
            }}
            onToggleTrash={toggleTrash}
            onOpenTrashItem={handleOpenTrashItem}
            onPurgeTrash={() => {
              void purgeTrash();
            }}
          />

          {trashPreview ? (
            <RichTextEditor
              variant="workspace"
              readOnly
              value={trashScrivenings ? trashCombinedHtml : trashPreview.body ?? ""}
              onChange={() => {}}
              placeholder="삭제된 원고"
              uploadUrl="/api/chapters/upload"
            />
          ) : scrivenings ? (
            <RichTextEditor
              variant="workspace"
              enableFontSize
              enableHighlight
              placeholder="폴더 본문을 입력해주세요."
              value={scrivCombinedHtml}
              onChange={(html) => {
                setScrivCombinedHtml(html);
                setScrivDirty(true);
              }}
              uploadUrl="/api/chapters/upload"
              onEditorReady={handleEditorReady}
              onNotice={(editorNotice: EditorNotice) =>
                notify(editorNotice.text, editorNotice.type)
              }
            />
          ) : !selected || selected.node_type === "chapter" ? (
            <RichTextEditor
              variant="workspace"
              enableFontSize
              enableHighlight
              readOnly={isPlaceholder}
              placeholder="본문을 입력해주세요."
              value={form.body}
              onEditorReady={handleEditorReady}
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

          <aside
            className={`ms-inspector${mobilePanel === "info" ? " is-open" : ""}`}
          >
            <div className="ms-panel-title">
              <span>정보</span>
            </div>
            {trashPreview ? (
              <>
                <div className="ms-inspector__actions">
                  <button
                    type="button"
                    className="ms-button ms-button--primary"
                    onClick={() => void restoreFromTrash(trashPreview.id)}
                  >
                    복원
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTrashPreview(null);
                      setTrashScrivenings(null);
                      setTrashCombinedHtml("");
                    }}
                  >
                    닫기
                  </button>
                </div>
                <label className="ms-inspector__field">
                  제목
                  <input value={trashPreview.title} readOnly />
                </label>
                <label className="ms-inspector__field">
                  유형
                  <input
                    value={trashPreview.node_type === "folder" ? "폴더" : "문서"}
                    readOnly
                  />
                </label>
                <label className="ms-inspector__field">
                  삭제 시각
                  <input value={trashPreview.deleted_at ?? ""} readOnly />
                </label>
                <label className="ms-inspector__field">
                  영구 삭제 예정
                  <input value={trashPreview.expires_at ?? ""} readOnly />
                </label>
                {trashPreview.synopsis ? (
                  <label className="ms-inspector__field">
                    시놉시스
                    <textarea value={trashPreview.synopsis} rows={4} readOnly />
                  </label>
                ) : null}
                <label className="ms-inspector__field">
                  작가 메모
                  <textarea value={trashPreview.notes ?? ""} rows={6} readOnly />
                </label>
              </>
            ) : selected ? (
              <>
                <div className="ms-inspector__actions">
                  <button type="button" className="ms-button--danger" onClick={deleteSelected}>
                    삭제
                  </button>
                  <div className="ms-inspector__actions-right">
                    {selected.node_type === "chapter" ? (
                    <button
                      type="button"
                      className="ms-button ms-button--primary"
                      disabled={!linkedBookId}
                      onClick={publish}
                    >
                      {hasLinkedPost ? "재발행" : "발행"}
                    </button>
                  ) : null}
                  {scrivenings ? (
                    <button
                      type="button"
                      className="ms-button ms-button--primary"
                      disabled={(!scrivDirty && !dirty) || saving || autoSaving}
                      onClick={() => saveCombined()}
                    >
                      {saving
                        ? "저장 중…"
                        : autoSaving
                          ? "자동 저장 중…"
                          : scrivDirty || dirty
                            ? "폴더 저장"
                            : "저장됨"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="ms-button ms-button--primary"
                      disabled={!dirty || saving || autoSaving}
                      onClick={() => saveNode()}
                    >
                      {saving
                        ? "저장 중…"
                        : autoSaving
                          ? "자동 저장 중…"
                          : dirty
                            ? "저장"
                            : "저장됨"}
                    </button>
                  )}
                  </div>
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
                    pendingSearchRef.current = query;
                    selectNode(result.id);
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
                  <span className="ms-search-results__snippet">
                    {highlightSnippet(result.snippet, query)}
                  </span>
                </button>
              ))}
              {query.trim() && results.length === 0 ? (
                <p className="ms-search-results__empty">검색 결과가 없습니다.</p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

    </div>
  );
}
