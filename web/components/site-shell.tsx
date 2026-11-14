"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useEffect,
  useRef,
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
  const [drawerPinned, setDrawerPinned] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);

  const isSide = layoutKey === "side";
  const isBottom = layoutKey === "collapsible";
  const isDrawer = layoutKey === "drawer";
  const sideRight = isSide && sidePosition === "right";

  const closeDrawer = () => {
    setDrawerOpen(false);
    setDrawerPinned(false);
  };

  useEffect(() => {
    setDrawerOpen(false);
    setDrawerPinned(false);
  }, [pathname]);

  useEffect(() => {
    if (!drawerOpen || drawerPinned) return;

    const handleMouseMove = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Node && drawerRef.current?.contains(target)) {
        return;
      }
      setDrawerOpen(false);
      setDrawerPinned(false);
    };
    const timer = window.setTimeout(() => {
      window.addEventListener("mousemove", handleMouseMove);
    }, 120);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, [drawerOpen, drawerPinned]);

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
          <div id="content" className="site-bottom-content">
            <div className="site-bottom-content__scroll">
              {children}
            </div>
            <div className="site-bottom-dock">
              <div className="site-bottom-bar">
                <Navbar />
              </div>
              <footer className="site-bottom-footer">
                <FooterShortcut />
              </footer>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div id="container" className={classes}>
      <header className={isDrawer ? "site-topbar" : undefined}>
        <SiteTitle />
        {isDrawer ? (
          <button
            type="button"
            className="site-menu-toggle"
            onClick={() => {
              setDrawerOpen(true);
              setDrawerPinned(true);
            }}
            onMouseEnter={() => {
              setDrawerOpen(true);
              setDrawerPinned(false);
            }}
            aria-label="메뉴 열기"
            aria-expanded={drawerOpen}
          >
            <span />
            <span />
            <span />
          </button>
        ) : null}
        {!isDrawer ? <Navbar /> : null}
      </header>

      {isDrawer ? (
        <div
          className={`site-drawer-backdrop${drawerOpen ? " is-open" : ""}`}
          onClick={closeDrawer}
          aria-hidden={!drawerOpen}
        >
          <div
            ref={drawerRef}
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
                onClick={closeDrawer}
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
