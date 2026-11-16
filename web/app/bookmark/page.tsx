import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/server-auth";

import BookmarkClient from "./bookmark-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    noimageindex: true,
    nosnippet: true,
  },
};

export default async function BookmarkPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/signin");
  }

  return <BookmarkClient username={user.username} />;
}
