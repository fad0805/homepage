import Link from "next/link";

import { AuthorProfileView } from "@/components/author-profile-view";
import type { AuthorProfile } from "@/config/author";
import { serverApiFetch } from "@/lib/server-api";

import "@/public/styles/author.scss";

export const dynamic = "force-dynamic";

interface AuthorPageProps {
  searchParams: Promise<{ profile?: string | string[] }>;
}

export default async function Author({ searchParams }: AuthorPageProps) {
  let profiles: AuthorProfile[] = [];
  let failed = false;

  try {
    profiles = await serverApiFetch<AuthorProfile[]>("/profiles", {
      tags: ["profiles"],
    });
  } catch (error) {
    console.error(error);
    failed = true;
  }

  if (failed) {
    return (
      <div id="author">
        <p className="author-state">작가 소개를 불러오지 못했습니다.</p>
      </div>
    );
  }

  if (profiles.length === 0) {
    return (
      <div id="author">
        <p className="author-state">작가 소개가 아직 등록되지 않았습니다.</p>
      </div>
    );
  }

  const params = await searchParams;
  const rawProfileId = Array.isArray(params.profile)
    ? params.profile[0]
    : params.profile;
  const selectedProfileId = rawProfileId
    ? Number.parseInt(rawProfileId, 10)
    : null;
  const selectedProfile =
    selectedProfileId !== null && Number.isInteger(selectedProfileId)
      ? profiles.find((profile) => profile.id === selectedProfileId) ?? null
      : null;

  if (rawProfileId) {
    return (
      <div id="author">
        <div className="author-detail">
          <Link className="author-back" href="/author">
            <span aria-hidden="true">←</span> 작가 목록
          </Link>
          {selectedProfile ? (
            <AuthorProfileView profile={selectedProfile} />
          ) : (
            <p className="author-state">작가 소개를 찾을 수 없습니다.</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div id="author">
      <div className="author-directory">
        {profiles.map((profile, index) => {
          const nickname =
            profile.nickname?.trim() ||
            profile.owner?.trim() ||
            profile.title?.trim() ||
            "작가";
          const href =
            profile.id != null ? `/author?profile=${profile.id}` : null;
          const card = (
            <span className="author-card__name">{nickname}</span>
          );

          return href ? (
            <Link
              className="author-card"
              href={href}
              key={profile.id}
              aria-label={`${nickname} 작가 소개 보기`}
            >
              {card}
            </Link>
          ) : (
            <article
              className="author-card"
              key={`${nickname}-${index}`}
            >
              {card}
            </article>
          );
        })}
      </div>
    </div>
  );
}
