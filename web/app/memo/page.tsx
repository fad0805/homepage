import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/server-auth";

import MemoClient from "./memo-client";

export const dynamic = "force-dynamic";

export default async function MemoPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/signin");
  }

  return <MemoClient />;
}
