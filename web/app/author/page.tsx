import {
  profileToHtml,
  type AuthorProfile,
} from "@/config/author";
import { serverApiFetch } from "@/lib/server-api";

import "@/public/styles/author.scss";

export const dynamic = "force-dynamic";

export default async function Author() {
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

  return (
    <div id="author">
      {profiles.map((profile, index) => {
        const profileHtml = profileToHtml(profile.profile);
        const subtitle = profile.subtitle?.trim() ?? "";

        return (
          <article
            className="author-profile"
            key={profile.id ?? `${profile.title}-${index}`}
          >
            <section className="author-hero">
              <p className="author-eyebrow">ABOUT THE AUTHOR</p>
              <h1 className="author-title">{profile.title}</h1>
              {subtitle ? <p className="author-tagline">{subtitle}</p> : null}
            </section>

            <section className="author-body">
              <div
                className="author-copy"
                dangerouslySetInnerHTML={{ __html: profileHtml }}
              />
            </section>
          </article>
        );
      })}
    </div>
  );
}
