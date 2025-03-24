"use client";
import { Link } from "@nextui-org/react";

import "@/public/styles/navbar.scss";

export const Navbar = () => {
    return <nav id="navbar">
        <Link href="#">글쓴이</Link>
        <Link href="#">등장인물</Link>
        <Link href="#">책장</Link>
        <Link className="active" href="/">놀러가기</Link>
    </nav>;
};
