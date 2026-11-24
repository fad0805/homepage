"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { AdminNavbar } from "@/components/admin-navbar";
import { FloatingSearch } from "@/components/floating-search";
import { FooterShortcut } from "@/components/footer-shortcut";
import { Navbar } from "@/components/navbar";
import { ThemeToggle } from "@/components/theme-toggle";
import type {
  ColorThemeKey,
  LayoutKey,
  SidePosition,
} from "@/config/appearance";
import {
  clearAppearancePreview,
  useAppearancePreview,
} from "@/lib/appearance-preview";
import {
  applyColorTheme,
  type ColorOverrides,
} from "@/lib/color-theme";

interface SiteShellProps {
  layoutKey: LayoutKey;
  sidePosition: SidePosition;
  colorTheme: ColorThemeKey;
  colorOverrides: ColorOverrides;
  siteTitle: string;
  siteSubtitle: string;
  copyrightName: string;
  children: ReactNode;
}

const RIGHT_HOVER_OFFSET = 40;
const RIGHT_HOVER_MIN_ZONE = 24;

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "summary",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function getFocusableElements(container: HTMLElement | null) {
  if (!container) return [];

  return Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter(
    (element) =>
      !element.hasAttribute("disabled") &&
      element.getClientRects().length > 0,
  );
}

function SiteTitle({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div id="title">
      <Link href="/">
        <span className="title__text">{title}</span>
        <span className="title__caption">{subtitle}</span>
      </Link>
    </div>
  );
}

export function SiteShell({
  layoutKey,
  sidePosition,
  colorTheme,
  colorOverrides,
  siteTitle,
  siteSubtitle,
  copyrightName,
  children,
}: SiteShellProps) {
  const pathname = usePathname();
  const preview = useAppearancePreview();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerPinned, setDrawerPinned] = useState(false);
  const [sideMenuOpen, setSideMenuOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const drawerTriggerRef = useRef<HTMLButtonElement>(null);
  const drawerReturnFocusRef = useRef<HTMLElement | null>(null);
  const topbarRef = useRef<HTMLElement>(null);
  const rightHoverArmedRef = useRef(true);

  const activeLayoutKey = preview?.layoutKey ?? layoutKey;
  const activeSidePosition = preview?.sidePosition ?? sidePosition;
  const activeColorTheme = preview?.colorTheme ?? colorTheme;
  const activeColorOverrides = preview?.colorOverrides ?? colorOverrides;
  const isSide = activeLayoutKey === "side";
  const isBottom = activeLayoutKey === "collapsible";
  const isDrawer = activeLayoutKey === "drawer";
  const isAdminRoute = pathname.startsWith("/admin");
  const sideRight = isSide && activeSidePosition === "right";

  const openDrawer = useCallback(
    (pinned: boolean, returnFocus?: HTMLElement | null) => {
      drawerReturnFocusRef.current = returnFocus ?? null;
      setDrawerOpen(true);
      setDrawerPinned(pinned);

      if (returnFocus) {
        window.requestAnimationFrame(() => {
          const first = getFocusableElements(drawerRef.current)[0];
          (first ?? drawerRef.current)?.focus();
        });
      }
    },
    [],
  );

  const closeDrawer = useCallback((restoreFocus: boolean) => {
    setDrawerOpen(false);
    setDrawerPinned(false);
    rightHoverArmedRef.current = false;

    const returnFocus = drawerReturnFocusRef.current;
    drawerReturnFocusRef.current = null;

    if (restoreFocus) {
      window.requestAnimationFrame(() => {
        if (returnFocus?.isConnected) returnFocus.focus();
      });
    }
  }, []);

  useEffect(() => {
    closeDrawer(false);
    setSideMenuOpen(false);
  }, [closeDrawer, pathname]);

  useEffect(() => {
    if (!drawerOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;

      if (event.key === "Escape") {
        event.preventDefault();
        closeDrawer(true);
        return;
      }

      if (event.key !== "Tab") return;

      const drawer = drawerRef.current;
      if (!drawer) return;

      const focusable = getFocusableElements(drawer);
      if (focusable.length === 0) {
        event.preventDefault();
        drawer.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;

      const active = document.activeElement;
      const outside =
        !active || active === drawer || !drawer.contains(active);

      if (event.shiftKey) {
        if (active === first || outside) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last || outside) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeDrawer, drawerOpen]);

  useEffect(() => {
    if (!isSide) setSideMenuOpen(false);
  }, [isSide]);

  useEffect(() => {
    document.documentElement.dataset.appearance = activeLayoutKey;
  }, [activeLayoutKey]);

  useEffect(() => {
    applyColorTheme(
      document.documentElement,
      activeColorTheme,
      activeColorOverrides,
    );
  }, [activeColorTheme, activeColorOverrides]);

  useEffect(() => {
    if (!pathname.startsWith("/admin/appearance")) {
      clearAppearancePreview();
    }
  }, [pathname]);

  useEffect(() => {
    if (!isDrawer || drawerOpen) return;

    const handleMouseMove = (event: MouseEvent) => {
      const topbar = topbarRef.current;
      if (!topbar) return;

      const triggerStart = Math.min(
        topbar.getBoundingClientRect().right + RIGHT_HOVER_OFFSET,
        window.innerWidth - RIGHT_HOVER_MIN_ZONE,
      );
      if (event.clientX < triggerStart) {
        rightHoverArmedRef.current = true;
        return;
      }

      if (!rightHoverArmedRef.current) return;
      openDrawer(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [isDrawer, drawerOpen, openDrawer]);

  useEffect(() => {
    if (!drawerOpen || drawerPinned) return;

    const handleMouseMove = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Node && drawerRef.current?.contains(target)) {
        return;
      }

      const topbar = topbarRef.current;
      if (topbar) {
        const triggerStart = Math.min(
          topbar.getBoundingClientRect().right + RIGHT_HOVER_OFFSET,
          window.innerWidth - RIGHT_HOVER_MIN_ZONE,
        );
        if (event.clientX >= triggerStart) return;
      }

      closeDrawer(false);
    };
    const timer = window.setTimeout(() => {
      window.addEventListener("mousemove", handleMouseMove);
    }, 120);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, [closeDrawer, drawerOpen, drawerPinned]);

  const classes = [
    "site-layout",
    `site-layout--${activeLayoutKey}`,
    sideRight ? "is-side-right" : "",
    drawerOpen ? "is-menu-open" : "",
    isSide && sideMenuOpen ? "is-side-menu-open" : "",
  ]
    .filter(Boolean)
    .join(" ");

  if (isSide) {
    return (
      <div id="container" className={classes}>
        <aside className="site-sidebar">
          <div className="site-sidebar__header">
            <SiteTitle title={siteTitle} subtitle={siteSubtitle} />
            <button
              type="button"
              className="site-menu-toggle site-sidebar-menu-toggle"
              onClick={() => setSideMenuOpen((open) => !open)}
              aria-label={sideMenuOpen ? "메뉴 닫기" : "메뉴 열기"}
              aria-expanded={sideMenuOpen}
              aria-controls="navbar"
            >
              <span />
              <span />
              <span />
            </button>
          </div>
          <Navbar />
          <div className="site-sidebar__theme">
            <ThemeToggle variant="sidebar" />
            <FloatingSearch variant="sidebar" />
          </div>
        </aside>

        <div className="site-main-column">
          <main>
            <div id="content">{children}</div>
          </main>
          <footer>
            <FooterShortcut copyrightName={copyrightName} />
          </footer>
        </div>
      </div>
    );
  }

  if (isBottom) {
    return (
      <div id="container" className={classes}>
        <header className="site-bottom-header">
          <SiteTitle title={siteTitle} subtitle={siteSubtitle} />
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
                <FooterShortcut copyrightName={copyrightName} />
              </footer>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div id="container" className={classes}>
      <header
        ref={isDrawer ? topbarRef : undefined}
        className={isDrawer ? "site-topbar" : undefined}
      >
        <SiteTitle title={siteTitle} subtitle={siteSubtitle} />
        {isDrawer ? (
          <button
            ref={drawerTriggerRef}
            type="button"
            className="site-menu-toggle"
            onClick={() =>
              openDrawer(true, drawerTriggerRef.current)
            }
            aria-label="메뉴 열기"
            aria-expanded={drawerOpen}
            aria-haspopup="dialog"
            aria-controls="site-drawer"
            tabIndex={drawerOpen ? -1 : undefined}
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
          onClick={() => closeDrawer(true)}
          aria-hidden={!drawerOpen}
          inert={!drawerOpen}
        >
          <div
            ref={drawerRef}
            id="site-drawer"
            className="site-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="site-drawer-title"
            tabIndex={-1}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="site-drawer__header">
              <span id="site-drawer-title">메뉴</span>
              <button
                type="button"
                onClick={() => closeDrawer(true)}
                aria-label="메뉴 닫기"
              >
                ×
              </button>
            </div>
            {isAdminRoute ? (
              <>
                <div className="site-drawer__section-label">관리자</div>
                <AdminNavbar
                  id="drawer-admin-navbar"
                  showGroupLabels
                />
                <details className="site-drawer__site-menu">
                  <summary>사이트 메뉴</summary>
                  <Navbar />
                </details>
              </>
            ) : (
              <Navbar />
            )}
            <div className="site-drawer__theme">
              <FloatingSearch variant="drawer" />
              <ThemeToggle variant="drawer" />
            </div>
          </div>
        </div>
      ) : null}

      <main>
        <div id="content">{children}</div>
      </main>
      <footer>
        <FooterShortcut copyrightName={copyrightName} />
      </footer>
    </div>
  );
}
