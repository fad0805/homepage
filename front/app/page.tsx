"use client";
import { Image, Link } from "@nextui-org/react";

import '@/public/styles/links.scss';

export default function Home() {
  return (
    <div className="grid grid-rows-[20px_1fr_20px] items-center justify-items-center p-8 pb-20 gap-16 sm:p-20 font-[family-name:var(--font-gown-dodum)]">
      <header className="row-start-1 flex gap-4 items-center justify-center">
        <p className="page-title">Links</p>
      </header>
      <main className="flex flex-col gap-8 row-start-2 items-center">
        <div className="links-header">
          <div className="links-section"><p>어디에도 없는 섬</p></div>
          <div className="links-contents">
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
        </div>
        <div className="links-body">
          <div className="links-section"><p>방랑자들</p></div>
          <div className="links-contents">
            <Link
              className="links-banner"
              href="https://tadongsa.mycafe24.com/"
              target="_blank"
            >
              <Image
                src="https://objectstorage.ap-seoul-1.oraclecloud.com/n/cnftfbml9zxa/b/bucket-20230907-0739/o/misskey/4c03d61f-a991-4058-ab70-97ea1a97fb66.gif"
                alt="감나무님"
                radius="none"
              />
              <p>사이바 포스트잇</p>
            </Link>
            <Link
              className="links-banner"
              href="https://zze.kr"
              target="_blank"
            >
              <Image
                src="https://zze.kr/img/J_banner.png"
                alt="네비비님"
                radius="none"
              />
              <p>쩨의 스윗홈</p>
            </Link>
            <Link
              className="links-banner"
              href="https://lemo.noxexcelsis.today/"
              target="_blank"
            >
              <Image
                src="https://lemo.noxexcelsis.today/banner200.png"
                alt="겨울새우님"
                radius="none"
              />
              <p>두더지굴 속 새우수조</p>
            </Link>
            <Link
              className="links-banner"
              href="https://blog.daydream.ink/jaeyeondiary/"
              target="_blank"
            >
              <Image
                src="https://for.stella.place/D1/639fc0c9-7e7d-421f-be58-5a60d68c189e.png"
                alt="재연님"
                radius="none"
              />
              <p>도원</p>
            </Link>
            <Link
              className="links-banner"
              href="https://zerosquare.me/ananaes"
              target="_blank"
            >
              <Image
                src="https://i.imgur.com/8I2VxQR.png"
                alt="내스님"
                radius="none"
              />
              <p>ANANAES</p>
            </Link>
          </div>
        </div>
      </main>
      <footer className="row-start-3 flex gap-6 flex-wrap items-center justify-center">
      </footer>
    </div>
  );
}