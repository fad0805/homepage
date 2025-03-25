"use client";
import { useEffect, useState } from "react";
import { Link } from "@nextui-org/react";

import "@/public/styles/navbar.scss";
import nextConfig from "@/next.config";

export const Navbar = () => {
    const [path, setPath] = useState(window.location.pathname);

    useEffect(() => {
        const path = window.location.pathname;
        setPath(path);
    }, [window.location.pathname]);

    const menuItems = nextConfig.navigation.items;
    const menuList = menuItems.map((item, index) => {
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
