"use client";

import { useEffect, useState } from "react";

import {
  profileToHtml,
  type AuthorProfile,
} from "@/config/author";

import "@/public/styles/author.scss";

export default function Author() {
  const [profile, setProfile] = useState<AuthorProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/profiles")
      .then((response) => {
        if (!response.ok) throw new Error("프로필을 불러오지 못했습니다.");
        return response.json() as Promise<AuthorProfile[]>;
      })
      .then((profiles) => {
        if (!cancelled) {
          setProfile(profiles[0] ?? null);
        }
      })
      .catch((error) => {
        console.error(error);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div id="author">
        <p className="author-state">불러오는 중...</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div id="author">
        <p className="author-state">작가 소개가 아직 등록되지 않았습니다.</p>
      </div>
    );
  }

  const profileHtml = profileToHtml(profile.profile);
  const subtitle = profile.subtitle?.trim() ?? "";

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
      </section>
    </div>
  );
}
