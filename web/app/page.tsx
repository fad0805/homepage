"use client";

import Link from "next/link";

import navigation from "@/config/navigation";

import "@/public/styles/main.scss";

export default function Home() {
  const menuItems = navigation.main.items;
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
            {menuItems.map((item) => (
              <Link
                key={item.href}
                className={`hero__button${
                  item.href === "/characters"
                    ? " hero__button--primary"
                    : ""
                }`}
                href={item.href}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
