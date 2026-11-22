"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent,
} from "react";

import {
  ImageCropModal,
  type CropStageConfig,
  type CroppedImageResult,
} from "@/components/image-crop-modal";
import { TagInput } from "@/components/tag-input";
import { apiFetch, apiFetchWithTotal } from "@/lib/api";
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
type IllustrationVisibility = "public" | "protected" | "private";

interface Preview {
  file: File;
  url: string;
  range?: VideoRange;
}

const MAX_FILES = 100;
const MAX_VIDEOS_PER_ILLUSTRATION = 5;
const MAX_CHUNK_BYTES = 32 * 1024 * 1024;
const MAX_IMAGE_BYTES = 40 * 1024 * 1024;
const MAX_REPRESENTATIVE_BYTES = 16 * 1024 * 1024;
const LIST_PAGE_SIZE = 12;
const MAX_VIDEO_SECONDS = 10;
const MAX_VIDEO_BYTES = 20 * 1024 * 1024;
const MAX_VIDEO_UPLOAD_BYTES = 200 * 1024 * 1024;
const ILLUSTRATION_ACCEPT =
  "image/png,image/jpeg,image/webp,image/gif,video/mp4,video/quicktime,video/webm,video/x-m4v";
const ILLUSTRATION_VIDEO_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-m4v",
]);

function isIllustrationFile(file: File) {
  return (
    file.type.startsWith("image/") || ILLUSTRATION_VIDEO_TYPES.has(file.type)
  );
}

function countVideos(files: File[]) {
  return files.filter((file) => ILLUSTRATION_VIDEO_TYPES.has(file.type)).length;
}

interface StageFilesOptions {
  files: File[];
  ranges?: Map<File, VideoRange>;
  purpose: "create" | "append";
  illustrationId?: number;
  title?: string;
  description?: string;
  tags?: string;
  takenAt?: string;
  visible?: boolean;
  protected?: boolean;
  representativeFile?: File | null;
  onChunk?: (file: File, index: number, total: number) => void;
}

/**
 * Store every file on the server first. Videos are split into byte-sized
 * requests; nothing is published until finalize runs.
 */
async function stageFiles(options: StageFilesOptions): Promise<string> {
  const sessionId = crypto.randomUUID();
  for (const [fileIndex, file] of options.files.entries()) {
    const isVideo = ILLUSTRATION_VIDEO_TYPES.has(file.type);
    const chunkCount = isVideo
      ? Math.max(1, Math.ceil(file.size / MAX_CHUNK_BYTES))
      : 1;
    const range = options.ranges?.get(file) ?? {
      start: 0,
      seconds: MAX_VIDEO_SECONDS,
    };

    for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
      options.onChunk?.(file, chunkIndex + 1, chunkCount);
      const start = chunkIndex * MAX_CHUNK_BYTES;
      const formData = new FormData();
      formData.append(
        "chunk",
        file.slice(start, Math.min(start + MAX_CHUNK_BYTES, file.size)),
        `${file.name}.part${chunkIndex}`,
      );
      formData.append("session_id", sessionId);
      formData.append("purpose", options.purpose);
      formData.append("file_index", String(fileIndex));
      formData.append("file_count", String(options.files.length));
      formData.append("chunk_index", String(chunkIndex));
      formData.append("chunk_count", String(chunkCount));
      formData.append("file_name", file.name);
      formData.append("content_type", file.type);
      formData.append("total_size", String(file.size));
      if (options.illustrationId) {
        formData.append("illustration_id", String(options.illustrationId));
      }
      if (isVideo) {
        formData.append("video_start_seconds", String(range.start));
        formData.append("video_seconds", String(range.seconds));
      }

      if (fileIndex === 0 && chunkIndex === 0) {
        if (options.title) formData.append("title", options.title);
        if (options.description) {
          formData.append("description", options.description);
        }
        if (options.tags) formData.append("tags", options.tags);
        if (options.takenAt) formData.append("taken_at", options.takenAt);
        if (options.visible !== undefined) {
          formData.append("visible", String(options.visible));
        }
        if (options.protected !== undefined) {
          formData.append("protected", String(options.protected));
        }
        if (options.representativeFile) {
          formData.append("representative_file", options.representativeFile);
        }
      }

      await apiFetch("/api/illustrations/upload-stage", {
        method: "POST",
        body: formData,
      });
    }
  }
  return sessionId;
}

async function finalizeStagedUpload(sessionId: string) {
  const formData = new FormData();
  formData.append("session_id", sessionId);
  return apiFetch<
    IllustrationDetailItem | { accepted: boolean; illustration_id: number }
  >("/api/illustrations/upload-finalize", {
    method: "POST",
    body: formData,
  });
}

async function waitForAppendImages(id: number, expected: number) {
  const deadline = Date.now() + 10 * 60 * 1000;
  while (Date.now() < deadline) {
    const detail = await apiFetch<IllustrationDetailItem>(
      `/api/illustrations/${id}?mine=true`,
    );
    if (
      detail.upload_status !== "processing" &&
      (detail.images?.length ?? 0) >= expected
    ) {
      return detail;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 1000));
  }
  throw new Error("영상 처리가 완료되지 않았습니다.");
}

async function waitForIllustrationReady(id: number) {
  const deadline = Date.now() + 10 * 60 * 1000;
  while (Date.now() < deadline) {
    try {
      const detail = await apiFetch<IllustrationDetailItem>(
        `/api/illustrations/${id}?mine=true`,
      );
      if (detail.upload_status !== "processing") return detail;
    } catch {
      throw new Error("삽화 이미지 업로드에 실패해 등록이 취소되었습니다.");
    }
    await new Promise((resolve) => window.setTimeout(resolve, 1000));
  }
  throw new Error("이미지 업로드가 완료되지 않았습니다.");
}

interface VideoRange {
  start: number;
  seconds: number;
}

interface VideoTrimCandidate {
  file: File;
  duration: number | null;
  previewUrl: string;
}

type VideoCandidateBase = Omit<VideoTrimCandidate, "previewUrl">;

interface VideoTrimRequest {
  target: "create" | "edit";
  files: File[];
  videos: VideoTrimCandidate[];
}

function readVideoDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    const finish = (duration: number | null) => {
      URL.revokeObjectURL(url);
      video.removeAttribute("src");
      video.load();
      resolve(duration);
    };
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      finish(
        Number.isFinite(video.duration) && video.duration > 0
          ? video.duration
          : null,
      );
    };
    video.onerror = () => finish(null);
    video.src = url;
  });
}

async function inspectVideos(files: File[]): Promise<VideoCandidateBase[]> {
  const videos = files.filter((file) => ILLUSTRATION_VIDEO_TYPES.has(file.type));
  return Promise.all(
    videos.map(async (file) => ({
      file,
      duration: await readVideoDuration(file),
    })),
  );
}

function oversizedVideo(files: File[]) {
  return files.find(
    (file) =>
      ILLUSTRATION_VIDEO_TYPES.has(file.type) &&
      file.size > MAX_VIDEO_UPLOAD_BYTES,
  );
}

function needsTrim(candidate: VideoCandidateBase) {
  if (candidate.file.size > MAX_VIDEO_BYTES) return true;
  return candidate.duration !== null && candidate.duration > MAX_VIDEO_SECONDS;
}

function startMax(candidate: VideoCandidateBase, seconds: number) {
  if (candidate.duration === null) return 0;
  return Math.max(0, Math.floor(candidate.duration - seconds));
}

function formatClock(totalSeconds: number) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

function formatClockDraft(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 6);
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 6)]
    .filter(Boolean)
    .join(":");
}

function parseClockDraft(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 6) return null;
  const hours = Number(digits.slice(0, 2));
  const minutes = Number(digits.slice(2, 4));
  const seconds = Number(digits.slice(4, 6));
  if (minutes > 59 || seconds > 59) return null;
  return hours * 3600 + minutes * 60 + seconds;
}

function trimDefault(candidate: VideoCandidateBase) {
  if (candidate.duration === null) return MAX_VIDEO_SECONDS;
  return Math.min(
    MAX_VIDEO_SECONDS,
    Math.max(1, Math.floor(candidate.duration)),
  );
}

const REPRESENTATIVE_CROP_STAGES: CropStageConfig[] = [
  {
    key: "representative",
    aspect: 1,
    outputWidth: 1024,
    title: "대표 이미지 자르기",
    hint: "목록에 표시할 정사각형(1:1) 이미지를 자릅니다. 적용하면 1024×1024px로 저장됩니다.",
    fileSuffix: "representative",
  },
];

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

function moveItem<T>(items: T[], from: number, to: number) {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) {
    return items;
  }
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function parseTags(value: string) {
  const tags: string[] = [];
  for (const raw of value.split(",")) {
    const tag = raw.trim();
    if (tag && !tags.includes(tag)) {
      tags.push(tag);
    }
  }
  return tags;
}

export default function AdminIllustrations() {
  const [items, setItems] = useState<IllustrationDetailItem[]>([]);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<Preview[]>([]);
  const [sentFiles, setSentFiles] = useState<Set<File>>(() => new Set());
  const [sendingFile, setSendingFile] = useState<File | null>(null);
  const [sendingChunk, setSendingChunk] = useState<{
    file: File;
    index: number;
    total: number;
  } | null>(null);
  const [uploadProgressOpen, setUploadProgressOpen] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadModalStatus, setUploadModalStatus] = useState<
    "running" | "success" | "error"
  >("running");
  const [videoRangesByFile, setVideoRangesByFile] = useState<
    Map<File, VideoRange>
  >(() => new Map());
  const [videoTrimRequest, setVideoTrimRequest] =
    useState<VideoTrimRequest | null>(null);
  const [videoTrimStarts, setVideoTrimStarts] = useState<number[]>([]);
  const [clockDrafts, setClockDrafts] = useState<Record<number, string>>({});
  const [videoTrimSeconds, setVideoTrimSeconds] = useState<number[]>([]);
  const [trimPreviewPlaying, setTrimPreviewPlaying] = useState<number | null>(
    null,
  );
  const [trimPreviewTimes, setTrimPreviewTimes] = useState<number[]>([]);
  const [inspectingVideos, setInspectingVideos] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [takenAt, setTakenAt] = useState("");
  const [createVisibility, setCreateVisibility] =
    useState<IllustrationVisibility>("public");
  const [createRepresentativeFile, setCreateRepresentativeFile] =
    useState<File | null>(null);
  const [createRepresentativePreview, setCreateRepresentativePreview] =
    useState<string | null>(null);
  const [representativeCrop, setRepresentativeCrop] = useState<{
    target: "create" | "edit";
    src: string;
    fileName: string;
  } | null>(null);
  const [savingRepresentative, setSavingRepresentative] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [listPage, setListPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [listQuery, setListQuery] = useState("");
  const [listQueryInput, setListQueryInput] = useState("");
  const [uploading, setUploading] = useState(false);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(
    () => new Set(),
  );
  const [bulkWorking, setBulkWorking] = useState(false);
  const [bulkTakenAt, setBulkTakenAt] = useState("");
  const [bulkTags, setBulkTags] = useState("");
  const [cardDragId, setCardDragId] = useState<number | null>(null);
  const [cardDragOverId, setCardDragOverId] = useState<number | null>(null);
  const [editingItem, setEditingItem] =
    useState<IllustrationDetailItem | null>(null);
  const [editingTagsInput, setEditingTagsInput] = useState("");
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
  const [issuedCode, setIssuedCode] = useState<string | null>(null);
  const [issuing, setIssuing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modalFileInputRef = useRef<HTMLInputElement>(null);
  const createRepresentativeInputRef = useRef<HTMLInputElement>(null);
  const modalRepresentativeInputRef = useRef<HTMLInputElement>(null);
  const handledEditParamRef = useRef(false);
  const trimVideoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const backgroundUploadIdsRef = useRef<Set<number>>(new Set());
  const today = todayDateInputValue();

  useEffect(() => {
    setIssuedCode(null);
  }, [editingItem?.id]);

  const totalPages = Math.max(
    1,
    Math.ceil(totalCount / LIST_PAGE_SIZE),
  );
  const currentPage = Math.min(listPage, totalPages);
  const visibleItems = items;
  const selectableItems = items.filter(
    (item) => item.upload_status !== "processing",
  );

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(listPage),
        page_size: String(LIST_PAGE_SIZE),
      });
      if (listQuery) params.set("q", listQuery);
      const { data, total } = await apiFetchWithTotal<
        Omit<IllustrationDetailItem, "images">[]
      >(`/api/illustrations/admin?${params.toString()}`);
      setItems(data.map((item) => ({ ...item, images: [] })));
      setTotalCount(total ?? data.length);
      if (!silent) setSelectedIds(new Set());
    } catch (error) {
      if (!silent) {
        setNotice({
          type: "error",
          text:
            error instanceof Error
              ? error.message
              : "삽화 목록을 불러오지 못했습니다.",
        });
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [listPage, listQuery]);

  useEffect(() => {
    void load();
  }, [load]);

  const hasBackgroundUploads = items.some(
    (item) => item.upload_status === "processing",
  );

  useEffect(() => {
    if (!hasBackgroundUploads) return;
    const timer = window.setInterval(() => void load(true), 2000);
    return () => window.clearInterval(timer);
  }, [hasBackgroundUploads, load]);

  useEffect(() => {
    const remaining = new Set<number>();
    let failed = 0;
    backgroundUploadIdsRef.current.forEach((id) => {
      const item = items.find((candidate) => candidate.id === id);
      if (!item) {
        failed += 1;
      } else if (item.upload_status === "processing") {
        remaining.add(id);
      }
    });
    backgroundUploadIdsRef.current = remaining;
    if (failed > 0) {
      setNotice({
        type: "error",
        text: `${failed}개의 삽화 업로드에 실패해 등록이 취소되었습니다.`,
      });
    }
  }, [items]);

  useEffect(() => {
    const next = files.map((file) => ({
      file,
      url: URL.createObjectURL(file),
      range: videoRangesByFile.get(file),
    }));
    setPreviews(next);

    return () => {
      next.forEach((preview) => URL.revokeObjectURL(preview.url));
    };
  }, [files, videoRangesByFile]);

  useEffect(() => {
    return () => {
      if (createRepresentativePreview) {
        URL.revokeObjectURL(createRepresentativePreview);
      }
    };
  }, [createRepresentativePreview]);

  useEffect(() => {
    if (files.length === 0) {
      setCreateRepresentativeFile(null);
      setCreateRepresentativePreview(null);
    }
  }, [files.length]);

  useEffect(() => {
    if (listPage > totalPages) {
      setListPage(totalPages);
    }
  }, [listPage, totalPages]);

  useEffect(() => {
    if (!editingItem) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !representativeCrop) {
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
  }, [editingItem, representativeCrop]);

  useEffect(() => {
    return () => {
      videoTrimRequest?.videos.forEach((video) =>
        URL.revokeObjectURL(video.previewUrl),
      );
    };
  }, [videoTrimRequest]);

  const appendSelectedFiles = (
    media: File[],
    ranges: Map<File, VideoRange> = new Map(),
  ) => {
    const available = Math.max(0, MAX_FILES - files.length);
    const chosen = media.slice(0, available);
    if (files.length + countVideos(chosen) > MAX_VIDEOS_PER_ILLUSTRATION) {
      setNotice({
        type: "error",
        text: `영상은 삽화 하나당 최대 ${MAX_VIDEOS_PER_ILLUSTRATION}개까지 넣을 수 있습니다.`,
      });
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setFiles((previous) => [...previous, ...chosen]);
    if (ranges.size > 0) {
      setVideoRangesByFile((previous) => {
        const next = new Map(previous);
        ranges.forEach((range, file) => next.set(file, range));
        return next;
      });
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const openVideoTrim = (
    target: "create" | "edit",
    media: File[],
    videos: VideoCandidateBase[],
  ) => {
    const candidates: VideoTrimCandidate[] = videos.map((video) => ({
      ...video,
      previewUrl: URL.createObjectURL(video.file),
    }));
    trimVideoRefs.current = [];
    setTrimPreviewPlaying(null);
    setTrimPreviewTimes(candidates.map(() => 0));
    setVideoTrimRequest({ target, files: media, videos: candidates });
    setVideoTrimStarts(candidates.map(() => 0));
    setVideoTrimSeconds(candidates.map(trimDefault));
  };

  const addFiles = async (list: FileList | null) => {
    if (!list || inspectingVideos) return;

    const media = Array.from(list).filter(isIllustrationFile);
    if (media.length === 0) return;

    if (oversizedVideo(media)) {
      setNotice({
        type: "error",
        text: `원본 영상은 ${
          MAX_VIDEO_UPLOAD_BYTES / (1024 * 1024)
        }MB 이하만 업로드할 수 있습니다.`,
      });
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    if (files.length + countVideos(media) > MAX_VIDEOS_PER_ILLUSTRATION) {
      setNotice({
        type: "error",
        text: `영상은 삽화 하나당 최대 ${MAX_VIDEOS_PER_ILLUSTRATION}개까지 넣을 수 있습니다.`,
      });
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setInspectingVideos(true);
    try {
      const videos = await inspectVideos(media);
      const longVideos = videos.filter(needsTrim);
      if (longVideos.length > 0) {
        openVideoTrim("create", media, longVideos);
        return;
      }
      appendSelectedFiles(media);
    } finally {
      setInspectingVideos(false);
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    void addFiles(event.dataTransfer.files);
  };

  const removeFile = (index: number) => {
    const removed = files[index];
    setFiles((previous) =>
      previous.filter((_, fileIndex) => fileIndex !== index),
    );
    if (removed) {
      setVideoRangesByFile((previous) => {
        const next = new Map(previous);
        next.delete(removed);
        return next;
      });
    }
  };

  const moveFile = (from: number, to: number) => {
    setFiles((previous) => moveItem(previous, from, to));
  };

  const closeRepresentativeCrop = useCallback(() => {
    setRepresentativeCrop((current) => {
      if (current) {
        URL.revokeObjectURL(current.src);
      }
      return null;
    });
  }, []);

  const openRepresentativeCrop = (
    list: FileList | null,
    target: "create" | "edit",
  ) => {
    const file = list?.[0];
    if (!file) return;

    const showError = (text: string) => {
      if (target === "edit") {
        setModalNotice({ type: "error", text });
      } else {
        setNotice({ type: "error", text });
      }
    };

    const resetInput = () => {
      if (target === "create" && createRepresentativeInputRef.current) {
        createRepresentativeInputRef.current.value = "";
      }
      if (target === "edit" && modalRepresentativeInputRef.current) {
        modalRepresentativeInputRef.current.value = "";
      }
    };

    if (!file.type.startsWith("image/")) {
      showError("PNG / JPEG / WEBP / GIF 이미지만 업로드할 수 있습니다.");
      resetInput();
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      showError("이미지는 50MB 이하만 업로드할 수 있습니다.");
      resetInput();
      return;
    }

    const src = URL.createObjectURL(file);
    setRepresentativeCrop({ target, src, fileName: file.name });
    resetInput();
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
    if (countVideos(files) > MAX_VIDEOS_PER_ILLUSTRATION) {
      setNotice({
        type: "error",
        text: `영상은 삽화 하나당 최대 ${MAX_VIDEOS_PER_ILLUSTRATION}개까지 넣을 수 있습니다.`,
      });
      return;
    }

    const uploadedCount = files.length;
    if (
      createRepresentativeFile &&
      createRepresentativeFile.size > MAX_REPRESENTATIVE_BYTES
    ) {
      setNotice({
        type: "error",
        text: "대표 이미지는 16MB 이하로 선택해주세요.",
      });
      return;
    }

    try {
      const sessionId = await stageFiles({
        files,
        ranges: videoRangesByFile,
        purpose: "create",
        title: normalizedTitle,
        description: description.trim() || undefined,
        tags: tagsInput.trim() || undefined,
        takenAt: takenAt || undefined,
        visible: createVisibility !== "private",
        protected: createVisibility === "protected",
        representativeFile: createRepresentativeFile,
        onChunk: (file, index, total) => {
          setSendingFile(file);
          setSendingChunk({ file, index, total });
        },
      });
      setSendingChunk(null);
      setSentFiles(new Set(files));
      setNotice({
        type: "success",
        text: "모든 파일을 받았습니다. 서버에서 처리하는 중입니다...",
      });
      const finalized = await finalizeStagedUpload(sessionId);
      if ("accepted" in finalized) {
        throw new Error("삽화 등록을 시작하지 못했습니다.");
      }
      backgroundUploadIdsRef.current.add(finalized.id);
      upsertItem(finalized);
      const ready = await waitForIllustrationReady(finalized.id);
      upsertItem(ready);
      setUploadModalStatus(
        ready.upload_status === "video_failed" ? "error" : "success",
      );
      setNotice(
        ready.upload_status === "video_failed"
          ? {
              type: "error",
              text: "영상 변환에 실패해 비공개로 저장했습니다. 영상을 다시 추가하거나 이 상태로 수정할 수 있습니다.",
            }
          : {
              type: "success",
              text: `${uploadedCount}개의 파일로 삽화를 등록했습니다.`,
            },
      );
      setFiles([]);
      setVideoRangesByFile(new Map());
      setTitle("");
      setDescription("");
      setTagsInput("");
      setCreateVisibility("public");
      setCreateRepresentativeFile(null);
      setCreateRepresentativePreview(null);
    } catch (error) {
      setUploadModalStatus("error");
      setNotice({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "삽화를 등록하지 못했습니다.",
      });
    } finally {
      setUploading(false);
      setSendingFile(null);
      setSendingChunk(null);
    }
  };

  const openEdit = useCallback(async (id: number) => {
    try {
      const detail = await apiFetch<IllustrationDetailItem>(
        `/api/illustrations/${id}?mine=true`,
      );
      if (detail.upload_status === "processing") {
        setNotice({
          type: "error",
          text: "이미지 업로드가 완료된 뒤 수정할 수 있습니다.",
        });
        return;
      }
      setEditingItem({
        ...detail,
        images: [...(detail.images ?? [])],
      });
      setEditingTagsInput((detail.tags ?? []).join(", "));
      setModalNotice(null);
      setModalDragIndex(null);
      setModalDragOverIndex(null);
    } catch (error) {
      setNotice({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "삽화를 불러오지 못했습니다.",
      });
    }
  }, []);

  useEffect(() => {
    if (handledEditParamRef.current) {
      return;
    }

    const raw = new URLSearchParams(window.location.search).get("edit");
    if (!raw) {
      return;
    }

    const requested = Number(raw);
    if (!Number.isFinite(requested)) {
      return;
    }

    handledEditParamRef.current = true;
    void openEdit(requested);
  }, [openEdit]);

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
      upload_status: updated.upload_status,
      updated_at: updated.updated_at,
    };
    setItems((previous) =>
      previous.map((item) =>
        item.id === updated.id ? { ...item, ...mediaPatch } : item,
      ),
    );
    return mediaPatch;
  };

  const handleRepresentativeCropComplete = async (
    results: CroppedImageResult[],
  ) => {
    const result = results[0];
    const target = representativeCrop?.target;
    if (!result || !target) {
      closeRepresentativeCrop();
      return;
    }

    if (target === "create") {
      const preview = URL.createObjectURL(result.file);
      setCreateRepresentativeFile(result.file);
      setCreateRepresentativePreview(preview);
      closeRepresentativeCrop();
      setNotice({
        type: "success",
        text: "대표 이미지를 선택했습니다. 삽화를 올리면 함께 저장됩니다.",
      });
      return;
    }

    if (!editingItem) {
      closeRepresentativeCrop();
      return;
    }

    setSavingRepresentative(true);
    setModalNotice(null);
    try {
      const formData = new FormData();
      formData.append("file", result.file);
      const updated = await apiFetch<IllustrationDetailItem>(
        `/api/illustrations/${editingItem.id}/representative`,
        { method: "PUT", body: formData },
      );
      const mediaPatch = applyMediaUpdate(updated);
      setEditingItem((current) =>
        current ? { ...current, ...mediaPatch } : current,
      );
      setModalNotice({
        type: "success",
        text: "대표 이미지를 변경했습니다.",
      });
    } catch (error) {
      setModalNotice({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "대표 이미지를 업로드하지 못했습니다.",
      });
    } finally {
      setSavingRepresentative(false);
      closeRepresentativeCrop();
    }
  };

  const uploadEditingFiles = async (
    media: File[],
    ranges: Map<File, VideoRange> = new Map(),
  ) => {
    if (!editingItem || addingImages) return;

    const targetId = editingItem.id;
    const expectedImages = editingItem.images.length + media.length;
    setAddingImages(true);
    setModalNotice(null);

    try {
      const sessionId = await stageFiles({
        files: media,
        ranges,
        purpose: "append",
        illustrationId: targetId,
        onChunk: (file, index, total) =>
          setSendingChunk({ file, index, total }),
      });
      setModalNotice({
        type: "success",
        text: "모든 파일을 받았습니다. 서버에서 처리하는 중입니다...",
      });
      const finalized = await finalizeStagedUpload(sessionId);
      if (!("accepted" in finalized)) {
        throw new Error("파일 추가를 시작하지 못했습니다.");
      }
      const updated = await waitForAppendImages(targetId, expectedImages);
      const mediaPatch = applyMediaUpdate(updated);
      setEditingItem((current) => {
        if (!current) return current;
        const existingIds = new Set(current.images.map((image) => image.id));
        const added = updated.images.filter(
          (image) => !existingIds.has(image.id),
        );
        return { ...current, ...mediaPatch, images: [...current.images, ...added] };
      });
      setModalNotice(
        updated.upload_status === "video_failed"
          ? {
              type: "error",
              text: "영상 변환에 실패했습니다. 다른 파일은 저장되었고 삽화는 비공개로 유지됩니다.",
            }
          : {
              type: "success",
              text: `${media.length}개의 파일을 추가했습니다.`,
            },
      );
    } catch (error) {
      setModalNotice({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "파일을 추가하지 못했습니다.",
      });
    } finally {
      setAddingImages(false);
      setSendingChunk(null);
      if (modalFileInputRef.current) {
        modalFileInputRef.current.value = "";
      }
    }
  };

  const addImagesToEditing = async (list: FileList | null) => {
    if (!editingItem || !list || addingImages || inspectingVideos) return;

    const media = Array.from(list).filter(isIllustrationFile);
    if (media.length === 0) return;

    if (oversizedVideo(media)) {
      setModalNotice({
        type: "error",
        text: `원본 영상은 ${
          MAX_VIDEO_UPLOAD_BYTES / (1024 * 1024)
        }MB 이하만 업로드할 수 있습니다.`,
      });
      if (modalFileInputRef.current) modalFileInputRef.current.value = "";
      return;
    }

    setInspectingVideos(true);
    try {
      const videos = await inspectVideos(media);
      const longVideos = videos.filter(needsTrim);
      if (longVideos.length > 0) {
        openVideoTrim("edit", media, longVideos);
        return;
      }
      await uploadEditingFiles(media);
    } finally {
      setInspectingVideos(false);
    }
  };

  const confirmVideoTrim = (fromBeginning: boolean) => {
    const request = videoTrimRequest;
    if (!request) return;

    const ranges = new Map<File, VideoRange>();
    request.videos.forEach((candidate, index) => {
      ranges.set(candidate.file, {
        start: fromBeginning
          ? 0
          : (videoTrimStarts[index] ?? 0),
        seconds: fromBeginning
          ? MAX_VIDEO_SECONDS
          : (videoTrimSeconds[index] ?? MAX_VIDEO_SECONDS),
      });
    });

    if (request.target === "create") {
      appendSelectedFiles(request.files, ranges);
    } else {
      void uploadEditingFiles(request.files, ranges);
    }
    setVideoTrimRequest(null);
  };

  const playTrimRange = (index: number) => {
    trimVideoRefs.current.forEach((video, otherIndex) => {
      if (video && otherIndex !== index) video.pause();
    });
    const video = trimVideoRefs.current[index];
    if (!video) return;

    const start = videoTrimStarts[index] ?? 0;
    video.currentTime = start;
    setTrimPreviewTimes((current) => {
      const next = [...current];
      next[index] = start;
      return next;
    });
    void video.play().catch(() => undefined);
  };

  const toggleTrimRange = (index: number) => {
    const video = trimVideoRefs.current[index];
    if (!video) return;
    if (trimPreviewPlaying === index) {
      video.pause();
      return;
    }
    playTrimRange(index);
  };

  const setTrimPreviewTime = (index: number, time: number) => {
    setTrimPreviewTimes((current) => {
      const next = [...current];
      next[index] = time;
      return next;
    });
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
            tags: parseTags(editingTagsInput),
            taken_at: editingItem.taken_at || null,
            visible: editingItem.visible,
            protected: editingItem.protected,
            ...(editingItem.upload_status === "video_failed" &&
            editingItem.visible !== false
              ? { upload_status: "ready" }
              : {}),
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

  const issueCode = async () => {
    if (!editingItem || issuing) return;
    setIssuing(true);
    setIssuedCode(null);
    setModalNotice(null);
    try {
      const result = await apiFetch<{ code: string }>(
        "/api/gallery/invites",
        {
          method: "POST",
          body: JSON.stringify({
            resource_type: "illustration",
            resource_id: editingItem.id,
          }),
        },
      );
      setIssuedCode(result.code);
    } catch (error) {
      setModalNotice({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "열람 코드를 발급하지 못했습니다.",
      });
    } finally {
      setIssuing(false);
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
    const selectableIds = selectableItems.map((item) => item.id);
    setSelectedIds((previous) =>
      selectableIds.length > 0 &&
      selectableIds.every((id) => previous.has(id))
        ? new Set()
        : new Set(selectableIds),
    );
  };

  const persistOrder = async (nextItems: IllustrationDetailItem[]) => {
    try {
      const offset = (currentPage - 1) * LIST_PAGE_SIZE;
      await apiFetch("/api/illustrations/reorder", {
        method: "PUT",
        body: JSON.stringify({
          items: nextItems.map((item, index) => ({
            id: item.id,
            order: offset + index,
          })),
        }),
      });
      setItems(
        nextItems.map((item, index) => ({
          ...item,
          order: offset + index,
        })),
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
    protected?: boolean;
    taken_at?: string | null;
    tags?: string[];
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
      if (patch.tags !== undefined) {
        setBulkTags("");
      }
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
      setTotalCount((previous) => Math.max(0, previous - result.deleted));
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
      setTotalCount((previous) => Math.max(0, previous - 1));
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
            사진을 여러 장 선택해 하나의 삽화로 올릴 수 있습니다. 최대{' '}
            {MAX_FILES}장, 영상 {MAX_VIDEOS_PER_ILLUSTRATION}개. 파일은 하나씩
            순서대로 서버에 전송됩니다.
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

      <section
        className={`admin-illustrations-upload${
          uploadOpen ? " is-open" : ""
        }`}
        onClick={
          uploadOpen ? undefined : () => setUploadOpen(true)
        }
      >
        <div
          className="admin-illustrations-upload__head"
          role="button"
          tabIndex={0}
          aria-expanded={uploadOpen}
          onClick={(event) => {
            event.stopPropagation();
            setUploadOpen((open) => !open);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setUploadOpen((open) => !open);
            }
          }}
        >
          <div>
            <h2>새 삽화 올리기</h2>
            <p>선택한 사진들은 하나의 삽화로 묶입니다.</p>
          </div>
          <span className="admin-illustrations-upload__indicator">
            {files.length} / {MAX_FILES}
            <span
              className="admin-illustrations-upload__chevron"
              aria-hidden="true"
            >
              {uploadOpen ? "▲" : "▼"}
            </span>
          </span>
        </div>

        {uploadOpen ? (
          <>
        <div
          className="admin-illustrations-picker"
          onDragOver={(event) => event.preventDefault()}
          onDrop={handleDrop}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={ILLUSTRATION_ACCEPT}
            multiple
            onChange={(event) => void addFiles(event.target.files)}
          />
          {previews.length === 0 ? (
            <button
              type="button"
              className="admin-illustrations-picker__empty"
              onClick={() => fileInputRef.current?.click()}
            >
              <strong>사진·영상 선택</strong>
              <span>또는 이 영역에 사진·영상을 끌어다 놓으세요.</span>
            </button>
          ) : (
            <>
              <div className="admin-illustrations-picker__head">
                <span>선택한 파일 {files.length}개</span>
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
                사진을 드래그해 순서를 바꾸세요. 대표 이미지는 아래에서
                따로 업로드할 수 있습니다.
              </p>
              <div className="admin-illustrations-previews">
                {previews.map((preview, index) => {
                  const previewRange = preview.range;
                  const previewEnd = previewRange
                    ? previewRange.start + previewRange.seconds
                    : null;
                  const previewSrc =
                    previewRange && previewEnd !== null
                      ? `${preview.url}#t=${previewRange.start},${previewEnd}`
                      : preview.url;
                  return (
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
                    {ILLUSTRATION_VIDEO_TYPES.has(preview.file.type) ? (
                      <video
                        key={previewSrc}
                        src={previewSrc}
                        aria-label={preview.file.name}
                        muted
                        loop={!previewRange}
                        autoPlay
                        playsInline
                        onLoadedMetadata={(event) => {
                          if (previewRange) {
                            event.currentTarget.currentTime =
                              previewRange.start;
                          }
                        }}
                        onTimeUpdate={(event) => {
                          if (!previewRange || previewEnd === null) return;
                          if (event.currentTarget.currentTime >= previewEnd - 0.05) {
                            event.currentTarget.currentTime =
                              previewRange.start;
                          }
                        }}
                      />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={preview.url} alt={preview.file.name} />
                    )}
                    <button
                      type="button"
                      onClick={() => removeFile(index)}
                      disabled={uploading}
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
                    {previewRange && previewEnd !== null ? (
                      <span className="admin-illustrations-preview__range">
                        구간 {previewRange.start}~{previewEnd}초
                      </span>
                    ) : null}
                  </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {previews.length > 0 ? (
          <div className="admin-illustrations-representative">
            <div className="admin-illustrations-representative__preview">
              {createRepresentativePreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={createRepresentativePreview}
                  alt="대표 이미지 미리보기"
                />
              ) : (
                <span>대표 이미지 없음</span>
              )}
            </div>
            <div className="admin-illustrations-representative__body">
              <h3>대표 이미지</h3>
              <p>
                목록에 표시할 정사각형 이미지를 업로드하세요. 없으면 첫
                사진이 사용됩니다.
              </p>
              <button
                type="button"
                className="admin-button"
                onClick={() =>
                  createRepresentativeInputRef.current?.click()
                }
                disabled={uploading}
              >
                {createRepresentativeFile
                  ? "대표 이미지 다시 선택"
                  : "대표 이미지 선택"}
              </button>
              <input
                ref={createRepresentativeInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                hidden
                onChange={(event) =>
                  openRepresentativeCrop(event.target.files, "create")
                }
              />
            </div>
          </div>
        ) : null}

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
          <label className="admin-illustrations-field">
            <span>태그 <em>선택</em></span>
            <TagInput
              value={tagsInput}
              placeholder="쉼표로 구분 (예: 바다, 밤)"
              onChange={setTagsInput}
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

        <div className="admin-illustrations-modal__access">
          <label className="admin-illustrations-modal__visible">
            <span>공개 설정</span>
            <select
              value={createVisibility}
              onChange={(event) =>
                setCreateVisibility(
                  event.target.value as IllustrationVisibility,
                )
              }
              disabled={uploading}
            >
              <option value="public">공개</option>
              <option value="protected">보호</option>
              <option value="private">비공개</option>
            </select>
          </label>
          <small className="admin-illustrations-create-visibility-hint">
            보호는 열람 코드를 입력한 사람만 볼 수 있습니다.
          </small>
        </div>

        {previews.length > 0 ? (
          <div className="admin-illustrations-upload__actions">
            <button
              type="button"
              className="admin-button"
              onClick={() => {
                setFiles([]);
                setVideoRangesByFile(new Map());
              }}
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
                ? "등록 중..."
                : `${files.length}장으로 삽화 만들기`}
            </button>
          </div>
        ) : null}
          </>
        ) : null}
      </section>

      <section className="admin-illustrations-list">
        <div className="admin-illustrations-list__head">
          <h2>등록된 삽화</h2>
          <div className="admin-illustrations-list__tools">
            <form
              className="admin-illustrations-list__search"
              onSubmit={(event) => {
                event.preventDefault();
                setListQuery(listQueryInput.trim().slice(0, 100));
                setListPage(1);
              }}
            >
              <input
                type="search"
                value={listQueryInput}
                onChange={(event) => setListQueryInput(event.target.value)}
                placeholder="제목·태그 검색"
                aria-label="삽화 검색"
              />
              <button type="submit">검색</button>
            </form>
            <span>{totalCount}개</span>
            <label className="admin-illustrations-select-all">
              <input
                type="checkbox"
                checked={
                  selectableItems.length > 0 &&
                  selectableItems.every((item) => selectedIds.has(item.id))
                }
                disabled={selectableItems.length === 0}
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
                onClick={() =>
                  void bulkUpdate({ visible: true, protected: false })
                }
                disabled={bulkWorking}
              >
                공개
              </button>
              <button
                type="button"
                className="admin-button"
                onClick={() =>
                  void bulkUpdate({ visible: true, protected: true })
                }
                disabled={bulkWorking}
              >
                보호
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
              <label className="admin-illustrations-bulkbar__tags">
                <span>태그</span>
                <TagInput
                  value={bulkTags}
                  placeholder="쉼표로 구분"
                  onChange={setBulkTags}
                  className="is-inline"
                />
              </label>
              <button
                type="button"
                className="admin-button"
                onClick={() =>
                  void bulkUpdate({ tags: parseTags(bulkTags) })
                }
                disabled={bulkWorking || parseTags(bulkTags).length === 0}
              >
                태그 적용
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
                const isProcessing = item.upload_status === "processing";
                return (
                  <article
                    className={`admin-illustration-card is-compact${
                      isProcessing ? " is-uploading" : ""
                    }${
                      selectedIds.has(item.id) ? " is-selected" : ""
                    }${
                      cardDragId === item.id ? " is-card-dragging" : ""
                    }${
                      cardDragOverId === item.id && cardDragId !== item.id
                        ? " is-card-drag-over"
                        : ""
                    }`}
                    key={item.id}
                    role={isProcessing ? undefined : "button"}
                    tabIndex={isProcessing ? undefined : 0}
                    aria-disabled={isProcessing || undefined}
                    title={isProcessing ? "이미지 업로드 중" : undefined}
                    onClick={() => {
                      if (!isProcessing) void openEdit(item.id);
                    }}
                    onKeyDown={(event) => {
                      if (isProcessing) return;
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        void openEdit(item.id);
                      }
                    }}
                    onDragOver={(event) => {
                      if (cardDragId === null || isProcessing) return;
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
                      if (cardDragId === null || isProcessing) return;
                      event.preventDefault();
                      moveCard(cardDragId, item.id);
                      setCardDragId(null);
                      setCardDragOverId(null);
                    }}
                  >
                    <span
                      className="admin-illustration-card__drag"
                      draggable={!isProcessing}
                      title={
                        isProcessing
                          ? undefined
                          : "드래그해서 순서 변경"
                      }
                      onClick={(event) => event.stopPropagation()}
                      onDragStart={(event) => {
                        if (isProcessing) {
                          event.preventDefault();
                          return;
                        }
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
                        checked={!isProcessing && selectedIds.has(item.id)}
                        disabled={isProcessing}
                        onChange={() => toggleSelected(item.id)}
                      />
                      선택
                    </label>
                  {item.representative_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.representative_url}
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
                      {item.tags?.length ? (
                        <div className="tag-list admin-illustration-card__compact-tags">
                          {item.tags.map((tag) => (
                            <span className="tag" key={tag}>
                              {tag}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      <p className="admin-illustration-card__compact-date">
                        촬영 {formatDate(item.taken_at)}
                      </p>
                    </div>
                    <span
                      className={
                        item.upload_status === "processing" ||
                        item.upload_status === "video_failed"
                          ? "admin-illustration-card__upload-status"
                          : undefined
                      }
                    >
                      {item.upload_status === "processing"
                        ? "업로드 중..."
                        : item.upload_status === "video_failed"
                          ? "영상 처리 실패 · 비공개"
                          : `${item.image_count}장 · 조회 ${item.view_count ?? 0}회`}
                    </span>
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

      {uploadProgressOpen ? (
        <div
          className="admin-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target !== event.currentTarget || uploading) return;
            setUploadProgressOpen(false);
          }}
        >
          <div
            className="admin-modal admin-illustrations-upload-modal"
            role="dialog"
            aria-modal="true"
            aria-label="파일 업로드 진행 상황"
          >
            <header className="admin-modal-header">
              <h2>파일 업로드</h2>
              {uploading ? null : (
                <button
                  type="button"
                  className="admin-modal-close"
                  onClick={() => setUploadProgressOpen(false)}
                  aria-label="닫기"
                >
                  ×
                </button>
              )}
            </header>
            <div className="admin-modal-body">
              <p className="admin-illustrations-upload-modal__summary">
                {sentFiles.size} / {uploadFiles.length}개 파일 서버 전송 완료
              </p>
              {uploadModalStatus === "error" ? (
                <p className="admin-illustrations-upload-modal__message is-error">
                  {notice?.type === "error"
                    ? notice.text
                    : "업로드에 실패했습니다."}
                </p>
              ) : null}
              {uploadModalStatus === "success" ? (
                <p className="admin-illustrations-upload-modal__message is-success">
                  모든 파일을 서버에 전송했습니다.
                </p>
              ) : null}
              <ol className="admin-illustrations-upload-modal__list">
                {uploadFiles.map((file, index) => {
                  const sent = sentFiles.has(file);
                  const sending = sendingFile === file;
                  return (
                    <li
                      key={`${file.name}-${index}`}
                      className={`admin-illustrations-upload-modal__row${
                        sent ? " is-sent" : ""
                      }${sending ? " is-sending" : ""}`}
                    >
                      <span className="admin-illustrations-upload-modal__index">
                        {index + 1}
                      </span>
                      <span className="admin-illustrations-upload-modal__name">
                        {file.name}
                      </span>
                      <span className="admin-illustrations-upload-modal__state">
                        {sent
                          ? "서버 전송 완료"
                          : sendingChunk?.file === file
                            ? `전송 중 (${sendingChunk.index}/${sendingChunk.total})`
                            : sending
                              ? "전송 중"
                              : "전송 대기"}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </div>
            <footer className="admin-modal-footer">
              <button
                type="button"
                className="admin-button"
                disabled={uploading}
                onClick={() => setUploadProgressOpen(false)}
              >
                {uploading ? "업로드 중..." : "닫기"}
              </button>
            </footer>
          </div>
        </div>
      ) : null}

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
                  <div className="admin-illustrations-modal__cover-image">
                    {editingItem.representative_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={editingItem.representative_url}
                        alt={editingItem.title}
                      />
                    ) : (
                      <span>대표 이미지 없음</span>
                    )}
                  </div>
                  <button
                    type="button"
                    className="admin-button"
                    onClick={() =>
                      modalRepresentativeInputRef.current?.click()
                    }
                    disabled={savingRepresentative}
                  >
                    {savingRepresentative
                      ? "업로드 중..."
                      : "대표 이미지 변경"}
                  </button>
                  <input
                    ref={modalRepresentativeInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    hidden
                    onChange={(event) =>
                      openRepresentativeCrop(
                        event.target.files,
                        "edit",
                      )
                    }
                  />
                  <p className="admin-illustrations-modal__cover-hint">
                    정사각형(1:1)으로 자동 크롭됩니다.
                  </p>
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
                      rows={6}
                      placeholder="삽화에 대한 설명"
                      onChange={(event) =>
                        updateEditing({
                          description: event.target.value,
                        })
                      }
                    />
                  </label>
                  <label className="admin-illustration-card__field">
                    <span>태그</span>
                    <TagInput
                      value={editingTagsInput}
                      placeholder="쉼표로 구분 (예: 바다, 밤)"
                      onChange={setEditingTagsInput}
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
                  <div className="admin-illustrations-modal__access">
                    <label className="admin-illustrations-modal__visible">
                      <span>공개 상태</span>
                      <select
                        value={
                          editingItem.visible === false
                            ? "private"
                            : editingItem.protected
                              ? "protected"
                              : "public"
                        }
                        onChange={(event) => {
                          const value = event.target.value;
                          updateEditing({
                            visible: value !== "private",
                            protected: value === "protected",
                          });
                        }}
                      >
                        <option value="public">공개</option>
                        <option value="protected">보호</option>
                        <option value="private">비공개</option>
                      </select>
                    </label>
                    {editingItem.visible !== false &&
                    editingItem.protected ? (
                      <div className="admin-illustrations-modal__code">
                        <button
                          type="button"
                          className="admin-button"
                          onClick={() => void issueCode()}
                          disabled={issuing}
                        >
                          {issuing ? "발급 중..." : "열람 코드 발급"}
                        </button>
                        {issuedCode ? (
                          <code>{issuedCode}</code>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="admin-illustrations-modal__images">
                <div className="admin-illustrations-modal__images-head">
                  <div>
                    <h3>사진 순서</h3>
                    <p>사진을 드래그해 순서를 바꾸세요.</p>
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
                      accept={ILLUSTRATION_ACCEPT}
                      multiple
                      onChange={(event) =>
                        void addImagesToEditing(event.target.files)
                      }
                    />
                  </div>
                </div>

                {editingItem.upload_status === "video_failed" ? (
                  <p className="admin-illustrations-notice is-error">
                    영상 변환에 실패해 비공개로 저장했습니다. 영상을 다시
                    추가하거나, 이 상태로 두고 싶으면 공개 상태를 변경해
                    저장하세요.
                  </p>
                ) : null}
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
                        alt={editingItem.title}
                        loading="lazy"
                        decoding="async"
                      />
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

            <footer className="admin-modal-footer">
              <button
                type="button"
                className="admin-button danger admin-illustrations-modal__delete"
                onClick={() => void deleteItem(editingItem)}
                disabled={deletingId !== null || savingId !== null}
              >
                {deletingId === editingItem.id ? "삭제 중..." : "삭제"}
              </button>
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
            </footer>
          </div>
        </div>
      ) : null}

      {videoTrimRequest ? (
        <div
          className="admin-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setVideoTrimRequest(null);
            }
          }}
        >
          <div
            className="admin-modal admin-illustrations-trim-modal"
            role="dialog"
            aria-modal="true"
            aria-label="영상 길이 자르기"
          >
            <header className="admin-modal-header">
              <h2>영상 길이 자르기</h2>
              <button
                type="button"
                className="admin-modal-close"
                onClick={() => setVideoTrimRequest(null)}
                aria-label="닫기"
              >
                ×
              </button>
            </header>

            <div className="admin-modal-body">
              <p className="admin-illustrations-trim-modal__hint">
                시작과 길이를 입력한 뒤 `구간 재생`을 누르면 선택한 부분만 재생됩니다. 재생바도 선택 구간만 움직이며, 해당 구간이 움직이는 WebP로 저장됩니다. 길이는 최대 {MAX_VIDEO_SECONDS}초입니다.
              </p>
              <div className="admin-illustrations-trim-modal__list">
                {videoTrimRequest.videos.map((candidate, index) => {
                  const start = videoTrimStarts[index] ?? 0;
                  const seconds = videoTrimSeconds[index] ?? MAX_VIDEO_SECONDS;
                  const end = start + seconds;
                  const maxStart = startMax(candidate, seconds);
                  const clockDraft = clockDrafts[index] ?? formatClock(start);
                  const setStart = (value: number) => {
                    const clamped = Math.min(
                      Math.max(Math.round(value), 0),
                      maxStart,
                    );
                    setVideoTrimStarts((current) => {
                      const next = [...current];
                      next[index] = clamped;
                      return next;
                    });
                  };
                  const previewTime = Math.min(
                    Math.max(trimPreviewTimes[index] ?? start, start),
                    end,
                  );
                  return (
                    <div
                      className="admin-illustrations-trim-modal__row"
                      key={`${candidate.file.name}-${candidate.file.size}-${index}`}
                    >
                      <video
                        ref={(element) => {
                          trimVideoRefs.current[index] = element;
                        }}
                        key={`${candidate.previewUrl}-${start}-${end}`}
                        className="admin-illustrations-trim-modal__preview"
                        src={`${candidate.previewUrl}#t=${start},${end}`}
                        muted
                        playsInline
                        preload="metadata"
                        onLoadedMetadata={(event) => {
                          event.currentTarget.currentTime = start;
                          setTrimPreviewTime(index, start);
                        }}
                        onPlay={(event) => {
                          const video = event.currentTarget;
                          if (
                            video.currentTime < start ||
                            video.currentTime >= end
                          ) {
                            video.currentTime = start;
                          }
                          setTrimPreviewPlaying(index);
                        }}
                        onTimeUpdate={(event) => {
                          const video = event.currentTarget;
                          if (video.currentTime >= end - 0.05) {
                            video.pause();
                            video.currentTime = start;
                            setTrimPreviewTime(index, start);
                            return;
                          }
                          setTrimPreviewTime(
                            index,
                            Math.min(Math.max(video.currentTime, start), end),
                          );
                        }}
                        onPause={() =>
                          setTrimPreviewPlaying((current) =>
                            current === index ? null : current,
                          )
                        }
                        onEnded={(event) => {
                          event.currentTarget.currentTime = start;
                          setTrimPreviewTime(index, start);
                          setTrimPreviewPlaying((current) =>
                            current === index ? null : current,
                          );
                        }}
                      />
                      <div className="admin-illustrations-trim-modal__head">
                        <span className="admin-illustrations-trim-modal__name">
                          {candidate.file.name}
                        </span>
                        <span className="admin-illustrations-trim-modal__meta">
                          {candidate.duration === null
                            ? "길이 정보 없음"
                            : `원본 ${candidate.duration.toFixed(1)}초`}
                          {" · "}
                          {(candidate.file.size / (1024 * 1024)).toFixed(1)}MB
                        </span>
                        <span className="admin-illustrations-trim-modal__range">
                          선택 {formatClock(start)} ~ {formatClock(end)}
                        </span>
                      </div>
                      <div className="admin-illustrations-trim-modal__player">
                        <button
                          type="button"
                          className="admin-button admin-illustrations-trim-modal__play"
                          onClick={() => toggleTrimRange(index)}
                        >
                          {trimPreviewPlaying === index
                            ? "일시정지"
                            : "구간 재생"}
                        </button>
                        <input
                          className="admin-illustrations-trim-modal__seek"
                          type="range"
                          aria-label="미리보기 재생 위치"
                          min={start}
                          max={end}
                          step={0.1}
                          value={previewTime}
                          onChange={(event) => {
                            const value = Number(event.target.value);
                            const clamped = Math.min(
                              Math.max(value, start),
                              end,
                            );
                            const video = trimVideoRefs.current[index];
                            if (video) video.currentTime = clamped;
                            setTrimPreviewTime(index, clamped);
                          }}
                        />
                        <span className="admin-illustrations-trim-modal__time">
                          {previewTime.toFixed(1)}초 / {end}초
                        </span>
                      </div>
                      <div className="admin-illustrations-trim-modal__inputs">
                        <label className="admin-illustrations-trim-modal__input admin-illustrations-trim-modal__input--time">
                          <span>시작</span>
                          <input
                            type="text"
                            inputMode="numeric"
                            autoComplete="off"
                            aria-label="시작 시각 (시:분:초)"
                            value={formatClockDraft(clockDraft)}
                            onChange={(event) => {
                              const digits = event.target.value
                                .replace(/\D/g, "")
                                .slice(0, 6);
                              setClockDrafts((current) => ({
                                ...current,
                                [index]: digits,
                              }));
                              const parsed = parseClockDraft(digits);
                              if (parsed !== null) setStart(parsed);
                            }}
                            onKeyDown={(event) => {
                              if (
                                event.key !== "ArrowUp" &&
                                event.key !== "ArrowDown"
                              ) {
                                return;
                              }
                              event.preventDefault();
                              const next =
                                start + (event.key === "ArrowUp" ? 1 : -1);
                              setStart(next);
                              setClockDrafts((current) => ({
                                ...current,
                                [index]: formatClock(next).replace(/:/g, ""),
                              }));
                            }}
                            onBlur={() => {
                              const parsed = parseClockDraft(clockDraft);
                              if (parsed !== null) setStart(parsed);
                              setClockDrafts((current) => {
                                const next = { ...current };
                                delete next[index];
                                return next;
                              });
                            }}
                          />
                          <small>최대 {formatClock(maxStart)}</small>
                        </label>
                        <label className="admin-illustrations-trim-modal__input">
                          <span>길이</span>
                          <input
                            type="number"
                            min={1}
                            max={MAX_VIDEO_SECONDS}
                            step={1}
                            value={seconds}
                            onChange={(event) => {
                              const value = Number(event.target.value);
                              const clamped = Number.isFinite(value)
                                ? Math.min(
                                    Math.max(Math.round(value), 1),
                                    MAX_VIDEO_SECONDS,
                                  )
                                : 1;
                              setVideoTrimSeconds((current) => {
                                const next = [...current];
                                next[index] = clamped;
                                return next;
                              });
                              if (
                                candidate.duration !== null &&
                                start + clamped > candidate.duration
                              ) {
                                setVideoTrimStarts((current) => {
                                  const next = [...current];
                                  next[index] = Math.max(
                                    0,
                                    Math.floor(candidate.duration ?? 0) -
                                      clamped,
                                  );
                                  return next;
                                });
                              }
                            }}
                          />
                          <em>초</em>
                          <small>최대 {MAX_VIDEO_SECONDS}초</small>
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <footer className="admin-modal-footer">
              <button
                type="button"
                className="admin-button"
                onClick={() => setVideoTrimRequest(null)}
              >
                취소
              </button>
              <button
                type="button"
                className="admin-button"
                onClick={() => confirmVideoTrim(true)}
              >
                처음 {MAX_VIDEO_SECONDS}초로 추가
              </button>
              <button
                type="button"
                className="admin-button primary"
                onClick={() => confirmVideoTrim(false)}
              >
                선택 구간으로 추가
              </button>
            </footer>
          </div>
        </div>
      ) : null}

      {representativeCrop ? (
        <ImageCropModal
          imageSrc={representativeCrop.src}
          fileName={representativeCrop.fileName}
          stages={REPRESENTATIVE_CROP_STAGES}
          onClose={closeRepresentativeCrop}
          onComplete={handleRepresentativeCropComplete}
        />
      ) : null}
    </div>
  );
}
