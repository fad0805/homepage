import Link from "next/link";

import { formatDate } from "@/lib/datetime";
import type { IllustrationItem } from "@/lib/illustration-types";
import { serverApiFetch } from "@/lib/server-api";

import "@/public/styles/illustrations.scss";

export const dynamic = "force-dynamic";

export default async function IllustrationsPage() {
  let illustrations: IllustrationItem[] = [];
  let failed = false;

  try {
    illustrations = await serverApiFetch<IllustrationItem[]>(
      "/illustrations",
      { tags: ["illustrations"] },
    );
  } catch (error) {
    console.error(error);
    failed = true;
  }

  return (
    <div id="illustrations-page">
      <header className="illustrations-header">
        <p className="illustrations-eyebrow">ILLUSTRATIONS</p>
        <h1>삽화</h1>
      </header>

      {failed ? (
        <p className="illustrations-state">삽화를 불러오지 못했습니다.</p>
      ) : illustrations.length === 0 ? (
        <p className="illustrations-state">등록된 삽화가 없습니다.</p>
      ) : (
        <div className="illustrations-grid">
          {illustrations.map((item) => (
            <Link
              className="illustration-card"
              href={`/illustrations/${item.id}`}
              key={item.id}
            >
              <div className="illustration-card__thumb">
                {item.representative_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.representative_url}
                    alt={item.title}
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <span className="illustration-card__empty">
                    이미지 없음
                  </span>
                )}
                {item.image_count > 1 ? (
                  <span className="illustration-card__count">
                    {item.image_count}장
                  </span>
                ) : null}
              </div>
              <div className="illustration-card__body">
                <p className="illustration-card__title">{item.title}</p>
                {item.description ? (
                  <p className="illustration-card__description">
                    {item.description}
                  </p>
                ) : null}
                <p className="illustration-card__meta">
                  촬영 {formatDate(item.taken_at)}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
