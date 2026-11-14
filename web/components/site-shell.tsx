"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { FooterShortcut } from "@/components/footer-shortcut";
import { Navbar } from "@/components/navbar";
import type {
  LayoutKey,
  SidePosition,
} from "@/config/appearance";

interface SiteShellProps {
  layoutKey: LayoutKey;
  sidePosition: SidePosition;
  children: ReactNode;
}

function SiteTitle() {
  return (
    <div id="title">
      <Link href="/">
        <span className="title__text">어디에도 없는 섬</span>
        <span className="title__caption">Missing Island</span>
      </Link>
    </div>
  );
}

export function SiteShell({
  layoutKey,
  sidePosition,
  children,
}: SiteShellProps) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const isSide = layoutKey === "side";
  const isBottom = layoutKey === "collapsible";
  const isDrawer = layoutKey === "drawer";
  const sideRight = isSide && sidePosition === "right";

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  const classes = [
    "site-layout",
    `site-layout--${layoutKey}`,
    sideRight ? "is-side-right" : "",
    drawerOpen ? "is-menu-open" : "",
  ]
    .filter(Boolean)
    .join(" ");

  if (isSide) {
    return (
      <div id="container" className={classes}>
        <aside className="site-sidebar">
          <SiteTitle />
          <Navbar />
        </aside>

        <div className="site-main-column">
          <main>
            <div id="content">{children}</div>
          </main>
          <footer>
            <FooterShortcut />
          </footer>
        </div>
      </div>
    );
  }

  if (isBottom) {
    return (
      <div id="container" className={classes}>
        <header className="site-bottom-header">
          <SiteTitle />
        </header>

        <main>
          <div id="content">{children}</div>
        </main>
        <footer>
          <FooterShortcut />
        </footer>

        <div className="site-bottom-bar">
          <Navbar />
        </div>
      </div>
    );
  }

  return (
    <div id="container" className={classes}>
      <header className={isDrawer ? "site-topbar" : undefined}>
        {isDrawer ? (
          <button
            type="button"
            className="site-menu-toggle"
            onClick={() => setDrawerOpen(true)}
            aria-label="메뉴 열기"
            aria-expanded={drawerOpen}
          >
            <span />
            <span />
            <span />
          </button>
        ) : null}
        <SiteTitle />
        {!isDrawer ? <Navbar /> : null}
      </header>

      {isDrawer && drawerOpen ? (
        <div
          className="site-drawer-backdrop"
          onClick={() => setDrawerOpen(false)}
        >
          <div
            className="site-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="메뉴"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="site-drawer__header">
              <span>메뉴</span>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="메뉴 닫기"
              >
                ×
              </button>
            </div>
            <Navbar />
          </div>
        </div>
      ) : null}

      <main>
        <div id="content">{children}</div>
      </main>
      <footer>
        <FooterShortcut />
      </footer>
    </div>
  );
}
