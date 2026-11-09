"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent,
} from "react";

import { apiFetch } from "@/lib/api";
import {
  formatDate,
  formatDateTime,
  todayDateInputValue,
} from "@/lib/datetime";
import type {
  IllustrationDetailItem,
  IllustrationImageItem,
} from "@/lib/illustration-types";

import "@/public/styles/admin/illustrations.scss";

type Notice = { type: "success" | "error"; text: string };

interface Preview {
  file: File;
  url: string;
}

const MAX_FILES = 100;
const MAX_BATCH_FILES = 10;
const MAX_BATCH_BYTES = 40 * 1024 * 1024;
const LIST_PAGE_SIZE = 12;

function listPageNumbers(page: number, totalPages: number) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages: Array<number | "ellipsis"> = [1];
  if (page > 3) pages.push("ellipsis");

  for (
    let current = Math.max(2, page - 1);
    current <= Math.min(totalPages - 1, page + 1);
    current += 1
  ) {
    pages.push(current);
  }

  if (page < totalPages - 2) pages.push("ellipsis");
  pages.push(totalPages);
  return pages;
}

function createBatches(files: File[]) {
  const batches: File[][] = [];
  let current: File[] = [];
  let currentBytes = 0;

  for (const file of files) {
    const full =
      current.length >= MAX_BATCH_FILES ||
      (current.length > 0 && currentBytes + file.size > MAX_BATCH_BYTES);
    if (full) {
      batches.push(current);
      current = [];
      currentBytes = 0;
    }
    current.push(file);
    currentBytes += file.size;
  }

  if (current.length > 0) {
    batches.push(current);
  }
  return batches;
}

function moveItem<T>(items: T[], from: number, to: number) {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) {
    return items;
  }
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function representativeImage(item: IllustrationDetailItem) {
  return (
    item.images.find((image) => image.id === item.representative_image_id) ??
    item.images[0] ??
    null
  );
}

export default function AdminIllustrations() {
  const [items, setItems] = useState<IllustrationDetailItem[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<Preview[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [takenAt, setTakenAt] = useState("");
  const [representativeIndex, setRepresentativeIndex] = useState(0);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [listPage, setListPage] = useState(1);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(
    () => new Set(),
  );
  const [bulkWorking, setBulkWorking] = useState(false);
  const [bulkTakenAt, setBulkTakenAt] = useState("");
  const [cardDragId, setCardDragId] = useState<number | null>(null);
  const [cardDragOverId, setCardDragOverId] = useState<number | null>(null);
  const [editingItem, setEditingItem] =
    useState<IllustrationDetailItem | null>(null);
  const [modalDragIndex, setModalDragIndex] = useState<number | null>(null);
  const [modalDragOverIndex, setModalDragOverIndex] = useState<
    number | null
  >(null);
  const [addingImages, setAddingImages] = useState(false);
  const [deletingImageId, setDeletingImageId] = useState<number | null>(
    null,
  );
  const [modalNotice, setModalNotice] = useState<Notice | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modalFileInputRef = useRef<HTMLInputElement>(null);
  const today = todayDateInputValue();
  const totalPages = Math.max(
    1,
    Math.ceil(items.length / LIST_PAGE_SIZE),
  );
  const currentPage = Math.min(listPage, totalPages);
  const visibleItems = items.slice(
    (currentPage - 1) * LIST_PAGE_SIZE,
    currentPage * LIST_PAGE_SIZE,
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<IllustrationDetailItem[]>(
        "/api/illustrations/admin",
      );
      setItems(
        [...data].sort(
          (a, b) => a.order - b.order || b.id - a.id,
        ),
      );
      setSelectedIds(new Set());
      setListPage(1);
    } catch (error) {
      setNotice({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "삽화 목록을 불러오지 못했습니다.",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const next = files.map((file) => ({
      file,
      url: URL.createObjectURL(file),
    }));
    setPreviews(next);

    return () => {
      next.forEach((preview) => URL.revokeObjectURL(preview.url));
    };
  }, [files]);

  useEffect(() => {
    setRepresentativeIndex((current) =>
      files.length === 0 ? 0 : Math.min(current, files.length - 1),
    );
  }, [files.length]);

  useEffect(() => {
    if (listPage > totalPages) {
      setListPage(totalPages);
    }
  }, [listPage, totalPages]);

  useEffect(() => {
    if (!editingItem) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setEditingItem(null);
      }
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [editingItem]);

  const addFiles = (list: FileList | null) => {
    if (!list) return;

    const images = Array.from(list).filter((file) =>
      file.type.startsWith("image/"),
    );
    if (images.length === 0) return;

    setFiles((previous) => {
      const available = Math.max(0, MAX_FILES - previous.length);
      return [...previous, ...images.slice(0, available)];
    });
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    addFiles(event.dataTransfer.files);
  };

  const removeFile = (index: number) => {
    setFiles((previous) =>
      previous.filter((_, fileIndex) => fileIndex !== index),
    );
    setRepresentativeIndex((current) => {
      if (current === index) return 0;
      if (current > index) return current - 1;
      return current;
    });
  };

  const moveFile = (from: number, to: number) => {
    setFiles((previous) => moveItem(previous, from, to));
    setRepresentativeIndex((current) => {
      if (current === from) return to;
      if (from < current && to >= current) return current - 1;
      if (from > current && to <= current) return current + 1;
      return current;
    });
  };

  const upsertItem = (item: IllustrationDetailItem) => {
    setItems((previous) => {
      const exists = previous.some((current) => current.id === item.id);
      const next = exists
        ? previous.map((current) => (current.id === item.id ? item : current))
        : [item, ...previous];
      return [...next].sort(
        (a, b) => a.order - b.order || b.id - a.id,
      );
    });
  };

  const handleUpload = async () => {
    if (files.length === 0 || uploading) return;

    if (takenAt && takenAt > today) {
      setNotice({
        type: "error",
        text: "촬영 일자는 오늘 이후로 지정할 수 없습니다.",
      });
      return;
    }

    const normalizedTitle = title.trim();
    if (!normalizedTitle) {
      setNotice({ type: "error", text: "삽화 제목을 입력해주세요." });
      return;
    }

    const selectedFiles = files;
    const batches = createBatches(selectedFiles);
    let groupId: number | null = null;
    let detail: IllustrationDetailItem | null = null;
    let processed = 0;

    setUploading(true);
    setUploadProgress({ done: 0, total: selectedFiles.length });
    setNotice(null);

    try {
      for (const batch of batches) {
        const formData = new FormData();
        batch.forEach((file) => formData.append("files", file));
        formData.append("title", normalizedTitle);
        if (description.trim()) {
          formData.append("description", description.trim());
        }
        if (takenAt) {
          formData.append("taken_at", takenAt);
        }
        if (groupId !== null) {
          formData.append("illustration_id", String(groupId));
        }

        const result = await apiFetch<IllustrationDetailItem>(
          "/api/illustrations/bulk",
          {
            method: "POST",
            body: formData,
          },
        );
        groupId = result.id;
        detail = result;
        processed += batch.length;
        setUploadProgress({
          done: processed,
          total: selectedFiles.length,
        });
        upsertItem(result);
      }

      if (detail) {
        const selectedRepresentative =
          detail.images[representativeIndex] ?? detail.images[0] ?? null;
        if (
          selectedRepresentative &&
          selectedRepresentative.id !== detail.representative_image_id
        ) {
          const updated = await apiFetch<IllustrationDetailItem>(
            `/api/illustrations/${detail.id}`,
            {
              method: "PUT",
              body: JSON.stringify({
                representative_image_id: selectedRepresentative.id,
              }),
            },
          );
          detail = updated;
          upsertItem(updated);
        }
      }

      setFiles([]);
      setTitle("");
      setDescription("");
      setNotice({
        type: "success",
        text: `${detail?.image_count ?? selectedFiles.length}장을 하나의 삽화로 올렸습니다.`,
      });
    } catch (error) {
      if (groupId === null) {
        // Nothing was created, so keep the selection for another attempt.
      } else {
        // A partial group exists; avoid accidentally creating a second one.
        setFiles([]);
      }
      setNotice({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "삽화를 올리지 못했습니다.",
      });
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  };

  const openEdit = (item: IllustrationDetailItem) => {
    setEditingItem({
      ...item,
      images: [...item.images],
    });
    setModalNotice(null);
    setModalDragIndex(null);
    setModalDragOverIndex(null);
  };

  const updateEditing = (patch: Partial<IllustrationDetailItem>) => {
    setEditingItem((current) =>
      current ? { ...current, ...patch } : current,
    );
  };

  const moveModalImage = (from: number, to: number) => {
    setEditingItem((current) => {
      if (!current) return current;
      return {
        ...current,
        images: moveItem(current.images, from, to),
      };
    });
  };

  const applyMediaUpdate = (updated: IllustrationDetailItem) => {
    const mediaPatch = {
      images: updated.images,
      image_count: updated.image_count,
      representative_image_id: updated.representative_image_id,
      representative_url: updated.representative_url,
      representative_original_name:
        updated.representative_original_name,
      updated_at: updated.updated_at,
    };
    setItems((previous) =>
      previous.map((item) =>
        item.id === updated.id ? { ...item, ...mediaPatch } : item,
      ),
    );
    return mediaPatch;
  };

  const addImagesToEditing = async (list: FileList | null) => {
    if (!editingItem || !list || addingImages) return;

    const images = Array.from(list).filter((file) =>
      file.type.startsWith("image/"),
    );
    if (images.length === 0) return;

    setAddingImages(true);
    setModalNotice(null);

    const formData = new FormData();
    images.forEach((file) => formData.append("files", file));
    formData.append("illustration_id", String(editingItem.id));

    try {
      const updated = await apiFetch<IllustrationDetailItem>(
        "/api/illustrations/bulk",
        {
          method: "POST",
          body: formData,
        },
      );
      const mediaPatch = applyMediaUpdate(updated);
      setEditingItem((current) => {
        if (!current) return current;
        const existingIds = new Set(current.images.map((image) => image.id));
        const added = updated.images.filter(
          (image) => !existingIds.has(image.id),
        );
        return {
          ...current,
          ...mediaPatch,
          images: [...current.images, ...added],
        };
      });
      setModalNotice({
        type: "success",
        text: `${images.length}장의 사진을 추가했습니다.`,
      });
    } catch (error) {
      setModalNotice({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "사진을 추가하지 못했습니다.",
      });
    } finally {
      setAddingImages(false);
      if (modalFileInputRef.current) {
        modalFileInputRef.current.value = "";
      }
    }
  };

  const removeImageFromEditing = async (
    image: IllustrationDetailItem["images"][number],
  ) => {
    if (
      !editingItem ||
      deletingImageId !== null ||
      editingItem.images.length <= 1
    ) {
      return;
    }
    if (!window.confirm("이 사진을 삭제할까요?")) return;

    setDeletingImageId(image.id);
    setModalNotice(null);

    try {
      const updated = await apiFetch<IllustrationDetailItem>(
        `/api/illustrations/${editingItem.id}/images/${image.id}`,
        { method: "DELETE" },
      );
      const mediaPatch = applyMediaUpdate(updated);
      setEditingItem((current) => {
        if (!current) return current;
        return {
          ...current,
          ...mediaPatch,
          images: current.images
            .filter((item) => item.id !== image.id)
            .map((item, index) => ({ ...item, order: index })),
        };
      });
      setModalNotice({
        type: "success",
        text: "사진을 삭제했습니다.",
      });
    } catch (error) {
      setModalNotice({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "사진을 삭제하지 못했습니다.",
      });
    } finally {
      setDeletingImageId(null);
    }
  };

  const saveEditing = async () => {
    if (!editingItem || savingId !== null) return;

    if (!editingItem.title.trim()) {
      setModalNotice({
        type: "error",
        text: "삽화 제목을 입력해주세요.",
      });
      return;
    }

    if (editingItem.taken_at && editingItem.taken_at > today) {
      setModalNotice({
        type: "error",
        text: "촬영 일자는 오늘 이후로 지정할 수 없습니다.",
      });
      return;
    }

    setSavingId(editingItem.id);
    setModalNotice(null);
    setNotice(null);

    try {
      await apiFetch(
        `/api/illustrations/${editingItem.id}/images/reorder`,
        {
          method: "PUT",
          body: JSON.stringify({
            items: editingItem.images.map((image, index) => ({
              id: image.id,
              order: index,
            })),
          }),
        },
      );
      const updated = await apiFetch<IllustrationDetailItem>(
        `/api/illustrations/${editingItem.id}`,
        {
          method: "PUT",
          body: JSON.stringify({
            title: editingItem.title,
            description: editingItem.description,
            taken_at: editingItem.taken_at || null,
            representative_image_id:
              editingItem.representative_image_id,
            visible: editingItem.visible,
          }),
        },
      );
      upsertItem(updated);
      setEditingItem(null);
      setModalNotice(null);
      setNotice({ type: "success", text: "삽화 정보를 저장했습니다." });
    } catch (error) {
      setModalNotice({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "삽화 정보를 저장하지 못했습니다.",
      });
    } finally {
      setSavingId(null);
    }
  };

  const toggleSelected = (id: number) => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds((previous) =>
      previous.size === items.length
        ? new Set()
        : new Set(items.map((item) => item.id)),
    );
  };

  const persistOrder = async (nextItems: IllustrationDetailItem[]) => {
    try {
      await apiFetch("/api/illustrations/reorder", {
        method: "PUT",
        body: JSON.stringify({
          items: nextItems.map((item, index) => ({
            id: item.id,
            order: index,
          })),
        }),
      });
      setItems(
        nextItems.map((item, index) => ({ ...item, order: index })),
      );
      setNotice({ type: "success", text: "삽화 순서를 저장했습니다." });
    } catch (error) {
      setNotice({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "삽화 순서를 저장하지 못했습니다.",
      });
      void load();
    }
  };

  const moveCard = (fromId: number, toId: number) => {
    if (fromId === toId) return;

    const fromIndex = items.findIndex((item) => item.id === fromId);
    const toIndex = items.findIndex((item) => item.id === toId);
    if (fromIndex < 0 || toIndex < 0) return;

    const next = moveItem(items, fromIndex, toIndex);
    setItems(next);
    void persistOrder(next);
  };

  const bulkUpdate = async (patch: {
    visible?: boolean;
    taken_at?: string | null;
  }) => {
    if (selectedIds.size === 0 || bulkWorking) return;

    if (patch.taken_at && patch.taken_at > today) {
      setNotice({
        type: "error",
        text: "촬영 일자는 오늘 이후로 지정할 수 없습니다.",
      });
      return;
    }

    setBulkWorking(true);
    setNotice(null);

    try {
      const ids = [...selectedIds];
      const result = await apiFetch<{ updated: number }>(
        "/api/illustrations/bulk",
        {
          method: "PATCH",
          body: JSON.stringify({ ids, ...patch }),
        },
      );
      setItems((previous) =>
        previous.map((item) =>
          selectedIds.has(item.id) ? { ...item, ...patch } : item,
        ),
      );
      setNotice({
        type: "success",
        text: `${result.updated}개의 삽화를 수정했습니다.`,
      });
    } catch (error) {
      setNotice({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "삽화를 일괄 수정하지 못했습니다.",
      });
    } finally {
      setBulkWorking(false);
    }
  };

  const bulkDelete = async () => {
    if (selectedIds.size === 0 || bulkWorking) return;

    const count = selectedIds.size;
    if (
      !window.confirm(
        `선택한 삽화 ${count}개를 삭제할까요?\n삭제한 사진 파일도 함께 삭제되며 되돌릴 수 없습니다.`,
      )
    ) {
      return;
    }

    setBulkWorking(true);
    setNotice(null);

    try {
      const result = await apiFetch<{ deleted: number }>(
        "/api/illustrations/bulk-delete",
        {
          method: "POST",
          body: JSON.stringify({ ids: [...selectedIds] }),
        },
      );
      const removed = selectedIds;
      setItems((previous) =>
        previous.filter((item) => !removed.has(item.id)),
      );
      setSelectedIds(new Set());
      setNotice({
        type: "success",
        text: `${result.deleted}개의 삽화를 삭제했습니다.`,
      });
    } catch (error) {
      setNotice({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "삽화를 일괄 삭제하지 못했습니다.",
      });
    } finally {
      setBulkWorking(false);
    }
  };

  const deleteItem = async (item: IllustrationDetailItem) => {
    if (
      deletingId !== null ||
      !window.confirm("이 삽화를 삭제할까요?")
    ) {
      return;
    }

    setDeletingId(item.id);
    setNotice(null);

    try {
      await apiFetch(`/api/illustrations/${item.id}`, {
        method: "DELETE",
      });
      setItems((previous) =>
        previous.filter((current) => current.id !== item.id),
      );
      setSelectedIds((previous) => {
        const next = new Set(previous);
        next.delete(item.id);
        return next;
      });
      setEditingItem((current) =>
        current?.id === item.id ? null : current,
      );
      setNotice({ type: "success", text: "삽화를 삭제했습니다." });
    } catch (error) {
      setNotice({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "삽화를 삭제하지 못했습니다.",
      });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div id="admin-illustrations">
      <header className="admin-illustrations-toolbar">
        <div>
          <h1>삽화 관리</h1>
          <p className="admin-illustrations-hint">
            사진을 여러 장 선택해 한 번에 하나의 삽화로 올릴 수 있습니다.
            최대 {MAX_FILES}장.
          </p>
        </div>
        <div className="admin-illustrations-toolbar-actions">
          <button
            type="button"
            className="admin-button"
            onClick={() => void load()}
            disabled={loading || uploading}
          >
            새로고침
          </button>
        </div>
      </header>

      {notice ? (
        <p
          className={`admin-illustrations-notice is-${notice.type}`}
          role="status"
        >
          {notice.text}
        </p>
      ) : null}

      <section className="admin-illustrations-upload">
        <div className="admin-illustrations-upload__head">
          <div>
            <h2>새 삽화 올리기</h2>
            <p>선택한 사진들은 하나의 삽화로 묶입니다.</p>
          </div>
          <span>{files.length} / {MAX_FILES}</span>
        </div>

        <div
          className="admin-illustrations-picker"
          onDragOver={(event) => event.preventDefault()}
          onDrop={handleDrop}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            multiple
            onChange={(event) => addFiles(event.target.files)}
          />
          {previews.length === 0 ? (
            <button
              type="button"
              className="admin-illustrations-picker__empty"
              onClick={() => fileInputRef.current?.click()}
            >
              <strong>사진 선택</strong>
              <span>또는 이 영역에 사진을 끌어다 놓으세요.</span>
            </button>
          ) : (
            <>
              <div className="admin-illustrations-picker__head">
                <span>선택한 사진 {files.length}장</span>
                <button
                  type="button"
                  className="admin-button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  사진 추가
                </button>
              </div>
              <p className="admin-illustrations-order-hint">
                사진을 드래그해 순서를 바꾸고, 미리보기에 사용할 대표
                이미지를 선택하세요.
              </p>
              <div className="admin-illustrations-previews">
                {previews.map((preview, index) => (
                  <div
                    className={`admin-illustrations-preview${
                      dragIndex === index ? " is-dragging" : ""
                    }${
                      dragOverIndex === index && dragIndex !== index
                        ? " is-drag-over"
                        : ""
                    }`}
                    key={preview.url}
                    draggable={!uploading}
                    onDragStart={(event) => {
                      setDragIndex(index);
                      event.dataTransfer.effectAllowed = "move";
                    }}
                    onDragOver={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      event.dataTransfer.dropEffect = "move";
                      setDragOverIndex(index);
                    }}
                    onDragLeave={() => {
                      setDragOverIndex((current) =>
                        current === index ? null : current,
                      );
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      if (event.dataTransfer.files.length > 0) {
                        addFiles(event.dataTransfer.files);
                        setDragIndex(null);
                        setDragOverIndex(null);
                        return;
                      }
                      event.stopPropagation();
                      if (dragIndex !== null) {
                        moveFile(dragIndex, index);
                      }
                      setDragIndex(null);
                      setDragOverIndex(null);
                    }}
                    onDragEnd={() => {
                      setDragIndex(null);
                      setDragOverIndex(null);
                    }}
                  >
                    <span
                      className="admin-illustrations-preview__handle"
                      aria-hidden="true"
                    >
                      ⠿
                    </span>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={preview.url} alt={preview.file.name} />
                    <label
                      className={`admin-illustrations-preview__rep${
                        representativeIndex === index ? " is-active" : ""
                      }`}
                    >
                      <input
                        type="radio"
                        name="representative-image"
                        checked={representativeIndex === index}
                        onChange={() => setRepresentativeIndex(index)}
                      />
                      대표
                    </label>
                    <button
                      type="button"
                      onClick={() => removeFile(index)}
                      aria-label={`${preview.file.name} 선택 해제`}
                    >
                      ×
                    </button>
                    <span className="admin-illustrations-preview__order">
                      {index + 1}
                    </span>
                    <span className="admin-illustrations-preview__name">
                      {preview.file.name}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="admin-illustrations-fields">
          <label className="admin-illustrations-field">
            <span>제목 <em>필수</em></span>
            <input
              value={title}
              maxLength={255}
              required
              placeholder="삽화 제목"
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label className="admin-illustrations-field">
            <span>상세 설명 <em>선택</em></span>
            <textarea
              value={description}
              maxLength={2000}
              rows={3}
              placeholder="삽화에 대한 설명"
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
        </div>

        <label className="admin-illustrations-batch-date">
          <span>촬영 일자 (선택)</span>
          <input
            type="date"
            max={today}
            value={takenAt}
            onChange={(event) => setTakenAt(event.target.value)}
          />
          <small>선택한 사진 전체에 같은 촬영 일자를 기록합니다.</small>
        </label>

        {previews.length > 0 ? (
          <div className="admin-illustrations-upload__actions">
            <button
              type="button"
              className="admin-button"
              onClick={() => setFiles([])}
              disabled={uploading}
            >
              선택 비우기
            </button>
            <button
              type="button"
              className="admin-button primary"
              onClick={() => void handleUpload()}
              disabled={uploading || !title.trim()}
            >
              {uploading
                ? uploadProgress
                  ? `${uploadProgress.done}/${uploadProgress.total} 올리는 중...`
                  : "올리는 중..."
                : `${files.length}장으로 삽화 만들기`}
            </button>
          </div>
        ) : null}
      </section>

      <section className="admin-illustrations-list">
        <div className="admin-illustrations-list__head">
          <h2>등록된 삽화</h2>
          <div className="admin-illustrations-list__tools">
            <span>{items.length}개</span>
            <label className="admin-illustrations-select-all">
              <input
                type="checkbox"
                checked={
                  items.length > 0 && selectedIds.size === items.length
                }
                onChange={toggleSelectAll}
              />
              전체 선택
            </label>
          </div>
        </div>

        {selectedIds.size > 0 ? (
          <div className="admin-illustrations-bulkbar">
            <strong>{selectedIds.size}개 선택</strong>
            <div className="admin-illustrations-bulkbar__actions">
              <button
                type="button"
                className="admin-button"
                onClick={() => void bulkUpdate({ visible: true })}
                disabled={bulkWorking}
              >
                공개
              </button>
              <button
                type="button"
                className="admin-button"
                onClick={() => void bulkUpdate({ visible: false })}
                disabled={bulkWorking}
              >
                비공개
              </button>
              <label className="admin-illustrations-bulkbar__date">
                <span>촬영 일자</span>
                <input
                  type="date"
                  max={today}
                  value={bulkTakenAt}
                  onChange={(event) => setBulkTakenAt(event.target.value)}
                />
              </label>
              <button
                type="button"
                className="admin-button"
                onClick={() =>
                  void bulkUpdate({ taken_at: bulkTakenAt || null })
                }
                disabled={bulkWorking || !bulkTakenAt}
              >
                촬영일 적용
              </button>
              <button
                type="button"
                className="admin-button is-danger"
                onClick={() => void bulkDelete()}
                disabled={bulkWorking}
              >
                선택 삭제
              </button>
              <button
                type="button"
                className="admin-button"
                onClick={() => setSelectedIds(new Set())}
                disabled={bulkWorking}
              >
                선택 해제
              </button>
            </div>
          </div>
        ) : null}

        {loading ? (
          <p className="admin-illustrations-state">불러오는 중...</p>
        ) : items.length === 0 ? (
          <p className="admin-illustrations-state">
            아직 등록된 삽화가 없습니다.
          </p>
        ) : (
          <>
            <div className="admin-illustrations-grid">
              {visibleItems.map((item) => {
              const representative = representativeImage(item);
              return (
                <article
                  className={`admin-illustration-card is-compact${
                    selectedIds.has(item.id) ? " is-selected" : ""
                  }${
                    cardDragId === item.id ? " is-card-dragging" : ""
                  }${
                    cardDragOverId === item.id && cardDragId !== item.id
                      ? " is-card-drag-over"
                      : ""
                  }`}
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => openEdit(item)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openEdit(item);
                    }
                  }}
                  onDragOver={(event) => {
                    if (cardDragId === null) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    setCardDragOverId(item.id);
                  }}
                  onDragLeave={() => {
                    setCardDragOverId((current) =>
                      current === item.id ? null : current,
                    );
                  }}
                  onDrop={(event) => {
                    if (cardDragId === null) return;
                    event.preventDefault();
                    moveCard(cardDragId, item.id);
                    setCardDragId(null);
                    setCardDragOverId(null);
                  }}
                >
                  <span
                    className="admin-illustration-card__drag"
                    draggable
                    title="드래그해서 순서 변경"
                    onClick={(event) => event.stopPropagation()}
                    onDragStart={(event) => {
                      event.stopPropagation();
                      setCardDragId(item.id);
                      event.dataTransfer.effectAllowed = "move";
                    }}
                    onDragEnd={() => {
                      setCardDragId(null);
                      setCardDragOverId(null);
                    }}
                  >
                    ⠿
                  </span>
                  <label
                    className="admin-illustration-card__select"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(item.id)}
                      onChange={() => toggleSelected(item.id)}
                    />
                    선택
                  </label>
                  {representative ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={representative.url}
                      alt={item.title}
                      loading="lazy"
                      decoding="async"
                    />
                  ) : null}
                  <div className="admin-illustration-card__compact">
                    <div className="admin-illustration-card__compact-copy">
                      <p>{item.title}</p>
                      {item.description ? (
                        <p className="admin-illustration-card__compact-description">
                          {item.description}
                        </p>
                      ) : null}
                      <p className="admin-illustration-card__compact-date">
                        촬영 {formatDate(item.taken_at)}
                      </p>
                    </div>
                    <span>{item.image_count}장</span>
                  </div>
                </article>
              );
            })}
            </div>

            {totalPages > 1 ? (
              <nav
                className="admin-illustrations-pagination"
                aria-label="등록된 삽화 페이지"
              >
                <button
                  type="button"
                  className="admin-illustrations-pagination__button"
                  onClick={() =>
                    setListPage((page) => Math.max(1, page - 1))
                  }
                  disabled={currentPage <= 1}
                >
                  이전
                </button>
                {listPageNumbers(currentPage, totalPages).map(
                  (value, index) =>
                    value === "ellipsis" ? (
                      <span
                        className="admin-illustrations-pagination__ellipsis"
                        key={`ellipsis-${index}`}
                      >
                        …
                      </span>
                    ) : (
                      <button
                        type="button"
                        className={`admin-illustrations-pagination__button${
                          value === currentPage ? " is-active" : ""
                        }`}
                        onClick={() => setListPage(value)}
                        aria-current={
                          value === currentPage ? "page" : undefined
                        }
                        key={value}
                      >
                        {value}
                      </button>
                    ),
                )}
                <button
                  type="button"
                  className="admin-illustrations-pagination__button"
                  onClick={() =>
                    setListPage((page) =>
                      Math.min(totalPages, page + 1),
                    )
                  }
                  disabled={currentPage >= totalPages}
                >
                  다음
                </button>
              </nav>
            ) : null}
          </>
        )}
      </section>

      {editingItem ? (
        <div
          className="admin-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setEditingItem(null);
            }
          }}
        >
          <div
            className="admin-modal admin-illustrations-modal"
            role="dialog"
            aria-modal="true"
            aria-label="삽화 상세 수정"
          >
            <header className="admin-modal-header">
              <h2>삽화 상세 수정</h2>
              <button
                type="button"
                className="admin-modal-close"
                onClick={() => setEditingItem(null)}
                aria-label="닫기"
              >
                ×
              </button>
            </header>

            <div className="admin-modal-body">
              <div className="admin-illustrations-modal__summary">
                <div className="admin-illustrations-modal__cover">
                  {representativeImage(editingItem) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={representativeImage(editingItem)!.url}
                      alt={editingItem.title}
                    />
                  ) : null}
                </div>
                <div className="admin-illustrations-modal__fields">
                  <label className="admin-illustration-card__field">
                    <span>제목</span>
                    <input
                      value={editingItem.title}
                      maxLength={255}
                      required
                      placeholder="삽화 제목"
                      onChange={(event) =>
                        updateEditing({ title: event.target.value })
                      }
                    />
                  </label>
                  <label className="admin-illustration-card__field">
                    <span>상세 설명</span>
                    <textarea
                      value={editingItem.description ?? ""}
                      maxLength={2000}
                      rows={4}
                      placeholder="삽화에 대한 설명"
                      onChange={(event) =>
                        updateEditing({
                          description: event.target.value,
                        })
                      }
                    />
                  </label>
                  <label className="admin-illustration-card__field is-inline">
                    <span>촬영 일자</span>
                    <input
                      type="date"
                      max={today}
                      value={editingItem.taken_at ?? ""}
                      onChange={(event) =>
                        updateEditing({
                          taken_at: event.target.value || null,
                        })
                      }
                    />
                  </label>
                  <label className="admin-illustrations-modal__visible">
                    <input
                      type="checkbox"
                      checked={editingItem.visible}
                      onChange={(event) =>
                        updateEditing({
                          visible: event.target.checked,
                        })
                      }
                    />
                    공개
                  </label>
                </div>
              </div>

              <div className="admin-illustrations-modal__images">
                <div className="admin-illustrations-modal__images-head">
                  <div>
                    <h3>사진 순서 및 대표 이미지</h3>
                    <p>
                      사진을 드래그해 순서를 바꾸고, 라디오로 대표
                      이미지를 선택하세요.
                    </p>
                  </div>
                  <div className="admin-illustrations-modal__images-actions">
                    <span>{editingItem.image_count}장</span>
                    <button
                      type="button"
                      className="admin-button"
                      onClick={() => modalFileInputRef.current?.click()}
                      disabled={addingImages}
                    >
                      {addingImages ? "추가 중..." : "사진 추가"}
                    </button>
                    <input
                      ref={modalFileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      multiple
                      onChange={(event) =>
                        void addImagesToEditing(event.target.files)
                      }
                    />
                  </div>
                </div>

                {modalNotice ? (
                  <p
                    className={`admin-illustrations-notice is-${modalNotice.type}`}
                    role="status"
                  >
                    {modalNotice.text}
                  </p>
                ) : null}

                <div className="admin-illustrations-modal__image-list">
                  {editingItem.images.map((image, index) => (
                    <div
                      className={`admin-illustrations-modal__image${
                        modalDragIndex === index ? " is-dragging" : ""
                      }${
                        modalDragOverIndex === index &&
                        modalDragIndex !== index
                          ? " is-drag-over"
                          : ""
                      }`}
                      key={image.id}
                      draggable
                      onDragStart={(event) => {
                        setModalDragIndex(index);
                        event.dataTransfer.effectAllowed = "move";
                      }}
                      onDragOver={(event) => {
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "move";
                        setModalDragOverIndex(index);
                      }}
                      onDragLeave={() => {
                        setModalDragOverIndex((current) =>
                          current === index ? null : current,
                        );
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        if (modalDragIndex !== null) {
                          moveModalImage(modalDragIndex, index);
                        }
                        setModalDragIndex(null);
                        setModalDragOverIndex(null);
                      }}
                      onDragEnd={() => {
                        setModalDragIndex(null);
                        setModalDragOverIndex(null);
                      }}
                    >
                      <span
                        className="admin-illustrations-modal__image-handle"
                        aria-hidden="true"
                      >
                        ⠿
                      </span>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={image.url}
                        alt={image.original_name || editingItem.title}
                        loading="lazy"
                        decoding="async"
                      />
                      <label
                        className={`admin-illustrations-modal__image-rep${
                          editingItem.representative_image_id === image.id
                            ? " is-active"
                            : ""
                        }`}
                      >
                        <input
                          type="radio"
                          name={`modal-representative-${editingItem.id}`}
                          checked={
                            editingItem.representative_image_id ===
                            image.id
                          }
                          onChange={() =>
                            updateEditing({
                              representative_image_id: image.id,
                            })
                          }
                        />
                        대표
                      </label>
                      <span className="admin-illustrations-modal__image-order">
                        {index + 1}
                      </span>
                      <button
                        type="button"
                        className="admin-illustrations-modal__image-delete"
                        draggable={false}
                        aria-label={`${index + 1}번째 사진 삭제`}
                        disabled={
                          editingItem.images.length <= 1 ||
                          deletingImageId !== null
                        }
                        onClick={(event) => {
                          event.stopPropagation();
                          void removeImageFromEditing(image);
                        }}
                      >
                        {deletingImageId === image.id ? "…" : "×"}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <footer className="admin-modal-footer admin-illustrations-modal__footer">
              <button
                type="button"
                className="admin-button is-danger"
                onClick={() => void deleteItem(editingItem)}
                disabled={deletingId !== null || savingId !== null}
              >
                {deletingId === editingItem.id ? "삭제 중..." : "삭제"}
              </button>
              <div>
                <button
                  type="button"
                  className="admin-button"
                  onClick={() => setEditingItem(null)}
                  disabled={savingId !== null}
                >
                  취소
                </button>
                <button
                  type="button"
                  className="admin-button primary"
                  onClick={() => void saveEditing()}
                  disabled={
                    savingId !== null || !editingItem.title.trim()
                  }
                >
                  {savingId === editingItem.id ? "저장 중..." : "저장"}
                </button>
              </div>
            </footer>
          </div>
        </div>
      ) : null}
    </div>
  );
}
