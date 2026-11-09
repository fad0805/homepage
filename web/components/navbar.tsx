"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

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
            >{item.label}</Link>
        )) }
    </nav>;
};
