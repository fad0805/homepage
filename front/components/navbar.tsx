"use client";
import { Link } from "@nextui-org/react";

import "@/public/styles/navbar.scss";

export const Navbar = () => {
    return <nav id="navbar">
        <Link href="#">글쓰니</Link>
        <Link href="#">작품</Link>
        <Link className="active" href="/">항해하기</Link>
    </nav>;
};
