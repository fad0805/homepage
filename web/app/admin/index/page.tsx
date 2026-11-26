"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";

import {
  ImageCropModal,
  type CropStageConfig,
  type CroppedImageResult,
} from "@/components/image-crop-modal";
import { RichTextEditor } from "@/components/rich-text-editor";
import { apiFetch } from "@/lib/api";

import "@/public/styles/admin/author.scss";
import "@/public/styles/admin/index.scss";

interface IndexPage {
  scope: "author" | "integrated";
  user_id: number | null;
  title: string;
  subtitle: string;
  copyright_name: string;
  favicon_url: string | null;
  favicon_192_url: string | null;
  favicon_maskable_url: string | null;
  content_html: string;
}

interface CropRequest {
  src: string;
  fileName: string;
}

type Notice = { type: "success" | "error"; text: string };

const MAX_IMAGE_SIZE = 50 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
];

const FAVICON_CROP_STAGE: CropStageConfig = {
  key: "favicon",
  aspect: 1,
  outputWidth: 512,
  title: "이미지 자르기 · 파비콘",
  hint: "브라우저 탭에 표시할 정사각형 이미지를 자릅니다. 512×512px PNG로 저장됩니다.",
  fileSuffix: "favicon",
};

export default function AdminIndex() {
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [copyrightName, setCopyrightName] = useState("");
  const [content, setContent] = useState("");
  const [faviconUrl, setFaviconUrl] = useState<string | null>(null);
  const [favicon192Url, setFavicon192Url] = useState<string | null>(null);
  const [faviconMaskableUrl, setFaviconMaskableUrl] = useState<
    string | null
  >(null);
  const [faviconPreview, setFaviconPreview] = useState<string | null>(null);
  const [faviconFile, setFaviconFile] = useState<File | null>(null);
  const [faviconFileName, setFaviconFileName] = useState("");
  const [cropRequest, setCropRequest] = useState<CropRequest | null>(null);
  const objectUrls = useRef<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

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
      const data = await apiFetch<IndexPage>("/api/index-page?scope=integrated");
      setTitle(data.title);
      setSubtitle(data.subtitle);
      setCopyrightName(data.copyright_name);
      setContent(data.content_html);
      setFaviconUrl(data.favicon_url);
      setFavicon192Url(data.favicon_192_url);
      setFaviconMaskableUrl(data.favicon_maskable_url);
      setFaviconPreview(data.favicon_url);
      setFaviconFile(null);
      setFaviconFileName("");
    } catch (error) {
      setNotice({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "인덱스 페이지를 불러오지 못했습니다.",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const uploadFavicon = useCallback(async (file: File) => {
    const body = new FormData();
    body.append("file", file);
    return apiFetch<{
      favicon_url: string;
      favicon_192_url: string;
      favicon_maskable_url: string;
    }>("/api/index-page/favicon", {
      method: "POST",
      body,
    });
  }, []);

  const closeCropModal = useCallback(() => {
    if (cropRequest) {
      URL.revokeObjectURL(cropRequest.src);
      objectUrls.current.delete(cropRequest.src);
    }
    setCropRequest(null);
  }, [cropRequest]);

  const handleFaviconChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setNotice({
        type: "error",
        text: "PNG / JPEG / WEBP / GIF 이미지만 업로드할 수 있습니다.",
      });
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
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

  const handleFaviconCropComplete = useCallback(
    (results: CroppedImageResult[]) => {
      const favicon = results.find((result) => result.stage === "favicon");
      if (!favicon) {
        setNotice({
          type: "error",
          text: "이미지 크롭 결과를 찾지 못했습니다.",
        });
        closeCropModal();
        return;
      }

      const preview = URL.createObjectURL(favicon.file);
      objectUrls.current.add(preview);
      setFaviconFile(favicon.file);
      setFaviconPreview(preview);
      setFaviconFileName(favicon.file.name);
      closeCropModal();
    },
    [closeCropModal],
  );

  const resetFavicon = () => {
    setFaviconUrl(null);
    setFavicon192Url(null);
    setFaviconMaskableUrl(null);
    setFaviconPreview(null);
    setFaviconFile(null);
    setFaviconFileName("");
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setNotice(null);
    try {
      let nextFaviconUrl = faviconUrl;
      let nextFavicon192Url = favicon192Url;
      let nextMaskableUrl = faviconMaskableUrl;
      if (faviconFile) {
        const uploaded = await uploadFavicon(faviconFile);
        nextFaviconUrl = uploaded.favicon_url;
        nextFavicon192Url = uploaded.favicon_192_url;
        nextMaskableUrl = uploaded.favicon_maskable_url;
      }

      const updated = await apiFetch<IndexPage>("/api/index-page", {
        method: "PUT",
        body: JSON.stringify({
          scope: "integrated",
          title,
          subtitle,
          copyright_name: copyrightName,
          favicon_url: nextFaviconUrl ?? "",
          favicon_192_url: nextFavicon192Url ?? "",
          favicon_maskable_url: nextMaskableUrl ?? "",
          content_html: content,
        }),
      });
      setTitle(updated.title);
      setSubtitle(updated.subtitle);
      setCopyrightName(updated.copyright_name);
      setContent(updated.content_html);
      setFaviconUrl(updated.favicon_url);
      setFavicon192Url(updated.favicon_192_url);
      setFaviconMaskableUrl(updated.favicon_maskable_url);
      setFaviconPreview(updated.favicon_url);
      setFaviconFile(null);
      setFaviconFileName("");
      setNotice({ type: "success", text: "인덱스 페이지를 저장했습니다." });
    } catch (error) {
      setNotice({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "인덱스 페이지를 저장하지 못했습니다.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div id="admin-index">
      <header className="admin-author-header">
        <div>
          <h1>인덱스 관리</h1>
          <p className="admin-author-hint">
            화면 상단에 표시할 사이트 제목·부제, 브라우저 탭 파비콘, 푸터
            카피라이트 이름, 메인 인덱스(/) 내용을 편집합니다. 제목은
            브라우저 탭 이름으로도 사용됩니다.
          </p>
        </div>
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
            <span>화면에 표시되는 타이틀</span>
            <input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="상단 사이트 이름 · 브라우저 탭 제목"
              maxLength={120}
            />
          </div>

          <div className="admin-field">
            <span>화면에 표시되는 부제</span>
            <input
              type="text"
              value={subtitle}
              onChange={(event) => setSubtitle(event.target.value)}
              placeholder="사이트 이름 아래에 작게 표시됩니다."
              maxLength={160}
            />
            <small className="admin-field-hint">
              영문자는 화면에 대문자로 표시됩니다.
            </small>
          </div>

          <div className="admin-field">
            <span>브라우저 탭 파비콘</span>
            <div className="admin-favicon-field">
              <div className="admin-favicon-preview">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={faviconPreview ?? faviconUrl ?? "/favicon.ico"}
                  alt="파비콘 미리보기"
                />
              </div>
              <div className="admin-favicon-controls">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={handleFaviconChange}
                />
                {faviconFileName ? (
                  <span className="admin-banner-filename">
                    {faviconFileName}
                  </span>
                ) : null}
                <span className="admin-field-hint">
                  이미지를 선택하면 정사각형(1:1)으로 자릅니다.
                  192×192, 512×512 PWA 아이콘과 안전 영역을 확보한
                  마스커블 아이콘을 서버에서 각각 생성합니다.
                </span>
                {faviconPreview ||
                faviconUrl ||
                favicon192Url ||
                faviconMaskableUrl ? (
                  <button
                    type="button"
                    className="admin-button"
                    onClick={resetFavicon}
                  >
                    기본 파비콘 사용
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          <div className="admin-field">
            <span>인덱스 내용</span>
            <RichTextEditor
              value={content}
              onChange={setContent}
              placeholder="메인 인덱스에 표시할 내용을 입력해주세요."
              uploadUrl="/api/index-page/upload"
              onNotice={setNotice}
              enableFontSize
              enableHighlight
            />
          </div>

          <div className="admin-field">
            <span>카피라이트 이름</span>
            <input
              type="text"
              value={copyrightName}
              onChange={(event) => setCopyrightName(event.target.value)}
              placeholder="저작권 표시에 사용할 이름"
              maxLength={120}
            />
            <small className="admin-field-hint">
              비워두면 이름 없이 저작권 문구가 표시됩니다.
            </small>
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

      {cropRequest ? (
        <ImageCropModal
          imageSrc={cropRequest.src}
          fileName={cropRequest.fileName}
          stages={[FAVICON_CROP_STAGE]}
          onClose={closeCropModal}
          onComplete={handleFaviconCropComplete}
        />
      ) : null}
    </div>
  );
}
