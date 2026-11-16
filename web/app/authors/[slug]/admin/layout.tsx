import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/server-auth";

import { AdminShell } from "./admin-shell";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    noimageindex: true,
    nosnippet: true,
  },
};

export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect(`/@${slug}/signin`);
  }

  // An admin area always belongs to the signed-in account's own page.
  if (currentUser.slug && currentUser.slug !== slug) {
    redirect(`/@${currentUser.slug}/admin`);
  }

  return <AdminShell>{children}</AdminShell>;
}
