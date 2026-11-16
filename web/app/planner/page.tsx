import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/server-auth";

import PlannerClient from "./planner-client";

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

export default async function PlannerPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/signin");
  }

  return <PlannerClient username={user.username} />;
}
