"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { useAuth } from "@/components/auth-provider";

import "@/public/styles/navbar.scss";
import navigation from "@/config/navigation";

interface MenuItem {
    label: string;
    href: string;
    authOnly?: boolean;
}

export const Navbar = () => {
    const currentPath = usePathname();
    const router = useRouter();
    const { isLoggedIn } = useAuth();

    const menuItems = navigation.main.items.filter(
        (item: MenuItem) => !item.authOnly || isLoggedIn
    );

    return <nav id="navbar">
        { menuItems.map((item: MenuItem) => (
            <Link
                key={item.href}
                href={item.href}
                className={ currentPath === item.href ? "active" : "" }
                onClick={(event) => {
                    // Next.js treats a link to the current URL as a no-op.
                    // Refetch the server data on a second click while keeping
                    // the current client-side view state.
                    if (currentPath === item.href) {
                        event.preventDefault();
                        router.refresh();
                    }
                }}
            ><span>{item.label}</span></Link>
        )) }
    </nav>;
};
