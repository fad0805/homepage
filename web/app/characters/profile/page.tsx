"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { toRichTextHtml } from "@/lib/rich-text";

import "@/public/styles/character-profile.scss";

interface CharacterLocation {
  id: number;
  name: string;
  description: string | null;
  order: number;
}

interface DollInfo {
  id: number;
  company: string;
  name: string;
  size: string | null;
  skin_tone: string | null;
}

interface RelatedCharacter {
  id: number;
  name: string;
  thumbnail: string | null;
  layout: string | null;
  visible: boolean | null;
  is_my_doll: boolean | null;
}

interface CharacterRelationship {
  id: number;
  relationship_type: string;
  character: RelatedCharacter;
}

interface CharacterDetail {
  id: number;
  name: string;
  thumbnail: string | null;
  detail_image: string | null;
  alt_name: string | null;
  nickname: string | null;
  age: string | null;
  serif: string | null;
  description: string | null;
  comming_day: string | null;
  visible: boolean;
  is_my_doll: boolean;
  location: CharacterLocation | null;
  head_doll: DollInfo | null;
  body_doll: DollInfo | null;
  relationships: CharacterRelationship[] | null;
}

function isHexColor(value: string | null) {
  return !!value && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value);
}

function SkinTone({ value }: { value: string | null }) {
  if (!value) {
    return <>-</>;
  }

  return (
    <>
      {isHexColor(value) ? (
        <span
          className="character-profile__swatch"
          style={{ background: value }}
          aria-hidden="true"
        />
      ) : null}
      {value}
    </>
  );
}

function DollCard({ title, doll }: { title: string; doll: DollInfo | null }) {
  return (
    <article className="character-profile__part">
      <h3>{title}</h3>
      {doll ? (
        <dl>
          <dt>회사명</dt>
          <dd>{doll.company || "-"}</dd>
          <dt>이름</dt>
          <dd>{doll.name || "-"}</dd>
          <dt>스킨색</dt>
          <dd>
            <SkinTone value={doll.skin_tone} />
          </dd>
        </dl>
      ) : (
        <p className="character-profile__empty">등록된 정보가 없습니다.</p>
      )}
    </article>
  );
}

function CharacterProfileContent() {
  const searchParams = useSearchParams();
  const characterId = searchParams.get("character");

  const [character, setCharacter] = useState<CharacterDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!characterId) {
      setLoading(false);
      setError("등장인물을 찾을 수 없습니다.");
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/characters/${encodeURIComponent(characterId)}`)
      .then((response) => {
        if (response.status === 404) {
          throw new Error("등장인물을 찾을 수 없습니다.");
        }
        if (!response.ok) {
          throw new Error("등장인물을 불러오지 못했습니다.");
        }
        return response.json() as Promise<CharacterDetail>;
      })
      .then((data) => {
        if (cancelled) return;
        if (data.visible === false || data.is_my_doll !== true) {
          setError("등장인물을 찾을 수 없습니다.");
          return;
        }
        setCharacter(data);
      })
      .catch((reason) => {
        const isNotFound =
          reason instanceof Error &&
          reason.message === "등장인물을 찾을 수 없습니다.";
        if (!isNotFound) {
          console.error(reason);
        }
        if (!cancelled) {
          setError(
            reason instanceof Error
              ? reason.message
              : "등장인물을 불러오지 못했습니다.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [characterId]);

  if (loading) {
    return (
      <div id="character-profile">
        <p className="character-profile__state">불러오는 중...</p>
      </div>
    );
  }

  if (error || !character) {
    return (
      <div id="character-profile">
        <div className="character-profile__state">
          <p>{error ?? "등장인물을 찾을 수 없습니다."}</p>
          <Link href="/characters">← 등장인물 목록으로</Link>
        </div>
      </div>
    );
  }

  const subName = [character.alt_name, character.nickname]
    .filter(Boolean)
    .join(" · ");
  const displayImage = character.detail_image ?? character.thumbnail;
  const visibleRelationships = (character.relationships ?? []).filter(
    (relationship) => relationship.character.visible !== false,
  );

  return (
    <div id="character-profile">
      <Link className="character-profile__back" href="/characters">
        ← 등장인물 목록
      </Link>

      <section className="character-profile__hero">
        <div
          className={`character-profile__image${displayImage ? "" : " is-empty"}`}
        >
          {displayImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={displayImage} alt={character.name} />
          ) : (
            <span>이미지 없음</span>
          )}
        </div>

        <div className="character-profile__summary">
          <h1 className="character-profile__name">{character.name}</h1>
          {subName ? (
            <p className="character-profile__subname">{subName}</p>
          ) : null}

          <div className="character-profile__meta">
            {character.location ? (
              <span>위치: {character.location.name}</span>
            ) : null}
            {character.age ? <span>나이: {character.age}</span> : null}
            {character.comming_day ? (
              <span>등장일: {character.comming_day.slice(0, 10)}</span>
            ) : null}
          </div>

          {character.is_my_doll ? (
            <div className="character-profile__badges">
              <span className="character-profile__badge">내 인형</span>
            </div>
          ) : null}

          {character.serif ? (
            <blockquote className="character-profile__quote">
              {character.serif}
            </blockquote>
          ) : null}
        </div>
      </section>

      {character.description ? (
        <section className="character-profile__section">
          <h2>소개</h2>
          <div
            className="character-profile__description"
            dangerouslySetInnerHTML={{
              __html: toRichTextHtml(character.description),
            }}
          />
        </section>
      ) : null}

      {visibleRelationships.length > 0 ? (
        <section className="character-profile__section">
          <h2>관계 인물</h2>
          <div className="character-profile__relations">
            {visibleRelationships.map((relationship) => {
              const canOpenProfile =
                relationship.character.is_my_doll === true;
              const content = (
                <>
                  <div
                    className={`character-profile__relation-banner${
                      relationship.character.thumbnail ? "" : " is-empty"
                    }`}
                  >
                    {relationship.relationship_type ? (
                      <span className="character-profile__relation-type">
                        {relationship.relationship_type}
                      </span>
                    ) : null}
                    <p>{relationship.character.name}</p>
                    {relationship.character.thumbnail ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={relationship.character.thumbnail}
                        alt={relationship.character.name}
                      />
                    ) : null}
                  </div>
                </>
              );

              return canOpenProfile ? (
                <Link
                  key={relationship.id}
                  className="character-profile__relation"
                  href={`/characters/profile?character=${relationship.character.id}`}
                >
                  {content}
                </Link>
              ) : (
                <div
                  key={relationship.id}
                  className="character-profile__relation"
                  aria-disabled="true"
                >
                  {content}
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="character-profile__section">
        <h2>인형 정보</h2>
        <div className="character-profile__parts">
          <DollCard title="헤드" doll={character.head_doll} />
          <DollCard title="바디" doll={character.body_doll} />
        </div>
      </section>
    </div>
  );
}

export default function CharacterProfile() {
  return (
    <Suspense
      fallback={
        <div id="character-profile">
          <p className="character-profile__state">불러오는 중...</p>
        </div>
      }
    >
      <CharacterProfileContent />
    </Suspense>
  );
}
