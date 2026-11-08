"use client";

import Link from "next/link";

import "@/public/styles/main.scss";

const indexItems = [
  {
    href: "/author",
    label: "작가소개",
    description: "섬을 그리는 사람",
  },
  {
    href: "/characters",
    label: "등장인물",
    description: "섬에 머무는 이름들",
  },
  {
    href: "/books",
    label: "목차",
    description: "이야기의 순서",
  },
  {
    href: "/links",
    label: "놀러가기",
    description: "섬 밖의 문",
  },
];

export default function Home() {
  return (
    <div id="main">
      <section className="hero">
        <div className="hero__copy">
          <p className="hero__eyebrow">Missing Island · Story Archive</p>

          <h1 className="hero__title">
            당신은 어떤
            <br />
            <span className="hero__title-accent">이야기</span>를
            <br />
            가지고 있나요?
          </h1>

          <p className="hero__lead">
            어서오세요.
            <br />
            이 곳은 어디에나 있지만, 어디에도 없는 섬.
          </p>

          <div className="hero__actions">
            <Link
              className="hero__button hero__button--primary"
              href="/characters"
            >
              등장인물 만나기
            </Link>
            <Link className="hero__button" href="/links">
              놀러가기
            </Link>
          </div>
        </div>
      </section>

      <section className="island-index" aria-labelledby="island-index-title">
        <div className="island-index__heading">
          <p className="island-index__eyebrow">Index</p>
          <h2 id="island-index-title">섬의 지도</h2>
        </div>

        <div className="island-index__grid">
          {indexItems.map((item, index) => (
            <Link
              key={item.href}
              href={item.href}
              className="island-index__card"
            >
              <span className="island-index__number">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="island-index__label">{item.label}</span>
              <span className="island-index__description">
                {item.description}
              </span>
              <span className="island-index__arrow" aria-hidden="true">
                ↗
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
