import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { formatDate, formatDateTime } from "@/lib/datetime";
import type { IllustrationDetailItem } from "@/lib/illustration-types";
import { ServerApiError, serverApiFetch } from "@/lib/server-api";
import { getCurrentUser } from "@/lib/server-auth";

import { IllustrationDetailGallery } from "./detail-gallery";
import { IllustrationViewTracker } from "./view-tracker";

import "@/public/styles/illustrations.scss";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    noimageindex: true,
    nosnippet: true,
  },
};

function parseId(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export default async function IllustrationDetailPage({
  params,
}: {
  params: Promise<{ illustrationId: string }>;
}) {
  const { illustrationId } = await params;
  const id = parseId(illustrationId);
  const currentUser = await getCurrentUser();

  let illustration: IllustrationDetailItem | null = null;
  let errorMessage = "삽화를 찾을 수 없습니다.";

  if (id !== null) {
    try {
      illustration = await serverApiFetch<IllustrationDetailItem>(
        `/illustrations/${id}`,
        { auth: true, tags: ["illustrations"] },
      );
    } catch (error) {
      if (error instanceof ServerApiError && error.status === 404) {
        errorMessage = "삽화를 찾을 수 없습니다.";
      } else {
        console.error(error);
        errorMessage = "삽화를 불러오지 못했습니다.";
      }
    }
  }

  if (illustration?.locked) {
    redirect(
      `/gallery/unlock?next=${encodeURIComponent(
        `/illustrations/${illustrationId}`,
      )}`,
    );
  }

  if (!illustration) {
    return (
      <div id="illustrations-page" className="illustration-detail-page">
        <div className="illustrations-state">
          <p>{errorMessage}</p>
          <Link href="/illustrations">← 삽화 목록으로</Link>
        </div>
      </div>
    );
  }

  const title = illustration.title;

  return (
    <div id="illustrations-page" className="illustration-detail-page">
      <IllustrationViewTracker illustrationId={illustration.id} />
      <div className="illustration-detail__actions">
        <Link className="illustration-detail__back" href="/illustrations">
          ← 삽화 목록
        </Link>
        {currentUser ? (
          <Link
            className="illustration-detail__edit"
            href={`/admin/illustrations?edit=${illustration.id}`}
          >
            수정
          </Link>
        ) : null}
      </div>

      <article className="illustration-detail">
        <IllustrationDetailGallery images={illustration.images} />

        <header className="illustration-detail__header">
          <div>
            <h1>{title}</h1>
            {illustration.description ? (
              <p className="illustration-detail__description">
                {illustration.description}
              </p>
            ) : null}
            {illustration.tags?.length ? (
              <div className="tag-list illustration-detail__tags">
                {illustration.tags.map((tag) => (
                  <Link
                    className="tag is-clickable"
                    href={`/search?q=${encodeURIComponent(tag)}`}
                    key={tag}
                  >
                    {tag}
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
          <dl className="illustration-detail__meta">
            <div>
              <dt>촬영 일자</dt>
              <dd>{formatDate(illustration.taken_at)}</dd>
            </div>
            <div>
              <dt>업로드</dt>
              <dd>{formatDateTime(illustration.created_at)}</dd>
            </div>
          </dl>
        </header>
      </article>
    </div>
  );
}
