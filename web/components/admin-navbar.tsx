"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Link } from "@heroui/react";

import "@/public/styles/admin/navbar.scss";
import nextConfig from "@/next.config";

export const AdminNavbar = () => {
    const currentPath = usePathname();
    const [path, setPath] = useState(currentPath);

    useEffect(() => {
        setPath(currentPath);
    }, [currentPath]);

    interface MenuItem {
        label: string;
        href: string;
    };
    const menuItems = nextConfig.admin_navigation.items;
    const menuList = menuItems.map((item: MenuItem, index: number) => {
        return <Link
            key={index}
            href={item.href}
            className={ path === item.href ? "active" : "" }
        >{item.label}</Link>;
    });

    return <nav id="admin-navbar">
        { menuList }
    </nav>;
};
