"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import "@/public/styles/navbar.scss";
import navigation from "@/config/navigation";

export const Navbar = () => {
    const currentPath = usePathname();
    const [path, setPath] = useState(currentPath);
    const [isLoggedIn, setIsLoggedIn] = useState(false);

    useEffect(() => {
        setPath(currentPath);
    }, [currentPath]);

    useEffect(() => {
        let cancelled = false;

        fetch("/api/users/me", { credentials: "include" })
            .then((response) => {
                if (!cancelled) setIsLoggedIn(response.ok);
            })
            .catch(() => {
                if (!cancelled) setIsLoggedIn(false);
            });

        return () => {
            cancelled = true;
        };
    }, [currentPath]);

    interface MenuItem {
        label: string;
        href: string;
        authOnly?: boolean;
    };
    const menuItems = navigation.main.items.filter(
        (item: MenuItem) => !item.authOnly || isLoggedIn
    );
    const menuList = menuItems.map((item: MenuItem, index: number) => {
        return <Link
            key={index}
            href={item.href}
            className={ path === item.href ? "active" : "" }
        >{item.label}</Link>;
    });

    return <nav id="navbar">
        { menuList }
    </nav>;
};
