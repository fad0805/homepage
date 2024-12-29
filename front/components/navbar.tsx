"use client";
import { Link } from "@nextui-org/react";

import "@/public/styles/navbar.scss";

export const Navbar = () => {
    return <nav id="navbar">
        <Link href="#">글쓴이</Link>
        <Link href="#">작품</Link>
        <Link className="active" href="/">놀러가기</Link>
    </nav>;
};
