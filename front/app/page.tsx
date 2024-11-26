"use client";
import { Image, Link } from "@nextui-org/react";

import './styles/links.scss';

export default function Home() {
  return (
    <div className="grid grid-rows-[20px_1fr_20px] items-center justify-items-center min-h-screen p-8 pb-20 gap-16 sm:p-20 font-[family-name:var(--font-gown-dodum)]">
      <header className="row-start-1 flex gap-4 items-center justify-center">
        <p className="page-title">Links</p>
      </header>
      <main className="flex flex-col gap-8 row-start-2 items-center sm:items-start">
        <div className="links-header">
          <div className="links-section"><p>어디에도 없는 섬</p></div>
          <Link
            className="links-banner"
            href="https://blog.daydream.ink/siarte/"
            target="_blank"
          >
            <Image
              src="/banner.webp"
              alt="Island banner"
              radius="none"
            />
            <p>꿈 꾸는 어린 용</p>
          </Link>
        </div>
        <div className="links-body">
        <div className="links-section"><p>방랑자들</p></div>
          <Link
            className="links-banner"
            href="https://blog.daydream.ink/jaeyeondiary/"
            target="_blank"
          >
            <Image
              src="https://for.stella.place/D1/639fc0c9-7e7d-421f-be58-5a60d68c189e.png"
              alt="jaeyeon's diary"
              radius="none"
            />
            <p>도원</p>
          </Link>
        </div>
      </main>
      <footer className="row-start-3 flex gap-6 flex-wrap items-center justify-center">
        © Rimien Siarte. All rights reserved. No external use permitted.
      </footer>
    </div>
  );
}
