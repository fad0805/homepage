"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import {
  DEFAULT_AUTHOR_PROFILE,
  profileToHtml,
  type AuthorProfile,
} from "@/config/author";

import "@/public/styles/author.scss";

export default function Author() {
  const [profile, setProfile] = useState<AuthorProfile>(
    DEFAULT_AUTHOR_PROFILE,
  );

  useEffect(() => {
    let cancelled = false;

    fetch("/api/profiles")
      .then((response) => {
        if (!response.ok) throw new Error("프로필을 불러오지 못했습니다.");
        return response.json() as Promise<AuthorProfile[]>;
      })
      .then((profiles) => {
        if (!cancelled && profiles.length > 0) {
          setProfile(profiles[0]);
        }
      })
      .catch((error) => {
        console.error(error);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const profileHtml = profileToHtml(profile.profile);
  const subtitle =
    profile.subtitle === undefined || profile.subtitle === null
      ? DEFAULT_AUTHOR_PROFILE.subtitle
      : profile.subtitle.trim();

  return (
    <div id="author">
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

        <aside className="author-note">
          <span className="author-note__name">Rimien Siarte</span>
          <p className="author-note__role">작가 · 인형 제작</p>
          <Link className="author-note__link" href="/characters">
            등장인물 보기 →
          </Link>
        </aside>
      </section>
    </div>
  );
}
