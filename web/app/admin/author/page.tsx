"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";

import { useAuth } from "@/components/auth-provider";
import {
  ImageCropModal,
  type CropStageConfig,
  type CroppedImageResult,
} from "@/components/image-crop-modal";
import { RichTextEditor } from "@/components/rich-text-editor";
import { profileToHtml, type AuthorProfile } from "@/config/author";
import { maybeRevalidatePublicContent } from "@/lib/revalidate";

import "@/public/styles/admin/author.scss";

type Notice = { type: "success" | "error"; text: string };

interface CropRequest {
  src: string;
  fileName: string;
}

const MAX_BANNER_SIZE = 50 * 1024 * 1024;
const ALLOWED_BANNER_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
];

const PROFILE_BANNER_CROP_STAGE: CropStageConfig = {
  key: "banner",
  aspect: 1,
  outputWidth: 1024,
  title: "이미지 자르기 · 프로필 배너",
  hint: "작가소개 카드에 표시할 정사각형(1:1) 이미지를 자릅니다. 1024×1024px로 저장됩니다.",
  fileSuffix: "banner",
};

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

export default function AdminProfile() {
  const { isAdmin } = useAuth();
  const [profile, setProfile] = useState<AuthorProfile | null>(null);
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [content, setContent] = useState("");
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerFileName, setBannerFileName] = useState("");
  const [cropRequest, setCropRequest] = useState<CropRequest | null>(null);
  const objectUrls = useRef<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [othersOpen, setOthersOpen] = useState(false);
  const [othersLoading, setOthersLoading] = useState(false);
  const [others, setOthers] = useState<AuthorProfile[]>([]);
  const [viewingOther, setViewingOther] = useState<AuthorProfile | null>(
    null,
  );

  useEffect(() => {
    const urls = objectUrls.current;
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const profiles = await apiFetch<AuthorProfile[]>(
        "/api/profiles?mine=true",
      );
      const first = profiles[0];
      const nextTitle = first?.title ?? "";
      const nextSubtitle = first?.subtitle ?? "";
      const nextProfile = first?.profile ?? "";
      const nextHtml = profileToHtml(nextProfile);

      setProfile(first ?? null);
      setTitle(nextTitle);
      setSubtitle(nextSubtitle);
      setContent(nextHtml);
      setBannerPreview(first?.banner_url ?? null);
      setBannerFile(null);
      setBannerFileName("");
    } catch (error) {
      setNotice({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "프로필을 불러오지 못했습니다.",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const uploadBanner = useCallback(async (file: File) => {
    const body = new FormData();
    body.append("file", file);
    const uploaded = await apiFetch<{ url: string }>(
      "/api/profiles/upload",
      {
        method: "POST",
        body,
      },
    );
    return uploaded.url;
  }, []);

  const closeCropModal = useCallback(() => {
    if (cropRequest) {
      URL.revokeObjectURL(cropRequest.src);
      objectUrls.current.delete(cropRequest.src);
    }
    setCropRequest(null);
  }, [cropRequest]);

  const handleBannerChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!ALLOWED_BANNER_TYPES.includes(file.type)) {
      setNotice({
        type: "error",
        text: "PNG / JPEG / WEBP / GIF 이미지만 업로드할 수 있습니다.",
      });
      return;
    }
    if (file.size > MAX_BANNER_SIZE) {
      setNotice({
        type: "error",
        text: "이미지는 50MB 이하만 업로드할 수 있습니다.",
      });
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    objectUrls.current.add(objectUrl);
    setCropRequest({ src: objectUrl, fileName: file.name });
  };

  const handleCropComplete = useCallback(
    (results: CroppedImageResult[]) => {
      const banner = results.find((result) => result.stage === "banner");
      if (!banner) {
        setNotice({
          type: "error",
          text: "이미지 크롭 결과를 찾지 못했습니다.",
        });
        closeCropModal();
        return;
      }

      const preview = URL.createObjectURL(banner.file);
      objectUrls.current.add(preview);
      setBannerFile(banner.file);
      setBannerPreview(preview);
      setBannerFileName(banner.file.name);
      closeCropModal();
    },
    [closeCropModal],
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nextTitle = title.trim();
    const nextSubtitle = subtitle.trim();
    const nextContent = content;
    const plainText = nextContent
      .replace(/<[^>]*>/g, "")
      .replace(/&nbsp;/g, " ")
      .trim();

    if (!nextTitle) {
      setNotice({ type: "error", text: "제목을 입력해주세요." });
      return;
    }

    if (!plainText) {
      setNotice({ type: "error", text: "소개 내용을 입력해주세요." });
      return;
    }

    setSaving(true);
    try {
      let nextBannerUrl = profile?.banner_url ?? null;
      if (bannerFile) {
        nextBannerUrl = await uploadBanner(bannerFile);
      }

      if (profile?.id) {
        const updated = await apiFetch<AuthorProfile>(
          `/api/profiles/${profile.id}`,
          {
            method: "PUT",
            body: JSON.stringify({
              title: nextTitle,
              subtitle: nextSubtitle,
              banner_url: nextBannerUrl,
              profile: nextContent,
            }),
          },
        );
        setProfile(updated);
        setBannerPreview(updated.banner_url ?? null);
      } else {
        const created = await apiFetch<AuthorProfile>("/api/profiles", {
          method: "POST",
          body: JSON.stringify({
            title: nextTitle,
            subtitle: nextSubtitle,
            banner_url: nextBannerUrl,
            profile: nextContent,
          }),
        });
        setProfile(created);
        setBannerPreview(created.banner_url ?? null);
      }
      setTitle(nextTitle);
      setSubtitle(nextSubtitle);
      setBannerFile(null);
      setBannerFileName("");
      setNotice({ type: "success", text: "프로필을 저장했습니다." });
    } catch (error) {
      setNotice({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "프로필을 저장하지 못했습니다.",
      });
    } finally {
      setSaving(false);
    }
  };

  const openOtherProfiles = useCallback(async () => {
    setOthersOpen(true);
    setViewingOther(null);
    setOthersLoading(true);
    try {
      const data = await apiFetch<AuthorProfile[]>("/api/profiles/others");
      setOthers(data);
    } catch (error) {
      setNotice({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "다른 사용자 프로필을 불러오지 못했습니다.",
      });
    } finally {
      setOthersLoading(false);
    }
  }, []);

  const closeOtherProfiles = useCallback(() => {
    setOthersOpen(false);
    setViewingOther(null);
  }, []);

  const deleteOtherProfile = useCallback(
    async (target: AuthorProfile) => {
      if (!target.id) return;
      if (
        !window.confirm(
          `${target.owner ?? "다른 사용자"}의 프로필을 삭제할까요?`,
        )
      ) {
        return;
      }

      try {
        await apiFetch(`/api/profiles/${target.id}`, {
          method: "DELETE",
        });
        setOthers((prev) =>
          prev.filter((item) => item.id !== target.id),
        );
        setViewingOther((current) =>
          current?.id === target.id ? null : current,
        );
        setNotice({
          type: "success",
          text: "프로필을 삭제했습니다.",
        });
      } catch (error) {
        setNotice({
          type: "error",
          text:
            error instanceof Error
              ? error.message
              : "프로필을 삭제하지 못했습니다.",
        });
      }
    },
    [],
  );

  useEffect(() => {
    if (!othersOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeOtherProfiles();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [othersOpen, closeOtherProfiles]);

  return (
    <div id="admin-author">
      <header className="admin-author-header">
        <div>
          <h1>프로필 관리</h1>
          <p className="admin-author-hint">
            작가소개 카드에 표시할 배너 이미지, 제목, 서브타이틀,
            소개를 편집합니다.
          </p>
        </div>
        {isAdmin ? (
          <button
            type="button"
            className="admin-button"
            onClick={openOtherProfiles}
          >
            다른 사용자 프로필 보기
          </button>
        ) : null}
      </header>

      {notice ? (
        <div className={`admin-notice admin-notice-${notice.type}`}>
          {notice.text}
        </div>
      ) : null}

      {loading ? (
        <p className="admin-author-loading">불러오는 중...</p>
      ) : (
        <form className="admin-author-form" onSubmit={handleSubmit}>
          <div className="admin-field">
            <span>프로필 배너</span>
            <div className="admin-author-banner-field">
              <div className="admin-author-banner-preview">
                {bannerPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={bannerPreview} alt="프로필 배너 미리보기" />
                ) : (
                  <span>이미지 없음</span>
                )}
              </div>
              <div className="admin-author-banner-controls">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={handleBannerChange}
                />
                {bannerFileName ? (
                  <span className="admin-banner-filename">
                    {bannerFileName}
                  </span>
                ) : null}
                <span className="admin-banner-help">
                  이미지를 선택하면 정사각형(1:1)으로 자릅니다.
                  1024×1024px로 저장됩니다.
                </span>
              </div>
            </div>
          </div>

          <label className="admin-field">
            <span>제목</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="작가 이름 또는 소개 제목"
            />
          </label>

          <label className="admin-field">
            <span>서브타이틀</span>
            <input
              value={subtitle}
              onChange={(event) => setSubtitle(event.target.value)}
              placeholder="제목 아래에 표시할 문구"
            />
          </label>

          <div className="admin-field">
            <span>소개</span>
            <RichTextEditor
              value={content}
              onChange={setContent}
              placeholder="작가소개 내용을 입력해주세요."
              uploadUrl="/api/profiles/upload"
              onNotice={setNotice}
            />
          </div>

          <div className="admin-author-actions">
            <button
              type="submit"
              className="admin-button primary"
              disabled={saving}
            >
              {saving ? "저장 중..." : "저장"}
            </button>
          </div>
        </form>
      )}

      {othersOpen ? (
        <div
          className="admin-modal-backdrop"
          onClick={closeOtherProfiles}
        >
          <div
            className="admin-modal admin-author-others-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-author-others-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="admin-modal-header">
              <h2 id="admin-author-others-title">
                {viewingOther ? "프로필 조회" : "다른 사용자 프로필"}
              </h2>
              <button
                type="button"
                className="admin-modal-close"
                onClick={closeOtherProfiles}
                aria-label="닫기"
              >
                ×
              </button>
            </header>

            <div className="admin-modal-body">
              {viewingOther ? (
                <article className="admin-author-other-view">
                  <header>
                    <strong>{viewingOther.title}</strong>
                    <span>
                      {viewingOther.owner ?? "알 수 없는 사용자"}
                    </span>
                  </header>
                  {viewingOther.subtitle ? (
                    <p className="admin-author-other-subtitle">
                      {viewingOther.subtitle}
                    </p>
                  ) : null}
                  <div
                    className="admin-author-other-copy"
                    dangerouslySetInnerHTML={{
                      __html: profileToHtml(viewingOther.profile),
                    }}
                  />
                  <p className="admin-author-readonly">
                    다른 사용자의 프로필은 조회만 할 수 있습니다.
                  </p>
                </article>
              ) : othersLoading ? (
                <p className="admin-author-loading">
                  불러오는 중...
                </p>
              ) : others.length === 0 ? (
                <p className="admin-author-empty">
                  다른 사용자의 프로필이 없습니다.
                </p>
              ) : (
                <ul className="admin-author-other-list">
                  {others.map((item) => (
                    <li key={item.id} className="admin-author-other-item">
                      <div>
                        <strong>{item.title}</strong>
                        <span>{item.owner ?? "알 수 없는 사용자"}</span>
                        {item.subtitle ? (
                          <p>{item.subtitle}</p>
                        ) : null}
                      </div>
                      <div className="admin-author-other-actions">
                        <button
                          type="button"
                          className="admin-button"
                          onClick={() => setViewingOther(item)}
                        >
                          조회
                        </button>
                        <button
                          type="button"
                          className="admin-button danger"
                          onClick={() => deleteOtherProfile(item)}
                        >
                          삭제
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <footer className="admin-modal-footer">
              {viewingOther ? (
                <button
                  type="button"
                  className="admin-button"
                  onClick={() => setViewingOther(null)}
                >
                  목록으로
                </button>
              ) : null}
              <button
                type="button"
                className="admin-button"
                onClick={closeOtherProfiles}
              >
                닫기
              </button>
            </footer>
          </div>
        </div>
      ) : null}

      {cropRequest ? (
        <ImageCropModal
          imageSrc={cropRequest.src}
          fileName={cropRequest.fileName}
          stages={[PROFILE_BANNER_CROP_STAGE]}
          onClose={closeCropModal}
          onComplete={handleCropComplete}
        />
      ) : null}
    </div>
  );
}
