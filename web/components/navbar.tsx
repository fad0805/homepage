"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { useAuth } from "@/components/auth-provider";
import { useHorizontalScrollFade } from "@/lib/use-horizontal-scroll-fade";

import "@/public/styles/navbar.scss";
import navigation from "@/config/navigation";

interface MenuItem {
    label: string;
    href: string;
    authOnly?: boolean;
    iconOnly?: boolean;
}

export const Navbar = () => {
    const currentPath = usePathname();
    const router = useRouter();
    const { isLoggedIn } = useAuth();
    const { ref, fadeClassName } = useHorizontalScrollFade<HTMLElement>();

    const menuItems = navigation.main.items.filter(
        (item: MenuItem) => !item.authOnly || isLoggedIn
    );

    return <nav id="navbar" ref={ref} className={fadeClassName || undefined}>
        { menuItems.map((item: MenuItem) => (
            <Link
                key={item.href}
                href={item.href}
                className={[
                    currentPath === item.href ? "active" : "",
                    item.iconOnly ? "navbar-icon-link" : "",
                ].filter(Boolean).join(" ")}
                title={item.iconOnly ? item.label : undefined}
                aria-label={item.iconOnly ? item.label : undefined}
                onClick={(event) => {
                    // Next.js treats a link to the current URL as a no-op.
                    // Refetch the server data on a second click while keeping
                    // the current client-side view state.
                    if (currentPath === item.href) {
                        event.preventDefault();
                        router.refresh();
                    }
                }}
            >{item.iconOnly ? (
                <svg
                    className="navbar-icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.1"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                >
                    <circle cx="10.8" cy="10.8" r="6.8" />
                    <path d="m16 16 4.5 4.5" />
                </svg>
            ) : (
                <span>{item.label}</span>
            )}</Link>
        )) }
    </nav>;
};
