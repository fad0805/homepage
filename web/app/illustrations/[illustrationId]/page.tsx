import Link from "next/link";

import { formatDate, formatDateTime } from "@/lib/datetime";
import type { IllustrationDetailItem } from "@/lib/illustration-types";
import { ServerApiError, serverApiFetch } from "@/lib/server-api";

import { IllustrationDetailGallery } from "./detail-gallery";

import "@/public/styles/illustrations.scss";

export const dynamic = "force-dynamic";

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

  let illustration: IllustrationDetailItem | null = null;
  let errorMessage = "삽화를 찾을 수 없습니다.";

  if (id !== null) {
    try {
      illustration = await serverApiFetch<IllustrationDetailItem>(
        `/illustrations/${id}`,
        { tags: ["illustrations"] },
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
      <Link className="illustration-detail__back" href="/illustrations">
        ← 삽화 목록
      </Link>

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
