"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { maybeRevalidatePublicContent } from "@/lib/revalidate";

import "@/public/styles/admin/links.scss";

interface Category {
  id: number;
  name: string;
  order: number;
}

interface LinkItem {
  id: number;
  name: string;
  url: string;
  banner_url: string | null;
  description: string | null;
  order: number;
  category: Category;
}

interface DraftLink extends LinkItem {
  /** Staged banner file that will be uploaded on save. */
  file?: File | null;
  /** Local object URL preview for the staged file. */
  preview_url?: string | null;
}

type Notice = { type: "success" | "error"; text: string };

const CATEGORY_TYPE = "category";
const LINK_TYPE = "link";
const MAX_BANNER_SIZE = 50 * 1024 * 1024;
const ALLOWED_BANNER_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
];

async function apiFetch<T>(url: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (
    init.body &&
    !(init.body instanceof FormData) &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }

  let response = await fetch(url, {
    credentials: "include",
    ...init,
    headers,
  });

  // Retry once when a concurrent request just rotated the auth cookies.
  if (response.status === 401) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    response = await fetch(url, {
      credentials: "include",
      ...init,
      headers,
    });
  }

  if (response.status === 401) {
    window.location.href = "/signin";
    throw new Error("로그인이 필요합니다.");
  }

  if (!response.ok) {
    let detail = `요청에 실패했습니다. (${response.status})`;
    try {
      const data = await response.json();
      if (typeof data?.detail === "string") {
        detail = data.detail;
      } else if (Array.isArray(data?.detail) && data.detail[0]?.msg) {
        detail = data.detail[0].msg;
      }
    } catch {
      // Ignore malformed error bodies.
    }
    throw new Error(detail);
  }

  maybeRevalidatePublicContent(url, init);

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

function sortCategories(categories: Category[]) {
  return [...categories].sort((a, b) => a.order - b.order || a.id - b.id);
}

function sortLinks(links: LinkItem[]) {
  return [...links].sort((a, b) => a.order - b.order || a.id - b.id);
}

function ModalShell({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return (
    <div
      className="admin-modal-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="admin-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="admin-modal-header">
          <h2>{title}</h2>
          <button
            type="button"
            className="admin-modal-close"
            onClick={onClose}
            aria-label="닫기"
          >
            ×
          </button>
        </header>
        <div className="admin-modal-body">{children}</div>
        <footer className="admin-modal-footer">{footer}</footer>
      </div>
    </div>
  );
}

function SortableLinkCard({
  link,
  onEdit,
}: {
  link: DraftLink;
  onEdit: (link: DraftLink) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `${LINK_TYPE}-${link.id}`,
    data: { type: LINK_TYPE, categoryId: link.category.id },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.45 : 1,
    zIndex: isDragging ? 2 : undefined,
  };

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={`admin-link-card${isDragging ? " is-dragging" : ""}`}
      onClick={() => onEdit(link)}
    >
      <button
        type="button"
        className="admin-drag-handle"
        aria-label={`${link.name} 순서 변경`}
        {...attributes}
        {...listeners}
        onClick={(event) => event.stopPropagation()}
      >
        ⠿
      </button>

      <div className="admin-link-banner">
        {link.preview_url || link.banner_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={link.preview_url ?? link.banner_url ?? undefined}
            alt={link.name}
            loading="lazy"
          />
        ) : (
          <span className="admin-link-banner-empty">이미지 없음</span>
        )}
      </div>

      <div className="admin-link-body">
        <strong className="admin-link-name" title={link.name}>
          {link.name}
          {link.id < 0 ? (
            <span className="admin-draft-badge">미저장</span>
          ) : null}
        </strong>
        <span className="admin-link-url" title={link.url}>
          {link.url}
        </span>
        {link.description ? (
          <p className="admin-link-description">{link.description}</p>
        ) : null}
      </div>

    </article>
  );
}

function SortableCategorySection({
  category,
  links,
  canManageCategory,
  onAddLink,
  onEditCategory,
  onDeleteCategory,
  onEditLink,
}: {
  category: Category;
  links: DraftLink[];
  canManageCategory: boolean;
  onAddLink: (categoryId: number) => void;
  onEditCategory: (category: Category) => void;
  onDeleteCategory: (category: Category) => void;
  onEditLink: (link: DraftLink) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `${CATEGORY_TYPE}-${category.id}`,
    data: { type: CATEGORY_TYPE },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.45 : 1,
    zIndex: isDragging ? 2 : undefined,
  };

  return (
    <section
      ref={setNodeRef}
      style={style}
      className={`admin-links-category${isDragging ? " is-dragging" : ""}`}
    >
      <header className="admin-links-category-header">
        {canManageCategory ? (
          <button
            type="button"
            className="admin-drag-handle"
            aria-label={`${category.name} 카테고리 순서 변경`}
            {...attributes}
            {...listeners}
          >
            ⠿
          </button>
        ) : null}

        <h2>
          {category.name}
          {category.id < 0 ? (
            <span className="admin-draft-badge">미저장</span>
          ) : null}
        </h2>
        <span className="admin-links-count">{links.length}개</span>

        <div className="admin-links-category-actions">
          <button type="button" onClick={() => onAddLink(category.id)}>
            링크 추가
          </button>
          {canManageCategory ? (
            <>
              <button
                type="button"
                onClick={() => onEditCategory(category)}
              >
                이름 변경
              </button>
              <button
                type="button"
                className="danger"
                disabled={links.length > 0}
                title={
                  links.length > 0
                    ? "링크가 남아 있는 카테고리는 삭제할 수 없습니다."
                    : undefined
                }
                onClick={() => onDeleteCategory(category)}
              >
                삭제
              </button>
            </>
          ) : null}
        </div>
      </header>

      {links.length === 0 ? (
        <p className="admin-links-empty">아직 링크가 없습니다.</p>
      ) : (
        <SortableContext
          items={links.map((link) => `${LINK_TYPE}-${link.id}`)}
          strategy={rectSortingStrategy}
        >
          <div className="admin-links-grid">
            {links.map((link) => (
              <SortableLinkCard
                key={link.id}
                link={link}
                onEdit={onEditLink}
              />
            ))}
          </div>
        </SortableContext>
      )}
    </section>
  );
}

export default function AdminLinks() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [links, setLinks] = useState<DraftLink[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<number | "all">(
    "all",
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [editingLink, setEditingLink] = useState<DraftLink | null>(null);
  const [formCategoryId, setFormCategoryId] = useState<number | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [bannerFileName, setBannerFileName] = useState<string>("");
  const [bannerUrlInput, setBannerUrlInput] = useState<string>("");
  const [bannerFile, setBannerFile] = useState<File | null>(null);

  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);

  const [isDirty, setIsDirty] = useState(false);
  const [deletedLinkIds, setDeletedLinkIds] = useState<number[]>([]);
  const [deletedCategoryIds, setDeletedCategoryIds] = useState<number[]>([]);
  const [dirtyLinkIds, setDirtyLinkIds] = useState<Set<number>>(
    () => new Set(),
  );
  const [dirtyCategoryIds, setDirtyCategoryIds] = useState<Set<number>>(
    () => new Set(),
  );
  const [reorderedCategoryIds, setReorderedCategoryIds] = useState<
    Set<number>
  >(() => new Set());
  const [categoriesReordered, setCategoriesReordered] = useState(false);

  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const objectUrls = useRef<Set<string>>(new Set());
  const nextTempId = useRef(-1);

  const notify = useCallback((type: Notice["type"], text: string) => {
    if (noticeTimer.current) {
      clearTimeout(noticeTimer.current);
    }
    setNotice({ type, text });
    noticeTimer.current = setTimeout(() => setNotice(null), 3500);
  }, []);

  const revokeObjectUrls = useCallback(() => {
    objectUrls.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrls.current.clear();
  }, []);

  useEffect(() => {
    return () => {
      if (noticeTimer.current) {
        clearTimeout(noticeTimer.current);
      }
      revokeObjectUrls();
    };
  }, [revokeObjectUrls]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [categoryData, linkData] = await Promise.all([
        apiFetch<Category[]>("/api/links/categories"),
        apiFetch<LinkItem[]>("/api/links?mine=true"),
      ]);
      revokeObjectUrls();
      setCategories(sortCategories(categoryData));
      setLinks(linkData);
      setDeletedLinkIds([]);
      setDeletedCategoryIds([]);
      setDirtyLinkIds(new Set());
      setDirtyCategoryIds(new Set());
      setReorderedCategoryIds(new Set());
      setCategoriesReordered(false);
      setIsDirty(false);
    } catch (error) {
      notify(
        "error",
        error instanceof Error ? error.message : "데이터를 불러오지 못했습니다.",
      );
    } finally {
      setLoading(false);
    }
  }, [notify, revokeObjectUrls]);

  useEffect(() => {
    load();
  }, [load]);

  const linksByCategory = useMemo(() => {
    const map = new Map<number, DraftLink[]>();
    for (const category of categories) {
      map.set(
        category.id,
        sortLinks(links.filter((link) => link.category.id === category.id)),
      );
    }
    return map;
  }, [categories, links]);

  const displayCategories = useMemo(
    () =>
      categoryFilter === "all"
        ? categories
        : categories.filter(
            (category) => category.id === categoryFilter,
          ),
    [categories, categoryFilter],
  );

  useEffect(() => {
    if (
      categoryFilter !== "all" &&
      !categories.some((category) => category.id === categoryFilter)
    ) {
      setCategoryFilter("all");
    }
  }, [categories, categoryFilter]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const collisionDetection = useCallback<CollisionDetection>((args) => {
    const activeType = args.active.data.current?.type;
    const activeCategoryId = args.active.data.current?.categoryId;

    const droppableContainers = args.droppableContainers.filter((container) => {
      const data = container.data.current;
      if (!data || data.type !== activeType) {
        return false;
      }
      if (activeType === LINK_TYPE) {
        return data.categoryId === activeCategoryId;
      }
      return true;
    });

    return closestCenter({ ...args, droppableContainers });
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) {
        return;
      }

      const activeData = active.data.current;

      if (activeData?.type === CATEGORY_TYPE) {
        const oldIndex = categories.findIndex(
          (category) => `${CATEGORY_TYPE}-${category.id}` === active.id,
        );
        const newIndex = categories.findIndex(
          (category) => `${CATEGORY_TYPE}-${category.id}` === over.id,
        );
        if (oldIndex < 0 || newIndex < 0) {
          return;
        }

        setCategories(
          arrayMove(categories, oldIndex, newIndex).map((category, index) => ({
            ...category,
            order: index,
          })),
        );
        setCategoriesReordered(true);
        setIsDirty(true);
        return;
      }

      if (activeData?.type !== LINK_TYPE) {
        return;
      }

      const categoryId = activeData.categoryId as number;
      const current = linksByCategory.get(categoryId) ?? [];
      const oldIndex = current.findIndex(
        (link) => `${LINK_TYPE}-${link.id}` === active.id,
      );
      const newIndex = current.findIndex(
        (link) => `${LINK_TYPE}-${link.id}` === over.id,
      );
      if (oldIndex < 0 || newIndex < 0) {
        return;
      }

      const reordered = arrayMove(current, oldIndex, newIndex).map(
        (link, index) => ({ ...link, order: index }),
      );
      const others = links.filter((link) => link.category.id !== categoryId);
      setLinks([...others, ...reordered]);
      setReorderedCategoryIds((prev) => {
        const next = new Set(prev);
        next.add(categoryId);
        return next;
      });
      setIsDirty(true);
    },
    [categories, links, linksByCategory],
  );

  const uploadBanner = useCallback(async (file: File) => {
    const body = new FormData();
    body.append("file", file);
    const uploaded = await apiFetch<{ url: string }>("/api/links/upload", {
      method: "POST",
      body,
    });
    return uploaded.url;
  }, []);

  const handleSaveAll = useCallback(async () => {
    if (!isDirty || saving) {
      return;
    }

    setSaving(true);
    try {
      const categoryIdMap = new Map<number, number>();
      const deletedCategorySet = new Set(deletedCategoryIds);
      const deletedLinkSet = new Set(deletedLinkIds);

      for (const category of categories.filter((item) => item.id < 0)) {
        const created = await apiFetch<Category>("/api/links/categories", {
          method: "POST",
          body: JSON.stringify({ name: category.name, order: category.order }),
        });
        categoryIdMap.set(category.id, created.id);
      }

      const realCategoryId = (id: number) => categoryIdMap.get(id) ?? id;

      const dirtyExistingCategories = categories.filter(
        (item) =>
          item.id > 0 &&
          dirtyCategoryIds.has(item.id) &&
          !deletedCategorySet.has(item.id),
      );
      for (const category of dirtyExistingCategories) {
        await apiFetch(`/api/links/categories/${category.id}`, {
          method: "PUT",
          body: JSON.stringify({ name: category.name }),
        });
      }

      for (const id of deletedLinkIds) {
        await apiFetch(`/api/links/${id}`, { method: "DELETE" });
      }

      const linkIdMap = new Map<number, number>();

      for (const link of links.filter((item) => item.id < 0)) {
        const bannerUrl = link.file
          ? await uploadBanner(link.file)
          : link.banner_url;
        const created = await apiFetch<LinkItem>("/api/links", {
          method: "POST",
          body: JSON.stringify({
            name: link.name,
            url: link.url,
            category: realCategoryId(link.category.id),
            banner_url: bannerUrl,
            description: link.description,
          }),
        });
        linkIdMap.set(link.id, created.id);
      }

      const dirtyExistingLinks = links.filter(
        (item) =>
          item.id > 0 &&
          dirtyLinkIds.has(item.id) &&
          !deletedLinkSet.has(item.id),
      );
      for (const link of dirtyExistingLinks) {
        const bannerUrl = link.file
          ? await uploadBanner(link.file)
          : link.banner_url;
        await apiFetch(`/api/links/${link.id}`, {
          method: "PUT",
          body: JSON.stringify({
            name: link.name,
            url: link.url,
            category: realCategoryId(link.category.id),
            banner_url: bannerUrl,
            description: link.description,
          }),
        });
      }

      if (categoriesReordered) {
        await apiFetch("/api/links/categories/reorder", {
          method: "PUT",
          body: JSON.stringify({
            items: categories.map((category, index) => ({
              id: realCategoryId(category.id),
              order: index,
            })),
          }),
        });
      }

      const linkItems: {
        id: number;
        order: number;
        category: number;
      }[] = [];
      reorderedCategoryIds.forEach((categoryId) => {
        if (deletedCategorySet.has(categoryId)) {
          return;
        }
        const category = categories.find(
          (item) => item.id === categoryId,
        );
        if (!category) {
          return;
        }
        const group = sortLinks(
          links.filter((link) => link.category.id === categoryId),
        );
        group.forEach((link, index) => {
          const id = linkIdMap.get(link.id) ?? link.id;
          if (id > 0) {
            linkItems.push({
              id,
              order: index,
              category: realCategoryId(categoryId),
            });
          }
        });
      });

      if (linkItems.length > 0) {
        await apiFetch("/api/links/reorder", {
          method: "PUT",
          body: JSON.stringify({ items: linkItems }),
        });
      }

      for (const id of deletedCategoryIds) {
        await apiFetch(`/api/links/categories/${id}`, {
          method: "DELETE",
        });
      }

      notify("success", "변경사항을 저장했습니다.");
      await load();
    } catch (error) {
      notify(
        "error",
        error instanceof Error
          ? `${error.message} 서버 상태를 다시 불러옵니다.`
          : "변경사항을 저장하지 못했습니다. 서버 상태를 다시 불러옵니다.",
      );
      await load();
    } finally {
      setSaving(false);
    }
  }, [
    categories,
    categoriesReordered,
    deletedCategoryIds,
    deletedLinkIds,
    dirtyCategoryIds,
    dirtyLinkIds,
    isDirty,
    links,
    load,
    notify,
    reorderedCategoryIds,
    saving,
    uploadBanner,
  ]);

  const handleDiscard = useCallback(async () => {
    if (!isDirty) {
      return;
    }
    if (!window.confirm("저장하지 않은 변경사항을 되돌릴까요?")) {
      return;
    }
    await load();
  }, [isDirty, load]);

  useEffect(() => {
    if (!isDirty) {
      return;
    }
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isDirty]);

  const openCreateLink = (categoryId?: number) => {
    setEditingLink(null);
    setBannerPreview(null);
    setBannerFileName("");
    setBannerUrlInput("");
    setBannerFile(null);
    setFormCategoryId(categoryId ?? categories[0]?.id ?? null);
    setLinkModalOpen(true);
  };

  const openEditLink = (link: DraftLink) => {
    setEditingLink(link);
    setBannerPreview(link.preview_url ?? link.banner_url);
    setBannerFileName(link.file?.name ?? "");
    setBannerUrlInput(link.banner_url ?? "");
    setBannerFile(null);
    setFormCategoryId(link.category.id);
    setLinkModalOpen(true);
  };

  const closeLinkModal = useCallback(() => {
    setLinkModalOpen(false);
    setEditingLink(null);
    setBannerPreview(null);
    setBannerFileName("");
    setBannerUrlInput("");
    setBannerFile(null);
  }, []);

  const handleBannerChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      const urlValue = bannerUrlInput.trim();
      const urlChanged = urlValue !== (editingLink?.banner_url ?? "");
      setBannerFile(null);
      setBannerPreview(
        urlChanged
          ? urlValue || null
          : editingLink?.preview_url ?? (urlValue || null),
      );
      setBannerFileName(
        urlChanged ? "" : editingLink?.file?.name ?? "",
      );
      return;
    }
    if (!ALLOWED_BANNER_TYPES.includes(file.type)) {
      event.target.value = "";
      notify("error", "PNG / JPEG / WEBP / GIF 이미지만 업로드할 수 있습니다.");
      return;
    }
    if (file.size > MAX_BANNER_SIZE) {
      event.target.value = "";
      notify("error", "배너 이미지는 50MB 이하만 업로드할 수 있습니다.");
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    objectUrls.current.add(objectUrl);
    setBannerFile(file);
    setBannerFileName(file.name);
    setBannerPreview(objectUrl);
  };

  const handleBannerUrlChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setBannerUrlInput(value);
    if (!bannerFile) {
      setBannerFileName("");
      setBannerPreview(value.trim() || null);
    }
  };

  const handleLinkSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const url = String(form.get("url") ?? "").trim();
    const description = String(form.get("description") ?? "").trim();
    const category = Number(form.get("category"));
    const file = form.get("banner_file");
    const bannerUrl = String(form.get("banner_url") ?? "").trim();
    const targetCategory = categories.find((item) => item.id === category);

    if (!name || !url || !targetCategory) {
      notify("error", "이름, URL, 카테고리는 필수입니다.");
      return;
    }

    const hasNewFile = file instanceof File && file.size > 0;
    const urlChanged = bannerUrl !== (editingLink?.banner_url ?? "");
    const nextFile = hasNewFile
      ? (file as File)
      : urlChanged
        ? null
        : (editingLink?.file ?? null);
    const nextBannerUrl =
      hasNewFile || !urlChanged
        ? (editingLink?.banner_url ?? null)
        : bannerUrl || null;
    const nextPreview = hasNewFile
      ? bannerPreview
      : nextFile
        ? (editingLink?.preview_url ?? null)
        : bannerUrl || null;

    const remaining = links.filter((link) => link.id !== editingLink?.id);
    const order =
      editingLink && editingLink.category.id === targetCategory.id
        ? editingLink.order
        : remaining
            .filter((link) => link.category.id === targetCategory.id)
            .reduce((max, link) => Math.max(max, link.order), -1) + 1;

    const draft: DraftLink = {
      id: editingLink?.id ?? nextTempId.current--,
      name,
      url,
      description: description || null,
      banner_url: nextBannerUrl,
      file: nextFile,
      preview_url: nextPreview,
      order,
      category: targetCategory,
    };

    setLinks((prev) =>
      editingLink
        ? prev.map((link) => (link.id === editingLink.id ? draft : link))
        : [...prev, draft],
    );
    if (editingLink && editingLink.id > 0) {
      setDirtyLinkIds((prev) => {
        const next = new Set(prev);
        next.add(editingLink.id);
        return next;
      });
    }
    if (editingLink && editingLink.category.id !== targetCategory.id) {
      setReorderedCategoryIds((prev) => {
        const next = new Set(prev);
        next.add(editingLink.category.id);
        next.add(targetCategory.id);
        return next;
      });
    }
    setIsDirty(true);
    closeLinkModal();
  };

  const handleDeleteLink = (link: DraftLink): boolean => {
    if (!window.confirm(`'${link.name}' 링크를 삭제할까요?`)) {
      return false;
    }
    setLinks((prev) => prev.filter((item) => item.id !== link.id));
    if (link.id > 0) {
      setDeletedLinkIds((prev) => [...prev, link.id]);
    }
    setDirtyLinkIds((prev) => {
      const next = new Set(prev);
      next.delete(link.id);
      return next;
    });
    setReorderedCategoryIds((prev) => {
      const next = new Set(prev);
      next.add(link.category.id);
      return next;
    });
    setIsDirty(true);
    return true;
  };

  const openCreateCategory = () => {
    setEditingCategory(null);
    setCategoryModalOpen(true);
  };

  const openEditCategory = (category: Category) => {
    setEditingCategory(category);
    setCategoryModalOpen(true);
  };

  const closeCategoryModal = useCallback(() => {
    setCategoryModalOpen(false);
    setEditingCategory(null);
  }, []);

  const handleCategorySubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    if (!name) {
      notify("error", "카테고리 이름을 입력해주세요.");
      return;
    }

    if (editingCategory) {
      setCategories((prev) =>
        prev.map((category) =>
          category.id === editingCategory.id
            ? { ...category, name }
            : category,
        ),
      );
    } else {
      const id = nextTempId.current--;
      const order =
        categories.reduce((max, category) => Math.max(max, category.order), -1) +
        1;
      setCategories((prev) => [...prev, { id, name, order }]);
    }

    if (editingCategory && editingCategory.id > 0) {
      setDirtyCategoryIds((prev) => {
        const next = new Set(prev);
        next.add(editingCategory.id);
        return next;
      });
    }
    setIsDirty(true);
    closeCategoryModal();
  };

  const handleDeleteCategory = (category: Category) => {
    if (!window.confirm(`'${category.name}' 카테고리를 삭제할까요?`)) {
      return;
    }
    setCategories((prev) =>
      prev.filter((item) => item.id !== category.id),
    );
    setLinks((prev) =>
      prev.filter((link) => link.category.id !== category.id),
    );
    if (category.id > 0) {
      setDeletedCategoryIds((prev) => [...prev, category.id]);
      setDirtyCategoryIds((prev) => {
        const next = new Set(prev);
        next.delete(category.id);
        return next;
      });
      setReorderedCategoryIds((prev) => {
        const next = new Set(prev);
        next.delete(category.id);
        return next;
      });
    }
    setIsDirty(true);
  };

  const handleReload = useCallback(async () => {
    if (
      isDirty &&
      !window.confirm(
        "저장하지 않은 변경사항이 있습니다. 새로고침하면 사라집니다. 계속할까요?",
      )
    ) {
      return;
    }
    await load();
  }, [isDirty, load]);

  return (
    <div id="admin-links">
      <div className="admin-links-toolbar">
        <div>
          <h1>놀러가기 관리</h1>
          <p className="admin-links-hint">
            링크와 카테고리를 수정하거나 드래그해서 순서를 바꾼 뒤 저장
            버튼을 눌러주세요.
          </p>
        </div>
        <div className="admin-links-toolbar-actions">
          <label className="admin-filter">
            <span>카테고리</span>
            <select
              value={categoryFilter}
              onChange={(event) =>
                setCategoryFilter(
                  event.target.value === "all"
                    ? "all"
                    : Number(event.target.value),
                )
              }
            >
              <option value="all">전체 카테고리</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="admin-button"
            onClick={handleReload}
            disabled={loading}
          >
            새로고침
          </button>
          <button
            type="button"
            className={`admin-button${isDirty ? " primary" : ""}`}
            onClick={handleSaveAll}
            disabled={!isDirty || saving || loading}
          >
            {saving ? "저장 중..." : "변경사항 저장"}
          </button>
          <button
            type="button"
            className="admin-button"
            onClick={openCreateCategory}
          >
            카테고리 추가
          </button>
          <button
            type="button"
            className="admin-button"
            onClick={() => openCreateLink()}
            disabled={categories.length === 0}
          >
            링크 추가
          </button>
        </div>
      </div>

      {notice ? (
        <div className={`admin-notice admin-notice-${notice.type}`}>
          {notice.text}
        </div>
      ) : null}

      {loading ? (
        <div className="admin-links-loading">불러오는 중...</div>
      ) : categories.length === 0 ? (
        <p className="admin-links-empty">
          카테고리가 없습니다. 먼저 카테고리를 추가해주세요.
        </p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetection}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={displayCategories.map(
              (category) => `${CATEGORY_TYPE}-${category.id}`,
            )}
            strategy={verticalListSortingStrategy}
          >
            <div className="admin-links-categories">
              {displayCategories.map((category) => (
                <SortableCategorySection
                  key={category.id}
                  category={category}
                  links={linksByCategory.get(category.id) ?? []}
                  canManageCategory
                  onAddLink={openCreateLink}
                  onEditCategory={openEditCategory}
                  onDeleteCategory={handleDeleteCategory}
                  onEditLink={openEditLink}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {linkModalOpen ? (
        <ModalShell
          title={editingLink ? "링크 수정" : "링크 추가"}
          onClose={closeLinkModal}
          footer={
            <div className="admin-link-modal-footer">
              {editingLink ? (
                <button
                  type="button"
                  className="admin-button danger"
                  onClick={() => {
                    if (editingLink && handleDeleteLink(editingLink)) {
                      closeLinkModal();
                    }
                  }}
                  disabled={saving}
                >
                  삭제
                </button>
              ) : null}
              <div className="admin-link-modal-footer-actions">
                <button
                  type="button"
                  className="admin-button"
                  onClick={closeLinkModal}
                  disabled={saving}
                >
                  취소
                </button>
                <button
                  type="submit"
                  form="link-form"
                  className="admin-button primary"
                  disabled={saving}
                >
                  {editingLink ? "적용" : "추가"}
                </button>
              </div>
            </div>
          }
        >
          <form id="link-form" onSubmit={handleLinkSubmit}>
            <label className="admin-field">
              <span>
                이름 <em>*</em>
              </span>
              <input
                name="name"
                required
                autoFocus
                defaultValue={editingLink?.name ?? ""}
                placeholder="사이트 이름"
              />
            </label>

            <label className="admin-field">
              <span>
                URL <em>*</em>
              </span>
              <input
                name="url"
                type="url"
                required
                defaultValue={editingLink?.url ?? ""}
                placeholder="https://example.com"
              />
            </label>

            <label className="admin-field">
              <span>
                카테고리 <em>*</em>
              </span>
              <select
                name="category"
                required
                defaultValue={
                  formCategoryId ?? categories[0]?.id ?? ""
                }
              >
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="admin-field">
              <span>설명</span>
              <textarea
                name="description"
                rows={2}
                defaultValue={editingLink?.description ?? ""}
                placeholder="링크 설명 (선택)"
              />
            </label>

            <div className="admin-field">
              <span>배너 이미지</span>
              <input
                type="text"
                name="banner_url"
                inputMode="url"
                value={bannerUrlInput}
                onChange={handleBannerUrlChange}
                placeholder="이미지 URL (선택)"
                spellCheck={false}
              />
              <div className="admin-banner-preview-wrap">
                {bannerPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={bannerPreview}
                    alt="배너 미리보기"
                    className="admin-banner-preview"
                  />
                ) : (
                  <span className="admin-banner-placeholder">
                    미리보기 없음
                  </span>
                )}
              </div>
              <input
                type="file"
                name="banner_file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={handleBannerChange}
              />
              {bannerFileName ? (
                <span className="admin-banner-filename">
                  선택됨: {bannerFileName}
                </span>
              ) : null}
              <span className="admin-banner-help">
                이미지 URL 또는 PNG / JPEG / WEBP / GIF 파일(50MB 이하).
                파일을 선택하면 파일이 우선 적용됩니다.
              </span>
            </div>
          </form>
        </ModalShell>
      ) : null}

      {categoryModalOpen ? (
        <ModalShell
          title={editingCategory ? "카테고리 이름 변경" : "카테고리 추가"}
          onClose={closeCategoryModal}
          footer={
            <>
              <button
                type="button"
                className="admin-button"
                onClick={closeCategoryModal}
                disabled={saving}
              >
                취소
              </button>
              <button
                type="submit"
                form="category-form"
                className="admin-button primary"
                disabled={saving}
              >
                {editingCategory ? "적용" : "추가"}
              </button>
            </>
          }
        >
          <form id="category-form" onSubmit={handleCategorySubmit}>
            <label className="admin-field">
              <span>
                카테고리 이름 <em>*</em>
              </span>
              <input
                name="name"
                required
                autoFocus
                defaultValue={editingCategory?.name ?? ""}
                placeholder="예: 방랑자들"
              />
            </label>
          </form>
        </ModalShell>
      ) : null}

      {isDirty ? (
        <div className="admin-save-bar" role="status">
          <span>저장하지 않은 변경사항이 있습니다.</span>
          <button
            type="button"
            className="admin-button"
            onClick={handleDiscard}
            disabled={saving}
          >
            되돌리기
          </button>
          <button
            type="button"
            className="admin-button primary"
            onClick={handleSaveAll}
            disabled={saving}
          >
            {saving ? "저장 중..." : "저장"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
