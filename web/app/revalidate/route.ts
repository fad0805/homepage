import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

const API_BASE = (
  process.env.API_INTERNAL_URL ?? "http://api:8000"
).replace(/\/+$/, "");

const PUBLIC_TAGS = [
  "books",
  "chapters",
  "links",
  "characters",
  "profiles",
  "illustrations",
] as const;

export async function POST(request: Request) {
  const cookie = request.headers.get("cookie") ?? "";
  if (!cookie) {
    return NextResponse.json(
      { success: false, detail: "로그인이 필요합니다." },
      { status: 401 },
    );
  }

  const auth = await fetch(`${API_BASE}/users/me/status`, {
    headers: {
      Accept: "application/json",
      Cookie: cookie,
    },
    cache: "no-store",
  });
  if (!auth.ok) {
    return NextResponse.json(
      { success: false, detail: "로그인이 필요합니다." },
      { status: 401 },
    );
  }

  for (const tag of PUBLIC_TAGS) {
    revalidateTag(tag);
  }

  return NextResponse.json({ success: true, tags: PUBLIC_TAGS });
}
