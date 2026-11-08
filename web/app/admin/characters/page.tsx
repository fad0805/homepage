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
import Cropper, { type Area } from "react-easy-crop";

import "react-easy-crop/react-easy-crop.css";
import "@/public/styles/admin/characters.scss";

interface Location {
  id: number;
  name: string;
  description: string | null;
  order: number;
}

interface DollInfo {
  id?: number;
  company?: string;
  name: string | null;
  size?: string | null;
  skin_tone: string | null;
}

type CharacterLayout = "auto" | "left" | "center" | "right";

interface RelatedCharacterSummary {
  id: number;
  name: string;
  thumbnail: string | null;
  layout?: CharacterLayout | null;
  visible?: boolean | null;
  is_my_doll?: boolean | null;
}

interface CharacterRelationshipItem {
  id: number;
  relationship_type: string;
  character: RelatedCharacterSummary;
}

interface CharacterRelationshipDraft {
  related_character_id: number;
  relationship_type: string;
}

interface CharacterItem {
  id: number;
  name: string;
  thumbnail: string | null;
  detail_image: string | null;
  location_id: number | null;
  alt_name: string | null;
  nickname: string | null;
  age: string | null;
  serif: string | null;
  description: string | null;
  comming_day: string | null;
  visible: boolean;
  is_my_doll: boolean;
  order_in_location: number | null;
  layout: CharacterLayout | null;
  relationships: CharacterRelationshipItem[] | null;
  location: Location | null;
  head_doll: DollInfo | null;
  body_doll: DollInfo | null;
}

interface DraftCharacter extends Omit<CharacterItem, "relationships"> {
  /** Staged banner file that will be uploaded on save. */
  file?: File | null;
  /** Local object URL preview for the staged banner file. */
  preview_url?: string | null;
  /** Staged square detail file that will be uploaded on save. */
  detail_file?: File | null;
  /** Local object URL preview for the staged detail file. */
  detail_preview_url?: string | null;
  relationships: CharacterRelationshipDraft[];
}

type Notice = { type: "success" | "error"; text: string };

const LOCATION_TYPE = "location";
const CHARACTER_TYPE = "character";
const MAX_THUMBNAIL_SIZE = 50 * 1024 * 1024;
const ALLOWED_THUMBNAIL_TYPES = [
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

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

function sortLocations(locations: Location[]) {
  return [...locations].sort((a, b) => a.order - b.order || a.id - b.id);
}

function sortCharacters(characters: DraftCharacter[]) {
  return [...characters].sort(
    (a, b) =>
      (a.order_in_location ?? 0) - (b.order_in_location ?? 0) ||
      a.id - b.id,
  );
}

function toDateValue(value: string | null | undefined) {
  if (!value) {
    return "";
  }
  return value.slice(0, 10);
}

type CropStage = "banner" | "detail";

const CROP_STAGES: Record<
  CropStage,
  { aspect: number; outputWidth: number; label: string }
> = {
  banner: {
    aspect: 3,
    outputWidth: 1280,
    label: "배너 (3:1)",
  },
  detail: {
    aspect: 1,
    outputWidth: 1024,
    label: "상세 (1:1)",
  },
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("이미지를 불러오지 못했습니다."));
    image.src = src;
  });
}

async function cropImageToBlob(
  src: string,
  crop: Area,
  outputWidth: number,
  aspect: number,
): Promise<Blob> {
  const image = await loadImage(src);
  const outputHeight = Math.max(
    1,
    Math.round(outputWidth / aspect),
  );
  const canvas = document.createElement("canvas");
  canvas.width = outputWidth;
  canvas.height = outputHeight;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("이미지를 처리할 수 없습니다.");
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(
    image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    outputWidth,
    outputHeight,
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("이미지를 처리할 수 없습니다."));
      }
    }, "image/png");
  });
}

function ModalShell({
  title,
  onClose,
  children,
  footer,
  closeOnEscape = true,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
  closeOnEscape?: boolean;
}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && closeOnEscape) {
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
  }, [closeOnEscape, onClose]);

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

function SortableCharacterCard({
  character,
  onEdit,
  onDelete,
}: {
  character: DraftCharacter;
  onEdit: (character: DraftCharacter) => void;
  onDelete: (character: DraftCharacter) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `${CHARACTER_TYPE}-${character.id}`,
    data: {
      type: CHARACTER_TYPE,
      locationId: character.location_id,
    },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.45 : 1,
    zIndex: isDragging ? 2 : undefined,
  };

  const thumbnail = character.preview_url ?? character.thumbnail;
  const subName = [character.alt_name, character.nickname]
    .filter(Boolean)
    .join(" · ");

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={`admin-character-card${isDragging ? " is-dragging" : ""}`}
    >
      <button
        type="button"
        className="admin-drag-handle"
        aria-label={`${character.name} 순서 변경`}
        {...attributes}
        {...listeners}
      >
        ⠿
      </button>

      <div className="admin-character-thumb">
        {thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbnail} alt={character.name} loading="lazy" />
        ) : (
          <span className="admin-character-thumb-empty">이미지 없음</span>
        )}
      </div>

      <div className="admin-character-body">
        <strong className="admin-character-name" title={character.name}>
          {character.name}
          {character.id < 0 ? (
            <span className="admin-draft-badge">미저장</span>
          ) : null}
        </strong>
        {subName ? (
          <span className="admin-character-meta">{subName}</span>
        ) : null}
        {character.age ? (
          <span className="admin-character-meta">나이: {character.age}</span>
        ) : null}
        <div className="admin-character-badges">
          {character.visible === false || character.is_my_doll !== true ? (
            <span className="admin-character-badge">비공개</span>
          ) : null}
          {character.is_my_doll ? (
            <span className="admin-character-badge">내 인형</span>
          ) : null}
        </div>
      </div>

      <div className="admin-character-actions">
        <button type="button" onClick={() => onEdit(character)}>
          수정
        </button>
        <button
          type="button"
          className="danger"
          onClick={() => onDelete(character)}
        >
          삭제
        </button>
      </div>
    </article>
  );
}

function SortableLocationSection({
  location,
  characters,
  onAddCharacter,
  onEditLocation,
  onDeleteLocation,
  onEditCharacter,
  onDeleteCharacter,
}: {
  location: Location;
  characters: DraftCharacter[];
  onAddCharacter: (locationId: number) => void;
  onEditLocation: (location: Location) => void;
  onDeleteLocation: (location: Location) => void;
  onEditCharacter: (character: DraftCharacter) => void;
  onDeleteCharacter: (character: DraftCharacter) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `${LOCATION_TYPE}-${location.id}`,
    data: { type: LOCATION_TYPE },
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
      className={`admin-characters-group${isDragging ? " is-dragging" : ""}`}
    >
      <header className="admin-characters-group-header">
        <button
          type="button"
          className="admin-drag-handle"
          aria-label={`${location.name} 위치 순서 변경`}
          {...attributes}
          {...listeners}
        >
          ⠿
        </button>

        <h2>
          {location.name}
          {location.id < 0 ? (
            <span className="admin-draft-badge">미저장</span>
          ) : null}
        </h2>
        <span className="admin-characters-count">
          {characters.length}명
        </span>

        <div className="admin-characters-group-actions">
          <button type="button" onClick={() => onAddCharacter(location.id)}>
            등장인물 추가
          </button>
          <button type="button" onClick={() => onEditLocation(location)}>
            이름 변경
          </button>
          <button
            type="button"
            className="danger"
            disabled={characters.length > 0}
            title={
              characters.length > 0
                ? "등장인물이 남아 있는 위치는 삭제할 수 없습니다."
                : undefined
            }
            onClick={() => onDeleteLocation(location)}
          >
            삭제
          </button>
        </div>
      </header>

      {location.description ? (
        <p className="admin-characters-location-description">
          {location.description}
        </p>
      ) : null}

      {characters.length === 0 ? (
        <p className="admin-links-empty">아직 등장인물이 없습니다.</p>
      ) : (
        <SortableContext
          items={characters.map(
            (character) => `${CHARACTER_TYPE}-${character.id}`,
          )}
          strategy={rectSortingStrategy}
        >
          <div className="admin-characters-grid">
            {characters.map((character) => (
              <SortableCharacterCard
                key={character.id}
                character={character}
                onEdit={onEditCharacter}
                onDelete={onDeleteCharacter}
              />
            ))}
          </div>
        </SortableContext>
      )}
    </section>
  );
}

export default function AdminCharacters() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [characters, setCharacters] = useState<DraftCharacter[]>([]);
  const [locationFilter, setLocationFilter] = useState<number | "all">(
    "all",
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const [characterModalOpen, setCharacterModalOpen] = useState(false);
  const [editingCharacter, setEditingCharacter] =
    useState<DraftCharacter | null>(null);
  const [formLocationId, setFormLocationId] = useState<number | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(null);
  const [thumbnailFileName, setThumbnailFileName] = useState<string>("");
  const [thumbnailUrlInput, setThumbnailUrlInput] = useState<string>("");
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [detailPreview, setDetailPreview] = useState<string | null>(null);
  const [detailFileName, setDetailFileName] = useState<string>("");
  const [detailFile, setDetailFile] = useState<File | null>(null);
  const [relationshipDraft, setRelationshipDraft] = useState<
    CharacterRelationshipDraft[]
  >([]);

  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [cropSource, setCropSource] = useState<string | null>(null);
  const [cropFileName, setCropFileName] = useState<string>("");
  const [cropStage, setCropStage] = useState<CropStage>("banner");
  const [pendingBanner, setPendingBanner] = useState<{
    file: File;
    preview: string;
    name: string;
  } | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [cropZoom, setCropZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [cropping, setCropping] = useState(false);
  const [urlCropLoading, setUrlCropLoading] = useState(false);

  const [locationModalOpen, setLocationModalOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);

  const [isDirty, setIsDirty] = useState(false);
  const [deletedCharacterIds, setDeletedCharacterIds] = useState<number[]>([]);
  const [deletedLocationIds, setDeletedLocationIds] = useState<number[]>([]);

  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const objectUrls = useRef<Set<string>>(new Set());
  const nextTempId = useRef(-1);
  const thumbnailInputRef = useRef<HTMLInputElement | null>(null);

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
      const [locationData, characterData] = await Promise.all([
        apiFetch<Location[]>("/api/characters/locations"),
        apiFetch<CharacterItem[]>("/api/characters"),
      ]);
      revokeObjectUrls();
      setLocations(sortLocations(locationData));
      setCharacters(
        characterData.map((character) => ({
          ...character,
          relationships: (character.relationships ?? []).map(
            (relationship) => ({
              related_character_id: relationship.character.id,
              relationship_type: relationship.relationship_type,
            }),
          ),
        })),
      );
      setDeletedCharacterIds([]);
      setDeletedLocationIds([]);
      setIsDirty(false);
    } catch (error) {
      notify(
        "error",
        error instanceof Error
          ? error.message
          : "데이터를 불러오지 못했습니다.",
      );
    } finally {
      setLoading(false);
    }
  }, [notify, revokeObjectUrls]);

  useEffect(() => {
    load();
  }, [load]);

  const charactersByLocation = useMemo(() => {
    const map = new Map<number, DraftCharacter[]>();
    for (const location of locations) {
      map.set(
        location.id,
        sortCharacters(
          characters.filter(
            (character) => character.location_id === location.id,
          ),
        ),
      );
    }
    return map;
  }, [characters, locations]);

  const displayLocations = useMemo(
    () =>
      locationFilter === "all"
        ? locations
        : locations.filter((location) => location.id === locationFilter),
    [locationFilter, locations],
  );

  useEffect(() => {
    if (
      locationFilter !== "all" &&
      !locations.some((location) => location.id === locationFilter)
    ) {
      setLocationFilter("all");
    }
  }, [locationFilter, locations]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const collisionDetection = useCallback<CollisionDetection>((args) => {
    const activeType = args.active.data.current?.type;
    const activeLocationId = args.active.data.current?.locationId;

    const droppableContainers = args.droppableContainers.filter((container) => {
      const data = container.data.current;
      if (!data || data.type !== activeType) {
        return false;
      }
      if (activeType === CHARACTER_TYPE) {
        return data.locationId === activeLocationId;
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

      if (activeData?.type === LOCATION_TYPE) {
        const oldIndex = locations.findIndex(
          (location) => `${LOCATION_TYPE}-${location.id}` === active.id,
        );
        const newIndex = locations.findIndex(
          (location) => `${LOCATION_TYPE}-${location.id}` === over.id,
        );
        if (oldIndex < 0 || newIndex < 0) {
          return;
        }

        setLocations(
          arrayMove(locations, oldIndex, newIndex).map((location, index) => ({
            ...location,
            order: index,
          })),
        );
        setIsDirty(true);
        return;
      }

      if (activeData?.type !== CHARACTER_TYPE) {
        return;
      }

      const locationId = activeData.locationId as number;
      const current = charactersByLocation.get(locationId) ?? [];
      const oldIndex = current.findIndex(
        (character) => `${CHARACTER_TYPE}-${character.id}` === active.id,
      );
      const newIndex = current.findIndex(
        (character) => `${CHARACTER_TYPE}-${character.id}` === over.id,
      );
      if (oldIndex < 0 || newIndex < 0) {
        return;
      }

      const reordered = arrayMove(current, oldIndex, newIndex).map(
        (character, index) => ({
          ...character,
          order_in_location: index,
        }),
      );
      const others = characters.filter(
        (character) => character.location_id !== locationId,
      );
      setCharacters([...others, ...reordered]);
      setIsDirty(true);
    },
    [characters, charactersByLocation, locations],
  );

  const uploadImage = useCallback(async (file: File) => {
    const body = new FormData();
    body.append("file", file);
    const uploaded = await apiFetch<{ url: string }>(
      "/api/characters/upload",
      {
        method: "POST",
        body,
      },
    );
    return uploaded.url;
  }, []);

  const handleSaveAll = useCallback(async () => {
    if (!isDirty || saving) {
      return;
    }

    setSaving(true);
    try {
      const locationIdMap = new Map<number, number>();

      for (const location of locations.filter((item) => item.id < 0)) {
        const created = await apiFetch<Location>("/api/characters/locations", {
          method: "POST",
          body: JSON.stringify({
            name: location.name,
            description: location.description,
            order: location.order,
          }),
        });
        locationIdMap.set(location.id, created.id);
      }

      const realLocationId = (id: number | null) =>
        id === null ? null : (locationIdMap.get(id) ?? id);

      for (const location of locations.filter((item) => item.id > 0)) {
        await apiFetch(`/api/characters/locations/${location.id}`, {
          method: "PUT",
          body: JSON.stringify({
            name: location.name,
            description: location.description,
          }),
        });
      }

      for (const id of deletedCharacterIds) {
        await apiFetch(`/api/characters/${id}`, { method: "DELETE" });
      }

      const characterIdMap = new Map<number, number>();

      for (const character of characters.filter((item) => item.id < 0)) {
        const thumbnail = character.file
          ? await uploadImage(character.file)
          : character.thumbnail;
        const detailImage = character.detail_file
          ? await uploadImage(character.detail_file)
          : character.detail_image;
        const created = await apiFetch<CharacterItem>("/api/characters", {
          method: "POST",
          body: JSON.stringify({
            name: character.name,
            thumbnail,
            detail_image: detailImage,
            location_id: realLocationId(character.location_id),
            alt_name: character.alt_name,
            nickname: character.nickname,
            age: character.age,
            serif: character.serif,
            description: character.description,
            comming_day: character.comming_day || null,
            visible: character.visible,
            is_my_doll: character.is_my_doll,
            order_in_location: character.order_in_location,
            layout: character.layout ?? "auto",
            head_doll: character.head_doll,
            body_doll: character.body_doll,
          }),
        });
        characterIdMap.set(character.id, created.id);
      }

      for (const character of characters.filter((item) => item.id > 0)) {
        const thumbnail = character.file
          ? await uploadImage(character.file)
          : character.thumbnail;
        const detailImage = character.detail_file
          ? await uploadImage(character.detail_file)
          : character.detail_image;
        await apiFetch(`/api/characters/${character.id}`, {
          method: "PUT",
          body: JSON.stringify({
            name: character.name,
            thumbnail,
            detail_image: detailImage,
            location_id: realLocationId(character.location_id),
            alt_name: character.alt_name,
            nickname: character.nickname,
            age: character.age,
            serif: character.serif,
            description: character.description,
            comming_day: character.comming_day || null,
            visible: character.visible,
            is_my_doll: character.is_my_doll,
            order_in_location: character.order_in_location,
            layout: character.layout ?? "auto",
            relationships: character.relationships.map((relationship) => ({
              related_character_id:
                characterIdMap.get(relationship.related_character_id) ??
                relationship.related_character_id,
              relationship_type: relationship.relationship_type,
            })),
            head_doll: character.head_doll,
            body_doll: character.body_doll,
          }),
        });
      }

      // New characters can only be linked after every new character has an id.
      for (const character of characters.filter((item) => item.id < 0)) {
        const realId = characterIdMap.get(character.id);
        if (!realId || character.relationships.length === 0) {
          continue;
        }
        await apiFetch(`/api/characters/${realId}`, {
          method: "PUT",
          body: JSON.stringify({
            relationships: character.relationships.map((relationship) => ({
              related_character_id:
                characterIdMap.get(relationship.related_character_id) ??
                relationship.related_character_id,
              relationship_type: relationship.relationship_type,
            })),
          }),
        });
      }

      await apiFetch("/api/characters/locations/reorder", {
        method: "PUT",
        body: JSON.stringify({
          items: locations.map((location, index) => ({
            id: realLocationId(location.id),
            order: index,
          })),
        }),
      });

      const characterItems: {
        id: number;
        order_in_location: number;
        location_id: number | null;
      }[] = [];
      locations.forEach((location) => {
        const group = sortCharacters(
          characters.filter(
            (character) => character.location_id === location.id,
          ),
        );
        group.forEach((character, index) => {
          characterItems.push({
            id: characterIdMap.get(character.id) ?? character.id,
            order_in_location: index,
            location_id: realLocationId(location.id),
          });
        });
      });

      await apiFetch("/api/characters/reorder", {
        method: "PUT",
        body: JSON.stringify({ items: characterItems }),
      });

      for (const id of deletedLocationIds) {
        await apiFetch(`/api/characters/locations/${id}`, {
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
    characters,
    deletedCharacterIds,
    deletedLocationIds,
    isDirty,
    load,
    locations,
    notify,
    saving,
    uploadImage,
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

  const openCreateCharacter = (locationId?: number) => {
    setEditingCharacter(null);
    setThumbnailPreview(null);
    setThumbnailFileName("");
    setThumbnailUrlInput("");
    setThumbnailFile(null);
    setDetailPreview(null);
    setDetailFileName("");
    setDetailFile(null);
    setRelationshipDraft([]);
    setFormLocationId(locationId ?? locations[0]?.id ?? null);
    setCharacterModalOpen(true);
  };

  const openEditCharacter = (character: DraftCharacter) => {
    setEditingCharacter(character);
    setThumbnailPreview(character.preview_url ?? character.thumbnail);
    setThumbnailFileName(character.file?.name ?? "");
    setThumbnailUrlInput(character.thumbnail ?? "");
    setThumbnailFile(null);
    setDetailPreview(
      character.detail_preview_url ?? character.detail_image,
    );
    setDetailFileName(character.detail_file?.name ?? "");
    setDetailFile(null);
    setRelationshipDraft(
      character.relationships.map((relationship) => ({ ...relationship })),
    );
    setFormLocationId(
      character.location_id ?? locations[0]?.id ?? null,
    );
    setCharacterModalOpen(true);
  };

  const resetCropState = useCallback(
    (discardPending = true) => {
      if (cropSource) {
        URL.revokeObjectURL(cropSource);
        objectUrls.current.delete(cropSource);
      }
      if (discardPending) {
        setPendingBanner((current) => {
          if (current) {
            URL.revokeObjectURL(current.preview);
            objectUrls.current.delete(current.preview);
          }
          return null;
        });
      } else {
        setPendingBanner(null);
      }
      setCropSource(null);
      setCropFileName("");
      setCropStage("banner");
      setCrop({ x: 0, y: 0 });
      setCropZoom(1);
      setCroppedAreaPixels(null);
      if (thumbnailInputRef.current) {
        thumbnailInputRef.current.value = "";
      }
    },
    [cropSource],
  );

  const closeCropModal = useCallback(() => {
    setCropModalOpen(false);
    resetCropState();
  }, [resetCropState]);

  const closeCharacterModal = useCallback(() => {
    setCharacterModalOpen(false);
    setEditingCharacter(null);
    setThumbnailPreview(null);
    setThumbnailFileName("");
    setThumbnailUrlInput("");
    setThumbnailFile(null);
    setDetailPreview(null);
    setDetailFileName("");
    setDetailFile(null);
    setRelationshipDraft([]);
    closeCropModal();
  }, [closeCropModal]);

  const handleThumbnailChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      setThumbnailFile(null);
      setThumbnailPreview(
        editingCharacter?.preview_url ?? editingCharacter?.thumbnail ?? null,
      );
      setThumbnailFileName(editingCharacter?.file?.name ?? "");
      return;
    }
    if (!ALLOWED_THUMBNAIL_TYPES.includes(file.type)) {
      event.target.value = "";
      notify("error", "PNG / JPEG / WEBP / GIF 이미지만 업로드할 수 있습니다.");
      return;
    }
    if (file.size > MAX_THUMBNAIL_SIZE) {
      event.target.value = "";
      notify("error", "이미지는 50MB 이하만 업로드할 수 있습니다.");
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    objectUrls.current.add(objectUrl);
    setCropSource(objectUrl);
    setCropFileName(file.name);
    setCropStage("banner");
    setPendingBanner(null);
    setCrop({ x: 0, y: 0 });
    setCropZoom(1);
    setCroppedAreaPixels(null);
    setCropModalOpen(true);
  };

  const openCropFromUrl = useCallback(async () => {
    const value = thumbnailUrlInput.trim();
    if (!value) {
      notify("error", "이미지 URL을 입력해주세요.");
      return;
    }
    if (urlCropLoading) {
      return;
    }

    setUrlCropLoading(true);
    try {
      const absoluteUrl = new URL(value, window.location.origin).toString();
      const response = await fetch(
        `/api/characters/image-proxy?url=${encodeURIComponent(absoluteUrl)}`,
        { credentials: "include" },
      );

      if (response.status === 401) {
        window.location.href = "/signin";
        throw new Error("로그인이 필요합니다.");
      }

      if (!response.ok) {
        let detail = "이미지를 불러오지 못했습니다.";
        try {
          const data = await response.json();
          if (typeof data?.detail === "string") {
            detail = data.detail;
          }
        } catch {
          // Ignore malformed error bodies.
        }
        throw new Error(detail);
      }

      const blob = await response.blob();
      if (!blob.type.startsWith("image/")) {
        throw new Error("이미지 URL이 아닙니다.");
      }

      const objectUrl = URL.createObjectURL(blob);
      objectUrls.current.add(objectUrl);
      setCropSource(objectUrl);
      setCropFileName(
        value.split("/").pop()?.split("?")[0] || "character",
      );
      setCropStage("banner");
      setPendingBanner(null);
      setCrop({ x: 0, y: 0 });
      setCropZoom(1);
      setCroppedAreaPixels(null);
      setCropModalOpen(true);
    } catch (error) {
      console.error(error);
      notify(
        "error",
        error instanceof Error
          ? error.message
          : "이미지를 불러오지 못했습니다.",
      );
    } finally {
      setUrlCropLoading(false);
    }
  }, [notify, thumbnailUrlInput, urlCropLoading]);

  const applyCrop = useCallback(async () => {
    if (!cropSource || !croppedAreaPixels) {
      return;
    }

    setCropping(true);
    try {
      const stage = CROP_STAGES[cropStage];
      const blob = await cropImageToBlob(
        cropSource,
        croppedAreaPixels,
        stage.outputWidth,
        stage.aspect,
      );
      const baseName = cropFileName.replace(/\.[^.]+$/, "") || "character";
      const suffix = cropStage === "banner" ? "banner" : "detail";
      const croppedFile = new File(
        [blob],
        `${baseName}-${suffix}.png`,
        { type: "image/png" },
      );

      if (cropStage === "banner") {
        const previewUrl = URL.createObjectURL(croppedFile);
        objectUrls.current.add(previewUrl);
        setPendingBanner({
          file: croppedFile,
          preview: previewUrl,
          name: croppedFile.name,
        });
        setCropStage("detail");
        setCrop({ x: 0, y: 0 });
        setCropZoom(1);
        setCroppedAreaPixels(null);
        return;
      }

      if (!pendingBanner) {
        notify("error", "배너 이미지 크롭 정보를 찾지 못했습니다.");
        return;
      }

      const previewUrl = URL.createObjectURL(croppedFile);
      objectUrls.current.add(previewUrl);

      setThumbnailFile(pendingBanner.file);
      setThumbnailPreview(pendingBanner.preview);
      setThumbnailFileName(pendingBanner.name);
      setDetailFile(croppedFile);
      setDetailPreview(previewUrl);
      setDetailFileName(croppedFile.name);

      setCropModalOpen(false);
      resetCropState(false);
    } catch (error) {
      console.error(error);
      notify("error", "이미지를 자르지 못했습니다.");
    } finally {
      setCropping(false);
    }
  }, [
    cropFileName,
    cropSource,
    cropStage,
    croppedAreaPixels,
    notify,
    pendingBanner,
    resetCropState,
  ]);

  const handleThumbnailUrlChange = (event: ChangeEvent<HTMLInputElement>) => {
    setThumbnailUrlInput(event.target.value);
  };

  const handleCharacterSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const altName = String(form.get("alt_name") ?? "").trim();
    const nickname = String(form.get("nickname") ?? "").trim();
    const age = String(form.get("age") ?? "").trim();
    const serif = String(form.get("serif") ?? "").trim();
    const description = String(form.get("description") ?? "").trim();
    const commingDay = String(form.get("comming_day") ?? "").trim();
    const headName = String(form.get("head_name") ?? "").trim();
    const headCompany = String(form.get("head_company") ?? "").trim();
    const headSkinTone = String(form.get("head_skin_tone") ?? "").trim();
    const bodyName = String(form.get("body_name") ?? "").trim();
    const bodyCompany = String(form.get("body_company") ?? "").trim();
    const bodySkinTone = String(form.get("body_skin_tone") ?? "").trim();
    const rawLayout = String(form.get("layout") ?? "auto");
    const layout: CharacterLayout =
      rawLayout === "left" || rawLayout === "right" || rawLayout === "center"
        ? rawLayout
        : "auto";
    const relationships = relationshipDraft
      .filter(
        (relationship) =>
          relationship.related_character_id !== 0 &&
          relationship.related_character_id !== editingCharacter?.id,
      )
      .map((relationship) => ({
        related_character_id: relationship.related_character_id,
        relationship_type: relationship.relationship_type.trim(),
      }));
    const rawLocation = form.get("location");
    const locationId =
      rawLocation === null || rawLocation === "" ? null : Number(rawLocation);
    const targetLocation =
      locationId === null
        ? null
        : locations.find((location) => location.id === locationId) ?? null;
    const thumbnailUrl = String(form.get("thumbnail_url") ?? "").trim();

    if (!name || !targetLocation) {
      notify("error", "이름과 위치는 필수입니다.");
      return;
    }

    if (
      thumbnailUrl &&
      thumbnailUrl !== (editingCharacter?.thumbnail ?? "") &&
      !thumbnailFile
    ) {
      notify(
        "error",
        "이미지 URL은 배너·상세 두 번 자른 뒤 적용해주세요.",
      );
      return;
    }

    const nextFile = thumbnailFile ?? editingCharacter?.file ?? null;
    const nextPreview =
      thumbnailPreview ??
      (nextFile
        ? editingCharacter?.preview_url ?? null
        : editingCharacter?.thumbnail ?? null);
    const nextDetailFile =
      detailFile ?? editingCharacter?.detail_file ?? null;
    const nextDetailPreview =
      detailPreview ??
      (nextDetailFile
        ? editingCharacter?.detail_preview_url ?? null
        : editingCharacter?.detail_image ?? null);

    const remaining = characters.filter(
      (character) => character.id !== editingCharacter?.id,
    );
    const order =
      editingCharacter && editingCharacter.location_id === targetLocation.id
        ? editingCharacter.order_in_location ?? 0
        : remaining
            .filter(
              (character) => character.location_id === targetLocation.id,
            )
            .reduce(
              (max, character) =>
                Math.max(max, character.order_in_location ?? 0),
              -1,
            ) + 1;

    const draft: DraftCharacter = {
      id: editingCharacter?.id ?? nextTempId.current--,
      name,
      thumbnail: editingCharacter?.thumbnail ?? null,
      detail_image: editingCharacter?.detail_image ?? null,
      location_id: targetLocation.id,
      alt_name: altName || null,
      nickname: nickname || null,
      age: age || null,
      serif: serif || null,
      description: description || null,
      comming_day: commingDay || null,
      visible: form.get("visible") === "on",
      is_my_doll: form.get("is_my_doll") === "on",
      order_in_location: order,
      layout,
      relationships,
      location: targetLocation,
      head_doll: headName
        ? {
            company: headCompany,
            name: headName,
            skin_tone: headSkinTone || null,
          }
        : null,
      body_doll: bodyName
        ? {
            company: bodyCompany,
            name: bodyName,
            skin_tone: bodySkinTone || null,
          }
        : null,
      file: nextFile,
      preview_url: nextPreview,
      detail_file: nextDetailFile,
      detail_preview_url: nextDetailPreview,
    };

    setCharacters((prev) =>
      editingCharacter
        ? prev.map((character) =>
            character.id === editingCharacter.id ? draft : character,
          )
        : [...prev, draft],
    );
    setIsDirty(true);
    closeCharacterModal();
  };

  const handleDeleteCharacter = (character: DraftCharacter) => {
    if (!window.confirm(`'${character.name}' 등장인물을 삭제할까요?`)) {
      return;
    }
    setCharacters((prev) =>
      prev
        .filter((item) => item.id !== character.id)
        .map((item) => ({
          ...item,
          relationships: item.relationships.filter(
            (relationship) =>
              relationship.related_character_id !== character.id,
          ),
        })),
    );
    if (character.id > 0) {
      setDeletedCharacterIds((prev) => [...prev, character.id]);
    }
    setIsDirty(true);
  };

  const openCreateLocation = () => {
    setEditingLocation(null);
    setLocationModalOpen(true);
  };

  const openEditLocation = (location: Location) => {
    setEditingLocation(location);
    setLocationModalOpen(true);
  };

  const closeLocationModal = useCallback(() => {
    setLocationModalOpen(false);
    setEditingLocation(null);
  }, []);

  const handleLocationSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const description = String(form.get("description") ?? "").trim();
    if (!name) {
      notify("error", "위치 이름을 입력해주세요.");
      return;
    }

    if (editingLocation) {
      setLocations((prev) =>
        prev.map((location) =>
          location.id === editingLocation.id
            ? { ...location, name, description: description || null }
            : location,
        ),
      );
      setCharacters((prev) =>
        prev.map((character) =>
          character.location_id === editingLocation.id
            ? {
                ...character,
                location: {
                  ...(character.location ?? editingLocation),
                  name,
                  description: description || null,
                },
              }
            : character,
        ),
      );
    } else {
      const id = nextTempId.current--;
      const order =
        locations.reduce(
          (max, location) => Math.max(max, location.order),
          -1,
        ) + 1;
      setLocations((prev) => [
        ...prev,
        { id, name, description: description || null, order },
      ]);
    }

    setIsDirty(true);
    closeLocationModal();
  };

  const handleDeleteLocation = (location: Location) => {
    if (!window.confirm(`'${location.name}' 위치를 삭제할까요?`)) {
      return;
    }
    setLocations((prev) =>
      prev.filter((item) => item.id !== location.id),
    );
    setCharacters((prev) => {
      const removedIds = new Set(
        prev
          .filter((character) => character.location_id === location.id)
          .map((character) => character.id),
      );
      return prev
        .filter((character) => character.location_id !== location.id)
        .map((character) => ({
          ...character,
          relationships: character.relationships.filter(
            (relationship) =>
              !removedIds.has(relationship.related_character_id),
          ),
        }));
    });
    if (location.id > 0) {
      setDeletedLocationIds((prev) => [...prev, location.id]);
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
    <div id="admin-characters">
      <div className="admin-characters-toolbar">
        <div>
          <h1>등장인물 관리</h1>
          <p className="admin-characters-hint">
            위치와 등장인물을 수정하거나 드래그해서 순서를 바꾼 뒤 저장 버튼을
            눌러주세요.
          </p>
        </div>
        <div className="admin-characters-toolbar-actions">
          <label className="admin-filter">
            <span>위치</span>
            <select
              value={locationFilter}
              onChange={(event) =>
                setLocationFilter(
                  event.target.value === "all"
                    ? "all"
                    : Number(event.target.value),
                )
              }
            >
              <option value="all">전체 위치</option>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
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
            onClick={openCreateLocation}
          >
            위치 추가
          </button>
          <button
            type="button"
            className="admin-button"
            onClick={() => openCreateCharacter()}
            disabled={locations.length === 0}
          >
            등장인물 추가
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
      ) : locations.length === 0 ? (
        <p className="admin-links-empty">
          위치가 없습니다. 먼저 위치를 추가해주세요.
        </p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetection}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={displayLocations.map(
              (location) => `${LOCATION_TYPE}-${location.id}`,
            )}
            strategy={verticalListSortingStrategy}
          >
            <div className="admin-characters-groups">
              {displayLocations.map((location) => (
                <SortableLocationSection
                  key={location.id}
                  location={location}
                  characters={charactersByLocation.get(location.id) ?? []}
                  onAddCharacter={openCreateCharacter}
                  onEditLocation={openEditLocation}
                  onDeleteLocation={handleDeleteLocation}
                  onEditCharacter={openEditCharacter}
                  onDeleteCharacter={handleDeleteCharacter}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {characterModalOpen ? (
        <ModalShell
          title={editingCharacter ? "등장인물 수정" : "등장인물 추가"}
          onClose={closeCharacterModal}
          closeOnEscape={!cropModalOpen}
          footer={
            <>
              <button
                type="button"
                className="admin-button"
                onClick={closeCharacterModal}
                disabled={saving}
              >
                취소
              </button>
              <button
                type="submit"
                form="character-form"
                className="admin-button primary"
                disabled={saving}
              >
                {editingCharacter ? "적용" : "추가"}
              </button>
            </>
          }
        >
          <form id="character-form" onSubmit={handleCharacterSubmit}>
            <label className="admin-field">
              <span>
                이름 <em>*</em>
              </span>
              <input
                name="name"
                required
                autoFocus
                defaultValue={editingCharacter?.name ?? ""}
                placeholder="등장인물 이름"
              />
            </label>

            <label className="admin-field">
              <span>
                위치 <em>*</em>
              </span>
              <select
                name="location"
                required
                defaultValue={formLocationId ?? locations[0]?.id ?? ""}
              >
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="admin-field">
              <span>배치</span>
              <select
                name="layout"
                defaultValue={editingCharacter?.layout ?? "auto"}
              >
                <option value="auto">자동 (기본)</option>
                <option value="left">왼쪽</option>
                <option value="center">가운데</option>
                <option value="right">오른쪽</option>
              </select>
            </label>

            <div className="admin-field admin-relationships-field">
              <span>관계 인물</span>
              <div className="admin-relationships">
                {relationshipDraft.map((relationship, index) => (
                  <div className="admin-relationship-row" key={index}>
                    <select
                      value={relationship.related_character_id}
                      onChange={(event) => {
                        const value = Number(event.target.value);
                        setRelationshipDraft((prev) =>
                          prev.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, related_character_id: value }
                              : item,
                          ),
                        );
                      }}
                    >
                      <option value={0}>등장인물 선택</option>
                      {characters
                        .filter((item) => item.id !== editingCharacter?.id)
                        .map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                    </select>
                    <input
                      value={relationship.relationship_type}
                      onChange={(event) => {
                        const value = event.target.value;
                        setRelationshipDraft((prev) =>
                          prev.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, relationship_type: value }
                              : item,
                          ),
                        );
                      }}
                      placeholder="관계 (예: 언니)"
                    />
                    <button
                      type="button"
                      className="admin-button"
                      onClick={() =>
                        setRelationshipDraft((prev) =>
                          prev.filter((_, itemIndex) => itemIndex !== index),
                        )
                      }
                    >
                      삭제
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="admin-button"
                  onClick={() =>
                    setRelationshipDraft((prev) => [
                      ...prev,
                      { related_character_id: 0, relationship_type: "" },
                    ])
                  }
                >
                  관계 추가
                </button>
              </div>
            </div>

            <label className="admin-field">
              <span>다른 이름</span>
              <input
                name="alt_name"
                defaultValue={editingCharacter?.alt_name ?? ""}
                placeholder="다른 이름 (선택)"
              />
            </label>

            <label className="admin-field">
              <span>별명</span>
              <input
                name="nickname"
                defaultValue={editingCharacter?.nickname ?? ""}
                placeholder="별명 (선택)"
              />
            </label>

            <label className="admin-field">
              <span>나이</span>
              <input
                name="age"
                defaultValue={editingCharacter?.age ?? ""}
                placeholder="나이 (선택)"
              />
            </label>

            <label className="admin-field">
              <span>등장일</span>
              <input
                type="date"
                name="comming_day"
                defaultValue={toDateValue(editingCharacter?.comming_day)}
              />
            </label>

            <label className="admin-field">
              <span>대사</span>
              <textarea
                name="serif"
                rows={2}
                defaultValue={editingCharacter?.serif ?? ""}
                placeholder="대표 대사 (선택)"
              />
            </label>

            <label className="admin-field">
              <span>설명</span>
              <textarea
                name="description"
                rows={3}
                defaultValue={editingCharacter?.description ?? ""}
                placeholder="등장인물 설명 (선택)"
              />
            </label>

            <div className="admin-character-parts">
              <fieldset className="admin-character-part">
                <legend>헤드</legend>
                <label className="admin-field">
                  <span>회사명</span>
                  <input
                    name="head_company"
                    defaultValue={editingCharacter?.head_doll?.company ?? ""}
                    placeholder="회사명 (선택)"
                  />
                </label>
                <label className="admin-field">
                  <span>이름</span>
                  <input
                    name="head_name"
                    defaultValue={editingCharacter?.head_doll?.name ?? ""}
                    placeholder="헤드 이름 (선택)"
                  />
                </label>
                <label className="admin-field">
                  <span>스킨색</span>
                  <input
                    type="text"
                    name="head_skin_tone"
                    defaultValue={editingCharacter?.head_doll?.skin_tone ?? ""}
                    placeholder="예: #F2D6C0 또는 노멀"
                  />
                </label>
              </fieldset>

              <fieldset className="admin-character-part">
                <legend>바디</legend>
                <label className="admin-field">
                  <span>회사명</span>
                  <input
                    name="body_company"
                    defaultValue={editingCharacter?.body_doll?.company ?? ""}
                    placeholder="회사명 (선택)"
                  />
                </label>
                <label className="admin-field">
                  <span>이름</span>
                  <input
                    name="body_name"
                    defaultValue={editingCharacter?.body_doll?.name ?? ""}
                    placeholder="바디 이름 (선택)"
                  />
                </label>
                <label className="admin-field">
                  <span>스킨색</span>
                  <input
                    type="text"
                    name="body_skin_tone"
                    defaultValue={editingCharacter?.body_doll?.skin_tone ?? ""}
                    placeholder="예: #F2D6C0 또는 노멀"
                  />
                </label>
              </fieldset>
            </div>

            <div className="admin-field">
              <span>이미지 (배너 · 상세)</span>
              <input
                type="text"
                name="thumbnail_url"
                inputMode="url"
                value={thumbnailUrlInput}
                onChange={handleThumbnailUrlChange}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    openCropFromUrl();
                  }
                }}
                placeholder="이미지 URL (선택)"
                spellCheck={false}
              />
              <button
                type="button"
                className="admin-button admin-url-crop-button"
                onClick={openCropFromUrl}
                disabled={urlCropLoading || !thumbnailUrlInput.trim()}
              >
                {urlCropLoading
                  ? "불러오는 중..."
                  : "URL 이미지로 두 번 자르기"}
              </button>
              <div className="admin-character-image-previews">
                <div className="admin-character-image-preview">
                  <span className="admin-character-image-preview__label">
                    배너 · 3:1
                  </span>
                  <div className="admin-banner-preview-wrap">
                    {thumbnailPreview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={thumbnailPreview}
                        alt="배너 이미지 미리보기"
                        className="admin-banner-preview"
                      />
                    ) : (
                      <span className="admin-banner-placeholder">
                        미리보기 없음
                      </span>
                    )}
                  </div>
                </div>
                <div className="admin-character-image-preview">
                  <span className="admin-character-image-preview__label">
                    상세 · 1:1
                  </span>
                  <div className="admin-detail-preview-wrap">
                    {detailPreview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={detailPreview}
                        alt="상세 이미지 미리보기"
                        className="admin-detail-preview"
                      />
                    ) : (
                      <span className="admin-banner-placeholder">
                        미리보기 없음
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <input
                ref={thumbnailInputRef}
                type="file"
                name="character_file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={handleThumbnailChange}
              />
              {thumbnailFileName || detailFileName ? (
                <span className="admin-banner-filename">
                  {thumbnailFileName ? `배너: ${thumbnailFileName}` : null}
                  {thumbnailFileName && detailFileName ? " · " : null}
                  {detailFileName ? `상세: ${detailFileName}` : null}
                </span>
              ) : null}
              <span className="admin-banner-help">
                파일을 선택하거나 URL을 불러오면 3:1 배너 → 1:1 상세 순서로
                두 번 자릅니다. 배너는 너비 1280px, 상세 이미지는
                1024×1024px로 저장됩니다.
              </span>
            </div>

            <label className="admin-field admin-checkbox-field">
              <input
                type="checkbox"
                name="visible"
                defaultChecked={editingCharacter?.visible ?? true}
              />
              <span>공개</span>
            </label>

            <label className="admin-field admin-checkbox-field">
              <input
                type="checkbox"
                name="is_my_doll"
                defaultChecked={editingCharacter?.is_my_doll ?? true}
              />
              <span>내 인형</span>
            </label>
          </form>
        </ModalShell>
      ) : null}

      {cropModalOpen && cropSource ? (
        <ModalShell
          title={
            cropStage === "banner"
              ? "이미지 자르기 · 1/2 배너"
              : "이미지 자르기 · 2/2 상세"
          }
          onClose={closeCropModal}
          footer={
            <>
              <button
                type="button"
                className="admin-button"
                onClick={closeCropModal}
                disabled={cropping}
              >
                취소
              </button>
              <button
                type="button"
                className="admin-button primary"
                onClick={applyCrop}
                disabled={cropping || !croppedAreaPixels}
              >
                {cropping
                  ? "처리 중..."
                  : cropStage === "banner"
                    ? "다음 (상세 이미지)"
                    : "적용"}
              </button>
            </>
          }
        >
          <div className="admin-crop">
            <div className="admin-crop-viewport">
              <Cropper
                key={cropStage}
                image={cropSource}
                crop={crop}
                zoom={cropZoom}
                aspect={CROP_STAGES[cropStage].aspect}
                onCropChange={setCrop}
                onZoomChange={setCropZoom}
                onCropComplete={(_, areaPixels) =>
                  setCroppedAreaPixels(areaPixels)
                }
                showGrid
              />
            </div>
            <label className="admin-field">
              <span>확대 / 축소</span>
              <input
                type="range"
                min={1}
                max={3}
                step={0.01}
                value={cropZoom}
                onChange={(event) =>
                  setCropZoom(Number(event.target.value))
                }
              />
            </label>
            <p className="admin-crop-hint">
              {cropStage === "banner"
                ? "목록에 표시할 3:1 배너를 자릅니다. 다음 단계에서 상세 페이지용 1:1 이미지를 자릅니다."
                : "상세 페이지에 표시할 정사각형(1:1) 이미지를 자릅니다. 적용하면 1024×1024px로 저장됩니다."}
            </p>
          </div>
        </ModalShell>
      ) : null}

      {locationModalOpen ? (
        <ModalShell
          title={editingLocation ? "위치 이름 변경" : "위치 추가"}
          onClose={closeLocationModal}
          footer={
            <>
              <button
                type="button"
                className="admin-button"
                onClick={closeLocationModal}
                disabled={saving}
              >
                취소
              </button>
              <button
                type="submit"
                form="location-form"
                className="admin-button primary"
                disabled={saving}
              >
                {editingLocation ? "적용" : "추가"}
              </button>
            </>
          }
        >
          <form id="location-form" onSubmit={handleLocationSubmit}>
            <label className="admin-field">
              <span>
                위치 이름 <em>*</em>
              </span>
              <input
                name="name"
                required
                autoFocus
                defaultValue={editingLocation?.name ?? ""}
                placeholder="예: 꿈의 바깥"
              />
            </label>
            <label className="admin-field">
              <span>설명</span>
              <textarea
                name="description"
                rows={2}
                defaultValue={editingLocation?.description ?? ""}
                placeholder="위치 설명 (선택)"
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
